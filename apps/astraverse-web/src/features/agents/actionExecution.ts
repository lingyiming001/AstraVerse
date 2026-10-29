import { readResponse } from "@/shared/api/http";
export type ExecutionStatus = "accepted" | "confirmed" | "failed" | "cancelled";
export type Operation = { id: string; status: string };

/** Observe the requested source, not the previous song that happens to be playing. */
export async function waitForPlayback(element: HTMLMediaElement | null, url: string, current: () => boolean, timeout = 8000): Promise<ExecutionStatus> {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (!current()) return "cancelled";
    if (!element) return "failed";
    if (element.currentSrc === url && !element.paused && !element.ended && element.readyState >= 2) return "confirmed";
    if (element.src === url && element.error) return "failed";
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return current() ? "failed" : "cancelled";
}

export async function acknowledgeOperation(agentId: string, operation: Operation | undefined, status: ExecutionStatus, note: string, reply: string) {
  if (!operation) return true;
  try {
    await readResponse(await fetch(`/api/agents/${encodeURIComponent(agentId)}/operations/${encodeURIComponent(operation.id)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, note: note.slice(0, 500), reply: reply.slice(0, 4000) }), signal: AbortSignal.timeout(5000),
    }));
    return true;
  } catch { return false; }
}
