import { characterCommand } from "./controlCommands";
import { useWorld } from "@/shared/state/workspaceStore";
import { characterCapabilities } from "@/shared/state/characterCapabilities";
import { usePreferences } from "@/shared/preferences/preferences";
import { builtinScene, canOccupy } from "@/features/scenes/sceneCatalog";
import { pauseAutomaticPerformance } from "./performance";
import { startHumming, stopHumming } from "./humming";
export type CharacterAbility = "walk" | "run" | "sing" | "headphones_on" | "headphones_off" | "stop";
export function availableAbilities():CharacterAbility[] {
  const cap=characterCapabilities(),s=useWorld.getState(),p=usePreferences.getState();
  if(!s.characterVisible || !cap)return [];
  const result:CharacterAbility[]=["stop"];
  if(cap.canWearHeadphones)result.push("headphones_on","headphones_off");
  if(cap.canSing)result.push("sing");
  if(cap.canWalk && s.sceneVisible && p.motion!=="reduced" && !(p.motion==="auto"&&matchMedia("(prefers-reduced-motion: reduce)").matches))result.push("walk","run");
  return result;
}
export async function applyCharacterAbility(ability:unknown):Promise<boolean> {
  if(!availableAbilities().includes(ability as CharacterAbility))return false;
  const s=useWorld.getState();pauseAutomaticPerformance();
  if(ability==="sing")return startHumming();
  if(ability==="headphones_on"||ability==="headphones_off"){s.set({headphones:ability==="headphones_on"});return true;}
  stopHumming();
  void characterCommand("character.animate",{animation:"idle"}).catch(()=>{});
  if(ability==="stop"){s.set({action:"idle",walkMode:false,singing:false,walking:false,running:false,walkTarget:null});return true;}
  const position:[number,number,number] = s.furniture ? [0,0,0] : [...s.position];
  const scene=builtinScene(s.sceneUrl);
  const candidates:[[number,number],[number,number],[number,number],[number,number]]=[[0,1.8],[1.8,0],[0,-1.8],[-1.8,0]];
  const direction=candidates.find(([dx,dz])=>Array.from({length:12},(_,i)=>(i+1)/12).every(f=>canOccupy(scene,position[0]+dx*f,position[2]+dz*f)));
  if(!direction)return false;
  usePreferences.getState().set({framing:"world"});
  s.set({position,action:"idle",walkMode:true,movementMode:ability==="run"?"run":"walk",walkTarget:[position[0]+direction[0],position[2]+direction[1]],walkRoute:[[position[0],position[2]],[position[0]+direction[0],position[2]+direction[1]]]});
  return true;
}
