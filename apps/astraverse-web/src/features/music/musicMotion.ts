/** Shared audio measurements: updated outside React, consumed by the render loop. */
export const musicMotion = {
  energy: 0,
  bass: 0,
  pulse: 0,
  bpm: 72,
  phase: 0,
  confidence: 0,
  measured: false,
  playing: false,
};
let stopCurrent: (() => void) | null = null;
let mediaContext: AudioContext | null = null;
let mediaGeneration = 0;
const mediaSources = new WeakMap<
  HTMLAudioElement,
  MediaElementAudioSourceNode
>();
export function stopMusicAnalysis() {
  stopCurrent?.();
  stopCurrent = null;
  Object.assign(musicMotion, {
    energy: 0,
    bass: 0,
    pulse: 0,
    measured: false,
    playing: false,
    confidence: 0,
    bpm: 72,
    phase: 0,
  });
}
export function analyseMusic(
  source: AudioNode,
  context: AudioContext,
): () => void {
  stopMusicAnalysis();
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.6;
  const silent = context.createGain();
  silent.gain.value = 0;
  source.connect(analyser);
  analyser.connect(silent);
  silent.connect(context.destination);
  const samples = new Float32Array(analyser.fftSize);
  const spectrum = new Uint8Array(analyser.frequencyBinCount);
  let frame = 0,
    last = performance.now(),
    started = last,
    beat = last,
    lastOnset = 0;
  let previousBass = 0,
    averageFlux = 0.002,
    averageRms = 0.015,
    pulse = 0,
    intervals: number[] = [];
  let stopped = false;
  const sample = () => {
    if (stopped) return;
    const now = performance.now(),
      dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    analyser.getFloatTimeDomainData(samples);
    analyser.getByteFrequencyData(spectrum);
    let power = 0;
    for (const v of samples) power += v * v;
    const rms = Math.sqrt(power / samples.length);
    averageRms += (rms - averageRms) * 0.008;
    const bins = Math.max(
      2,
      Math.round((220 * analyser.fftSize) / context.sampleRate),
    );
    let bass = 0;
    for (let i = 1; i <= bins; i++) bass += spectrum[i] / 255;
    bass /= bins;
    const flux = Math.max(0, bass - previousBass);
    previousBass = bass;
    averageFlux += (flux - averageFlux) * 0.04;
    if (
      flux > Math.max(0.025, averageFlux * 2.3) &&
      rms > 0.001 &&
      now - lastOnset > 330
    ) {
      const interval = (now - lastOnset) / 1000;
      if (lastOnset && interval < 1.3) {
        intervals.push(interval);
        if (intervals.length > 8) intervals.shift();
      }
      lastOnset = now;
      beat = now;
      pulse = 1;
      if (intervals.length >= 3) {
        const sorted = [...intervals].sort((a, b) => a - b),
          median = sorted[Math.floor(sorted.length / 2)];
        musicMotion.bpm +=
          (Math.min(160, Math.max(50, 60 / median)) - musicMotion.bpm) * 0.18;
        musicMotion.confidence = Math.min(
          1,
          intervals.filter((v) => Math.abs(v - median) < median * 0.2).length /
            5,
        );
      }
    }
    if (now - lastOnset > 4000) musicMotion.confidence *= 0.995;
    pulse *= Math.exp(-dt * 6);
    const target =
      rms < 0.0002 ? 0 : Math.min(1, rms / Math.max(0.005, averageRms * 2.5));
    musicMotion.energy +=
      (target - musicMotion.energy) * (1 - Math.exp(-dt * 3));
    musicMotion.bass += (bass - musicMotion.bass) * (1 - Math.exp(-dt * 4));
    musicMotion.pulse = pulse;
    musicMotion.phase =
      ((((now - (musicMotion.confidence > 0.35 ? beat : started)) / 1000) *
        musicMotion.bpm) /
        60) *
      Math.PI *
      2;
    musicMotion.measured = true;
    musicMotion.playing = context.state === "running";
    frame = requestAnimationFrame(sample);
  };
  frame = requestAnimationFrame(sample);
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    source.disconnect(analyser);
    analyser.disconnect();
    silent.disconnect();
    musicMotion.playing = false;
    musicMotion.energy = 0;
  };
  stopCurrent = stop;
  return stop;
}
export async function analyseMusicElement(
  element: HTMLAudioElement,
): Promise<() => void> {
  const generation = ++mediaGeneration;
  if (!mediaContext) mediaContext = new AudioContext();
  // Resume before routing media, so a blocked context cannot mute normal playback.
  await mediaContext.resume();
  if (generation !== mediaGeneration || element.paused || element.ended || !element.isConnected) return () => {};
  let source = mediaSources.get(element);
  if (!source) {
    source = mediaContext.createMediaElementSource(element);
    mediaSources.set(element, source);
  }
  source.connect(mediaContext.destination);
  const stop = analyseMusic(source, mediaContext);
  const context = mediaContext;
  return () => {
    stop();
    if (generation === mediaGeneration) {
      ++mediaGeneration;
      source?.disconnect(context.destination);
    }
  };
}
