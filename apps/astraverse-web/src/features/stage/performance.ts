import { validateLive2DDirective, type Live2DDirective } from "@/features/live2d/live2dControl";
import { create } from "zustand";
import type { Expression } from "@/shared/state/workspaceStore";
export type Gesture = "none" | "nod" | "tilt" | "open" | "heart";
export interface PerformanceCue {
  emotion: Expression;
  intensity: number;
  gesture: Gesture;
  energy: number;
  duration: number;
  live2d?: Live2DDirective;
  movement: "soft" | "graceful" | "lively";
}
interface PerformanceState {
  phase: "idle" | "listening" | "thinking" | "reply";
  cue: PerformanceCue | null;
  started: number;
  manualUntil: number;
  source: string;
  wink: { side: "left" | "right"; started: number } | null;
  temperament: {
    expressiveness: number;
    energy: number;
    movement: "soft" | "graceful" | "lively";
  };
}
export const usePerformance = create<PerformanceState>(() => ({
  phase: "idle",
  cue: null,
  started: 0,
  manualUntil: 0,
  source: "",
  wink: null,
  temperament: { expressiveness: 0.55, energy: 0.35, movement: "soft" },
}));
export function setAgentTemperament(behavior?: {
  expressiveness: number;
  energy: number;
  movement: "soft" | "graceful" | "lively";
}) {
  usePerformance.setState({
    temperament: behavior || {
      expressiveness: 0.55,
      energy: 0.35,
      movement: "soft",
    },
  });
}
export function pauseAutomaticPerformance(ms = 9000) {
  usePerformance.setState({ manualUntil: performance.now() + ms });
}
let finishTimer: ReturnType<typeof setTimeout> | undefined;
export function beginTurn() {
  clearTimeout(finishTimer);
  usePerformance.setState({
    phase: "thinking",
    manualUntil: 0,
    cue: null,
    started: performance.now(),
  });
}
export function endTurn() {
  clearTimeout(finishTimer);
  usePerformance.setState({ phase: "idle", cue: null });
}
export function setListening(listening: boolean) {
  const phase = usePerformance.getState().phase;
  if (phase === "thinking") return;
  if (listening) {
    clearTimeout(finishTimer);
    usePerformance.setState({ phase: "listening", cue: null });
  } else if (phase === "listening") usePerformance.setState({ phase: "idle" });
}

export function respond(cue: unknown, source = "local-fallback") {
  if (!cue || typeof cue !== "object") {
    endTurn();
    return;
  }
  const raw = cue as Record<string, unknown>;
  const emotions = [
    "neutral",
    "happy",
    "curious",
    "sad",
    "surprised",
    "relaxed",
  ];
  const gestures = ["none", "nod", "tilt", "open", "heart"];
  const number = (v: unknown, fallback: number, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v)
      ? Math.min(max, Math.max(min, v))
      : fallback;
  const value: PerformanceCue = {
    live2d: validateLive2DDirective(raw.live2d),
    emotion: emotions.includes(String(raw.emotion))
      ? (raw.emotion as Expression)
      : "neutral",
    intensity: number(raw.intensity, 0.4, 0, 1),
    gesture: gestures.includes(String(raw.gesture))
      ? (raw.gesture as Gesture)
      : "nod",
    energy: number(raw.energy, 0.3, 0, 1),
    duration: number(raw.duration, 5, 2, 9),
    movement: ["soft", "graceful", "lively"].includes(String(raw.movement))
      ? (raw.movement as PerformanceCue["movement"])
      : usePerformance.getState().temperament.movement,
  };
  clearTimeout(finishTimer);
  usePerformance.setState({
    phase: "reply",
    cue: value,
    started: performance.now(),
    source,
  });
  finishTimer = setTimeout(endTurn, (value.duration + 2) * 1000);
}
