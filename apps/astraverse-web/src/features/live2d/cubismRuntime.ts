/** Core is proprietary: users supply the official runtime, never a third-party CDN. */
let loading: Promise<void> | undefined;
const DB = "astraverse-cubism-runtime";
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("runtime");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("无法读取 Cubism Core 本地存储"));
  });
}
export async function saveCubismCore(file: File) {
  if (!/^live2dcubismcore(?:\.min)?\.js$/i.test(file.name) || file.size > 5 * 1024 * 1024)
    throw new Error("请选择官方 SDK 中的 live2dcubismcore.min.js（不超过 5 MB）");
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("runtime", "readwrite");
    tx.objectStore("runtime").put(file, "core");
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = tx.onerror = () => { db.close(); reject(new Error("Core 保存失败")); };
  });
}
export function loadCubismCore(): Promise<void> {
  if ((window as Window & { Live2DCubismCore?: unknown }).Live2DCubismCore) return Promise.resolve();
  if (loading) return loading;
  loading = (async () => {
    const db = await database();
    const blob = await new Promise<Blob | undefined>((resolve, reject) => {
      const tx = db.transaction("runtime", "readonly");
      const request = tx.objectStore("runtime").get("core");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("Core 读取失败"));
      tx.oncomplete = () => db.close();
    });
    const url = blob ? URL.createObjectURL(blob) : "/vendor/live2d/live2dcubismcore.min.js";
    try {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = url;
        script.onload = () => {
          script.remove();
          if ((window as Window & { Live2DCubismCore?: unknown }).Live2DCubismCore) resolve();
          else reject(new Error("Core 文件无效，请重新导入官方 SDK 文件"));
        };
        script.onerror = () => { script.remove(); reject(new Error("尚未安装 Cubism Core，请在角色控制中导入官方 Core 文件")); };
        document.head.append(script);
      });
    } finally { if (blob) URL.revokeObjectURL(url); }
  })().catch(error => { loading = undefined; throw error; });
  return loading;
}
export const isLive2D = (url?: string | null) => !!url && (url.endsWith("#live2d") || /\.model3\.json(?:[?#]|$)/i.test(url));

/** Inspect installation without executing the runtime or claiming model readiness. */
export async function inspectCubismCore(): Promise<"loaded" | "stored" | "server" | "missing"> {
  if ((window as Window & { Live2DCubismCore?: unknown }).Live2DCubismCore) return "loaded";
  try {
    const db = await database();
    const stored = await new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction("runtime", "readonly");
      const request = tx.objectStore("runtime").get("core");
      request.onsuccess = () => resolve(request.result instanceof Blob);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
    });
    if (stored) return "stored";
  } catch { /* Static installation also works without browser storage. */ }
  try {
    const response = await fetch("/vendor/live2d/live2dcubismcore.min.js", { method: "HEAD", cache: "no-store" });
    if (response.ok && /javascript/.test(response.headers.get("content-type") || "")) return "server";
  } catch { /* Show missing, not a false ready state. */ }
  return "missing";
}
