import { useState } from "react";
import type { AgentProfile } from "./agentApi";
import type { Resource } from "@/features/library/resources";

type Entries = AgentProfile["knowledge"];
export default function AgentKnowledge({ entries = [], resources, onChange }: {
  entries: Entries; resources: Resource[]; onChange: (entries: Entries) => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resourceId, setResourceId] = useState("");
  const books = resources.filter((r) => r.kind === "book" && /\.(txt|md)$/i.test(r.filename || ""));
  function patch(index: number, value: Partial<Entries[number]>) {
    onChange(entries.map((entry, i) => i === index ? { ...entry, ...value } : entry));
  }
  async function read(blob: Blob, title: string) {
    if (blob.size > 80000) throw new Error("资料最多80KB，请拆分为主题片段后导入。");
    const buffer = await blob.arrayBuffer();
    let content: string;
    try { content = new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
    catch { content = new TextDecoder("gb18030").decode(buffer); }
    if (!content.trim() || content.length > 20000) throw new Error("正文需为1–20000字，请先拆分资料。");
    onChange([...entries, { title: title.slice(0, 120), content, public: false }]);
  }
  async function importBook() {
    const book = books.find((r) => r.id === resourceId);
    if (!book?.url) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(book.url);
      if (!response.ok) throw new Error("书籍读取失败");
      await read(await response.blob(), book.name);
    } catch (e) { setError(e instanceof Error ? e.message : "读取失败"); }
    finally { setBusy(false); }
  }
  return <section className="agent-form">
    <h4>角色资料库 · {entries.length}/20</h4>
    <p className="memory-explainer">从书籍库读取 TXT / Markdown，或添加资料片段。保存设定后，角色会按话题查阅并用自己的话表达。仅勾选的条目可用于公开直播；修改原书后需重新导入。PDF / EPUB 请先提取正文。</p>
    <label className="field">书籍库
      <select value={resourceId} onChange={(e) => setResourceId(e.target.value)}>
        <option value="">选择文本书籍</option>
        {books.map((book) => <option key={book.id} value={book.id}>{book.name}</option>)}
      </select>
    </label>
    <button type="button" className="secondary" disabled={!resourceId || busy || entries.length >= 20} onClick={() => void importBook()}>{busy ? "正在读取…" : "读取到角色资料库"}</button>
    <button type="button" className="secondary" disabled={busy || entries.length >= 20} onClick={() => onChange([...entries, { title: "新资料", content: "请填写资料正文", public: false }])}>添加资料片段</button>
    {error && <p role="alert">{error}</p>}
    {entries.map((entry, index) => <div className="agent-form" key={index}>
      <label className="field">资料标题<input maxLength={120} value={entry.title} onChange={(e) => patch(index, { title: e.target.value })} required /></label>
      <label className="field">正文 · {entry.content.length}/20000<textarea rows={5} maxLength={20000} value={entry.content} onChange={(e) => patch(index, { content: e.target.value })} required /></label>
      <label className="agent-toggle"><span>允许在公开直播中引用</span><input type="checkbox" checked={entry.public} onChange={(e) => patch(index, { public: e.target.checked })} /></label>
      <button type="button" className="secondary" onClick={() => onChange(entries.filter((_, i) => i !== index))}>移除此资料</button>
    </div>)}
  </section>;
}
