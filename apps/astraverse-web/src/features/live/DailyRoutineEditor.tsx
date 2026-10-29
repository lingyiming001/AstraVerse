import type { LiveProgram } from "@/features/agents/agentApi";
type Daily = LiveProgram["daily"];
const activities = { chat: "随性闲聊", knowledge: "知识分享", memory: "虚构回忆", dream: "虚构梦境", rest: "安静休息" } as const;
export default function DailyRoutineEditor({ value, onChange, showToggle = true }: { value: Daily; onChange: (v: Daily) => void; showToggle?: boolean }) {
  function patch(p: Partial<Daily>) { onChange({ ...value, ...p }); }
  function slot(index: number, p: Partial<Daily["slots"][number]>) { patch({ slots: value.slots.map((s, i) => i === index ? { ...s, ...p } : s) }); }
  return <section className="daily-routine-editor">
    {showToggle && <label className="agent-toggle"><span><strong>全天直播模式</strong><small>按角色作息持续主持，每次启动最多24小时。休息时暂停回复与主动生成，仍保留弹幕接收；需要本地服务持续运行。</small></span><input type="checkbox" checked={value.enabled} onChange={(e) => patch({ enabled: e.target.checked })} /></label>}
    {value.enabled && <div className="agent-form">
      <button type="button" className="secondary" onClick={() => patch({ slots: [
        { start: "00:00", title: "自由陪伴", activity: "chat", topic: "根据角色兴趣自由发挥", interaction: "balanced", music: "auto", mood: "natural" },
        { start: "08:00", title: "上午互动", activity: "chat", topic: "多回应真实弹幕，分享兴趣和知识", interaction: "high", music: "off", mood: "lively" },
        { start: "13:00", title: "午后放松", activity: "chat", topic: "轻松听音乐，少提问，给观众留白", interaction: "low", music: "prefer", mood: "relaxed" },
        { start: "19:00", title: "晚间杂谈", activity: "chat", topic: "自然承接观众话题", interaction: "balanced", music: "auto", mood: "natural" },
      ] })}>使用“上午互动 · 午后音乐”示例（替换下方时段）</button>
      <p className="memory-explainer">保存后启动直播互动。全天模式接管冷场间隔与连续次数，收到弹幕仍优先回应；主动尝试总量不因观众消息而重置。不会自动开播或推流。</p>
      <label className="field"><span>作息时区</span><input value={value.timezone} maxLength={80} onChange={(e) => patch({ timezone: e.target.value })} placeholder="Asia/Shanghai" /><small>使用IANA时区，例如 Asia/Shanghai、Asia/Tokyo、Europe/London。</small></label>
      <div className="agent-field-pair">
        <label className="field"><span>主动话题间隔 · 秒</span><input type="number" min={60} max={1800} value={value.interval} onChange={(e) => patch({ interval: Number(e.target.value) })} /></label>
        <label className="field"><span>24小时主动尝试上限</span><input type="number" min={1} max={1000} value={value.max_attempts} onChange={(e) => patch({ max_attempts: Number(e.target.value) })} /><small>失败、重复、拦截也计入；不含观众触发的回复，非费用预算。</small></label>
      </div>
      <div className="routine-timeline">
        {value.slots.map((item, i) => <div className={`routine-slot ${item.activity === "rest" ? "is-rest" : ""}`} key={i}>
          <div className="routine-slot-heading"><label className="field"><span>开始时间</span><input type="time" value={item.start} disabled={i === 0} onChange={(e) => slot(i, { start: e.target.value })} /></label><label className="field"><span>时段名称</span><input value={item.title} maxLength={40} onChange={(e) => slot(i, { title: e.target.value })} /></label></div>
          <label className="field"><span>活动</span><select value={item.activity} onChange={(e) => slot(i, { activity: e.target.value as typeof item.activity })}>{Object.entries(activities).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
          {item.activity !== "rest" && <label className="field"><span>内容与习惯</span><textarea rows={2} maxLength={300} value={item.topic} onChange={(e) => slot(i, { topic: e.target.value })} placeholder="例如：先分享一个音乐小知识，慢慢展开，不反复问候。" /></label>}
          {item.activity !== "rest" && <>
            <label className="field"><span>弹幕互动</span><select value={item.interaction || "balanced"} onChange={e => slot(i, { interaction: e.target.value as "high" | "balanced" | "low" })}><option value="high">积极 · 多回应、多交流</option><option value="balanced">适中 · 自然交流</option><option value="low">轻量 · 简短回应、少提问</option></select></label>
            <label className="field"><span>音乐倾向</span><select value={item.music || "auto"} onChange={e => slot(i, { music: e.target.value as "auto" | "prefer" | "off" })}><option value="auto">自由选择</option><option value="prefer">偏重听音乐</option><option value="off">不主动选曲</option></select><small>仅从已有可播放音乐中选择；保留手动暂停优先权。</small></label>
            <label className="field"><span>角色状态</span><select value={item.mood || "natural"} onChange={e => slot(i, { mood: e.target.value as "lively" | "natural" | "relaxed" })}><option value="lively">稍活跃</option><option value="natural">自然</option><option value="relaxed">稍放松</option></select></label>
          </>}
          {i > 0 && <button type="button" className="routine-remove" onClick={() => patch({ slots: value.slots.filter((_, n) => n !== i) })}>移除此时段</button>}
        </div>)}
      </div>
      <small className="memory-explainer">每段持续到下一开始时间，末段持续到午夜；按时间递增填写。虚构故事始终标明虚构，不模拟现实身体行为。</small>
      {value.slots.length < 16 && <button type="button" className="secondary" onClick={() => { const last = value.slots.at(-1)!.start; if (last < "23:59") patch({ slots: [...value.slots, { start: "23:59", title: "新时段", activity: "rest", topic: "" }] }); }} disabled={value.slots.at(-1)!.start === "23:59"}>添加时段</button>}
    </div>}
  </section>;
}
