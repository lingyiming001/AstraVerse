import { create } from "zustand";
import { characters, useWorld, type Expression } from "@/shared/state/workspaceStore";
export interface CharacterCapabilities {
  url: string;
  canWalk: boolean;
  canPosture: boolean;
  canWearHeadphones?: boolean;
  canSing?: boolean;
  expressions: Expression[];
}
export const useCharacterCapabilities = create<{ current: CharacterCapabilities | null; load: {url:string; phase:"loading" | "ready" | "error"} | null }>(() => ({ current: null, load:null }));
export function activeModelUrl() {
  const state = useWorld.getState();
  return state.modelUrl || characters[state.character]?.modelUrl || characters[0].modelUrl;
}
export function characterCapabilities() {
  const cap = useCharacterCapabilities.getState().current;
  return cap?.url === activeModelUrl() ? cap : null;
}
