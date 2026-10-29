/** Only direct music transport requests; discussion/questions/negation stay in chat. */
export function musicPauseIntent(message: string) {
  const text = message.trim().replace(/[。！!，,]+$/, "");
  if (/[?？]|(?:不要|别|不用)(?:暂停|停止)|为什么|怎么|如果|能否解释/.test(text)) return false;
  return /^(?:请|麻烦|帮我|请你|你)?(?:先)?(?:把|将)?(?:背景音乐|音乐|歌曲|歌|这首歌)?(?:给我)?(?:暂停|停止|关掉|关闭|停下|停一下|暂停一下|停止播放)(?:一下|播放)?(?:背景音乐|音乐|歌曲|歌|这首歌)?(?:吧|了|好吗|可以吗)?$/.test(text)
    || /^(?:请|先)?(?:别放|不要放|不用放|别播|不要播)(?:音乐|歌曲|歌)?(?:了|吧)?$/.test(text);
}

export function pauseMusic(element: Pick<HTMLMediaElement, "pause" | "paused"> | null, setPlaying: (playing: boolean) => void) {
  setPlaying(false);
  try { element?.pause(); return !element || element.paused; }
  catch { return false; }
}
