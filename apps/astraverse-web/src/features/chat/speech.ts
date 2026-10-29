import { create } from "zustand";
export const useSpeech = create<{
  phase: "idle" | "preparing" | "speaking" | "error";
  source: "model" | "system" | null;
  key: string | null;
  text?: string;
  agentId?: string;
  taskId?: number;
  outcome?: 'completed' | 'cancelled' | 'failed';
  charIndex?: number;
  timing?: 'audio-estimate' | 'system-boundary';
}>(() => ({ phase: "idle", source: null, key: null }));
import { useWorld } from "@/shared/state/workspaceStore";
import { readResponse } from "@/shared/api/http";
import type { ModelSettings } from "@/features/models/contracts";
let activeAudio: HTMLAudioElement | null = null;
let taskSequence = 0;
export function speechClock() {
  const state = useSpeech.getState();
  return { taskId: state.taskId, phase: state.phase, source: state.source,
    currentTime: activeAudio?.currentTime || 0,
    duration: activeAudio && Number.isFinite(activeAudio.duration) ? activeAudio.duration : null,
    charIndex: state.charIndex, timing: state.timing };
}
export function speechProgress(): number | null {
  return activeAudio && Number.isFinite(activeAudio.duration) && activeAudio.duration > 0
    ? Math.min(1, activeAudio.currentTime / activeAudio.duration) : null;
}
let activeUrl: string | null = null;
let pending: AbortController | null = null;
export type PlaybackCallbacks = { onStart?: () => void; onEnd?: () => void; onCancel?: () => void; onError?: () => void };
type SpeechItem = PlaybackCallbacks & { text: string; voice?: { voice: string; rate: number; pitch: number }; key: string; agentId: string; prepared?: Promise<Blob | null> };
export async function prepareBookSpeech(text: string, agentId: string, voice: string | undefined, signal: AbortSignal): Promise<Blob | null> {
  try {
    const resolution = await readResponse<{ configured: boolean }>(await fetch(`/api/agents/${encodeURIComponent(agentId)}/model-resolution?capability=speech`, { signal }));
    if (!resolution.configured) return null;
    const response = await fetch('/api/models/infer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal, body: JSON.stringify({capability:'speech', agent_id:agentId, prompt:text, voice:voice || 'nova'}) });
    await (response.ok ? Promise.resolve() : readResponse(response));
    return await response.blob();
  } catch { return null; }
}
let activeCallbacks: PlaybackCallbacks | null = null;
const liveQueue: SpeechItem[] = [];
let queueTimer: ReturnType<typeof setTimeout> | undefined;
export function enqueueLiveSpeech(item: SpeechItem) {
  liveQueue.push(item);
  drainLiveSpeech();
}
function drainLiveSpeech() {
  if (["preparing", "speaking"].includes(useSpeech.getState().phase)) return;
  const item = liveQueue.shift();
  if (item) void startSpeech(item.text, item.voice, item.key, item.agentId, item, item.prepared).catch(() => {});
}
export function stopLiveSpeech(channelId: string) {
  const keys = [`live:${channelId}`, `live-idle:${channelId}`];
  for (let i = liveQueue.length - 1; i >= 0; i--) if (keys.includes(liveQueue[i].key)) liveQueue.splice(i, 1)[0].onCancel?.();
  if (keys.includes(useSpeech.getState().key || "")) stopSpeech(false);
}
export function stopBookSpeech(agentId: string) {
  const key = `book:${agentId}`;
  for (let i = liveQueue.length - 1; i >= 0; i--) if (liveQueue[i].key === key) liveQueue.splice(i, 1)[0].onCancel?.();
  if (useSpeech.getState().key === key) stopSpeech(false);
}
useSpeech.subscribe((state) => {
  if (state.phase === "idle" || state.phase === "error") {
    clearTimeout(queueTimer);
    queueTimer = setTimeout(drainLiveSpeech, 0);
  }
});
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
  stopSpeech(true);
}
function stopSpeech(clearQueue: boolean) {
  const callbacks = activeCallbacks;
  activeCallbacks = null;
  if (clearQueue) liveQueue.splice(0).forEach(item => item.onCancel?.());
  clearTimeout(queueTimer);
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
  useSpeech.setState({ phase: "idle", key: null, source: null, outcome: 'cancelled', charIndex: undefined });
  callbacks?.onCancel?.();
}
export async function speakCharacter(
  text: string,
  voice?: { voice: string; rate: number; pitch: number },
  playbackKey?: string,
  agentId?: string,
  callbacks?: PlaybackCallbacks,
): Promise<void> {
  stopCharacterSpeech();
  return startSpeech(text, voice, playbackKey, agentId, callbacks);
}
async function startSpeech(
  text: string,
  voice?: { voice: string; rate: number; pitch: number },
  playbackKey?: string,
  agentId?: string,
  callbacks?: PlaybackCallbacks,
  prepared?: Promise<Blob | null>,
): Promise<void> {
  stopSpeech(false);
  activeCallbacks = callbacks || null;
  const controller = new AbortController();
  pending = controller;
  const taskId = ++taskSequence;
  useSpeech.setState({
    phase: "preparing",
    taskId,
    outcome: undefined,
    charIndex: undefined,
    timing: undefined,
    text,
    agentId,
    key: playbackKey || text,
    source: null,
  });
  try {
    const readyBlob = prepared ? await prepared : null;
    if (controller.signal.aborted) return;
    let hasSpeechRoute = false;
    try {
      const response = readyBlob ? null : await fetch(
        agentId
          ? `/api/agents/${encodeURIComponent(agentId)}/model-resolution?capability=speech`
          : "/api/models/settings",
        {
          signal: controller.signal,
        },
      );
      if (readyBlob) hasSpeechRoute = true;
      if (response?.ok) {
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
      const response = readyBlob ? null : await fetch("/api/models/infer", {
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
      if (response && !response.ok) {
        await readResponse(response);
        return;
      }
      const blob = readyBlob || await response!.blob();
      if (controller.signal.aborted) return;
      activeUrl = URL.createObjectURL(blob);
      const audio = new Audio(activeUrl);
      activeAudio = audio;
      useSpeech.setState({ source: "model", timing: 'audio-estimate' });
      audio.volume = useWorld.getState().volume / 100;
      audio.playbackRate = voice?.rate || 1;
      audio.onplay = () => {
        if (controller.signal.aborted || pending !== controller) return;
        callbacks?.onStart?.();
        useSpeech.setState({ phase: "speaking" });
        useWorld.getState().set({ speaking: true });
        void analyse(audio);
      };
      const finish = (outcome: "end" | "cancel" | "error") => {
            if (controller.signal.aborted || pending !== controller) return;
            activeCallbacks = null;
            stopAnalysis();
            useWorld.getState().set({ speaking: false });
            useSpeech.setState({
              phase: outcome === "error" ? "error" : "idle",
              outcome: outcome === 'end' ? 'completed' : outcome === 'cancel' ? 'cancelled' : 'failed',
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
            if (outcome === "end") callbacks?.onEnd?.();
            else if (outcome === "error") callbacks?.onError?.();
            else callbacks?.onCancel?.();
          };
      audio.onended = () => finish("end");
      audio.onerror = () => finish("error");
      audio.onpause = () => { if (!audio.ended) finish("cancel"); };
      await audio.play();
      return;
    }
    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "zh-CN";
      utterance.rate = voice?.rate || 1;
      utterance.pitch = voice?.pitch || 1;
      useSpeech.setState({ source: "system" });
      utterance.onboundary = event => {
        if (!controller.signal.aborted && pending === controller && useSpeech.getState().taskId === taskId) {
          useSpeech.setState({ charIndex: event.charIndex, timing: 'system-boundary' });
        }
      };
      utterance.onstart = () => {
        if (!controller.signal.aborted && pending === controller) {
          callbacks?.onStart?.();
          useWorld.getState().set({ speaking: true });
          useSpeech.setState({ phase: "speaking" });
        }
      };
      utterance.onend = () => {
        if (!controller.signal.aborted && pending === controller) {
          activeCallbacks = null;
          useWorld.getState().set({ speaking: false });
          useSpeech.setState({ phase: "idle", key: null, outcome: 'completed' });
          pending = null;
          callbacks?.onEnd?.();
        }
      };
      utterance.onerror = (event) => {
        if (!controller.signal.aborted && pending === controller) {
          activeCallbacks = null;
          useWorld.getState().set({ speaking: false });
          useSpeech.setState({
            phase:
              event.error === "canceled" || event.error === "interrupted"
                ? "idle"
                : "error",
            key: null,
            outcome: event.error === 'canceled' || event.error === 'interrupted' ? 'cancelled' : 'failed',
          });
          pending = null;
          if (event.error === "canceled" || event.error === "interrupted") callbacks?.onCancel?.();
          else callbacks?.onError?.();
        }
      };
      speechSynthesis.speak(utterance);
    } else throw new Error("当前浏览器无系统语音，请配置语音合成路由");
  } catch (error) {
    if (controller.signal.aborted || pending !== controller) return;
    activeCallbacks = null;
    stopSpeech(false);
    useSpeech.setState({ phase: "error", outcome: 'failed' });
    callbacks?.onError?.();
    throw error;
  }
}
