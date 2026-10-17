import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
interface Preferences {
  theme: "dark" | "light";
  voice: boolean;
  focusMode: boolean;
  motion: "auto" | "full" | "reduced";
  set: (value: Partial<Omit<Preferences, "set">>) => void;
}
export const usePreferences = create<Preferences>()(
  persist(
    (set) => ({
      theme: "dark",
      voice: false,
      focusMode: false,
      motion: "auto",
      set,
    }),
    {
      name: "astraverse-preferences",
      version: 1,
      partialize: ({ theme, voice, focusMode, motion }) => ({
        theme,
        voice,
        focusMode,
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
