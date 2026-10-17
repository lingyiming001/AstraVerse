import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  Stars,
  Float,
  useGLTF,
  Sparkles,
} from "@react-three/drei";
import * as THREE from "three";
import { useWorld } from "./store";
import Avatar from "./Avatar";
import { useReducedMotion } from "./preferences";
function Asset({
  url,
  character = false,
}: {
  url: string;
  character?: boolean;
}) {
  const { scene } = useGLTF(url);
  const object = useMemo(() => {
    const copy = scene.clone(true);
    const box = new THREE.Box3().setFromObject(copy);
    const size = box.getSize(new THREE.Vector3());
    if (Math.max(size.x, size.y, size.z) <= 0)
      throw new Error("GLB contains no visible geometry");
    copy.scale.setScalar(
      (character ? 2.9 : 9) / Math.max(size.x, size.y, size.z),
    );
    return copy;
  }, [scene, character]);
  return <primitive object={object} />;
}
function Idol() {
  const root = useRef<THREE.Group>(null);
  const { position, modelUrl, rotation } = useWorld();
  const target = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    if (root.current)
      root.current.position.lerp(target.set(...position), Math.min(dt * 8, 1));
  });
  return (
    <group ref={root}>
      {modelUrl ? (
        <group rotation={[0, (rotation * Math.PI) / 180, 0]}>
          <Suspense fallback={null}>
            <Asset url={modelUrl} character />
          </Suspense>
        </group>
      ) : (
        <Avatar />
      )}
    </group>
  );
}
function World({ active = true }: { active?: boolean }) {
  const reduced = useReducedMotion();
  const { world, sceneUrl, set } = useWorld();
  const hue =
    world === "aurora" ? "#70e3cd" : world === "sunset" ? "#ffa987" : "#b5a0ff";
  useEffect(() => {
    if (!active) return;
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches("input,textarea,select")) return;
      const s = useWorld.getState();
      const p = [...s.position] as [number, number, number];
      if (e.key === "w" || e.key === "ArrowUp") p[2] -= 0.2;
      else if (e.key === "s" || e.key === "ArrowDown") p[2] += 0.2;
      else if (e.key === "a" || e.key === "ArrowLeft") p[0] -= 0.2;
      else if (e.key === "d" || e.key === "ArrowRight") p[0] += 0.2;
      else if (e.code === "Space") {
        e.preventDefault();
        set({ action: "jump" });
        return;
      } else return;
      e.preventDefault();
      p[0] = Math.max(-3, Math.min(3, p[0]));
      p[2] = Math.max(-3, Math.min(3, p[2]));
      set({ position: p });
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [set, active]);
  return (
    <>
      <color
        attach="background"
        args={[world === "sunset" ? "#29202d" : "#191b30"]}
      />
      <fog attach="fog" args={["#191b30", 12, 32]} />
      <ambientLight intensity={1.6} />
      <directionalLight position={[3, 7, 5]} intensity={3} color="#e1d8ff" />
      <pointLight position={[-4, 3, 2]} intensity={18} color={hue} />
      <pointLight position={[3, 2, -3]} intensity={15} color="#648aff" />
      <Stars
        radius={45}
        depth={30}
        count={1800}
        factor={2}
        saturation={0}
        fade
        speed={reduced ? 0 : 0.3}
      />
      <Sparkles
        count={45}
        scale={[12, 5, 8]}
        size={2}
        speed={reduced ? 0 : 0.2}
        color={hue}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]}>
        <planeGeometry args={[150, 150]} />
        <meshStandardMaterial
          color="#1c2035"
          metalness={0.5}
          roughness={0.35}
        />
      </mesh>
      {[3.4, 3.55, 4.6].map((r, i) => (
        <mesh
          key={r}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -0.04 - i * 0.025, 0]}
        >
          <torusGeometry args={[r, 0.014, 8, 128]} />
          <meshStandardMaterial
            color={hue}
            emissive={hue}
            emissiveIntensity={2}
          />
        </mesh>
      ))}
      <mesh position={[0, -0.13, 0]}>
        <cylinderGeometry args={[3.4, 3.6, 0.2, 96]} />
        <meshStandardMaterial color="#292840" metalness={0.6} roughness={0.3} />
      </mesh>
      <group position={[0, 2.4, -5]}>
        <mesh>
          <torusGeometry args={[3.7, 0.025, 8, 128]} />
          <meshStandardMaterial
            color={hue}
            emissive={hue}
            emissiveIntensity={1.5}
          />
        </mesh>
        <mesh rotation={[0, 0, 0.3]}>
          <torusGeometry args={[3.9, 0.008, 8, 128]} />
          <meshBasicMaterial color="#796f9c" />
        </mesh>
      </group>
      {Array.from({ length: 16 }, (_, i) => (
        <Float
          key={i}
          speed={reduced ? 0 : 1}
          floatIntensity={reduced ? 0 : 0.3}
        >
          <mesh
            position={[
              (i % 2 ? 1 : -1) * (4 + (i % 4) * 1.1),
              0.5 + (i % 5) * 0.6,
              -2 - Math.floor(i / 2) * 1.1,
            ]}
            rotation={[0, i * 0.4, 0.2]}
          >
            <boxGeometry args={[0.18, 0.5 + (i % 3) * 0.5, 0.18]} />
            <meshStandardMaterial
              color="#8374ad"
              metalness={0.6}
              roughness={0.2}
            />
          </mesh>
        </Float>
      ))}
      {sceneUrl && (
        <Suspense fallback={null}>
          <Asset url={sceneUrl} />
        </Suspense>
      )}
      <Idol />
      <OrbitControls
        makeDefault
        target={[0, 1.4, 0]}
        minDistance={3}
        maxDistance={16}
        maxPolarAngle={Math.PI / 2 - 0.02}
      />
    </>
  );
}
export default function Stage({ active = true }: { active?: boolean }) {
  return (
    <Canvas
      frameloop={active ? "always" : "never"}
      camera={{ position: [0, 2.8, 7.4], fov: 41 }}
      dpr={[1, 1.8]}
      gl={{ antialias: true }}
    >
      <Suspense fallback={null}>
        <World active={active} />
      </Suspense>
    </Canvas>
  );
}
