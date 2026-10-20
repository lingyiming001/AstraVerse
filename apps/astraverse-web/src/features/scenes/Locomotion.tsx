import { isRestAction } from "@/features/stage/restPose";
import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useWorld } from "@/shared/state/workspaceStore";
import { characterCapabilities } from "@/shared/state/characterCapabilities";
import { usePreferences, useReducedMotion } from "@/shared/preferences/preferences";
import { builtinScene, canOccupy } from "@/features/scenes/sceneCatalog";
export default function Locomotion({ active }: { active: boolean }) {
  const keys = useRef(new Set<string>());
  const cadence = useRef(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    const movement = new Set(["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright"]);
    const down = (event: KeyboardEvent) => {
      if (!active || !useWorld.getState().walkMode || event.altKey || event.metaKey || event.ctrlKey || event.isComposing) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input,textarea,select,[role=dialog]"))) return;
      const key = event.key.toLowerCase();
      if (key === "shift") { keys.current.add(key); return; }
      if (movement.has(key)) { event.preventDefault(); if(!keys.current.has(key))useWorld.getState().set({action:"idle",walkRoute:null,walkTarget:null}); keys.current.add(key); }
    };
    const up = (event: KeyboardEvent) => { keys.current.delete(event.key.toLowerCase()); };
    const clear = () => { keys.current.clear(); useWorld.getState().set({walking:false,running:false,walkTarget:null,walkRoute:null}); };
    const visibility = () => { if (document.hidden) clear(); };
    window.addEventListener("keydown",down); window.addEventListener("keyup",up); window.addEventListener("blur",clear); document.addEventListener("visibilitychange",visibility);
    return () => { window.removeEventListener("keydown",down); window.removeEventListener("keyup",up); window.removeEventListener("blur",clear); document.removeEventListener("visibilitychange",visibility); clear(); };
  }, [active]);
  useFrame((_, delta) => {
    cadence.current += Math.min(delta,.05);
    if (cadence.current < 1/30) return;
    const dt = Math.min(cadence.current,.06); cadence.current=0;
    const state=useWorld.getState();
    if (isRestAction(state.action) || !active || !state.walkMode || !state.characterVisible || !state.sceneVisible || reduced || usePreferences.getState().framing !== "world" || !characterCapabilities()?.canWalk) {
      keys.current.clear();
      if (state.walking || state.walkTarget) state.set({walking:false,running:false,walkTarget:null});
      return;
    }
    const held=keys.current;
    let dx=Number(held.has("d") || held.has("arrowright"))-Number(held.has("a") || held.has("arrowleft"));
    let dz=Number(held.has("s") || held.has("arrowdown"))-Number(held.has("w") || held.has("arrowup"));
    const keyboard=dx!==0 || dz!==0;
    if (!keyboard && state.walkTarget) { dx=state.walkTarget[0]-state.position[0]; dz=state.walkTarget[1]-state.position[2]; }
    const distance=Math.hypot(dx,dz);
    if (distance < .07) {
      if(state.walkRoute){
        const [a,b]=state.walkRoute;
        state.set({walkTarget:Math.hypot(state.position[0]-a[0],state.position[2]-a[1])<.15 ? b : a});
      } else if(state.walking || state.walkTarget)state.set({walking:false,running:false,walkTarget:null});
      return;
    }
    const running=state.movementMode === "run" || held.has("shift");
    const step=Math.min((running ? 3.05 : 1.45)*dt,keyboard ? Infinity : distance);
    dx=dx/distance*step; dz=dz/distance*step;
    const scene=builtinScene(state.sceneUrl);
    let [x,,z]=state.position;
    if (canOccupy(scene,x+dx,z)) x+=dx;
    if (canOccupy(scene,x,z+dz)) z+=dz;
    const moved=Math.hypot(x-state.position[0],z-state.position[2])>.0001;
    if (moved) state.set({position:[x,0,z],rotation:Math.atan2(dx,dz)*180/Math.PI,walking:true,running,...(keyboard ? {walkTarget:null} : {})});
    else if (state.walking || state.walkTarget) state.set({walking:false,running:false,walkTarget:null});
  });
  return null;
}
