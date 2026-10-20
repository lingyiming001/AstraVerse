import { create } from "zustand";
export const useSpeech = create<{
  phase: "idle" | "preparing" | "speaking" | "error";
  source: "model" | "system" | null;
  key: string | null;
}>(() => ({ phase: "idle", source: null, key: null }));
import { useWorld } from "@/shared/state/workspaceStore";
import { readResponse } from "@/shared/api/http";
import type { ModelSettings } from "@/features/models/contracts";
let activeAudio: HTMLAudioElement | null = null;
let activeUrl: string | null = null;
let pending: AbortController | null = null;
export const speechMotion = { energy: 0, measured: false };
let analyserContext: AudioContext | null = null;
let analysisFrame = 0;
function stopAnalysis() {
  cancelAnimationFrame(analysisFrame);
  speechMotion.energy = 0;
  speechMotion.measured = false;
  if (analyserContext) {
    void analyserContext.close();
    analyserContext = null;
  }
}
async function analyse(audio: HTMLAudioElement) {
  let context: AudioContext | null = null;
  try {
    context = new AudioContext();
    analyserContext = context;
    // Resume first: a denied AudioContext must not divert audible media into a suspended graph.
    await context.resume();
    if (analyserContext !== context || audio.paused || audio.ended) {
      if (context.state !== "closed") await context.close();
      return;
    }
    const source = context.createMediaElementSource(audio);
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyser.connect(context.destination);
    const samples = new Uint8Array(analyser.fftSize);
    const sample = () => {
      if (audio.paused || audio.ended) {
        speechMotion.energy = 0;
        return;
      }
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const value of samples) sum += ((value - 128) / 128) ** 2;
      speechMotion.energy = Math.min(1, Math.sqrt(sum / samples.length) * 7);
      speechMotion.measured = true;
      analysisFrame = requestAnimationFrame(sample);
    };
    sample();
  } catch {
    if (analyserContext === context) stopAnalysis();
  }
}
export function stopCharacterSpeech() {
  stopAnalysis();
  pending?.abort();
  pending = null;
  if (activeAudio) {
    activeAudio.pause();
    activeAudio = null;
  }
  if (activeUrl) {
    URL.revokeObjectURL(activeUrl);
    activeUrl = null;
  }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  useWorld.getState().set({ speaking: false });
  useSpeech.setState({ phase: "idle", key: null, source: null });
}
export async function speakCharacter(
  text: string,
  voice?: { voice: string; rate: number; pitch: number },
  playbackKey?: string,
  agentId?: string,
): Promise<void> {
  stopCharacterSpeech();
  const controller = new AbortController();
  pending = controller;
  useSpeech.setState({
    phase: "preparing",
    key: playbackKey || text,
    source: null,
  });
  try {
    let hasSpeechRoute = false;
    try {
      const response = await fetch(
        agentId
          ? `/api/agents/${encodeURIComponent(agentId)}/model-resolution?capability=speech`
          : "/api/models/settings",
        {
          signal: controller.signal,
        },
      );
      if (response.ok) {
        if (agentId) {
          const resolution = await readResponse<{ configured: boolean }>(
            response,
          );
          hasSpeechRoute = resolution.configured;
        } else {
          const config = await readResponse<ModelSettings>(response);
          hasSpeechRoute = !!config.routes.speech;
        }
      }
    } catch (error) {
      if (controller.signal.aborted)
        return; /* Offline speech falls back to the browser system voice. */
    }
    if (controller.signal.aborted) return;
    if (hasSpeechRoute) {
      const response = await fetch("/api/models/infer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          capability: "speech",
          agent_id: agentId,
          prompt: text,
          voice: voice?.voice || "nova",
        }),
      });
      if (!response.ok) {
        await readResponse(response);
        return;
      }
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      activeUrl = URL.createObjectURL(blob);
      const audio = new Audio(activeUrl);
      activeAudio = audio;
      useSpeech.setState({ source: "model" });
      audio.volume = useWorld.getState().volume / 100;
      audio.playbackRate = voice?.rate || 1;
      audio.onplay = () => {
        if (controller.signal.aborted || pending !== controller) return;
        useSpeech.setState({ phase: "speaking" });
        useWorld.getState().set({ speaking: true });
        void analyse(audio);
      };
      audio.onpause =
        audio.onended =
        audio.onerror =
          () => {
            if (controller.signal.aborted || pending !== controller) return;
            stopAnalysis();
            useWorld.getState().set({ speaking: false });
            useSpeech.setState({
              phase: audio.error ? "error" : "idle",
              key: null,
            });
            if (activeAudio === audio) {
              activeAudio = null;
              if (activeUrl) {
                URL.revokeObjectURL(activeUrl);
                activeUrl = null;
              }
            }
            pending = null;
          };
      await audio.play();
      return;
    }
    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "zh-CN";
      utterance.rate = voice?.rate || 1;
      utterance.pitch = voice?.pitch || 1;
      useSpeech.setState({ source: "system" });
      utterance.onstart = () => {
        if (!controller.signal.aborted && pending === controller) {
          useWorld.getState().set({ speaking: true });
          useSpeech.setState({ phase: "speaking" });
        }
      };
      utterance.onend = () => {
        if (!controller.signal.aborted && pending === controller) {
          useWorld.getState().set({ speaking: false });
          useSpeech.setState({ phase: "idle", key: null });
          pending = null;
        }
      };
      utterance.onerror = (event) => {
        if (!controller.signal.aborted && pending === controller) {
          useWorld.getState().set({ speaking: false });
          useSpeech.setState({
            phase:
              event.error === "canceled" || event.error === "interrupted"
                ? "idle"
                : "error",
            key: null,
          });
          pending = null;
        }
      };
      speechSynthesis.speak(utterance);
    } else throw new Error("当前浏览器无系统语音，请配置语音合成路由");
  } catch (error) {
    if (controller.signal.aborted || pending !== controller) return;
    stopCharacterSpeech();
    useSpeech.setState({ phase: "error" });
    throw error;
  }
}
