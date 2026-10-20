import { create } from "zustand";
import { readResponse } from "@/shared/api/http";
import type { Target } from "@/features/models/contracts";
import type { PendingSelection, ResourceChoice } from "@/features/library/resources";
export interface AgentBehavior {
  expressiveness: number;
  energy: number;
  movement: "soft" | "graceful" | "lively";
  reply_length: "brief" | "balanced" | "detailed";
  initiative: "quiet" | "balanced" | "curious";
}
export interface AgentVoice {
  voice: string;
  rate: number;
  pitch: number;
}
export interface AgentProfile {
  id: string;
  name: string;
  identity: string;
  background: string;
  personality: string;
  speaking_style: string;
  relationship: string;
  boundaries: string;
  greeting: string;
  memory_notes: string;
  remember: boolean;
  auto_summary: boolean;
  context_messages: number;
  allow_resources: boolean;
  allow_plugins: boolean;
  model: Target | null;
  model_scope: "platform" | "character";
  behavior: AgentBehavior;
  voice: AgentVoice;
}
export interface AgentMessage {
  role: "user" | "assistant";
  text: string;
  mode?: string;
  model?: string;
  provider?: string;
  choices?: ResourceChoice[];
  choiceToken?: string;
  characterName?: string;
}
export interface AgentOption {
  id: string;
  name: string;
  thumbnail?: string;
}
export interface AgentRoute {
  mode: string;
  provider?: string;
  model?: string;
  source?: string;
  detail?: string;
}
export interface AgentDetails {
  profile: AgentProfile;
  status: AgentRoute;
}
interface AgentState {
  profiles: Record<string, AgentProfile>;
  routes: Record<string, AgentRoute>;
  threads: Record<string, AgentMessage[]>;
  busy: Record<string, boolean>;
  pending: Record<string, PendingSelection | null>;
  epochs: Record<string, number>;
  historyLoading: Record<string, boolean>;
  historyErrors: Record<string, string>;
}
export const useAgents = create<AgentState>(() => ({
  profiles: {},
  routes: {},
  threads: {},
  busy: {},
  pending: {},
  epochs: {},
  historyLoading: {},
  historyErrors: {},
}));
export function acceptAgent(details: AgentDetails) {
  useAgents.setState((s) => ({
    profiles: { ...s.profiles, [details.profile.id]: details.profile },
    routes: { ...s.routes, [details.profile.id]: details.status },
  }));
}
export function updateThread(
  id: string,
  update: AgentMessage[] | ((messages: AgentMessage[]) => AgentMessage[]),
) {
  useAgents.setState((s) => ({
    threads: {
      ...s.threads,
      [id]: typeof update === "function" ? update(s.threads[id] || []) : update,
    },
  }));
}
export function setAgentBusy(id: string, busy: boolean) {
  useAgents.setState((s) => ({ busy: { ...s.busy, [id]: busy } }));
}
export function setAgentPending(id: string, pending: PendingSelection | null) {
  useAgents.setState((s) => ({ pending: { ...s.pending, [id]: pending } }));
}
export function setAgentRoute(id: string, route: AgentRoute) {
  useAgents.setState((s) => ({
    routes: { ...s.routes, [id]: { ...s.routes[id], ...route } },
  }));
}
export async function fetchAgent(id: string, name: string) {
  const details = await readResponse<AgentDetails>(
    await fetch(
      `/api/agents/${encodeURIComponent(id)}?name=${encodeURIComponent(name)}`,
    ),
  );
  acceptAgent(details);
  return details;
}
export async function saveAgent(profile: AgentProfile) {
  const details = await readResponse<AgentDetails>(
    await fetch(`/api/agents/${encodeURIComponent(profile.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    }),
  );
  acceptAgent(details);
  window.dispatchEvent(
    new CustomEvent("astraverse:agent-saved", { detail: profile.id }),
  );
  return details;
}
export async function fetchAgentThread(id: string) {
  const epoch = useAgents.getState().epochs[id] || 0;
  const previous = useAgents.getState().threads[id];
  useAgents.setState((s) => ({
    historyLoading: { ...s.historyLoading, [id]: true },
    historyErrors: { ...s.historyErrors, [id]: "" },
  }));
  try {
    const value = await readResponse<{
      messages: AgentMessage[];
      revision: number;
    }>(await fetch(`/api/agents/${encodeURIComponent(id)}/conversation`));
    if (
      (useAgents.getState().epochs[id] || 0) === epoch &&
      useAgents.getState().threads[id] === previous &&
      !useAgents.getState().busy[id]
    ) {
      updateThread(id, value.messages);
      useAgents.setState((s) => ({
        historyErrors: { ...s.historyErrors, [id]: "" },
      }));
    }
    return value;
  } catch (error) {
    if (useAgents.getState().threads[id] === previous)
      useAgents.setState((s) => ({
        historyErrors: {
          ...s.historyErrors,
          [id]: error instanceof Error ? error.message : "会话暂时无法读取",
        },
      }));
    throw error;
  } finally {
    useAgents.setState((s) => ({
      historyLoading: { ...s.historyLoading, [id]: false },
    }));
  }
}
export async function clearAgentThread(id: string) {
  await readResponse(
    await fetch(`/api/agents/${encodeURIComponent(id)}/conversation`, {
      method: "DELETE",
    }),
  );
  window.dispatchEvent(new Event("astraverse:memory-changed"));
  useAgents.setState((s) => ({
    threads: { ...s.threads, [id]: [] },
    pending: { ...s.pending, [id]: null },
    epochs: { ...s.epochs, [id]: (s.epochs[id] || 0) + 1 },
  }));
}

export async function fetchAgents() {
  const value = await readResponse<{ profiles: AgentProfile[] }>(
    await fetch("/api/agents"),
  );
  useAgents.setState((s) => ({
    profiles: {
      ...s.profiles,
      ...Object.fromEntries(value.profiles.map((p) => [p.id, p])),
    },
  }));
  return value.profiles;
}
