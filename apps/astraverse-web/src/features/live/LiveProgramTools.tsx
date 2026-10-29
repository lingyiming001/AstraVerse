import { useEffect, useRef, useState } from "react";
import { liveRequest, type LiveChannel } from "./liveApi";
type Session = { id: string; started: string; ended: string | null; summary: { source_id: number; kind: string; text: string }[] };
export default function LiveProgramTools({ channel, agentId, running }: { channel: LiveChannel; agentId: string; running: boolean }) {
  const activeAgent = useRef(agentId);
  activeAgent.current = agentId;
  const [question, setQuestion] = useState("下一个话题想聊什么？");
  const [options, setOptions] = useState("音乐与心情\n一起读一段书");
  const [duration, setDuration] = useState(60);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [originals, setOriginals] = useState<Record<string, { id: number; kind: string; text: string }[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setSessions([]);setOriginals({});
    liveRequest<{ sessions: Session[] }>(`/agents/${agentId}/sessions`).then((v) => { if (!cancelled) setSessions(v.sessions); }).catch(() => { if (!cancelled) setError("场次记录读取失败"); });
    return () => { cancelled = true; };
  }, [agentId, running]);
  async function act(action: "start" | "finish" | "clear" | "refresh") {
    if (action === "clear" && !window.confirm("清除本角色的直播长期记忆、近期上下文和所有场次记录？此操作不影响私聊与阅读进度。")) return;
    setBusy(true); setError("");
    try {
      if (action === "start") await liveRequest(`/channels/${channel.id}/poll`, "POST", { question, options: options.split("\n").map((v) => v.trim()).filter(Boolean), duration });
      if (action === "finish") await liveRequest(`/channels/${channel.id}/poll/finish`, "POST");
      if (action === "clear") { await liveRequest(`/agents/${agentId}/sessions`, "DELETE"); setOriginals({}); }
      const data = await liveRequest<{ sessions: Session[] }>(`/agents/${agentId}/sessions`); if (activeAgent.current === agentId) setSessions(data.sessions);
    } catch (e) { setError(e instanceof Error ? e.message : "操作失败"); }
    finally { setBusy(false); }
  }
  async function inspect(id: string) {
    setBusy(true);setError("");
    try {
      const data = await liveRequest<{ events: { id: number; kind: string; text: string }[] }>(`/agents/${agentId}/sessions/${id}`);
      if (activeAgent.current !== agentId) return;
      setOriginals((old) => ({ ...old, [id]: data.events }));
    } catch { setError("原始事件读取失败"); }
    finally { setBusy(false); }
  }
  return <div className="live-program-tools">
    <details><summary>观众投票</summary>
      {channel.poll && <div className="daily-live-status"><strong>{channel.poll.question} · {channel.poll.open ? "进行中" : "已结束"}</strong>{channel.poll.options.map((v, i) => <span key={i}>{i + 1}. {v} · {channel.poll!.counts[i]}票</span>)}<small>{channel.poll.voters}个昵称参与；同昵称最后一票有效</small></div>}
      {channel.poll?.open ? <button disabled={busy} onClick={() => void act("finish")}>立即结束并播报</button> : <div className="agent-form">
        <label className="field"><span>问题</span><input maxLength={120} value={question} onChange={(e) => setQuestion(e.target.value)} /></label>
        <label className="field"><span>选项 · 每行一个，2–4项</span><textarea rows={3} maxLength={243} value={options} onChange={(e) => setOptions(e.target.value)} /></label>
        <label className="field"><span>持续秒数 · 15–600</span><input type="number" min={15} max={600} value={duration} onChange={(e) => setDuration(Number(e.target.value))} /></label>
        <button disabled={busy || !running || !question.trim()} onClick={() => void act("start")}>发起投票并播报</button><small>观众发送1–4参与；投票期间暂停冷场自说，仍可回应其他弹幕。结果不会自动操作场景或播放器。</small>
      </div>}
    </details>
    <details><summary>这个角色的直播记忆 · {sessions.length}场</summary><p className="live-chat-hint">保存已播出的公开内容、已回应弹幕与节目结果，提供来源可追溯的场次记录；跨场聊天主要召回按兴趣筛选的记忆，不保存观众昵称档案。</p><div className="live-chat-controls"><button disabled={busy} onClick={() => void act("refresh")}>刷新记录</button><button disabled={busy || !sessions.length} onClick={() => void act("clear")}>清空此角色直播记忆</button></div>{sessions.map((s) => <details key={s.id}><summary>{s.started} UTC · {s.ended ? "已结束" : "未结算"}</summary>{s.summary.length ? s.summary.map((entry) => <p key={entry.source_id} className="live-chat-hint">#{entry.source_id} · {entry.kind}：{entry.text}</p>) : <p className="live-chat-hint">尚无结算摘要；未结束场次不用于跨场回忆。</p>}<button disabled={busy} onClick={() => void inspect(s.id)}>查看来源事件</button>{originals[s.id] && <div>{originals[s.id].slice(-100).map((entry) => <p className="live-chat-hint" key={entry.id}>#{entry.id} · {entry.kind}：{entry.text}</p>)}<small>展示最近100条原始事件</small></div>}</details>)}</details>
    {error && <p className="live-chat-error" role="alert">{error}</p>}
  </div>;
}
