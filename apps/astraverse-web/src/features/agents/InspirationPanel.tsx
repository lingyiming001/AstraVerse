import { useEffect, useState } from "react";
import type { AgentProfile } from "./agentApi";
import { readResponse } from "@/shared/api/http";
type Note = { kind: string; title: string; text: string; source_ids: number[]; public: boolean };
type Snapshot = { notes: Note[]; sources: { id: number; processed: boolean }[]; status: string };
export default function InspirationPanel({ agentId, value, dirty, onChange }: { agentId: string; value: AgentProfile["inspiration"]; dirty: boolean; onChange: (v: AgentProfile["inspiration"]) => void }) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [source, setSource] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const base = `/api/agents/${encodeURIComponent(agentId)}/inspiration`;
  useEffect(() => {
    let disposed = false;
    async function load() { try { const v = await readResponse<Snapshot>(await fetch(base)); if (!disposed) setData(v); } catch { if (!disposed) setError("灵感知识读取失败"); } }
    void load(); const timer = window.setInterval(() => void load(), 5000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [base]);
  async function act(clear = false) {
    setBusy(true); setError("");setSource("");
    try { await readResponse(await fetch(clear ? base : `${base}/organize`, { method: clear ? "DELETE" : "POST" })); setData(await readResponse<Snapshot>(await fetch(base))); }
    catch (e) { setError(e instanceof Error ? e.message : "整理失败"); }
    finally { setBusy(false); }
  }
  async function inspect(id: number) {
    try { const v = await readResponse<{ kind: string; text: string }>(await fetch(`${base}/sources/${id}`)); setSource(`#${id} · ${v.kind}\n${v.text}`); }
    catch { setError("来源读取失败"); }
  }
  return <section className="agent-form">
    <h4>角色灵感与特殊知识</h4>
    <label className="agent-toggle"><span><strong>自动积累与整理</strong><small>保存后，从后续模型聊天、实际书籍片段、设定与资料中收集素材。需要开启聊天记忆；后台整理会额外调用文本模型。</small></span><input type="checkbox" checked={value.enabled} onChange={(e) => onChange({ ...value, enabled: e.target.checked })} /></label>
    {value.enabled && <label className="field"><span>整理间隔 · 分钟</span><input type="number" min={5} max={1440} value={value.interval_minutes} onChange={(e) => onChange({ ...value, interval_minutes: Number(e.target.value) })} /><small>第一次有素材时开始整理，之后每5–1440分钟检查；每次公开/私密分别最多一次调用。需要服务运行；无新素材不调用。</small></label>}
    <details className="live-content-settings"><summary>灵感档案 · {data?.notes.length || 0}条</summary><p className="memory-explainer">来源最多200条，兴趣、个人理解、虚构故事分开标记。私密互动不会自动进入公开直播；不是整本读书，也不是已经核实的事实。</p>
      <div className="agent-memory-actions"><button type="button" disabled={busy || dirty || !value.enabled || data?.status === "organizing"} onClick={() => void act()}>立即整理</button><button type="button" disabled={busy} onClick={() => void act(true)}>清空灵感与来源</button></div>
      <p className="memory-explainer">{data?.status === "organizing" ? "正在整理…" : data?.status === "error" ? "上次整理未完成，请检查文本模型后重试。" : "等待新素材或下次整理"} · 素材 {data?.sources.length || 0}/200</p>
      {data?.notes.map((n, i) => <article className="agent-inspiration-note" key={i}><strong>{n.title}</strong><small>{({ interest: "角色兴趣", idea: "个人理解", fiction: "虚构故事" } as Record<string, string>)[n.kind]} · {n.public ? "公开素材" : "私密素材"}</small><p>{n.text}</p><div>{n.source_ids.map((id) => <button type="button" key={id} onClick={() => void inspect(id)}>来源 #{id}</button>)}</div></article>)}
      {source && <pre className="inspiration-source">{source}</pre>}
    </details>
    {error && <p role="alert" className="settings-feedback error">{error}</p>}
  </section>;
}
