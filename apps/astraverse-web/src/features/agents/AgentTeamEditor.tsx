import type { AgentProfile } from "./agentApi";
export default function AgentTeamEditor({ value, onChange }: { value: AgentProfile["team"]; onChange: (v: AgentProfile["team"]) => void }) {
  function patch(p: Partial<AgentProfile["team"]>) { onChange({ ...value, ...p }); }
  return <section className="agent-form">
    <h4>自动行为</h4><p className="memory-explainer">需要哪项再开启，每位角色独立保存。</p>
    <label className="agent-toggle"><span><strong>自主选歌与选书</strong><small>按喜好选择已有资源，需要开启资源库能力。整本朗读在书籍库或直播页控制。</small></span><input type="checkbox" checked={value.resource_initiative} onChange={(e) => patch({ resource_initiative: e.target.checked })} /></label>
    <label className="agent-toggle"><span><strong>自动表情与动作</strong><small>用于聊天和直播，受当前模型的动作能力限制。</small></span><input type="checkbox" checked={value.motion_enabled} onChange={(e) => patch({ motion_enabled: e.target.checked })} /></label>
    {value.motion_enabled && <label className="field"><span>动作决策方式</span><select value={value.motion_mode} onChange={(e) => patch({ motion_mode: e.target.value as "local" | "llm" })}><option value="local">本地协作 · 无额外模型调用</option><option value="llm">模型导演 · 每轮增加一次判断</option></select><small>本地模式沿用对话表情并检查情绪冲突；模型导演使用该角色文本模型，可调整表情、手势或取消已有动作，不能新增未授权动作。最多等待8秒，失败回退。</small></label>}
    <label className="agent-toggle"><span><strong>启用直播弹幕管理</strong><small>本地处理辱骂、重复刷屏与发言频率，不额外调用模型。拦截消息不打断主动主持。</small></span><input type="checkbox" checked={value.moderation_enabled} onChange={(e) => patch({ moderation_enabled: e.target.checked })} /></label>
    {value.moderation_enabled && <div className="agent-field-pair"><label className="field"><span>同用户最短间隔 · 秒</span><input type="number" min={0} max={120} value={value.viewer_cooldown} onChange={(e) => patch({ viewer_cooldown: Number(e.target.value) })} /><small>0表示不按用户限频。</small></label><label className="field"><span>相同内容去重窗口 · 秒</span><input type="number" min={5} max={300} value={value.repeat_window} onChange={(e) => patch({ repeat_window: Number(e.target.value) })} /></label></div>}
  </section>;
}
