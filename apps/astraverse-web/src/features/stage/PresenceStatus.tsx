import { usePerformance } from "@/features/stage/performance";
import { useWorld } from "@/shared/state/workspaceStore";
import { usePreferences, useReducedMotion } from "@/shared/preferences/preferences";
export default function PresenceStatus() {
  const singing = useWorld(s=>s.singing),walking=useWorld(s=>s.walking),running=useWorld(s=>s.running);
  const furniture = useWorld(s => s.furniture);
  const phase = usePerformance((s) => s.phase);
  const speaking = useWorld((s) => s.speaking);
  const playing = useWorld((s) => s.playing);
  const auto = usePreferences((s) => s.autoExpression);
  const natural = useWorld((s) => s.naturalMotion);
  const reduced = useReducedMotion();
  const music = usePreferences((s) => s.musicMotion);
  return (
    <span aria-live="polite">
      {phase === "thinking"
        ? "正在认真想一想…"
        : speaking
          ? "正在和你说话"
          : singing ? "正在哼唱原创旋律（合成音色）"
          : walking ? running ? "正在跑步" : "正在走路"
          : furniture?.kind === "sleep" ? "正在床上安静休息"
          : furniture?.kind === "study" ? "正在书桌前陪你学习"
          : furniture?.kind === "sit" ? "正在椅子上陪你休息"
          : auto && phase === "listening"
            ? "正在认真倾听"
            : auto && !reduced && phase === "reply"
              ? "用表情回应你"
              : playing && music && natural && !reduced
                ? "正随旋律轻轻摇曳"
                : "在线，随时陪伴你"}
    </span>
  );
}
