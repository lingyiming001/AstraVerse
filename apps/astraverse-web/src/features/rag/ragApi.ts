import { readResponse } from "@/shared/api/http";
import type { Resource } from "@/features/library/resources";
export interface RagSource { id: string; document_id: string; generation: string; title: string; section: string; kind: string; position: { page?: number; chapter?: string; time?: number }; }
export interface RagSettings { enabled: boolean; semantic_enabled: boolean; top_k: number; min_similarity: number; embedding_configured: boolean; embedding_model: string | null; }
export interface RagDocument { id: string; resource_id: string; title: string; status: string; chunks: number; error: string; }
export async function ragRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  return readResponse<T>(await fetch(`/api/rag${path}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000) }));
}
export function indexable(resource: Resource) { return resource.kind === "book" && /\.(txt|md|epub|pdf|docx|srt|vtt)$/i.test(resource.filename || resource.name); }
export async function indexFile(resource: Resource) {
  if (!indexable(resource) || !resource.url) throw new Error("请选择资料库中的文本文件");
  const url = new URL(resource.url, location.href);
  if (url.protocol !== "blob:" && url.origin !== location.origin) throw new Error("请先导入本地文件");
  const response = await fetch(resource.url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("原文件不可用，请重新导入");
  const blob = await response.blob();
  if (blob.size > 20 * 1024 * 1024) throw new Error("可检索文件不能超过20MB");
  const query = new URLSearchParams({ filename: resource.filename || resource.name, title: resource.name });
  return readResponse(await fetch(`/api/rag/documents/${encodeURIComponent(resource.id)}/file?${query}`, { method: "PUT", body: blob, signal: AbortSignal.timeout(60000) }));
}
// One shared queue avoids duplicate imports when views mount or StrictMode reruns effects.
let queue = Promise.resolve();
export function syncMissing(resources: Resource[]) {
  queue = queue.catch(() => {}).then(async () => {
    const status = await ragRequest<{ documents: RagDocument[] }>("/status");
    const existing = new Set(status.documents.map(d => d.resource_id));
    for (const resource of resources.filter(indexable)) {
      if (!existing.has(resource.id)) {
        try { await indexFile(resource); } catch { /* The status panel exposes unsupported files and retry. */ }
      }
    }
  });
  return queue;
}
