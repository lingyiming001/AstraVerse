import { useGLTF } from "@react-three/drei";
import { builtinScene } from "@/features/scenes/sceneCatalog";
/** Failed Suspense loads are cached too: an explicit retry must evict them. */
export function clearStageAssetCache(sceneUrl: string | null) {
  if (sceneUrl && !builtinScene(sceneUrl)) useGLTF.clear(sceneUrl);
  for (const prop of ["bed","desk","chair","bookcase","bench","tree-pine","tree-oak","bush"]) {
    useGLTF.clear(`/scenes/kenney/${prop}.glb`);
  }
}
