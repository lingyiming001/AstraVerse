import { useState } from 'react';
import { playbackDefaults, readPlaybackConfig, savePlaybackConfig, type PlaybackConfig } from '@/shared/preferences/playbackConfig';
export default function PlaybackSettings() {
  const [config, setConfig] = useState(readPlaybackConfig);
  const patch = (value: Partial<PlaybackConfig>) => { const next = { ...config, ...value }; savePlaybackConfig(next); setConfig(next); };
  return <section className="preference-card">
    <div className="preference-heading"><div><h4>播放与字幕</h4><p>自动保存到当前浏览器。字幕实时生效，朗读分段从下一段生效。</p></div></div>
    <label className="field"><span>每行最多 {config.captionChars} 字 · 每页最多两行</span><input type="range" min={16} max={40} value={config.captionChars} onChange={e => patch({ captionChars: Number(e.target.value) })}/></label>
    <label className="field"><span>字幕提前量 {Math.round(config.captionLead * 100)}%</span><input type="range" min={0} max={15} value={Math.round(config.captionLead * 100)} onChange={e => patch({ captionLead: Number(e.target.value) / 100 })}/><small>按本段音频进度估算；文字滞后时增大，过早时减小，不是逐字精准同步。</small></label>
    <label className="field"><span>朗读分段长度</span><select value={config.bookSegmentChars} onChange={e => patch({ bookSegmentChars: Number(e.target.value) })}><option value={60}>短段 · 字幕更紧凑</option><option value={120}>均衡 · 推荐</option><option value={240}>长段 · 减少生成次数</option></select></label>
    <label className="agent-toggle"><span>提前生成下一段语音<small>减少句间等待；可能生成暂停后未播放的音频，产生调用费用。</small></span><input type="checkbox" checked={config.prefetch} onChange={e => patch({ prefetch: e.target.checked })}/></label>
    <button className="secondary" onClick={() => { savePlaybackConfig(playbackDefaults); setConfig({ ...playbackDefaults }); }}>恢复播放默认值</button>
  </section>;
}
