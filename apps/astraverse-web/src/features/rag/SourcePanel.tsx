import { useState } from "react";
import { ragRequest, type RagSource } from "./ragApi";
import "./rag.css";
export default function SourcePanel({ sources, agentId, public: isPublic = false }: { sources?: RagSource[]; agentId: string; public?: boolean }) {
  const [selected, setSelected] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  if (!sources?.length) return null;
  return <details className="rag-sources" onToggle={event => { if (!event.currentTarget.open) { setText(""); setError(""); setSelected(""); } }}><summary>参考资料 · {sources.length}</summary><div className="rag-source-list">{sources.map(source => <button className="secondary" key={source.id} disabled={loading} aria-pressed={selected === source.id} onClick={async () => {
    setSelected(source.id); setText(""); setError(""); setLoading(true);
    try { const data = await ragRequest<{ text: string }>(`/chunks/${encodeURIComponent(source.id)}?${new URLSearchParams({ agent_id: agentId, public: String(isPublic) })}`); setText(data.text); }
    catch (err) { setError(err instanceof Error ? err.message : "无法读取来源"); }
    finally { setLoading(false); }
  }}>{source.title} · {source.section || "正文"}</button>)}</div>{loading && <p role="status">正在读取原文…</p>}{error && <p role="alert">{error}</p>}{text && <blockquote>{text}</blockquote>}<small>本轮检索到的参考片段；点击查看原文。</small></details>;
}
