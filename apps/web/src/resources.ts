export type ResourceKind = "music" | "scene" | "character";
export interface Resource {
  id: string;
  kind: ResourceKind;
  name: string;
  description: string;
  source: "builtin" | "upload";
  url?: string;
  duration?: number;
  preset?: "lunar" | "aurora" | "sunset";
  characterIndex?: number;
  filename?: string;
  persistent?: boolean;
}
export interface ResourceChoice {
  id: string;
  kind: ResourceKind;
  name: string;
  description: string;
}
export interface PendingSelection {
  kind: ResourceKind;
  ids: string[];
  token: string;
}
export interface ResourceAction {
  type: "resource.use" | "music.pause" | "music.resume";
  resource_id?: string;
  kind?: ResourceKind;
}
export const pageRoutes: Record<string, string> = {
  创作空间: "/studio",
  虚拟角色: "/characters",
  场景世界: "/scenes",
  音乐与舞蹈: "/music",
  资源库: "/library",
};
export function pageFromHash() {
  const path = location.hash.slice(1);
  return (
    Object.keys(pageRoutes).find((key) => pageRoutes[key] === path) ||
    "创作空间"
  );
}
