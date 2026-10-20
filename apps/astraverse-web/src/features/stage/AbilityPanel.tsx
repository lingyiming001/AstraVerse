import { useEffect, useRef, useState } from "react";
import { useWorld, type Expression } from "@/shared/state/workspaceStore";
import { useCharacterCapabilities } from "@/shared/state/characterCapabilities";
import { availableAbilities, applyCharacterAbility } from "./characterAbilities";
import { stopHumming } from "./humming";
import { pauseAutomaticPerformance, usePerformance } from "./performance";
import "./abilities.css";
export default function CharacterAbilities({active}:{active:boolean}) {
  const s=useWorld(),cap=useCharacterCapabilities(state=>state.current),[notice,setNotice]=useState("");
  const details=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{setNotice("");if(details.current){details.current.open=false;const panel=details.current.querySelector(".ability-popover");if(panel)panel.scrollTop=0;}},[s.actorId]);
  useEffect(()=>{if(!active){stopHumming();useWorld.getState().set({walkMode:false});}return stopHumming;},[active]);
  const abilities=availableAbilities();
  const apply=async (value:string)=>{const ok=await applyCharacterAbility(value);setNotice(ok ? "" : "当前角色、场景或浏览器不支持这个能力");};
  return <details ref={details} className="character-abilities"><summary>能力与配件</summary><div className="ability-popover">
    <strong>面部表情</strong><div className="ability-buttons">
      {([['neutral','自然'],['happy','开心'],['curious','好奇'],['sad','难过'],['surprised','惊讶'],['relaxed','放松']] as [Expression,string][]).map(([id,label])=><button key={id} aria-pressed={s.expression===id} onClick={()=>{pauseAutomaticPerformance();s.set({expression:id});}}>{label}</button>)}
      <button disabled={!cap?.canWearHeadphones} onClick={()=>{pauseAutomaticPerformance();usePerformance.setState({wink:{side:"left",started:performance.now()}});}}>眨左眼</button>
    </div>
    <label>表情强度<input type="range" aria-label="表情强度" min="0" max="1" step=".05" value={s.expressionIntensity} onChange={event=>{pauseAutomaticPerformance();s.set({expressionIntensity:Number(event.target.value)});}}/></label>
    <small>按模型已有表情绑定显示；缺少绑定时使用表情特效。</small>
    <strong>移动与声音</strong><div className="ability-buttons">
      <button disabled={!abilities.includes("walk")} aria-pressed={s.walkMode&&s.movementMode==="walk"} onClick={()=>void apply("walk")}>走一走</button>
      <button disabled={!abilities.includes("run")} aria-pressed={s.walkMode&&s.movementMode==="run"} onClick={()=>void apply("run")}>跑一跑</button>
      <button disabled={!abilities.includes("sing")} aria-pressed={s.singing} onClick={()=>void apply(s.singing ? "stop" : "sing")}>{s.singing ? "停止哼唱" : "哼唱旋律"}</button>
      <button onClick={()=>void apply("stop")}>停止动作</button>
    </div><small>哼唱为原创无词旋律、合成音色。走动时可按住 Shift 跑步。</small>
    <strong>配件</strong><button disabled={!abilities.includes("headphones_on")} aria-pressed={s.headphones} onClick={()=>void apply(s.headphones ? "headphones_off" : "headphones_on")}>{s.headphones ? "摘下耳机" : "戴上耳机"}</button>
    {notice&&<small role="status">{notice}</small>}
  </div></details>;
}
