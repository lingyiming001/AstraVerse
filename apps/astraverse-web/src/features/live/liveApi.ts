import { readResponse } from "@/shared/api/http";
export type LiveChannel = {
  solo?: { interval: number; duration_minutes: number; attempts: number; limit: number; reason: string; remaining_seconds: number; next_in_seconds: number; generating: boolean; speaking?: boolean } | null;
  poll?: { question: string; options: string[]; counts: number[]; voters: number; ends_at: number; open: boolean } | null;
  id: string;
  name: string;
  platform: string;
  room: string;
  transport: "bridge" | "twitch" | "youtube" | "bilibili" | "local";
  credentials?: Partial<Record<"client_id" | "client_secret" | "refresh_token" | "app_id" | "access_key" | "access_secret" | "identity_code", string>>;
  credential_status?: Record<string, boolean>;
  youtube_mode?: "stream" | "poll";
  username: string;
  has_oauth?: boolean;
  oauth?: string;
  agent_id: string | null;
  cooldown: number;
  keyword: string;
  voice: boolean;
  send_to_platform: boolean;
  status?: string;
  error?: string;
  queued?: number;
  metrics?: { received: number; queued: number; replies: number; failed: number; expired: number; filtered: number; latency_ms: number; proactive?: number; blocked?: number; interrupted?: number; idle_skipped?: number };
  autonomy?: { enabled: boolean; count: number; limit: number; generating: boolean; elapsed_seconds?: number; daily?: { title: string; activity: string; next_start: string; next_title: string; attempts: number; limit: number; remaining_seconds: number; paused: boolean; reason: string } | null };
};
export type LiveEvent = {
  sources?: import("@/features/rag/ragApi").RagSource[];
  at: number;
  channel_id: string;
  kind: string;
  user?: string;
  text: string;
  agent_id?: string;
  mode?: string;
  proactive?: boolean;
  narrative?: "reply" | "knowledge" | "memory" | "dream";
};
export type LiveInventory = {
  platforms: { id: string; name: string; direct: boolean }[];
  channels: LiveChannel[];
};
export const liveStatus: Record<string, string> = {
  stopped: "未启动",
  waiting: "等待桥接弹幕",
  connecting: "连接中",
  connected: "已接收弹幕 / 已连接",
  reconnecting: "正在重连",
  error: "连接失败",
};
export async function liveRequest<T>(
  path = "",
  method = "GET",
  body?: unknown,
): Promise<T> {
  return readResponse<T>(
    await fetch("/api/live" + path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}
export function liveChanged() {
  window.dispatchEvent(new Event("astraverse:live-changed"));
}
