import { bedroomFurniture } from "./furniture";
import { interactFurniture } from "./interactFurniture";
import { useWorld } from "@/shared/state/workspaceStore";
import { Suspense, useMemo } from "react";
import { Sparkles, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { SceneDefinition } from "@/features/scenes/sceneCatalog";
import { usePreferences, useReducedMotion } from "@/shared/preferences/preferences";
function Box({ at, size, color }: { at: [number,number,number]; size: [number,number,number]; color: string }) {
  return <mesh position={at} receiveShadow><boxGeometry args={size}/><meshStandardMaterial color={color} roughness={.9}/></mesh>;
}
function Prop({ name, at, height, turn = 0, width }: { name: string; at: [number,number,number]; height: number; turn?: number; width?: number }) {
  const { scene } = useGLTF(`/scenes/kenney/${name}.glb`);
  const object = useMemo(() => {
    const copy = scene.clone(true);
    const bounds = new THREE.Box3().setFromObject(copy);
    const size = bounds.getSize(new THREE.Vector3());
    const scale = height / Math.max(.01, size.y);
    const center = bounds.getCenter(new THREE.Vector3());
    copy.scale.set(scale * (width ? width / (size.x * scale) : 1), scale, scale);
    copy.position.set(-center.x * copy.scale.x, -bounds.min.y * scale, -center.z * scale);
    return copy;
  }, [scene, height, width]);
  return <group position={at} rotation={[0,turn,0]}><primitive object={object}/></group>;
}
export default function SceneEnvironment({ scene }: { scene: SceneDefinition }) {
  const studying = useWorld(s => s.furniture?.kind === "study");
  const seat = useWorld(s => s.position);
  const enabled = usePreferences(s => s.sceneEffects);
  const reduced = useReducedMotion();
  const park = scene.kind === "park";
  const width = scene.kind === "bedroom" ? 8 : 10;
  return <group>
    <Box at={[0,-.14,0]} size={[width,.26,10]} color={scene.floor}/>
    {park ? <>
      <Box at={[0,.006,0]} size={[2.6,.025,9.8]} color="#dbcdb6"/>
      <Box at={[0,.008,-2]} size={[9.8,.025,1.4]} color="#dbcdb6"/>
      <Suspense fallback={null}>
        {[-1,1].map(side => <group key={side}>
          <group onClick={event=>{event.stopPropagation();interactFurniture("sit",side < 0 ? "bench-left" : "bench-right");}}><Prop name="bench" at={[side*3.2,0,-2]} height={1.25} width={2.5} turn={side*Math.PI/2}/></group>
          {[-4.1,-.5,2.8].map((z,index) => <Prop key={z} name={index % 2 ? "tree-pine" : "tree-oak"} at={[side*4.1,0,z]} height={3.4 + index*.3}/>)}
          <Prop name="bush" at={[side*3.5,0,-4.3]} height={.9}/>
        </group>)}
      </Suspense>
      {[-1,1].map(side => <group key={side} position={[side*2.1,0,1.8]}>
        <Box at={[0,1.5,0]} size={[.08,3,.08]} color="#4b5d56"/>
        <mesh position={[0,3,0]}><sphereGeometry args={[.19,12,8]}/><meshStandardMaterial color="#ffe7b1" emissive="#ffc572" emissiveIntensity={scene.night ? 2 : .15}/></mesh>
        {scene.night && <pointLight position={[0,2.8,0]} intensity={7} distance={5} color="#ffdb9c"/>}
      </group>)}
    </> : <>
      <Box at={[0,2.2,-4.8]} size={[width,4.4,.16]} color={scene.night ? "#999ca9" : "#e6e2d7"}/>
      <Box at={[-width/2,1.8,-1.3]} size={[.14,3.6,7]} color={scene.night ? "#9b97a3" : "#ded9cd"}/>
      <Box at={[-width/2+.09,2.5,-1.5]} size={[.06,1.7,2.3]} color={scene.night ? "#657693" : "#afd3d7"}/>
      <Box at={[-width/2+.14,2.5,-1.5]} size={[.08,1.8,.07]} color="#f3ede3"/>
      <Box at={[-width/2+.14,2.5,-1.5]} size={[.08,.07,2.4]} color="#f3ede3"/>
      <Suspense fallback={null}>
        {scene.kind === "bedroom" ? <>
          <group onClick={event => {event.stopPropagation();interactFurniture("sleep");}}><Prop name="bed" at={bedroomFurniture.bed} height={1.0}/></group>
          <group onClick={event => {event.stopPropagation();interactFurniture("study");}}><Prop name="desk" at={bedroomFurniture.desk} height={1.35}/></group>
          <group onClick={event=>{event.stopPropagation();interactFurniture("sit");}}><Prop name="chair" at={bedroomFurniture.chair} height={1.5} turn={Math.PI}/></group>
          <Prop name="bookcase" at={[2.8,0,-4.3]} height={2.7}/>
          <Box at={[0,.015,-.1]} size={[2.8,.035,3.3]} color={scene.accent}/>
        </> : <>
          {[-2.6,2.6].flatMap(x => [-1.8,-3.3].map(z => <group key={`${x}:${z}`} onClick={event => {event.stopPropagation();interactFurniture("study",[x,0,z+.65]);}}>
            <Prop name="desk" at={[x,0,z]} height={1.2}/>
            <group onClick={event=>{event.stopPropagation();interactFurniture("sit",[x,0,z+.65]);}}><Prop name="chair" at={[x,0,z+.65]} height={1.45} turn={Math.PI}/></group>
          </group>))}
          <Prop name="bookcase" at={[4,0,-4.3]} height={2.5}/>
          <Box at={[0,2.6,-4.68]} size={[4,.07+1.5,.07]} color="#476d60"/>
          <Box at={[0,1.8,-4.56]} size={[4.1,.08,.2]} color="#a58d70"/>
          <Box at={[-1,2.75,-4.61]} size={[.8,.025,.02]} color="#d6e5cf"/>
          <Box at={[-.3,2.45,-4.61]} size={[2.2,.025,.02]} color="#d6e5cf"/>
        </>}
      </Suspense>
      <pointLight position={[-2,3,-1]} intensity={scene.night ? 10 : 5} distance={10} color={scene.night ? "#ffc28e" : "#fff4da"}/>
    </>}
    {studying && scene.kind !== "park" && <group position={[seat[0],scene.kind === "bedroom" ? 1.36 : 1.21,seat[2]-(scene.kind === "bedroom" ? .72 : .47)]}>
      <Box at={[-.17,0,0]} size={[.33,.025,.4]} color="#faf1d8"/>
      <Box at={[.17,0,0]} size={[.33,.025,.4]} color="#faf1d8"/>
      <Box at={[0,.018,0]} size={[.015,.012,.4]} color="#a99b87"/>
    </group>}
    {enabled && !reduced && <Sparkles key={scene.id} count={park ? 36 : 20} scale={park ? [9,4,8] : [6,3,6]} position={[0,2,0]} size={park && scene.night ? 3.5 : 1.8} speed={park ? .22 : .12} opacity={park && scene.night ? .7 : .28} color={scene.night ? "#ffe6ac" : "#fff8da"}/>}
  </group>;
}
