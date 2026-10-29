import SourcePanel from "@/features/rag/SourcePanel";
import "./liveUsability.css";
import LiveMemoryPanel from "./LiveMemoryPanel";
import { usePreferences } from "@/shared/preferences/preferences";
import LiveProgramTools from "./LiveProgramTools";
import { stopCharacterSpeech, useSpeech } from "@/features/chat/speech";
import { useBookReading } from "@/features/library/bookReading";
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
  expanded = false,
}: {
  agentId: string;
  agentName: string;
  onSettings: () => void;
  expanded?: boolean;
}) {
  const speechPhase = useSpeech((s) => s.phase);
  const speechAgent = useSpeech(s => s.agentId);
  const reading = useBookReading(s => s.readers[agentId]?.reading);
  const [minutes, setMinutes] = useState(60);
  const [interval, setIntervalSeconds] = useState(10);
  const [soloVoice, setSoloVoice] = useState(true);
  const [channels, setChannels] = useState<LiveChannel[]>([]);
  const [selected, setSelected] = useState("");
  const [feed, setFeed] = useState<LiveEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [captionNotice, setCaptionNotice] = useState("");
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
  const solo = channels.find((c) => c.transport === "local" && c.agent_id === agentId);
  const soloRunning = solo?.status === "connected";
  const owned = row?.agent_id === agentId;
  const running = row?.status && !["stopped", "error"].includes(row.status);
  async function soloAction() {
    setBusy(true); setError("");
    try {
      if (!soloRunning) stopCharacterSpeech();
      const updated = soloRunning && solo
        ? await liveRequest<LiveChannel>(`/channels/${solo.id}/stop`, "POST")
        : await liveRequest<LiveChannel>("/solo/start", "POST", { agent_id: agentId, duration_minutes: minutes, interval, voice: soloVoice });
      if (soloRunning) stopCharacterSpeech();
      else if (soloVoice) usePreferences.getState().set({ voice: true });
      setChannels((old) => [...old.filter((c) => c.id !== updated.id), updated]);
      setSelected(updated.id); liveChanged();
    } catch (e) { setError(e instanceof Error ? e.message : "直播模式启动失败"); }
    finally { setBusy(false); }
  }
  async function copyCaptionUrl() {
    if (!row) return;
    const url = new URL("/live-captions.html", location.origin);
    url.searchParams.set("channel", row.id);
    try {
      await navigator.clipboard.writeText(url.href);
      setCaptionNotice("字幕源地址已复制，可粘贴到 OBS 等直播软件的浏览器源。建议尺寸 1920 × 1080。");
    } catch {
      setCaptionNotice(`复制失败，请手动复制：${url.href}`);
    }
  }
  async function act(action: "bind" | "unbind" | "start" | "stop") {
    if (!row) return;
    if (action === "stop" && [`live:${row.id}`, `live-idle:${row.id}`].includes(useSpeech.getState().key || "")) stopCharacterSpeech();
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
    <details className={`live-chat-panel${expanded ? " is-expanded" : ""}`} open={expanded || undefined}>
      <summary onClick={(event) => { if (expanded) event.preventDefault(); }}>
        <Radio size={14} />
        <span>{expanded ? "直播间" : "直播弹幕"}</span>
        <small>
          {row
            ? owned
              ? `${agentName}已绑定 · ${liveStatus[row.status || "stopped"]}`
              : "选择直播间并绑定角色"
            : "配置平台后绑定角色"}
        </small>
      </summary>
      <div className="live-chat-body">
        <div className="live-quick-guide"><strong>{agentName}的直播控制台</strong><p>先在本地试播，满意后打开直播画面。需要回应观众时，再接入平台弹幕。</p><button className="secondary" onClick={onSettings}><Settings2 size={14}/>设置角色话题与直播平台</button></div>
        <section className="solo-live-card" aria-label="无人直播测试">
          <div className="solo-live-heading"><span className={soloRunning ? "solo-live-indicator active" : "solo-live-indicator"} /><strong>1 · 本地试播</strong><small>{soloRunning ? "进行中" : "未开始"}</small></div>
          <p>让{agentName}自主说话，不需要连接直播平台。</p>
          <div className="solo-live-options">
            <label>直播持续时长<select disabled={busy || soloRunning} value={soloRunning ? solo?.solo?.duration_minutes ?? minutes : minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              <option value={10}>10分钟</option><option value={60}>1小时</option><option value={240}>4小时</option><option value={1440}>24小时</option>
            </select></label>
            <label>两轮发言之间的停顿<select disabled={busy || soloRunning} value={soloRunning ? solo?.solo?.interval ?? interval : interval} onChange={(e) => setIntervalSeconds(Number(e.target.value))}>
              <option value={5}>每轮等待5秒 · 紧凑</option><option value={10}>每轮等待10秒</option><option value={20}>每轮等待20秒</option><option value={45}>每轮等待45秒</option><option value={120}>每轮等待2分钟</option><option value={300}>每轮等待5分钟 · 长留白</option>
            </select></label>
          </div>
          <p className="live-chat-hint">停顿从语音播完后计算，角色会根据话题调整。修改时长、停顿或语音开关前，请先停止试播。</p>
          <label className="solo-live-voice"><input type="checkbox" checked={soloVoice} disabled={busy || soloRunning} onChange={(e) => setSoloVoice(e.target.checked)} />开启角色语音朗读</label>
          <button className={soloRunning ? "secondary" : "primary"} disabled={busy} onClick={() => void soloAction()}>
            {soloRunning ? <Pause size={15}/> : <Radio size={15}/>}{busy ? "处理中…" : soloRunning ? "停止本地试播" : "开始本地试播"}
          </button>
          {solo?.solo && <div role="status" className="solo-live-progress">
            {soloRunning && <span>{speechAgent === agentId && speechPhase === 'preparing' ? '正在准备声音' : speechAgent === agentId && speechPhase === 'speaking' ? reading?.active ? '正在朗读书籍' : '正在讲话' : reading?.active ? '正在衔接下一段阅读' : solo.solo.generating ? '正在思考下一段内容' : '等待下一轮发言'}</span>}
            <strong>{soloRunning ? reading?.active ? `直播进行中 · 正在读《${reading.title}》，杂谈暂候` : solo.solo.speaking ? "直播进行中 · 正在准备或播放语音，播完后再接话" : solo.solo.generating ? "直播进行中 · 正在生成下一轮…" : `直播进行中 · 等待下一轮，约${Math.floor(solo.solo.next_in_seconds / 60)}分${solo.solo.next_in_seconds % 60}秒后开始生成` : ({ manual: "已手动停止", ended: "直播持续时长已结束", budget: "生成次数已达上限", "model-error": "模型连续失败，已停止", "model-unavailable": "模型不可用，已停止" } as Record<string, string>)[solo.solo.reason] || "测试已停止"}</strong>
            <span>主动发言 {solo.metrics?.proactive || 0} 次 · 剩余约 {Math.ceil(solo.solo.remaining_seconds / 60)} 分钟</span>
          </div>}
          {soloRunning && speechPhase === "error" && <p role="alert">语音播放失败，请检查语音设置与浏览器播放权限；文字主持仍会继续。</p>}
          <div className="live-output-card">
            <div><strong>2 · 打开直播画面</strong><span>独立窗口，只显示角色、场景和可选字幕</span><label><input type="checkbox" defaultChecked={localStorage.getItem("astraverse:broadcast-captions") === "true"} onChange={event => localStorage.setItem("astraverse:broadcast-captions", String(event.target.checked))} />显示底部字幕 · 最多两行，随朗读翻页</label></div>
            <button className="secondary" onClick={() => window.open("/?view=broadcast", "astraverse-broadcast", "popup,width=1280,height=720")}>打开画面 ↗</button>
          </div>
          <details className="live-setup-help"><summary>如何把画面播到平台？</summary><p>在 OBS 添加“窗口采集”，选择“AstraVerse 直播画面”，并配置浏览器声音采集。开启底部字幕即可连同画面一起采集。请保持主页面运行、角色可见。本地试播不会自动推流；模型和语音调用可能产生费用。</p></details>
        </section>

        <div className="live-section-heading"><strong>3 · 接收观众弹幕（可选）</strong><span>连接平台后，角色才能读取并回应观众。</span></div>

        {channels.length > 0 && <div className="live-chat-controls">
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
                {c.transport === "local" ? "本地试播记录" : `${c.name} · ${c.room}`}
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
            平台设置
          </button>
        </div>}
        {row ? (
          <>
            {row.transport !== "local" && <div className="live-chat-controls">
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
            </div>}
            <p className="live-chat-hint">
              {row.transport === "local" ? "当前查看本地试播记录。要接收观众弹幕，请先在“平台设置”添加直播间，再在上方选择。" : row.transport === "bridge"
                ? "需外部弹幕桥接程序；房间号不会自动接入平台。"
                : row.transport === "bilibili" ? "B站官方弹幕接入 · 本地语音与字幕回应。" : row.transport === "youtube" ? "YouTube 官方聊天接入。" : "Twitch 直连机器人账号。"}
              {row.keyword ? `关键词：${row.keyword} · ` : ""}
              {row.cooldown}秒/次 ·{" "}
              {row.send_to_platform ? "允许发回平台" : "本地回应"} · 排队
              {row.queued || 0}
            </p>
            {row.metrics && <details className="live-setup-help"><summary>运行统计 · 收到 {row.metrics.received} · 回应 {row.metrics.replies} · 失败 {row.metrics.failed}</summary><p className="live-chat-hint" role="status">
              本次服务运行：收到 {row.metrics.received} · 已回应 {row.metrics.replies} · 主动 {row.metrics.proactive || 0} · 拦截 {row.metrics.blocked || 0} · 失败 {row.metrics.failed} · 过滤 {row.metrics.filtered} · 过期 {row.metrics.expired} · 最近生成 {(row.metrics.latency_ms / 1000).toFixed(1)} 秒（含推理排队）
            </p></details>}
            {running && typeof row.autonomy?.elapsed_seconds === "number" && <p className="live-chat-hint">本场已运行 {Math.floor(row.autonomy.elapsed_seconds / 3600)}小时{Math.floor(row.autonomy.elapsed_seconds % 3600 / 60)}分钟 · 角色根据实际计时承接话题</p>}
            {row.autonomy?.daily && running && <div className="daily-live-status" role="status"><strong>全天直播 · {row.autonomy.daily.title}</strong><span>{row.autonomy.daily.reason === "ended" ? "24小时已结束，重新启动互动可开启新一轮" : row.autonomy.daily.reason === "budget" ? "主动发言已达总量上限，仍可回应观众" : row.autonomy.daily.reason === "rest" ? "休息时段 · 暂停生成" : "按作息自主主持"}</span><small>下一时段 {row.autonomy.daily.next_start} · {row.autonomy.daily.next_title} · 主动尝试 {row.autonomy.daily.attempts}/{row.autonomy.daily.limit}</small></div>}
            {!row.solo && !row.autonomy?.daily && row.autonomy?.enabled && running && <p className="live-chat-hint" role="status">冷场主持 · {row.autonomy.generating ? "正在准备话题，收到弹幕会打断" : row.autonomy.count >= row.autonomy.limit ? "本轮已达上限，等待观众发言" : `本轮 ${row.autonomy.count}/${row.autonomy.limit} 次`}</p>}
            <details className="live-setup-help"><summary>高级字幕输出（OBS 浏览器源）</summary><p className="live-chat-hint">仅在需要单独采集文字时使用；与上方直播画面的朗读字幕是两种输出方式。</p><div className="live-chat-controls">
              <button onClick={() => void copyCaptionUrl()}>复制直播字幕源地址</button>
              <a href={`/live-captions.html?channel=${encodeURIComponent(row.id)}`} target="_blank" rel="noopener noreferrer">预览字幕源 ↗</a>
            </div></details>
            {captionNotice && <p role="status" className="live-chat-hint">{captionNotice}</p>}
            {owned && <LiveProgramTools channel={row} agentId={agentId} running={!!running} />}
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
                      {e.kind === "reply" ? e.proactive ? "角色主动话题" : "角色回应" : e.user || "直播服务"}
                    </strong>
                    <span>{e.text}{e.agent_id && <SourcePanel sources={e.sources} agentId={e.agent_id} public />}</span>
                    {e.mode === "local-rules" && <small>未连接大模型</small>}
                  </div>
                ))
              ) : (
                <p>{row.transport === "local" ? "开始本地试播后，角色发言会显示在这里。" : "绑定角色并启动互动后，观众弹幕和角色回应会显示在这里。"}</p>
              )}
            </div>
          </>
        ) : (
          <div className="live-setup-empty"><h3>也可以连接真实直播间</h3><p>上方可直接测试无人主持；接收平台观众弹幕请先配置直播间。</p><button className="primary" onClick={onSettings}>配置直播平台</button><small>当前仅为角色预览，尚未连接直播间。</small></div>
        )}
        <details className="live-setup-help"><summary>直播记忆 · 查看与清除</summary><LiveMemoryPanel key={agentId} agentId={agentId} /></details>
        {error && (
          <p role="alert" className="live-chat-error">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
