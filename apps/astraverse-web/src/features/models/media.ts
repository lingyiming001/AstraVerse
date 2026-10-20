import type { Attachment } from "./contracts";

export async function encodeFile(file: File): Promise<Attachment> {
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
  const ext = file.name.split(".").at(-1)?.toLowerCase();
  const mime =
    ext === "wav" ? "audio/wav" : ext === "mp3" ? "audio/mpeg" : file.type;
  return { mime, data };
}
export async function videoFrames(file: File): Promise<Attachment[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.src = url;
  const wait = (event: string) =>
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("视频解码超时，请换用浏览器可播放的 MP4/WebM"));
      }, 15000);
      const done = () => {
        cleanup();
        resolve();
      };
      const fail = () => {
        cleanup();
        reject(new Error("无法解码视频"));
      };
      const cleanup = () => {
        clearTimeout(timer);
        video.removeEventListener(event, done);
        video.removeEventListener("error", fail);
      };
      video.addEventListener(event, done, { once: true });
      video.addEventListener("error", fail, { once: true });
    });
  try {
    await wait("loadeddata");
    if (!Number.isFinite(video.duration) || video.duration <= 0)
      throw new Error("无法读取视频时长");
    const canvas = document.createElement("canvas");
    const scale = Math.min(
      1,
      768 / Math.max(video.videoWidth, video.videoHeight),
    );
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("视频帧提取不可用");
    const frames: Attachment[] = [];
    for (const fraction of [0.1, 0.35, 0.6, 0.85]) {
      const ready = wait("seeked");
      video.currentTime = video.duration * fraction;
      await ready;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push({
        mime: "image/jpeg",
        data: canvas.toDataURL("image/jpeg", 0.75).split(",")[1],
      });
    }
    return frames;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

