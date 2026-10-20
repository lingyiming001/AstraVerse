import type { SceneDefinition } from "./sceneCatalog";
export const bedroomFurniture = {
  bed: [-2.7,0,-1.9] as [number,number,number],
  desk: [2.6,0,-2.4] as [number,number,number],
  chair: [2.6,0,-1.4] as [number,number,number],
};
export type FurnitureKind = "sleep" | "study" | "sit";
export function furnitureAnchor(scene: SceneDefinition | undefined, kind: FurnitureKind) {
  if (!scene || scene.kind === "park" || (kind === "sleep" && scene.kind !== "bedroom")) return null;
  if (kind === "sleep") return {position:[bedroomFurniture.bed[0],.55,bedroomFurniture.bed[2]] as [number,number,number],rotation:0,seatHeight:0};
  const chair = scene.kind === "bedroom" ? bedroomFurniture.chair : [2.6,0,-1.15];
  return {position:[...chair] as [number,number,number],rotation:180,seatHeight:scene.kind === "bedroom" ? .64 : .62};
}

export function furnitureIntent(message: string): FurnitureKind | null {
  if (/^(?:请|你|能不能|可以)?(?:上床睡觉|到床上睡觉|去床上睡觉|到床上休息|上床休息)(?:一下|一会儿|一会|会|吧|了|。|！|!)?$/.test(message.trim())) return "sleep";
  if (/^(?:请|你|能不能|可以)?(?:坐下学习|到书桌学习|去书桌学习|坐在桌子上学习|坐在桌前学习|坐在椅子上学习|在书桌前学习)(?:一下|一会儿|一会|会|吧|了|。|！|!)?$/.test(message.trim())) return "study";
  return null;
}

export interface SceneInteraction {
  id: string; kind: FurnitureKind; label: string;
  position: [number,number,number]; rotation: number; seatHeight: number;
}
export function sceneInteractions(scene: SceneDefinition | undefined): SceneInteraction[] {
  if (!scene) return [];
  if (scene.kind === "park") return [-1,1].map(side => ({id:side < 0 ? "bench-left" : "bench-right",kind:"sit",label:side < 0 ? "左侧长椅" : "右侧长椅",position:[side*3.2,0,-2],rotation:side < 0 ? 90 : -90,seatHeight:.63}));
  const result: SceneInteraction[] = [];
  if (scene.kind === "bedroom") result.push({id:"bed",kind:"sleep",label:"床铺",...furnitureAnchor(scene,"sleep")!});
  const chairs: [number,number,number][] = scene.kind === "bedroom" ? [bedroomFurniture.chair] : [2.6,-2.6].flatMap(x => [-1.15,-2.65].map(z => [x,0,z] as [number,number,number]));
  chairs.forEach((position,index) => {
    for (const kind of ["sit","study"] as const) result.push({id:`${kind === "sit" ? "chair" : "desk"}-${index}`,kind,label:`${scene.kind === "bedroom" ? "卧室" : `教室${index < 2 ? "右侧" : "左侧"}${index % 2 === 0 ? "前排" : "后排"}第${index+1}组`}${kind === "sit" ? "椅子" : "书桌"}`,position,rotation:180,seatHeight:scene.kind === "bedroom" ? .64 : .62});
  });
  return result;
}
