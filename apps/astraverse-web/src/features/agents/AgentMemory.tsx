import { useEffect, useState } from "react";
import { BrainCircuit, RefreshCw, Trash2, History } from "lucide-react";
import { readResponse } from "@/shared/api/http";
type Memory = {
  summary: string;
  facts: { text: string; source_ids: number[] }[];
  source: string;
  status: string;
  updated: string | null;
  messages: number;
  fact_count: number;
  enabled: boolean;
};
type Row = { id: number; role: string; text: string; created: string };
type Archive = {
  messages: Row[];
  has_more: boolean;
  next_before: number | null;
};
export default function AgentMemory({ agentId }: { agentId: string }) {
  const [memory, setMemory] = useState<Memory | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [archive, setArchive] = useState<Archive | null>(null);
  const [origin, setOrigin] = useState<Row | null>(null);
  const endpoint = `/api/agents/${encodeURIComponent(agentId)}`;
  async function load() {
    try {
      setMemory(await readResponse<Memory>(await fetch(endpoint + "/memory")));
    } catch (e) {
      setError(e instanceof Error ? e.message : "记忆暂时不可读");
    }
  }
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const value = await readResponse<Memory>(
          await fetch(endpoint + "/memory"),
        );
        if (active) setMemory(value);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "读取失败");
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    window.addEventListener("astraverse:memory-changed", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("astraverse:memory-changed", refresh);
    };
  }, [endpoint]);
  async function act(clear = false) {
    setBusy(true);
    setError("");
    try {
      await readResponse(
        await fetch(endpoint + (clear ? "/memory" : "/memory/summarize"), {
          method: clear ? "DELETE" : "POST",
        }),
      );
      setConfirm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }
  async function older() {
    setBusy(true);
    setError("");
    try {
      const page = await readResponse<Archive>(
        await fetch(
          endpoint +
            "/archive" +
            (archive?.next_before ? `?before=${archive.next_before}` : ""),
        ),
      );
      setArchive((p) => ({
        ...page,
        messages: [...page.messages, ...(p?.messages || [])],
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "历史读取失败");
    } finally {
      setBusy(false);
    }
  }
  async function source(id: number) {
    try {
      const value = await readResponse<Archive>(
        await fetch(endpoint + `/archive?before=${id + 1}&limit=1`),
      );
      setOrigin(value.messages.find((r) => r.id === id) || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "原话读取失败");
    }
  }
  return (
    <section className="agent-memory-panel">
      <div className="agent-memory-heading">
        <BrainCircuit size={17} />
        <div>
          <h4>属于你们的长期记忆</h4>
          <p>
            {memory?.messages || 0} 条完整历史 · {memory?.fact_count || 0}{" "}
            条记忆线索 ·{" "}
            {memory?.status === "updating"
              ? "正在整理…"
              : memory?.source === "model"
                ? "AI 摘要"
                : "原话摘录"}
          </p>
        </div>
      </div>
      <p className="memory-explainer">
        每累积约4轮新对话自动整理，每次最多处理40条原文。使用角色模型时会产生一次摘要请求；未配置模型时仅摘录明确偏好。完整聊天保留在数据库，主聊天显示最近100条。
      </p>
      {!memory?.enabled && (
        <p className="agent-thread-notice">
          自动摘要未启用；请保存上方记忆开关。
        </p>
      )}
      {memory?.status === "error" && (
        <p className="settings-feedback error">
          上次摘要失败，原始记录和旧摘要保留，可重新整理。
        </p>
      )}
      {memory?.summary ? (
        <div className="memory-summary">{memory.summary}</div>
      ) : (
        <div className="agent-thread-notice">
          还没有摘要。继续聊聊你的喜好、目标或有趣的小事，角色会逐渐积累线索。
        </div>
      )}
      {memory && memory.fact_count > memory.facts.length && (
        <p className="memory-explainer">
          展示最近50条线索；其他线索仍存入数据库，可按聊天话题检索。
        </p>
      )}
      <div className="memory-facts">
        {memory?.facts.map((fact, i) => (
          <div key={i}>
            <span>{fact.text}</span>
            <small>
              来自原话{" "}
              {fact.source_ids.map((id) => (
                <button key={id} onClick={() => void source(id)}>
                  #{id}
                </button>
              ))}
            </small>
          </div>
        ))}
      </div>
      {origin && (
        <div className="memory-origin">
          <strong>原话 #{origin.id}</strong>
          <p>{origin.text}</p>
          <button onClick={() => setOrigin(null)}>收起原话</button>
        </div>
      )}
      <div className="live-actions">
        <button
          disabled={busy || !memory?.enabled || memory.status === "updating"}
          onClick={() => void act()}
        >
          <RefreshCw size={13} />
          现在整理
        </button>
        <button
          disabled={busy || !memory?.summary}
          onClick={() => setConfirm(true)}
        >
          <Trash2 size={13} />
          删除自动记忆
        </button>
        <button disabled={busy} onClick={() => void older()}>
          <History size={13} />
          {archive ? "加载更早记录" : "查看完整历史"}
        </button>
      </div>
      {confirm && (
        <div className="plugin-consent">
          <p>
            删除自动摘要和记忆线索，保留聊天原文与手写记忆。已归纳的旧消息不会自动重新提取；最近对话仍可作为短期上下文。要彻底清除，请使用下方「清空会话」。
          </p>
          <button onClick={() => setConfirm(false)}>取消</button>
          <button disabled={busy} onClick={() => void act(true)}>
            确认删除摘要
          </button>
        </div>
      )}
      {archive && (
        <details open className="settings-detail">
          <summary>聊天档案（已载入{archive.messages.length}条）</summary>
          <div className="memory-archive">
            {archive.messages.map((row) => (
              <article key={row.id}>
                <small>
                  #{row.id} · {row.role === "user" ? "你" : "角色"} ·{" "}
                  {row.created} UTC
                </small>
                <p>{row.text}</p>
              </article>
            ))}
          </div>
          {archive.has_more && (
            <button disabled={busy} onClick={() => void older()}>
              加载更早记录
            </button>
          )}
          <button onClick={() => setArchive(null)}>收起历史</button>
        </details>
      )}
      {error && (
        <div className="settings-feedback error" role="alert">
          {error}
        </div>
      )}
      <small className="memory-footnote">
        AI摘要可能有误，可核对原话。关闭记忆后不读取摘要；清空会话会一起删除原文与自动记忆。直播弹幕不使用这些私人内容。
      </small>
    </section>
  );
}
