import { useEffect, useState, useRef } from "react";
import { readPlaybackConfig, normalizePlaybackConfig } from '@/shared/preferences/playbackConfig';
import { useSpeech, speechProgress, speechClock } from "@/features/chat/speech";
import { captionPageAt } from '@/features/chat/captionTimeline';
import Stage from "@/features/stage/Stage";
import { useWorld } from "@/shared/state/workspaceStore";
import { usePreferences } from "@/shared/preferences/preferences";

const channelName = "astraverse-clean-stage";
export function publishBroadcastStage() {
  const channel = new BroadcastChannel(channelName);
  const send = () => {
    const { set: _set, ...world } = useWorld.getState();
    const speech = useSpeech.getState();
    channel.postMessage({ playbackConfig: readPlaybackConfig() });
    channel.postMessage({ clock: speechClock() });
    channel.postMessage({ world, progress: speech.phase === "preparing" ? 0 : speechProgress(), framing: usePreferences.getState().framing, caption: ["preparing", "speaking"].includes(speech.phase) && speech.agentId === world.actorId ? speech.text : "", captions: localStorage.getItem("astraverse:broadcast-captions") === "true" });
  };
  channel.onmessage = event => { if (event.data === "ready") send(); };
  // Throttle pose updates while keeping animation and mouth movement in sync.
  const timer = window.setInterval(send, 100);
  const unsubscribe = useSpeech.subscribe(send);
  send();
  return () => { unsubscribe(); clearInterval(timer); channel.close(); };
}

export default function BroadcastView() {
  const [config, setConfig] = useState(readPlaybackConfig);
  const [clock, setClock] = useState<ReturnType<typeof speechClock> | null>(null);
  const clockTask = useRef<number | undefined>(undefined);
  const [caption, setCaption] = useState("");
  const [page, setPage] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const resize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const fontSize = Math.max(18, Math.min(32, width * .025));
  const captionHeight = Math.ceil(fontSize * 3 + 48);
  const context = document.createElement("canvas").getContext("2d")!;
  context.font = `${fontSize}px sans-serif`;
  const lines: string[] = [];
  let line = "";
  for (const char of caption) {
    if (char === "\n" || Array.from(line).length >= config.captionChars || context.measureText(line + char).width > Math.max(1, width * .84 - 56)) {
      lines.push(line); line = char === "\n" ? "" : char;
    } else line += char;
  }
  if (line) lines.push(line);
  const pages = Array.from({length: Math.ceil(lines.length / 2)}, (_, i) => lines.slice(i * 2, i * 2 + 2).join("\n"));
  useEffect(() => { setPage(0); }, [caption]);
  const offset = progress === null ? null : Math.floor(Array.from(lines.join("")).length * Math.min(1, progress + config.captionLead));
  let syncedPage = 0;
  let consumed = 0;
  if (offset !== null) for (let i = 0; i < pages.length; i++) {
    if (offset >= consumed) syncedPage = i;
    consumed += Array.from(pages[i].replace(/\n/g, "")).length;
  }
  const boundaryPage = clock?.timing === 'system-boundary' && typeof clock.charIndex === 'number' ? captionPageAt(pages, caption.slice(0, clock.charIndex).replace(/\n/g, '').length) : null;
  const current = pages[boundaryPage ?? (progress === null ? page : syncedPage)] || "";
  useEffect(() => {
    if (boundaryPage !== null || progress !== null || !current || page >= pages.length - 1) return;
    const timer = setTimeout(() => setPage(p => p + 1), Math.max(2500, current.length * config.fallbackMsPerChar));
    return () => clearTimeout(timer);
  }, [current, page, pages.length, progress, boundaryPage, config.fallbackMsPerChar]);
  useEffect(() => {
    document.title = "AstraVerse 直播画面";
    const channel = new BroadcastChannel(channelName);
    channel.onmessage = event => {
      if (event.data?.clock) {
        if (clockTask.current !== event.data.clock.taskId) setPage(0);
        clockTask.current = event.data.clock.taskId;
        setClock(event.data.clock);
      }
      if (event.data?.playbackConfig) setConfig(old => {
        const next = normalizePlaybackConfig(event.data.playbackConfig);
        return JSON.stringify(old) === JSON.stringify(next) ? old : next;
      });
      if (!event.data?.world) return;
      useWorld.setState(event.data.world);
      setCaption(event.data.captions ? event.data.caption || "" : "");
      setEnabled(Boolean(event.data.captions));
      setProgress(typeof event.data.progress === "number" ? event.data.progress : null);
      usePreferences.getState().set({ framing: event.data.framing });
    };
    channel.postMessage("ready");
    return () => channel.close();
  }, []);
  return <main style={{ position: "fixed", inset: 0, background: "#101322", overflow: "hidden", pointerEvents: "none" }}>
    <div style={{position:"absolute", inset:0, bottom:enabled ? captionHeight : 0, overflow:"hidden", isolation:"isolate"}}>
      <Stage clean onSceneSelect={() => {}} />
    </div>
    {enabled && <section aria-label="直播字幕" style={{position:"absolute", zIndex:100, bottom:0, left:0, right:0, height:captionHeight, display:"flex", alignItems:"center", justifyContent:"center", background:"#101322"}}>
      {current && <div style={{position:"relative", width:"84%", maxWidth:"84%", margin:0, padding:"10px 20px", borderRadius:10, background:"#252b38", color:"white", textAlign:"center", fontSize, fontWeight:400, fontFamily:"sans-serif", letterSpacing:0, lineHeight:1.5, whiteSpace:"pre", overflow:"hidden", height:"auto", maxHeight:fontSize * 3 + 20, boxSizing:"border-box", textShadow:"0 1px 3px black"}}>{current}</div>}
    </section>}
  </main>;
}
