import { useEffect } from "react";
import { readPlaybackConfig } from '@/shared/preferences/playbackConfig';
import { usePreferences } from "@/shared/preferences/preferences";
import { useWorld } from "@/shared/state/workspaceStore";
import { useAgents } from "@/features/agents/agentApi";
import { enqueueLiveSpeech, stopBookSpeech, prepareBookSpeech } from "@/features/chat/speech";
import { readingRequest, selectBook, updateReader, invalidateReader, useBookReading, ReadingError, type BookChunk, type Reading } from "./bookReading";

/** One outstanding segment per actor. Bookmarks advance only on a natural audio end. */
export function useBookReader(agentId: string) {
  useEffect(() => {
    let disposed = false, busy = false;
    let current: BookChunk | null = null;
    let preload = new AbortController();
    let ackPending: BookChunk | null = null;
    const clientId = useWorld.getState().clientId;
    const pause = (bookId: string, message = "") => {
      const chunk = current;
      current = null; ackPending = null;
      preload.abort();
      invalidateReader(agentId);
      const info = useBookReading.getState().readers[agentId]?.reading;
      if (info?.book_id === bookId) updateReader(agentId, { reading: { ...info, active: false } });
      void (chunk ? readingRequest(agentId, "/cancel", "POST", { client_id: clientId, book_id: chunk.book_id, token: chunk.token }) : selectBook(agentId, bookId, false)).then(() => {
        if (message) updateReader(agentId, { error: message });
      }).catch(() => { updateReader(agentId, { error: "暂停状态未能保存，请检查服务连接" }); });
    };
    async function tick() {
      if (disposed || busy) return;
      busy = true;
      const revision = useBookReading.getState().readers[agentId]?.revision || 0;
      const stale = () => disposed || (useBookReading.getState().readers[agentId]?.revision || 0) !== revision;
      try {
        if (ackPending) {
          const chunk = ackPending;
          const data = await readingRequest<{ reading: Reading }>(agentId, "/ack", "POST", { client_id: clientId, book_id: chunk.book_id, token: chunk.token });
          if (stale()) return;
          ackPending = null; current = null;
          updateReader(agentId, { reading: data.reading, error: "" });
          if (data.reading.active && usePreferences.getState().bookReadToEnd === false) {
            await selectBook(agentId, chunk.book_id, false);
            return;
          }
        }
        const { reading } = await readingRequest<{ reading: Reading | null }>(agentId);
        if (stale()) return;
        updateReader(agentId, { reading });
        if (!reading?.active || (current && current.book_id !== reading.book_id)) {
          preload.abort();
          current = null;
          stopBookSpeech(agentId);
        }
        if (!reading?.active) return;
        if (!usePreferences.getState().voice) { pause(reading.book_id, "语音已关闭，阅读已暂停，位置已保留"); return; }
        // Renew ownership while queued/preparing/playing; never advance by elapsed time.
        const response = await fetch(`/api/library/reading/${encodeURIComponent(agentId)}/next`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: clientId }), signal: AbortSignal.timeout(10000),
        });
        if (stale()) return;
        if (response.status === 409) {
          current = null; stopBookSpeech(agentId);
          updateReader(agentId, { error: "另一页面正在朗读，此页面等待中" }); return;
        }
        const data = await response.json() as { chunk?: BookChunk; detail?: string };
        if (stale()) return;
        if (!response.ok) {
          if (current) { const old = current; current = null; stopBookSpeech(agentId); pause(old.book_id, data.detail || "书籍片段读取失败"); }
          throw new Error(data.detail || "书籍片段读取失败");
        }
        const chunk = data.chunk;
        if (disposed || !chunk) return;
        if (current?.token === chunk.token) return;
        if (current) { current = null; stopBookSpeech(agentId); }
        current = chunk;
        preload.abort(); preload = new AbortController();
        updateReader(agentId, { text: chunk.text, error: "" });
        // Generate and play short subtitle-sized phrases. Each caption now starts
        // with its own audio instead of estimating position in a long paragraph.
        const phrases: string[] = [];
        const playbackConfig = readPlaybackConfig();
        let phrase = "";
        for (const char of chunk.text) {
          phrase += char;
          if (Array.from(phrase).length >= playbackConfig.bookSegmentChars || (Array.from(phrase).length >= Math.min(55, playbackConfig.bookSegmentChars / 2) && /[。！？；\n]/.test(char))) {
            if (phrase.trim()) phrases.push(phrase);
            phrase = "";
          }
        }
        if (phrase.trim()) phrases.push(phrase);
        let phraseIndex = 0;
        let prepared: Promise<Blob | null> | undefined;
        const playPhrase = () => {
          if (disposed || current?.token !== chunk.token) return;
          enqueueLiveSpeech({
          text: phrases[phraseIndex], key: `book:${agentId}`, agentId,
          prepared,
          onStart: () => {
            if (playbackConfig.prefetch && phraseIndex + 1 < phrases.length && !preload.signal.aborted) prepared = prepareBookSpeech(phrases[phraseIndex + 1], agentId, useAgents.getState().profiles[agentId]?.voice.voice, preload.signal);
          },
          voice: useAgents.getState().profiles[agentId]?.voice,
          onEnd: () => {
            if (disposed || current?.token !== chunk.token) return;
            phraseIndex++;
            if (phraseIndex < phrases.length) { playPhrase(); return; }
            ackPending = chunk;
            void tick();
          },
          onCancel: () => { if (!disposed && current?.token === chunk.token) pause(chunk.book_id); },
          onError: () => { if (!disposed && current?.token === chunk.token) pause(chunk.book_id, "语音播放失败，已保留本段位置；请检查语音配置后继续"); },
        });
        };
        playPhrase();
      } catch (error) {
        if (error instanceof ReadingError && error.status === 409) { ackPending = null; current = null; }
        if (!stale()) updateReader(agentId, { error: ackPending ? "本段已播完，正在重试保存进度…" : error instanceof Error ? error.message : "阅读连接失败" });
      } finally { busy = false; }
    }
    const timer = setInterval(() => void tick(), 3000);
    void tick();
    return () => {
      disposed = true; clearInterval(timer);
      preload.abort();
      stopBookSpeech(agentId);
      // Closing or switching preserves the last completed segment; next visit offers Continue.
      if (current) void readingRequest(agentId, "/cancel", "POST", { client_id: clientId, book_id: current.book_id, token: current.token }).catch(() => {});
    };
  }, [agentId]);
}
