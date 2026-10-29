import type { Resource } from "./resources";
export type ConflictChoice = "replace" | "skip" | "keep";
const key = (name: string) => name.normalize("NFKC").trim().toLocaleLowerCase();
export function duplicateResource(filename: string, kind: string, resources: Resource[]) {
  return resources.find(r => r.kind === kind && r.source === "upload" && key(r.filename || "") === key(filename));
}
export function availableFilename(filename: string, kind: string, resources: Resource[]) {
  const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const extension = dot > 0 ? filename.slice(dot) : "";
  let candidate = filename, number = 2;
  while (duplicateResource(candidate, kind, resources)) candidate = `${stem} (${number++})${extension}`;
  return candidate;
}
