import { create } from "zustand";
import type { Resource } from "@/features/library/resources";
export type ResourcePatch = Pick<Resource, "name" | "description">;
type Catalog = {
  hidden: string[];
  patches: Record<string, Partial<ResourcePatch>>;
};
const KEY = "astraverse-library-catalog-v1";
function read(): Catalog {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || "null");
    if (
      data &&
      Array.isArray(data.hidden) &&
      data.hidden.every((x: unknown) => typeof x === "string") &&
      data.patches &&
      typeof data.patches === "object"
    )
      return data;
  } catch {
    /* Existing binary resources remain in IndexedDB. */
  }
  return { hidden: [], patches: {} };
}
export const useLibraryCatalog = create<Catalog>(() => read());
function commit(next: Catalog) {
  localStorage.setItem(KEY, JSON.stringify(next));
  useLibraryCatalog.setState(next);
}
export function hideResource(id: string) {
  const state = useLibraryCatalog.getState();
  commit({ ...state, hidden: [...new Set([...state.hidden, id])] });
}
export function patchResource(id: string, patch: Partial<ResourcePatch>) {
  const state = useLibraryCatalog.getState();
  commit({
    ...state,
    patches: { ...state.patches, [id]: { ...state.patches[id], ...patch } },
  });
}
