import { useEffect, useState } from "react";
import { useWorld, type Expression } from "@/shared/state/workspaceStore";
import { useCharacterCapabilities, activeModelUrl } from "@/shared/state/characterCapabilities";
import { usePreferences, useReducedMotion } from "@/shared/preferences/preferences";
import { usePerformance } from "@/features/stage/performance";
function Symbol({ emotion }: { emotion: Expression }) {
  return <svg viewBox="0 0 80 64" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {emotion === "happy" ? <><path d="M40 50 19 30C5 13 28 3 40 20 52 3 75 13 61 30Z" fill="currentColor" fillOpacity=".16"/><path d="m12 6 2 7m52-7-2 7"/></> : emotion === "sad" ? <><path d="M22 32c-18 0-14-22 0-22 5-13 25-10 28 1 23-2 24 21 5 21Z" fill="currentColor" fillOpacity=".1"/><path d="m25 42-3 8m18-8-3 8m18-8-3 8"/></> : emotion === "curious" ? <><path d="M28 21c0-19 29-19 29-1 0 9-14 9-14 20"/><circle cx="43" cy="52" r="2" fill="currentColor"/></> : emotion === "surprised" ? <><path d="m36 9 2 27m12-27-2 27"/><circle cx="38" cy="48" r="2" fill="currentColor"/><circle cx="48" cy="48" r="2" fill="currentColor"/><path d="m14 16 8 7m42-7-8 7"/></> : <><path d="M49 8C20 5 17 36 33 46 46 55 62 49 67 36 45 43 32 23 49 8Z" fill="currentColor" fillOpacity=".13"/><path d="m14 12 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z"/></>}
  </svg>;
}
const labels: Partial<Record<Expression,string>> = {happy:"开心",sad:"低落",curious:"好奇",surprised:"惊讶",relaxed:"放松"};
export default function EmotionEffects() {
  const expression=useWorld(s=>s.expression), intensity=useWorld(s=>s.expressionIntensity), visible=useWorld(s=>s.characterVisible);
  const raw=useCharacterCapabilities(s=>s.current), phase=usePerformance(s=>s.phase), cue=usePerformance(s=>s.cue), started=usePerformance(s=>s.started), manual=usePerformance(s=>s.manualUntil);
  const mode=usePreferences(s=>s.emotionEffects), auto=usePreferences(s=>s.autoExpression), reduced=useReducedMotion();
  const effective=auto && phase==="reply" && performance.now()>=manual && cue ? cue.emotion : expression;
  const strength=auto && phase==="reply" && performance.now()>=manual && cue ? cue.intensity : intensity;
  const [fresh,setFresh]=useState(false);
  useEffect(()=>{setFresh(true);const timer=setTimeout(()=>setFresh(false), Math.min(11000,Math.max(4500,((cue?.duration || 4)+1)*1000)));return ()=>clearTimeout(timer);},[effective,started,expression,intensity,manual,mode,raw?.url]);
  const cap=raw?.url===activeModelUrl() ? raw : null;
  const directed=cue?.live2d?.expression;
  if (!visible || !cap || !fresh || mode==="off" || strength<.05 || effective==="neutral" || (mode==="auto" && (cap.expressions.includes(effective) || (phase==="reply" && directed)))) return null;
  const content=<div className={`emotion-effect emotion-${effective}${reduced ? " is-still" : ""}`} role="img" aria-label={`${labels[effective]}表情特效`}><Symbol emotion={effective}/></div>;
  return <div className="emotion-overlay">{content}</div>;
}
