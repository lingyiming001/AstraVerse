export const playbackDefaults = { captionChars: 40, captionLead: .035, fallbackMsPerChar: 220, bookSegmentChars: 120, prefetch: true };
export type PlaybackConfig = typeof playbackDefaults;
const key = 'astraverse:playback-config:v1';
export function normalizePlaybackConfig(input: Partial<PlaybackConfig> = {}): PlaybackConfig {
  const number = (value: unknown, fallback: number, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  return {
    captionChars: Math.round(number(input.captionChars, 40, 16, 40)),
    captionLead: number(input.captionLead, .035, 0, .15),
    fallbackMsPerChar: number(input.fallbackMsPerChar, 220, 100, 500),
    bookSegmentChars: Math.round(number(input.bookSegmentChars, 120, 60, 240)),
    prefetch: typeof input.prefetch === 'boolean' ? input.prefetch : true,
  };
}
export function readPlaybackConfig(): PlaybackConfig {
  try { const value = JSON.parse(localStorage.getItem(key) || '{}'); return normalizePlaybackConfig(value && typeof value === 'object' ? value : {}); }
  catch { return { ...playbackDefaults }; }
}
export function savePlaybackConfig(value: Partial<PlaybackConfig>) {
  localStorage.setItem(key, JSON.stringify(normalizePlaybackConfig(value)));
  window.dispatchEvent(new Event('astraverse:playback-config'));
}
