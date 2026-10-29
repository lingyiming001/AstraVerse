import type { Resource } from "@/features/library/resources";
/** Model assets are local; Core remains a separately installed official runtime. */
export const builtinLive2DCharacters: Resource[] = [{
  id: "live2d-qingtang", kind: "character", name: "晴棠",
  description: "温柔幽默的B站杂谈主播 · 生活趣事与具体鼓励 · 面向成年观众",
  source: "builtin", url: "/models/live2d/pink-sakura/pink-sakura.zip#live2d",
  filename: "pink-sakura.zip", author: "Ariakage / live2d-agent-kit", license: "CC BY 4.0",
  sourceUrl: "https://github.com/Ariakage/live2d-agent-kit/tree/main/examples/pink-sakura",
}, {
  id: "live2d-liyin", kind: "character", name: "栗音",
  description: "B站杂谈测试主播 · 游戏、动画与日常观察 · 复用 Arch-chan 形象",
  source: "builtin", url: "/models/live2d/arch-chan/arch-chan.zip#live2d",
  filename: "arch-chan.zip", author: "RavioliMavioli · Speykious 归档", license: "CC0-1.0",
  sourceUrl: "https://github.com/Speykious/arch-chan",
}, {
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

/** Optional upstream samples are listed only when their locally installed ZIP exists. */
export const optionalLive2DCharacters: Resource[] = [{
  id: "live2d-mao-pro", kind: "character", name: "虹色茉央 · Mao PRO",
  description: "Live2D 官方样例 · 点击回应、表情与模型动作",
  source: "builtin", url: "/models/live2d/mao-pro/mao-pro.zip#live2d",
  filename: "mao-pro.zip", author: "Live2D Inc.", license: "Live2D Original Character sample terms",
  sourceUrl: "https://github.com/Open-LLM-VTuber/Open-LLM-VTuber/tree/main/live2d-models/mao_pro",
}, {
  id: "live2d-shizuku", kind: "character", name: "雫 · Shizuku",
  description: "Live2D 官方样例 · 点击回应与模型动作",
  source: "builtin", url: "/models/live2d/shizuku/shizuku.zip#live2d",
  filename: "shizuku.zip", author: "Live2D Inc.", license: "Live2D Original Character sample terms",
  sourceUrl: "https://github.com/Open-LLM-VTuber/Open-LLM-VTuber/tree/main/live2d-models/shizuku",
}];
