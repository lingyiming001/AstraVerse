import { create } from "zustand";
export interface Live2DCapabilities {
  model_key: string;
  modelUrl: string;
  motions: string[];
  expressions: string[];
  parameters: string[];
}
export interface Live2DDirective {
  model_key: string;
  motion?: string | null;
  expression?: string | null;
  look?: "user" | "left" | "right" | "up" | "down" | "none";
  blink?: "none" | "both" | "left" | "right";
  parameters: { id: string; value: number }[];
}
export const useLive2DControl = create<{ capabilities: Live2DCapabilities | null }>(() => ({ capabilities: null }));
export function validateLive2DDirective(raw: unknown): Live2DDirective | undefined {
  const cap = useLive2DControl.getState().capabilities;
  if (!cap || !raw || typeof raw !== "object") return;
  const value = raw as Record<string, unknown>;
  if (value.model_key !== cap.model_key) return;
  const parameters = Array.isArray(value.parameters) ? value.parameters.slice(0, 8).flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const { id, value: number } = item as { id?: unknown; value?: unknown };
    return typeof id === "string" && cap.parameters.includes(id) && typeof number === "number" && Number.isFinite(number)
      ? [{ id, value: Math.max(-1, Math.min(1, number)) }] : [];
  }) : [];
  return {
    model_key: cap.model_key,
    motion: typeof value.motion === "string" && cap.motions.includes(value.motion) ? value.motion : undefined,
    expression: typeof value.expression === "string" && cap.expressions.includes(value.expression) ? value.expression : undefined,
    look: ["user", "left", "right", "up", "down", "none"].includes(String(value.look)) ? value.look as Live2DDirective["look"] : "user",
    blink: ["none", "both", "left", "right"].includes(String(value.blink)) ? value.blink as Live2DDirective["blink"] : "none",
    parameters,
  };
}
