import { useStageDisclosure } from "@/shared/ui/useStageDisclosure";
import { usePreferences, useReducedMotion } from "@/shared/preferences/preferences";
import { useWorld } from "@/shared/state/workspaceStore";
import { useCharacterCapabilities, activeModelUrl } from "@/shared/state/characterCapabilities";
import { builtinScenes } from "./sceneCatalog";
import type { Resource } from "@/features/library/resources";
export default function StageExperiencePanel({ onSceneSelect }: { onSceneSelect: (scene: Resource) => void }) {
  const panel=useStageDisclosure();
  const prefs=usePreferences(), state=useWorld();
  const raw=useCharacterCapabilities(s=>s.current);
  const cap=raw?.url===activeModelUrl() ? raw : null;
  const reduced=useReducedMotion();
  const supported=!!cap?.canWalk && state.characterVisible && state.sceneVisible && !reduced;
  return <details ref={panel} className="stage-experience">
    <summary>场景与表现</summary>
    <button type="button" className="stage-panel-close" aria-label="收起场景与表现" onClick={()=>{if(panel.current)panel.current.open=false;}}>收起 ×</button>
    <label><span>快速切换场景</span><select aria-label="快速切换场景" value={state.sceneVisible ? state.sceneUrl || "" : ""} onChange={event=>{
      const scene=builtinScenes.find(item=>item.url===event.target.value);
      if(scene){onSceneSelect(scene);if(panel.current)panel.current.open=false;}
    }}><option value="">选择场景</option>{builtinScenes.map(scene=><option key={scene.id} value={scene.url}>{scene.name}</option>)}</select></label>
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
