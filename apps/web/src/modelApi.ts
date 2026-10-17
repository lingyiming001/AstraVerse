export const capabilities = [
  {
    id: "text",
    name: "文本对话",
    en: "Text",
    description: "日常对话、角色人设与文字推理",
    kind: "理解",
  },
  {
    id: "vision",
    name: "图片理解",
    en: "Vision",
    description: "带着图片，和你的伙伴聊一聊",
    kind: "理解",
  },
  {
    id: "image",
    name: "图片生成",
    en: "Image",
    description: "将文字灵感变成画面",
    kind: "生成",
  },
  {
    id: "speech",
    name: "语音合成",
    en: "Speech",
    description: "把文字交给你选择的声音",
    kind: "生成",
  },
  {
    id: "transcription",
    name: "音频转写",
    en: "Audio",
    description: "将 WAV / MP3 语音转换为文字",
    kind: "理解",
  },
  {
    id: "video",
    name: "视频理解",
    en: "Video",
    description: "提取关键帧，理解视频中的画面",
    kind: "理解",
  },
  {
    id: "video_generate",
    name: "视频生成",
    en: "Motion",
    description: "创建视频任务并查看生成进度",
    kind: "生成",
  },
] as const;
export type Capability = (typeof capabilities)[number]["id"];
export interface Model {
  id: string;
  capabilities: Capability[];
}
export interface Provider {
  id: string;
  name: string;
  base_url: string;
  enabled: boolean;
  api_key?: string;
  key_configured?: boolean;
  clear_key?: boolean;
  models: Model[];
}
export interface Target {
  provider: string;
  model: string;
}
export interface Route {
  primary: Target;
  fallbacks: Target[];
}
export interface ModelSettings {
  auto_text_route?: boolean;
  providers: Provider[];
  routes: Partial<Record<Capability, Route>>;
  timeout: number;
  max_tokens: number;
}
export interface Attachment {
  mime: string;
  data: string;
}
export type InferenceResult =
  | {
      kind: "text";
      text: string;
      provider: string;
      model: string;
      attempts?: unknown[];
    }
  | { kind: "image"; url: string; provider: string; model: string }
  | { kind: "audio"; url: string }
  | {
      kind: "video_job";
      id: string;
      status: string;
      provider_id: string;
      model: string;
      progress?: number;
      error?: string | null;
    };
export async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: "服务不可用，请检查后端连接" }));
    const detail = error.detail;
    throw new Error(
      typeof detail === "string" ? detail : JSON.stringify(detail || error),
    );
  }
  return response.json() as Promise<T>;
}
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

export interface ModelCheck {
  status: "checking" | "success" | "failed";
  message: string;
  latency_ms?: number;
  checked_at?: string;
  reply?: string;
  http_status?: number;
  total_tokens?: number;
}
