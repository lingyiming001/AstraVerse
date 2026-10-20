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
  speech_backend?: "openai" | "dashscope";
  speech_voice?: string;
  speech_language?: string;
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

export interface ModelCheck {
  status: "checking" | "success" | "failed";
  message: string;
  latency_ms?: number;
  checked_at?: string;
  reply?: string;
  http_status?: number;
  total_tokens?: number;
}
