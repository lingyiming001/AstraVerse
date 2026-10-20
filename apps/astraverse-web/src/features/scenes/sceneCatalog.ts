import type { Resource } from "@/features/library/resources";
export type SceneKind = "bedroom" | "park" | "school";
export interface SceneDefinition {
  id: string;
  name: string;
  kind: SceneKind;
  night: boolean;
  sky: string;
  floor: string;
  accent: string;
  bounds: [number, number, number, number];
  obstacles: [number, number, number, number][];
}
export const sceneDefinitions: SceneDefinition[] = [
  { id: "bedroom-day", name: "晨光卧室", kind: "bedroom", night: false, sky: "#ece7e1", floor: "#cbb496", accent: "#b5caba", bounds: [-3.5,3.5,-2.6,2.7], obstacles: [[-4,-1.4,-3.45,-.35],[1.65,3.8,-3.5,-1.2]] },
  { id: "bedroom-night", name: "暖灯卧室", kind: "bedroom", night: true, sky: "#33384b", floor: "#a18c7b", accent: "#9299bb", bounds: [-3.5,3.5,-2.6,2.7], obstacles: [[-4,-1.4,-3.45,-.35],[1.65,3.8,-3.5,-1.2]] },
  { id: "park-day", name: "午后公园", kind: "park", night: false, sky: "#c7dfdf", floor: "#86a67d", accent: "#e3b5a6", bounds: [-4.5,4.5,-3.8,3.4], obstacles: [[-3.65,-2.75,-3.35,-.65],[2.75,3.65,-3.35,-.65]] },
  { id: "park-dusk", name: "萤光公园", kind: "park", night: true, sky: "#263b4d", floor: "#587c69", accent: "#b9d89c", bounds: [-4.5,4.5,-3.8,3.4], obstacles: [[-3.65,-2.75,-3.35,-.65],[2.75,3.65,-3.35,-.65]] },
  { id: "school-day", name: "晴日教室", kind: "school", night: false, sky: "#e5e9df", floor: "#c8bba0", accent: "#a6c1b7", bounds: [-4,4,-2.7,2.8], obstacles: [[-3.9,-1.5,-3.9,-1],[1.5,3.9,-3.9,-1]] },
  { id: "school-sunset", name: "放学后的教室", kind: "school", night: true, sky: "#d4b3a1", floor: "#b59c83", accent: "#e5b494", bounds: [-4,4,-2.7,2.8], obstacles: [[-3.9,-1.5,-3.9,-1],[1.5,3.9,-3.9,-1]] },
];
export function builtinScene(url: string | null) {
  return sceneDefinitions.find(scene => url === `/scenes/${scene.id}.scene.json`);
}
export const builtinScenes: Resource[] = sceneDefinitions.map(scene => ({
  id: `scene-${scene.id}`, kind: "scene", name: scene.name,
  description: `${scene.kind === "bedroom" ? "床铺、书桌与窗光" : scene.kind === "park" ? "树木、步道与长椅" : "课桌、黑板与窗边光影"} · 3D场景 · 支持角色走动`,
  source: "builtin", url: `/scenes/${scene.id}.scene.json`, thumbnail: `/scenes/${scene.id}.svg`,
  author: "Kenney · AstraVerse 场景组合", license: "CC0（Kenney 素材）",
  sourceUrl: scene.kind === "park" ? "https://kenney.nl/assets/nature-kit" : "https://kenney.nl/assets/furniture-kit",
}));
/** Character radius is included so furniture and scene borders remain solid. */
export function canOccupy(scene: SceneDefinition | undefined, x: number, z: number) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  const [minX,maxX,minZ,maxZ] = scene?.bounds || [-3,3,-3,3];
  const radius = .28;
  if (x < minX+radius || x > maxX-radius || z < minZ+radius || z > maxZ-radius) return false;
  return !scene?.obstacles.some(([a,b,c,d]) => x > a-radius && x < b+radius && z > c-radius && z < d+radius);
}
