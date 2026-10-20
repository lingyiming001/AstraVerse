import { DEFAULT_RESOURCE_LIMIT_MB, normalizeResourceLimit } from "./resourceLimits";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ThemeId } from "@/shared/preferences/themes";
interface Preferences {
  theme: ThemeId;
  resourceLimitMB: number;
  framing: "portrait" | "full" | "world";
  autoExpression: boolean;
  musicMotion: boolean;
  motionStrength: number;
  danceStrength: number;
  voice: boolean;
  focusMode: boolean;
  sceneEffects: boolean;
  emotionEffects: "auto" | "always" | "off";
  motion: "auto" | "full" | "reduced";
  set: (value: Partial<Omit<Preferences, "set">>) => void;
}
export const usePreferences = create<Preferences>()(
  persist(
    (set) => ({
      resourceLimitMB: DEFAULT_RESOURCE_LIMIT_MB,
      theme: "mint",
      framing: "portrait",
      autoExpression: true,
      musicMotion: true,
      motionStrength: 0.65,
      danceStrength: 1,
      voice: false,
      focusMode: false,
      sceneEffects: true,
      emotionEffects: "auto",
      motion: "auto",
      set,
    }),
    {
      name: "astraverse-preferences",
      version: 4,
      migrate: (stored, version) =>
        ({
          ...(stored as object),
          ...(version < 3 ? { theme: "mint", framing: "portrait" } : {}),
          autoExpression: true,
          musicMotion: true,
          motionStrength: 0.65,
        }) as Preferences,
      merge: (stored, current) => ({
        ...current,
        ...(stored as Partial<Preferences>),
        resourceLimitMB: normalizeResourceLimit((stored as Partial<Preferences> | undefined)?.resourceLimitMB),
      }),
      partialize: ({
        resourceLimitMB,
        theme,
        framing,
        autoExpression,
        musicMotion,
        motionStrength,
        danceStrength,
        voice,
        focusMode,
        sceneEffects,
        emotionEffects,
        motion,
      }) => ({
        resourceLimitMB,
        theme,
        framing,
        autoExpression,
        musicMotion,
        motionStrength,
        danceStrength,
        voice,
        focusMode,
        sceneEffects,
        emotionEffects,
        motion,
      }),
    },
  ),
);
export function useReducedMotion() {
  const mode = usePreferences((s) => s.motion);
  const [system, setSystem] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setSystem(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return mode === "reduced" || (mode === "auto" && system);
}
