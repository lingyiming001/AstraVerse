import { readResponse } from "@/shared/api/http";
export type LiveChannel = {
  id: string;
  name: string;
  platform: string;
  room: string;
  transport: "bridge" | "twitch";
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
};
export type LiveEvent = {
  at: number;
  channel_id: string;
  kind: string;
  user?: string;
  text: string;
  agent_id?: string;
  mode?: string;
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
