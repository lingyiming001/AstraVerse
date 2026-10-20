import { useEffect, useState } from "react";
import { Radio, Settings2, Play, Pause, Link2 } from "lucide-react";
import {
  liveRequest,
  liveChanged,
  liveStatus,
  type LiveChannel,
  type LiveEvent,
  type LiveInventory,
} from "@/features/live/liveApi";
export default function LiveChatPanel({
  agentId,
  agentName,
  onSettings,
}: {
  agentId: string;
  agentName: string;
  onSettings: () => void;
}) {
  const [channels, setChannels] = useState<LiveChannel[]>([]);
  const [selected, setSelected] = useState("");
  const [feed, setFeed] = useState<LiveEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    async function refresh() {
      try {
        const data = await liveRequest<LiveInventory>();
        if (!disposed) {
          setChannels(data.channels);
          setSelected((p) =>
            data.channels.some((c) => c.id === p)
              ? p
              : data.channels.find((c) => c.agent_id === agentId)?.id ||
                data.channels[0]?.id ||
                "",
          );
        }
      } catch (e) {
        if (!disposed)
          setError(e instanceof Error ? e.message : "直播服务未连接");
      }
    }
    void refresh();
    const tick = setInterval(() => void refresh(), 5000);
    window.addEventListener("astraverse:live-changed", refresh);
    return () => {
      disposed = true;
      clearInterval(tick);
      window.removeEventListener("astraverse:live-changed", refresh);
    };
  }, [agentId]);
  useEffect(() => {
    setFeed([]);
    let disposed = false;
    if (selected)
      void liveRequest<{ events: LiveEvent[] }>(`/channels/${selected}/events`)
        .then((d) => {
          if (!disposed) setFeed(d.events);
        })
        .catch(() => {});
    const onEvent = (event: Event) => {
      const value = (event as CustomEvent<LiveEvent>).detail;
      if (value.channel_id === selected)
        setFeed((p) => [...p, value].slice(-80));
    };
    window.addEventListener("astraverse:danmaku", onEvent);
    return () => {
      disposed = true;
      window.removeEventListener("astraverse:danmaku", onEvent);
    };
  }, [selected]);
  const row = channels.find((c) => c.id === selected);
  const owned = row?.agent_id === agentId;
  const running = row?.status && !["stopped", "error"].includes(row.status);
  async function act(action: "bind" | "unbind" | "start" | "stop") {
    if (!row) return;
    setBusy(true);
    setError("");
    try {
      const updated = await liveRequest<LiveChannel>(
        `/channels/${row.id}/${action === "bind" || action === "unbind" ? "binding" : action}`,
        action === "bind" || action === "unbind" ? "PUT" : "POST",
        action === "bind" || action === "unbind"
          ? { agent_id: action === "bind" ? agentId : null }
          : undefined,
      );
      setChannels((p) => p.map((c) => (c.id === updated.id ? updated : c)));
      liveChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="live-chat-panel">
      <summary>
        <Radio size={14} />
        <span>直播弹幕</span>
        <small>
          {row
            ? owned
              ? `${agentName}已绑定 · ${liveStatus[row.status || "stopped"]}`
              : "选择直播间并绑定角色"
            : "配置平台后绑定角色"}
        </small>
      </summary>
      <div className="live-chat-body">
        <div className="live-chat-controls">
          <select
            aria-label="直播间"
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setError("");
            }}
          >
            <option value="" disabled>
              选择直播间
            </option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.room}
                {c.agent_id === agentId ? " · 已绑定" : ""}
              </option>
            ))}
          </select>
          <button
            title="配置直播平台"
            aria-label="配置直播平台"
            onClick={onSettings}
          >
            <Settings2 size={14} />
          </button>
        </div>
        {row ? (
          <>
            <div className="live-chat-controls">
              <button
                disabled={busy}
                onClick={() => void act(owned ? "unbind" : "bind")}
              >
                <Link2 size={12} />
                {owned ? "解除绑定" : `绑定${agentName}`}
              </button>
              <button
                className={running ? "" : "primary"}
                disabled={busy || !owned}
                onClick={() => void act(running ? "stop" : "start")}
              >
                {running ? <Pause size={12} /> : <Play size={12} />}{" "}
                {running ? "暂停互动" : "启动互动"}
              </button>
            </div>
            <p className="live-chat-hint">
              {row.transport === "bridge"
                ? "需外部弹幕桥接程序；房间号不会自动接入平台。"
                : "Twitch 直连机器人账号。"}
              {row.keyword ? `关键词：${row.keyword} · ` : ""}
              {row.cooldown}秒/次 ·{" "}
              {row.send_to_platform ? "允许发回平台" : "本地回应"} · 排队
              {row.queued || 0}
            </p>
            {row.error && (
              <p role="alert" className="live-chat-error">
                {row.error}
              </p>
            )}
            <div
              className="live-feed"
              role="log"
              aria-label="直播弹幕与角色回应"
            >
              {feed.length ? (
                feed.slice(-20).map((e, i) => (
                  <div key={`${e.at}-${i}`} className={`live-feed-${e.kind}`}>
                    <strong>
                      {e.kind === "reply" ? "角色回应" : e.user || "直播服务"}
                    </strong>
                    <span>{e.text}</span>
                    {e.mode === "local-rules" && <small>未连接大模型</small>}
                  </div>
                ))
              ) : (
                <p>启动后，收到的弹幕和角色回应会显示在这里。</p>
              )}
            </div>
          </>
        ) : (
          <button onClick={onSettings}>添加直播平台</button>
        )}
        {error && (
          <p role="alert" className="live-chat-error">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
