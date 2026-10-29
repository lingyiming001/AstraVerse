import type { Resource } from "./resources";

/** Read a small local text excerpt; never fetch remote URLs or parse HTML/PDF as text. */
export async function bookExcerpt(resource: Resource): Promise<string> {
  if (resource.kind !== "book" || !resource.url || !/\.(txt|md)$/i.test(resource.filename || resource.name)) return "";
  const url = new URL(resource.url, location.href);
  if (url.protocol !== "blob:" && url.origin !== location.origin) return "";
  const response = await fetch(resource.url, { signal: AbortSignal.timeout(2500) });
  if (!response.ok || !response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "", bytes = 0;
  try {
    while (text.length < 2000 && bytes < 16000) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      text += decoder.decode(value.subarray(0, 16000), { stream: true });
    }
    return text.slice(0, 2000).replace(/\u0000/g, "");
  } finally { await reader.cancel(); }
}
