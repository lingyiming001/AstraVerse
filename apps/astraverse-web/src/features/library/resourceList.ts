import type { Resource, ResourceKind } from "./resources";
import { isLive2D } from "@/features/live2d/cubismRuntime";
export type ResourceSort = "default" | "name-asc" | "name-desc";
export function filterResourceList(resources: Resource[], options: { kind: ResourceKind | "all"; source: string; query: string; characterType: "live2d" | "3d"; sort: ResourceSort }) {
  const query = options.query.trim().toLocaleLowerCase();
  const rows = resources.filter(r => (options.kind === "all" || r.kind === options.kind) &&
    (options.source === "all" || r.source === options.source) &&
    (options.kind !== "character" || (isLive2D(r.url) ? "live2d" : "3d") === options.characterType) &&
    `${r.name} ${r.description} ${r.filename || ""}`.toLocaleLowerCase().includes(query));
  if (options.sort !== "default") {
    const order = new Intl.Collator("zh-Hans", { numeric: true, sensitivity: "base" });
    rows.sort((a, b) => order.compare(a.name, b.name) * (options.sort === "name-desc" ? -1 : 1));
  }
  return rows;
}
