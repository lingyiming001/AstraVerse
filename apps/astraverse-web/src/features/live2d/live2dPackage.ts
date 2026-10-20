import JSZip from "jszip";
/** Resolve a self-contained Cubism 3/4 package without executing model-supplied code. */
export async function openLive2DPackage(blob: Blob) {
  const zip = await JSZip.loadAsync(blob);
  const files = Object.values(zip.files).filter(file => !file.dir && !file.name.startsWith("__MACOSX/"));
  if (files.length > 1000) throw new Error("模型包文件过多（最多 1000 个）");
  const roots = files.filter(file => /\.model3\.json$/i.test(file.name));
  if (roots.length !== 1) throw new Error("ZIP 内须包含且仅包含一个 .model3.json 模型入口");
  const entry = roots[0];
  const text = await entry.async("string");
  const settings = JSON.parse(text);
  if (!settings.FileReferences?.Moc || !Array.isArray(settings.FileReferences.Textures)) throw new Error("模型入口缺少 Moc 或 Textures");
  const base = entry.name.slice(0, entry.name.lastIndexOf("/") + 1);
  const urls: string[] = [];
  let total = 0;
  const cache = new Map<string, string>();
  const resolveFile = async (path: string) => {
    if (/^(?:[a-z]+:|\/|\\)/i.test(path)) throw new Error("模型包只能引用包内相对路径");
    const parts: string[] = [];
    for (const part of (base + path).replaceAll("\\", "/").split("/")) {
      if (part === "..") { if (!parts.length) throw new Error("无效的模型资源路径"); parts.pop(); }
      else if (part && part !== ".") parts.push(part);
    }
    const name = parts.join("/");
    if (cache.has(name)) return cache.get(name)!;
    const file = zip.file(name);
    if (!file) throw new Error(`模型包缺少文件：${path}`);
    const bytes = await file.async("uint8array");
    total += bytes.byteLength;
    if (total > 150 * 1024 * 1024) throw new Error("解压后的模型资源超过 150 MB");
    const type = /\.png$/i.test(name) ? "image/png" : /\.jpe?g$/i.test(name) ? "image/jpeg" : /\.json$/i.test(name) ? "application/json" : "application/octet-stream";
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
    urls.push(url); cache.set(name, url); return url;
  };
  try {
    const refs = settings.FileReferences;
    for (const key of ["Moc", "Physics", "Pose", "DisplayInfo", "UserData"]) if (typeof refs[key] === "string") refs[key] = await resolveFile(refs[key]);
    refs.Textures = await Promise.all(refs.Textures.map(resolveFile));
    for (const expression of refs.Expressions || []) expression.File = await resolveFile(expression.File);
    for (const group of Object.values(refs.Motions || {}) as { File: string; Sound?: string }[][]) {
      for (const motion of group) {
        motion.File = await resolveFile(motion.File);
        // Song and TTS playback belong to the application, never to motion clips.
        delete motion.Sound;
      }
    }
    return { settings, dispose: () => urls.forEach(url => URL.revokeObjectURL(url)) };
  } catch (error) { urls.forEach(url => URL.revokeObjectURL(url)); throw error; }
}
