import { usePreferences, useReducedMotion } from "@/shared/preferences/preferences";
import { useWorld } from "@/shared/state/workspaceStore";
import { useCharacterCapabilities, activeModelUrl } from "@/shared/state/characterCapabilities";
export default function StageExperiencePanel() {
  const prefs=usePreferences(), state=useWorld();
  const raw=useCharacterCapabilities(s=>s.current);
  const cap=raw?.url===activeModelUrl() ? raw : null;
  const reduced=useReducedMotion();
  const supported=!!cap?.canWalk && state.characterVisible && state.sceneVisible && !reduced;
  return <details className="stage-experience">
    <summary>场景与表现</summary>
    <label><span>环境氛围</span><input type="checkbox" checked={prefs.sceneEffects} onChange={event=>prefs.set({sceneEffects:event.target.checked})}/></label>
    <label><span>表情特效</span><select aria-label="表情特效" value={prefs.emotionEffects} onChange={event=>prefs.set({emotionEffects:event.target.value as typeof prefs.emotionEffects})}><option value="auto">能力不足时补足</option><option value="always">始终显示</option><option value="off">关闭</option></select></label>
    <button type="button" disabled={!supported} aria-pressed={state.walkMode && supported} onClick={()=>{
      const enabled=!state.walkMode;
      state.set({walkMode:enabled,walking:false,walkTarget:null,action:"idle"});
      if (enabled) prefs.set({framing:"world"});
    }}>{state.walkMode && supported ? "结束场景走动" : "开启场景走动"}</button>
    <label><span>移动速度</span><select aria-label="移动速度" value={state.movementMode} onChange={event=>state.set({movementMode:event.target.value as "walk"|"run"})}><option value="walk">走路</option><option value="run">跑步</option></select></label>
    <small>{reduced ? "减弱动态效果已开启，走动暂时停用。" : !cap ? "正在检测角色能力…" : !cap.canWalk ? "当前角色未检测到可用的步行骨骼，保留原地表现。" : !state.sceneVisible ? "选择场景后可以走动。" : "开启后按 WASD / 方向键，或点击地面移动，按住 Shift 跑步；遇到家具会停下。"}</small>
  </details>;
}
