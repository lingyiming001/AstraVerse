export type SubtitleCue = { start: number; end: number; text: string };

function seconds(value: string): number {
  const parts = value.trim().replace(',', '.').split(':').map(Number);
  if (parts.some(part => !Number.isFinite(part)) || parts.length < 2 || parts.length > 3) return NaN;
  return parts.reduce((sum, part) => sum * 60 + part, 0);
}

export function parseSubtitles(source: string): SubtitleCue[] {
  const blocks = source.replace(/^\uFEFF/, '').replace(/\r/g, '').split(/\n\s*\n/);
  const cues: SubtitleCue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const timing = lines.findIndex(line => line.includes('-->'));
    if (timing < 0) continue;
    const match = lines[timing].match(/^\s*([\d:.,]+)\s*-->\s*([\d:.,]+)/);
    if (!match) continue;
    const start = seconds(match[1]), end = seconds(match[2]);
    const text = lines.slice(timing + 1).join(' ').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start && text) cues.push({ start, end, text: text.slice(0, 500) });
    if (cues.length >= 10000) break;
  }
  if (!cues.length) throw new Error('字幕文件中没有有效的 SRT/VTT 时间轴');
  return cues.sort((a, b) => a.start - b.start);
}

export function subtitleAt(cues: SubtitleCue[], time: number): string {
  if (!Number.isFinite(time) || time < 0) return '';
  const nearby = cues.filter(cue => cue.start <= time + 4 && cue.end >= time - 4);
  return nearby.map(cue => cue.text).join(' ').slice(0, 500);
}
