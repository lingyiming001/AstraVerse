import { useEffect, useState } from "react";
import { BookOpen, Play, Pause, RotateCcw } from "lucide-react";
import { useWorld } from "@/shared/state/workspaceStore";
import { usePreferences } from "@/shared/preferences/preferences";
import { stopBookSpeech } from "@/features/chat/speech";
import { importWholeBook, readableBook, readingRequest, selectBook, updateReader, useBookReading, type Reading } from "./bookReading";
import type { Resource } from "./resources";
import "./bookReading.css";

export default function BookReadingControls({ resource, resources = [], actorId }: { resource?: Resource; resources?: Resource[]; actorId?: string }) {
  const readToEnd = usePreferences(s => s.bookReadToEnd);
  const currentActor = useWorld(s => s.actorId);
  const agentId = actorId || currentActor;
  const view = useBookReading(s => s.readers[agentId]);
  const [chosen, setChosen] = useState(resource?.id || "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const reading = view?.reading;
  const books = resource ? [resource] : resources.filter(readableBook);
  const target = books.find(b => b.id === chosen);
  const showing = !resource || reading?.book_id === resource.id;
  useEffect(() => {
    let active = true;
    void readingRequest<{ reading: Reading | null }>(agentId).then(data => { if (active) updateReader(agentId, { reading: data.reading }); }).catch(() => {});
    return () => { active = false; };
  }, [agentId, resource?.id]);
  async function run(action: "start" | "pause" | "restart" | "seek", position?: number) {
    setBusy(true); setNotice("");
    try {
      const book = target || (resource && readableBook(resource) ? resource : undefined);
      const bookId = (action === "start" && book ? book.id : showing ? reading?.book_id : undefined) || book?.id;
      if (!bookId) throw new Error("先选择一本TXT或EPUB书籍");
      // Clear the old segment before changing its bookmark; cancellation never advances it.
      stopBookSpeech(agentId);
      if (action === "start" && book) {
        const imported = await importWholeBook(book);
        if (imported.replaced) setNotice("原文件内容已替换，已从新书开头开始");
      }
      if (action !== "pause") usePreferences.getState().set({ voice: true });
      await selectBook(agentId, bookId, action !== "pause", action === "restart" ? { restart: true } : action === "seek" ? { position } : undefined);
    } catch (error) { setNotice(error instanceof Error ? error.message : "阅读操作失败"); }
    finally { setBusy(false); }
  }
  const active = showing && reading?.active && (!chosen || chosen === reading.book_id);
  const finished = showing && reading?.completed && (!target || target.id === reading.book_id);
  return <section className="book-reading-controls" aria-label="整本朗读">
    <div className="book-reading-title"><BookOpen size={17} /><strong>朗读</strong><span>{active ? "正在阅读" : showing && reading?.completed ? "已读完" : "记住阅读位置"}</span></div>
    {!resource && <label>选择书籍<select disabled={busy} value={chosen} onChange={e => setChosen(e.target.value)}>
      <option value="">{reading ? `继续《${reading.title}》` : "选择已导入的TXT / Markdown / EPUB"}</option>
      {books.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
    </select></label>}
    {showing && reading && <div className="book-reading-position" role="status">
      <strong>《{reading.title}》</strong><span>{reading.chapter} · {reading.percent}%</span>
      <progress max={reading.total} value={reading.offset} aria-label="已完成阅读进度" />
      <small>已读 {reading.offset.toLocaleString()} / {reading.total.toLocaleString()} 字</small>
      {reading.chapters.length > 0 && <label>跳到章节<select disabled={busy} value="" onChange={e => { if (e.target.value) void run("seek", Number(e.target.value)); }}>
        <option value="">选择章节（会更改阅读位置）</option>
        {reading.chapters.map((chapter, i) => <option key={i} value={chapter.offset}>{chapter.title}</option>)}
      </select></label>}
    </div>}
    <div className="book-reading-actions">
      <button className="primary" disabled={busy || finished || (!!resource && !readableBook(resource)) || (!target && !reading && !resource)} onClick={() => void run(active ? "pause" : "start")}>
        {active ? <Pause size={14} /> : <Play size={14} />}{busy ? "处理中…" : active ? "暂停阅读" : finished ? "已读完" : showing && reading?.offset && !reading.completed ? "继续阅读" : "开始阅读"}
      </button>
      {showing && reading && reading.offset > 0 && <button className="secondary" disabled={busy} onClick={() => void run("restart")}><RotateCcw size={14} />从头重读</button>}
    </div>
    <label className="book-reading-mode"><input type="checkbox" checked={readToEnd} onChange={e => usePreferences.getState().set({ bookReadToEnd: e.target.checked })} />持续读到全书结束</label>
    <p>{readToEnd ? "连续朗读，随时可暂停。" : "读完当前一段后暂停。"}进度自动保存；请保持主页面运行。也可以在聊天中说“读《书名》”“继续读书”或“暂停阅读”。</p>
    {resource && !readableBook(resource) && <p>此格式暂不能整本朗读，请导入TXT、Markdown或无加密EPUB。</p>}
    {showing && view?.text && <details className="book-reading-excerpt"><summary>当前朗读原文</summary><pre>{view.text}</pre></details>}
    {(notice || (showing && view?.error)) && <p role="status">{notice || view?.error}</p>}
  </section>;
}
