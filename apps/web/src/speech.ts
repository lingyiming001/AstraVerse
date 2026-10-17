import { useWorld } from "./store";
import { readResponse, type ModelSettings } from "./modelApi";
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
}
export async function speakCharacter(text: string): Promise<void> {
  stopCharacterSpeech();
  const controller = new AbortController();
  pending = controller;
  let hasSpeechRoute = false;
  try {
    const response = await fetch("/api/models/settings", {
      signal: controller.signal,
    });
    if (response.ok) {
      const config = await readResponse<ModelSettings>(response);
      hasSpeechRoute = !!config.routes.speech;
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
        prompt: text,
        voice: "nova",
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
    audio.volume = useWorld.getState().volume / 100;
    audio.onplay = () => {
      useWorld.getState().set({ speaking: true });
      void analyse(audio);
    };
    audio.onpause =
      audio.onended =
      audio.onerror =
        () => {
          stopAnalysis();
          useWorld.getState().set({ speaking: false });
        };
    await audio.play();
    return;
  }
  if ("speechSynthesis" in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.onstart = () => useWorld.getState().set({ speaking: true });
    utterance.onend = utterance.onerror = () =>
      useWorld.getState().set({ speaking: false });
    speechSynthesis.speak(utterance);
  } else throw new Error("当前浏览器无系统语音，请配置语音合成路由");
}
