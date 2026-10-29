import type { LiveProgram } from "@/features/agents/agentApi";
export type HostingMode = "reply" | "auto" | "daily";
export function hostingMode(value: LiveProgram): HostingMode {
  return value.daily.enabled ? "daily" : value.idle_enabled ? "auto" : "reply";
}
export function changeHostingMode(value: LiveProgram, mode: HostingMode): LiveProgram {
  return {
    ...value,
    idle_enabled: mode === "daily" ? value.idle_enabled : mode === "auto",
    daily: { ...value.daily, enabled: mode === "daily" },
  };
}
