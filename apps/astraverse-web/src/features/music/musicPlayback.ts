import { useEffect, useState } from "react";

/** One music owner per origin, including other AstraVerse tabs/windows. */
export function useMusicOwnership(playing: boolean, onUnavailable: () => void) {
  const [owned, setOwned] = useState(false);
  useEffect(() => {
    if (!playing) return;
    let cancelled = false;
    let release: (() => void) | undefined;
    const hold = new Promise<void>(resolve => { release = resolve; });
    if (navigator.locks) {
      void navigator.locks.request("astraverse:music-output", { ifAvailable: true }, async lock => {
        if (cancelled) return;
        if (!lock) { onUnavailable(); return; }
        setOwned(true);
        await hold;
      }).catch(() => { if (!cancelled) onUnavailable(); });
    } else {
      // Older browsers: announce each new playback and silence the previous owner.
      const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("astraverse:music-output") : null;
      channel?.postMessage("claim");
      if (channel) channel.onmessage = () => onUnavailable();
      setOwned(true);
      void hold.then(() => channel?.close());
    }
    return () => { cancelled = true; setOwned(false); release?.(); };
  }, [playing, onUnavailable]);
  return playing && owned;
}
