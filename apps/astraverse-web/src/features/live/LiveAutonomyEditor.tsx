import DailyRoutineEditor from "./DailyRoutineEditor";
import SettingsGroup from "@/features/agents/SettingsGroup";
import type { LiveProgram } from "@/features/agents/agentApi";
import { hostingMode, changeHostingMode, type HostingMode } from "./programConfig";

export default function LiveAutonomyEditor({ value, onChange }: {
  value: LiveProgram; onChange: (patch: Partial<LiveProgram>) => void;
}) {
  const mode = hostingMode(value);
  return <section className="agent-form">
    <label className="field"><span>主持方式</span><select value={mode} onChange={e => onChange(changeHostingMode(value, e.target.value as HostingMode))}>
      <option value="reply">仅回应弹幕</option><option value="auto">无人聊天时自动接话</option><option value="daily">按作息主持</option>
    </select><small>选择“按作息主持”后，平台互动和本地试播都会参考时段安排。不启用安排时，按人设与兴趣自由发挥。</small></label>
    {mode === "auto" && <>
      <label className="field"><span>冷场等待时间 · 秒</span><input type="number" min={20} max={600} value={value.idle_interval} onChange={e => onChange({ idle_interval: Number(e.target.value) })} /><small>20–600秒；开启语音回执时，从播完后开始等待。</small></label>
      <SettingsGroup title="自动主持细节" hint="普通平台互动的连续次数限制">
        <label className="field"><span>连续主动发言上限</span><input type="number" min={1} max={10} value={value.idle_max_turns} onChange={e => onChange({ idle_max_turns: Number(e.target.value) })} /><small>到达后等待新弹幕。本地连续试播使用直播页的时长与次数预算。</small></label>
      </SettingsGroup>
    </>}
    {mode === "daily" && <SettingsGroup title="调整作息" hint={`${value.daily.timezone} · ${value.daily.slots.length}个时段`}>
      <DailyRoutineEditor value={value.daily} showToggle={false} onChange={daily => onChange({ daily })} />
    </SettingsGroup>}
    <SettingsGroup title="内容边界" hint="选填：避开的话题与屏蔽词">
      <label className="field"><span>直播内容约定</span><textarea rows={3} maxLength={1500} value={value.safety_notes} onChange={e => onChange({ safety_notes: e.target.value })} placeholder="例如：不讨论观众隐私，不提供商品功效承诺。" /></label>
      <label className="field"><span>屏蔽词 · 每行一个</span><textarea rows={3} maxLength={2000} value={value.blocked_terms} onChange={e => onChange({ blocked_terms: e.target.value })} /><small>最多50行，每行60字；命中后整条回复不投递。</small></label>
      <SettingsGroup title="故事排练背景" hint="仅供手动故事排练，自动主持不播报私密故事">
        <label className="field"><span>虚构世界观与故事背景</span><textarea rows={4} maxLength={2000} value={value.fictional_lore} onChange={e => onChange({ fictional_lore: e.target.value })} /></label>
      </SettingsGroup>
    </SettingsGroup>
  </section>;
}
