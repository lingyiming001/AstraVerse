/** Provider time cues may be added without changing the playback clock contract. */
export type CaptionCue = { start: number; end: number; text: string };
export function timedCaption(cues: CaptionCue[], seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const cue = cues.find(c => Number.isFinite(c.start) && Number.isFinite(c.end) && c.start >= 0 && c.end > c.start && seconds >= c.start && seconds < c.end);
  return cue?.text ?? null;
}
export function captionPageAt(pages: string[], charIndex: number): number {
  let offset = 0;
  for (let i = 0; i < pages.length; i++) {
    offset += pages[i].replace(/\n/g, '').length;
    if (charIndex < offset) return i;
  }
  return Math.max(0, pages.length - 1);
}
