import { useState } from "react";
import { liveRequest } from "./liveApi";
import PanelDialog from "@/shared/ui/PanelDialog";
type Memories = { character_preferences?: { source_id: string; text: string }[]; memories: { id: string; text: string; source_id: number; hits: number }[]; context_turns: number; enabled: boolean };
export default function LiveMemoryPanel({ agentId }: { agentId: string }) {
  const [data, setData] = useState<Memories | null>(null);
  const [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false), [error, setError] = useState("");
  async function refresh() {
    setBusy(true);setError("");
    try { setData(await liveRequest<Memories>(`/agents/${agentId}/memory`)); }
    catch (e) { setError(e instanceof Error ? e.message : "记忆读取失败"); }
    finally { setBusy(false); }
  }
  async function clear() {
    setBusy(true);setError("");
    try {
      await liveRequest(`/agents/${agentId}/memory`, "DELETE");
      setData(await liveRequest<Memories>(`/agents/${agentId}/memory`));
      setConfirm(false);
    } catch (e) { setError(e instanceof Error ? e.message : "清除失败"); }
    finally { setBusy(false); }
  }
  return <details className="live-memory-panel" onToggle={e => { if (e.currentTarget.open && !data && !busy) void refresh(); }}>
    <summary>直播记忆{data ? ` · ${data.memories.length}条` : ""}</summary>
    <p className="live-chat-hint">{data ? `近期最多${data.context_turns}轮 · 兴趣记忆${data.enabled ? "开启" : "关闭"}。` : "按角色兴趣选择保留公开内容。"}只记部分内容；未检索到时不假装记得，不按昵称建立观众档案。</p>
    <div className="live-chat-controls"><button disabled={busy} onClick={() => void refresh()}>刷新记忆</button><button disabled={busy} onClick={() => setConfirm(true)}>清除直播记忆</button></div>
    {data && !data.memories.length && <p className="live-chat-hint">尚未形成长期记忆；正在进行的近期对话仍可用于接话。</p>}
    {data?.memories.map(item => <div className="live-memory-item" key={item.id}><p>{item.text}</p><small>公开弹幕来源 #{item.source_id} · 出现{item.hits}次</small></div>)}
    {!!data?.character_preferences?.length && <details><summary>角色公开表达过的偏好 · {data.character_preferences.length}</summary><p className="live-chat-hint">用于保持观点连贯，是过往表达，不代表现实经历；清除直播记忆时一并删除。</p>{data.character_preferences.map(item => <div className="live-memory-item" key={item.source_id + item.text}><p>{item.text}</p><small>来自已播公开发言</small></div>)}</details>}
    {error && <p role="alert" className="live-chat-error">{error}</p>}
    {confirm && <PanelDialog title="清除当前角色的直播记忆？" busy={busy} danger onClose={() => setConfirm(false)}>
      <p>将删除本角色的直播长期记忆和场次记录，并清空当前直播上下文。此操作不能撤销。</p><p>角色设置、私聊记忆和读书进度保留。进行中的旧回复会被作废。</p>
      {error && <p role="alert">{error}</p>}
      <div className="product-dialog-actions"><button className="secondary" data-dialog-focus disabled={busy} onClick={() => setConfirm(false)}>取消</button><button className="primary" disabled={busy} onClick={() => void clear()}>{busy ? "正在清除…" : "确认清除"}</button></div>
    </PanelDialog>}
  </details>;
}
