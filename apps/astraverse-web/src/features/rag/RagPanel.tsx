import { useEffect, useState } from "react";
import { indexFile, indexable, ragRequest, syncMissing, type RagDocument, type RagSettings } from "./ragApi";
import type { Resource } from "@/features/library/resources";
import "./rag.css";
const labels: Record<string, string> = { lexical_ready: "全文可检索", needs_reindex: "全文可检索 · 向量待重建", embedding: "向量索引中", ready: "混合可检索", error: "向量建立失败", unsupported: "无法提取正文" };
export default function RagPanel({ resources }: { resources: Resource[] }) {
  const [config, setConfig] = useState<RagSettings | null>(null);
  const [documents, setDocuments] = useState<RagDocument[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function refresh() { const [c, s] = await Promise.all([ragRequest<RagSettings>("/settings"), ragRequest<{ documents: RagDocument[] }>("/status")]); setConfig(c); setDocuments(s.documents); }
  useEffect(() => { void refresh().catch(err => setError(String(err))); }, []);
  useEffect(() => { if (!documents.some(d => d.status === "embedding")) return; const timer = setInterval(() => { void refresh().catch(() => {}); }, 3000); return () => clearInterval(timer); }, [documents]);
  async function action(task: () => Promise<unknown>) { setBusy(true); setError(""); setNotice(""); try { await task(); await refresh(); } catch (err) { setError(err instanceof Error ? err.message : "索引操作失败"); } finally { setBusy(false); } }
  async function toggle(key: "enabled" | "semantic_enabled", value: boolean) {
    if (!config) return;
    await action(async () => { await ragRequest("/settings", "PUT", { enabled: config.enabled, semantic_enabled: config.semantic_enabled, top_k: config.top_k, min_similarity: config.min_similarity, [key]: value }); if (key === "semantic_enabled" && value) await ragRequest("/reindex", "POST"); });
  }
  return <details className="rag-panel" onToggle={event => { if (event.currentTarget.open) void action(async () => { await syncMissing(resources); }); }}><summary><span>资料检索</span><small>{documents.length} 份已建立索引 · {config?.semantic_enabled ? "语义 + 全文" : "全文检索"}</small></summary><div className="rag-panel-body"><p>聊天和直播自动查找相关原文，回答下方可展开来源。沿用资料库权限，直播只使用公开内容。</p>
    {config && <div className="rag-settings"><label><input type="checkbox" checked={config.enabled} disabled={busy} onChange={e => void toggle("enabled", e.target.checked)} />回答时检索资料</label><label><input type="checkbox" checked={config.semantic_enabled} disabled={busy || (!config.embedding_configured && !config.semantic_enabled)} onChange={e => void toggle("semantic_enabled", e.target.checked)} />语义检索</label><small>{config.embedding_configured ? `向量模型：${config.embedding_model}` : "语义检索需先在设置 → 平台模型中添加向量模型，并配置“向量检索”能力路由。"}</small></div>}
    <small>开启语义检索后，正文片段和角色记忆会发送给所配置的向量模型服务。</small>
    <div className="rag-toolbar"><button className="secondary" disabled={busy} onClick={() => void action(async () => { await syncMissing(resources); await ragRequest("/reindex", "POST"); setNotice("全文索引已同步；启用语义检索后，向量会在后台建立。"); })}>{busy ? "处理中…" : "同步与重建索引"}</button><button className="secondary" disabled={busy} onClick={() => void action(refresh)}>刷新状态</button></div>
    <div className="rag-document-list">{resources.filter(indexable).map(resource => { const doc = documents.find(d => d.resource_id === resource.id); return <div key={resource.id}><span><strong>{resource.name}</strong><small>{doc ? `${labels[doc.status] || doc.status} · ${doc.chunks} 段` : "尚未索引"}{doc?.error && ` · ${doc.error}`}</small></span><button className="secondary" disabled={busy} onClick={() => void action(() => indexFile(resource))}>重建</button></div>; })}</div>
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}<small>支持 TXT、Markdown、EPUB、文字 PDF、DOCX、SRT/VTT。扫描件需先 OCR；不会自动理解视频画面。</small>
  </div></details>;
}
