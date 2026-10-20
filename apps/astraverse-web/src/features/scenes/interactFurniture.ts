import { useWorld, neutralPose } from "@/shared/state/workspaceStore";
import { characterCapabilities, activeModelUrl } from "@/shared/state/characterCapabilities";
import { usePreferences } from "@/shared/preferences/preferences";
import { pauseAutomaticPerformance } from "@/features/stage/performance";
import { builtinScene } from "./sceneCatalog";
import { sceneInteractions, type FurnitureKind } from "./furniture";
export function availableInteractions() {
  const s=useWorld.getState();
  return s.sceneVisible && s.characterVisible && characterCapabilities()?.canPosture ? sceneInteractions(builtinScene(s.sceneUrl)).sort((a,b)=>Math.hypot(a.position[0]-s.position[0],a.position[2]-s.position[2])-Math.hypot(b.position[0]-s.position[0],b.position[2]-s.position[2])) : [];
}
export function interactFurniture(kind: FurnitureKind, target?: [number,number,number] | string): boolean {
  const state = useWorld.getState();
  const choices=availableInteractions().filter(item=>item.kind===kind && (typeof target === "string" ? item.id===target : !target || Math.hypot(item.position[0]-target[0],item.position[2]-target[2])<.02));
  const anchor=choices.sort((a,b)=>Math.hypot(a.position[0]-state.position[0],a.position[2]-state.position[2])-Math.hypot(b.position[0]-state.position[0],b.position[2]-state.position[2]))[0];
  if (!anchor) return false;
  pauseAutomaticPerformance();
  usePreferences.getState().set({framing:"world"});
  state.set({furniture:{kind,seatHeight:anchor.seatHeight},position:[...anchor.position],rotation:anchor.rotation,action:kind === "sleep" ? "sleep" : "sit",pose:{...neutralPose},walking:false,walkTarget:null});
  return true;
}
export function executeStageInteraction(value: unknown, snapshot: {sceneUrl:string|null; modelUrl:string; revision:number}) {
  const s=useWorld.getState();
  if (s.interactionRevision!==snapshot.revision || s.sceneUrl!==snapshot.sceneUrl || activeModelUrl()!==snapshot.modelUrl) return false;
  if (!value || typeof value!=="object") return false;
  const plan=value as {target_id?:unknown;kind?:unknown};
  const target=availableInteractions().find(item=>item.id===plan.target_id && item.kind===plan.kind);
  return !!target && interactFurniture(target.kind,target.id);
}
