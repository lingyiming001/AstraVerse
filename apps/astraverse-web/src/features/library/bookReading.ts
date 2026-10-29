import { create } from "zustand";
import { readResponse } from "@/shared/api/http";
import type { Resource } from "./resources";

export type Reading = {
  book_id: string; title: string; total: number; offset: number; version: string;
  chapter: string; chapters: { title: string; offset: number }[];
  active: boolean; completed: boolean; percent: number;
};
export type BookChunk = { book_id: string; token: string; start: number; end: number; text: string };
type ReaderView = { reading: Reading | null; text: string; error: string; revision: number };
export const useBookReading = create<{ readers: Record<string, ReaderView> }>(() => ({ readers: {} }));
export function updateReader(agentId: string, patch: Partial<ReaderView>) {
  useBookReading.setState(s => ({ readers: { ...s.readers, [agentId]: { ...(s.readers[agentId] || { reading: null, text: "", error: "", revision: 0 }), ...patch } } }));
}
export function invalidateReader(agentId: string) {
  const revision = (useBookReading.getState().readers[agentId]?.revision || 0) + 1;
  updateReader(agentId, { revision });
  return revision;
}
export class ReadingError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function readingRequest<T>(agentId: string, suffix = "", method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api/library/reading/${encodeURIComponent(agentId)}${suffix}`, {
    method, headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000), keepalive: method === "PUT",
  });
  try { return await readResponse<T>(response); }
  catch (error) { throw new ReadingError(error instanceof Error ? error.message : "阅读请求失败", response.status); }
}
export async function selectBook(agentId: string, bookId: string, active: boolean, extra?: { restart?: boolean; position?: number; from_body?: boolean; page?: number; chapter?: number; page_delta?: number }) {
  const revision = invalidateReader(agentId);
  const data = await readingRequest<{ reading: Reading }>(agentId, "", "PUT", { book_id: bookId, active, ...extra });
  if (useBookReading.getState().readers[agentId]?.revision === revision) updateReader(agentId, { reading: data.reading, error: "", text: "" });
  return data.reading;
}
export function readableBook(resource: Resource) {
  return resource.kind === "book" && /\.(txt|md|epub)$/i.test(resource.filename || resource.name);
}
export async function importWholeBook(resource: Resource) {
  if (!readableBook(resource) || !resource.url) throw new Error("整本朗读支持TXT、Markdown和EPUB，请先导入文件");
  const url = new URL(resource.url, location.href);
  if (url.protocol !== "blob:" && url.origin !== location.origin) throw new Error("请先将书籍文件导入本地资源库");
  const response = await fetch(resource.url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("原文件不可用，请重新导入");
  const blob = await response.blob();
  if (blob.size > 20 * 1024 * 1024) throw new Error("整本朗读文件不能超过20MB");
  const query = new URLSearchParams({ filename: resource.filename || resource.name, title: resource.name });
  return readResponse<{ replaced: boolean; total: number }>(await fetch(`/api/library/books/${encodeURIComponent(resource.id)}/file?${query}`, {
    method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: blob, signal: AbortSignal.timeout(30000),
  }));
}
