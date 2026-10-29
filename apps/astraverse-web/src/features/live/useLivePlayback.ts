import { useEffect } from "react";
import { useSpeech } from "@/features/chat/speech";
import { useWorld } from "@/shared/state/workspaceStore";

/** A short renewable lease: closing the browser cannot stall hosting forever. */
export function useLivePlayback() {
  useEffect(() => {
    let channel: string | null = null;
    let timer: ReturnType<typeof setTimeout>;
    let reports = Promise.resolve();
    const report = (cid: string, active: boolean) => {
      reports = reports.then(async () => {
        await fetch(`/api/live/channels/${encodeURIComponent(cid)}/playback`, {
          method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
          body: JSON.stringify({ client_id: useWorld.getState().clientId, active }),
          signal: AbortSignal.timeout(5000),
        });
      }).catch(() => {});
    };
    const sync = () => {
      const speech = useSpeech.getState();
      const match = /^(?:live|live-idle):(.+)$/.exec(speech.key || "");
      const next = match && ["preparing", "speaking"].includes(speech.phase) ? match[1] : null;
      if (channel && channel !== next) report(channel, false);
      channel = next;
      if (channel) report(channel, true);
    };
    const unsubscribe = useSpeech.subscribe(() => {
      clearTimeout(timer);
      // A queued utterance starts on the next tick: do not release between sentences.
      timer = setTimeout(sync, 100);
    });
    const heartbeat = setInterval(sync, 10000);
    sync();
    return () => {
      unsubscribe(); clearTimeout(timer); clearInterval(heartbeat);
      if (channel) report(channel, false);
    };
  }, []);
}
