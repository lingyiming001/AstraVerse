import { builtinScene, canOccupy } from "@/features/scenes/sceneCatalog";
import Locomotion from "@/features/scenes/Locomotion";
import StageExperiencePanel from "@/features/scenes/StageExperiencePanel";
import EmotionEffects from "@/features/stage/EmotionEffects";
import { activeModelUrl, characterCapabilities, useCharacterCapabilities } from "@/shared/state/characterCapabilities";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  Stars,
  Float,
  useGLTF,
  Sparkles,
} from "@react-three/drei";
import * as THREE from "three";
import { characters, useWorld } from "@/shared/state/workspaceStore";
import AvatarModel from "@/features/stage/AvatarModel";
import { isLive2D } from "@/features/live2d/cubismRuntime";
import type { Resource } from "@/features/library/resources";
const SceneEnvironment = lazy(() => import("@/features/scenes/SceneEnvironment"));
const Live2DStage = lazy(() => import("@/features/live2d/Live2DStage"));
import { getTheme } from "@/shared/preferences/themes";
import { usePreferences, useReducedMotion } from "@/shared/preferences/preferences";
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
  const { position, modelUrl, character, characterVisible } = useWorld();
  const target = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    if (root.current)
      root.current.position.lerp(target.set(...position), Math.min(dt * 8, 1));
  });
  if (!characterVisible || isLive2D(modelUrl)) return null;
  return (
    <group ref={root}>
      <AvatarModel
        key={
          modelUrl || characters[character]?.modelUrl || characters[0].modelUrl
        }
        url={
          modelUrl || characters[character]?.modelUrl || characters[0].modelUrl
        }
      />
    </group>
  );
}
function World({ active = true }: { active?: boolean }) {
  const reduced = useReducedMotion();
  const { world, sceneUrl, set, sceneVisible } = useWorld();
  const preferences = usePreferences();
  const portrait = preferences.framing !== "world" || !sceneVisible;
  const theme = getTheme(preferences.theme);
  const hue =
    world === "aurora" ? "#70e3cd" : world === "sunset" ? "#ffa987" : "#b5a0ff";
  const environment = sceneVisible ? builtinScene(sceneUrl) : undefined;
  const walkTarget = useWorld(s => s.walkTarget);
  return (
    <>
      <color
        attach="background"
        args={[
          environment ? environment.sky : portrait ? theme.stage : world === "sunset" ? "#29202d" : "#191b30",
        ]}
      />
      <ambientLight intensity={portrait ? 1.8 : 1.6} />
      <directionalLight
        position={[2, 5, 6]}
        intensity={portrait ? 2.2 : 3}
        color={portrait ? "#fff7ed" : "#e1d8ff"}
      />
      <directionalLight position={[-3, 2, 3]} intensity={0.8} color="#eaf3ff" />
      {!portrait && !sceneUrl && (
        <>
          <fog attach="fog" args={["#191b30", 12, 32]} />
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
            <meshStandardMaterial
              color="#292840"
              metalness={0.6}
              roughness={0.3}
            />
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
        </>
      )}
      {environment && <Suspense fallback={null}><SceneEnvironment key={environment.id} scene={environment} /></Suspense>}
      {!portrait && sceneUrl && !environment && (
        <Suspense fallback={null}>
          <Asset url={sceneUrl} />
        </Suspense>
      )}
      <Locomotion active={active}/>
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,.035,0]} onClick={event=>{
        const state=useWorld.getState();
        if (event.delta > 5 || !active || reduced || !state.walkMode || !state.sceneVisible || portrait || !characterCapabilities()?.canWalk || !canOccupy(environment,event.point.x,event.point.z)) return;
        event.stopPropagation(); state.set({action:"idle",walkRoute:null,walkTarget:[event.point.x,event.point.z]});
      }}><planeGeometry args={[12,12]}/><meshBasicMaterial visible={false}/></mesh>
      {walkTarget && <mesh position={[walkTarget[0],.055,walkTarget[1]]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[.15,.2,32]}/><meshBasicMaterial color="#e8e9bf" transparent opacity={.8}/></mesh>}
      <Idol />
      <CameraRig />
    </>
  );
}
function CameraRig() {
  const framing = usePreferences((p) => p.framing);
  const character = useWorld((s) => s.character),
    modelUrl = useWorld((s) => s.modelUrl);
  const action = useWorld((s) => s.action);
  const furniture = useWorld(s => s.furniture);
  const sceneUrl = useWorld(s => s.sceneUrl);
  const dancing = action === "dance" || ["sit", "crouch", "sleep"].includes(action);
  const viewRevision = useWorld((s) => s.viewRevision);
  const { camera, size } = useThree();
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const goal = useRef<{
    position: THREE.Vector3;
    target: THREE.Vector3;
  } | null>(null);
  const initialized = useRef(false);
  const previousPosition = useRef(
    new THREE.Vector3(...useWorld.getState().position),
  );
  useEffect(() => {
    const [x, y, z] = useWorld.getState().position;
    const portrait = framing === "portrait" && !dancing;
    const scene = framing === "world";
    const target = new THREE.Vector3(x, y + (action === "sleep" ? .35 : action === "sit" || action === "crouch" ? .85 : portrait ? 1.8 : 1.43), z);
    const aspect = Math.max(0.35, size.width / Math.max(1, size.height));
    const vertical = portrait ? 2.55 : scene ? 5.1 : 3.65;
    const horizontal = portrait ? 1.95 : scene ? 5.6 : 3.1;
    const distance =
      Math.max(vertical, horizontal / aspect) /
      (2 * Math.tan(THREE.MathUtils.degToRad(33) / 2));
    const parkSeat = furniture?.kind === "sit" && builtinScene(sceneUrl)?.kind === "park";
    const position = target.clone().add(parkSeat
      ? new THREE.Vector3(-Math.sign(x) * distance * .65, 2.5, distance * .76)
      : new THREE.Vector3(0, action === "sleep" ? 3.5 : scene ? 2.5 : 0, distance));
    if (!initialized.current) {
      camera.position.copy(position);
      camera.lookAt(target);
      controls.current?.target.copy(target);
      controls.current?.update();
      initialized.current = true;
    }
    goal.current = { position, target };
    previousPosition.current.set(x, y, z);
  }, [
    camera,
    framing,
    furniture,
    sceneUrl,
    dancing,
    action,
    character,
    modelUrl,
    viewRevision,
    size.width,
    size.height,
  ]);
  useFrame((_, delta) => {
    const orbit = controls.current;
    if (!orbit) return;
    const p = new THREE.Vector3(...useWorld.getState().position);
    const shift = p.clone().sub(previousPosition.current);
    previousPosition.current.copy(p);
    camera.position.add(shift);
    orbit.target.add(shift);
    if (goal.current) {
      goal.current.position.add(shift);
      goal.current.target.add(shift);
      const alpha = 1 - Math.exp(-Math.min(delta, 0.05) * 7);
      camera.position.lerp(goal.current.position, alpha);
      orbit.target.lerp(goal.current.target, alpha);
      if (camera.position.distanceToSquared(goal.current.position) < 0.00001)
        goal.current = null;
    }
    orbit.update();
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      minDistance={2}
      maxDistance={22}
      minPolarAngle={0.35}
      maxPolarAngle={Math.PI / 2 + 0.15}
      enablePan={false}
      onStart={() => {
        goal.current = null;
      }}
    />
  );
}
export default function Stage({ active = true, clean = false, onSceneSelect }: { active?: boolean; clean?: boolean; onSceneSelect: (scene: Resource) => void }) {
  const { modelUrl, characterVisible } = useWorld();
  const [attempt, setAttempt] = useState(0);
  return (
    <div className={characterVisible && isLive2D(modelUrl) ? "stage-with-live2d" : undefined} style={{ position: "relative", width: "100%", height: "100%" }}>
    <Canvas
      frameloop={active ? "always" : "never"}
      camera={{ position: [0, 2.8, 7.4], fov: 33 }}
      dpr={[1, 1.8]}
      gl={{ antialias: true }}
    >
      <Suspense fallback={null}>
        <World key={attempt} active={active} />
      </Suspense>
    </Canvas>
    {!clean && <StageExperiencePanel onSceneSelect={onSceneSelect}/>}
    {characterVisible && <EmotionEffects/>}
    {!clean && characterVisible && !isLive2D(modelUrl) && <AvatarNotice onRetry={() => setAttempt(value => value + 1)} />}
    {characterVisible && isLive2D(modelUrl) && <Suspense fallback={null}><Live2DStage url={modelUrl!} active={active} /></Suspense>}
    </div>
  );
}

function AvatarNotice({onRetry}: {onRetry: () => void}) {
  const load = useCharacterCapabilities(s => s.load);
  const cap = useCharacterCapabilities(s => s.current);
  const action = useWorld(s => s.action);
  const reduced = useReducedMotion();
  const url = activeModelUrl();
  let title = "", description = "";
  const failed = load?.url === url && load.phase === "error";
  const loading = !load || load.url !== url || load.phase === "loading";
  if (failed) { title="角色模型加载失败"; description="请重试，或在资源库选择其他 VRM / GLB 角色。"; }
  else if (loading) { title="正在唤醒伙伴"; description="首次加载精细模型，请稍候"; }
  else if (["sit","crouch","sleep"].includes(action) && !cap?.canPosture) { title="当前模型不支持休息动作";description="请使用具有完整人形骨骼的 VRM 角色"; }
  else if (action === "dance" && reduced) { title="减少动态效果已开启";description="可在设置的动态效果中选择完整效果以播放舞蹈"; }
  else if (action === "dance" && !cap?.canWalk) { title="当前模型缺少完整人形骨骼";description="请切换 VRM 角色以使用全身舞蹈与表情"; }
  if (!title) return null;
  return <div className="stage-model-notice" role={failed ? "alert" : "status"}><div className="model-loading">
    {loading && !failed && <i/>}<strong>{title}</strong><span>{description}</span>
    {failed && <button className="secondary" onClick={onRetry}>重新加载模型</button>}
  </div></div>;
}
