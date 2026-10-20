import type { Resource } from "@/features/library/resources";
/** Model assets are local; Core remains a separately installed official runtime. */
export const builtinLive2DCharacters: Resource[] = [{
  id: "live2d-arch-chan",
  kind: "character",
  name: "Arch-chan",
  description: "Live2D · 视线跟随、呼吸、眨眼与语音口型 · 无原生舞蹈动作",
  source: "builtin",
  url: "/models/live2d/arch-chan/arch-chan.zip#live2d",
  filename: "arch-chan.zip",
  author: "RavioliMavioli · Speykious 归档",
  license: "CC0-1.0",
  sourceUrl: "https://github.com/Speykious/arch-chan",
}, {
  id: "live2d-pink-sakura", kind: "character", name: "樱 · Pink Sakura",
  description: "Live2D · 点头、摇头、眨眼与待机 · AI 生成素材来源已标注 · 无独立手臂",
  source: "builtin", url: "/models/live2d/pink-sakura/pink-sakura.zip#live2d",
  filename: "pink-sakura.zip", author: "Ariakage / live2d-agent-kit", license: "CC BY 4.0",
  sourceUrl: "https://github.com/Ariakage/live2d-agent-kit/tree/main/examples/pink-sakura",
}];
