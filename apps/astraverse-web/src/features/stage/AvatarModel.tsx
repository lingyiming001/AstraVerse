import Headphones from "./Headphones";
import { hummingMotion } from "./humming";
import { rigDirection } from "./rigPose";
import { isRestAction, restPoses } from "./restPose";
import { useCharacterCapabilities } from "@/shared/state/characterCapabilities";
import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  VRMLoaderPlugin,
  VRMUtils,
  type VRM,
  type VRMHumanBoneName,
} from "@pixiv/three-vrm";
import * as THREE from "three";
import { useWorld } from "@/shared/state/workspaceStore";
import { usePreferences, useReducedMotion } from "@/shared/preferences/preferences";
import { usePerformance } from "@/features/stage/performance";
import { musicMotion } from "@/features/music/musicMotion";
import { dancePose } from "@/features/stage/danceMotion";
import { speechMotion } from "@/features/chat/speech";

export default function AvatarModel({ url }: { url: string }) {
  const [model, setModel] = useState<{
    scene: THREE.Group;
    vrm?: VRM;
    scale: number;
    floor: number;
    centerX: number;
    centerZ: number;
    footHeight: number;
  } | null>(null);
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const headphonesRoot = useRef<THREE.Group>(null);
  const headphones = useWorld(s => s.headphones);
  const accessoryPose = useRef({position:new THREE.Vector3(),rotation:new THREE.Quaternion(),parent:new THREE.Quaternion()});
  const foot = useRef(new THREE.Vector3());
  const origin = useRef(new THREE.Vector3());
  const reduced = useReducedMotion();
  const blink = useRef({ next: 2.5, start: -10 });
  const weights = useRef({
    rest: 0,
    sleep: 0,
    wave: 0,
    dance: 0,
    music: 0,
    gesture: 0,
    jump: 0,
    actionStarted: 0,
    action: "idle",
    gazeX: 0,
    gazeY: 0,
    danceBeat: 0,
    danceBpm: 96,
  });
  const attention = useRef({ x: 0, y: 0, changed: 0 });
  useEffect(() => {
    let cancelled = false;
    let loaded: THREE.Group | undefined;
    setModel(null);
    useCharacterCapabilities.setState({ current: null, load:{url,phase:"loading"} });
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    loader.load(
      url,
      (gltf) => {
        loaded = gltf.scene;
        if (cancelled) {
          VRMUtils.deepDispose(loaded);
          return;
        }
        const vrm = gltf.userData.vrm as VRM | undefined;
        if (vrm) {
          VRMUtils.rotateVRM0(vrm);
          const left = vrm.humanoid.getNormalizedBoneNode("leftUpperArm"),
            right = vrm.humanoid.getNormalizedBoneNode("rightUpperArm");
          if (left) left.rotation.z = -1.24 * rigDirection(vrm.meta.metaVersion);
          if (right) right.rotation.z = 1.24 * rigDirection(vrm.meta.metaVersion);
          vrm.update(0);
        }
        loaded.traverse((object) => {
          object.frustumCulled = false;
        });
        const box = new THREE.Box3().setFromObject(loaded);
        const height = box.max.y - box.min.y;
        if (!Number.isFinite(height) || height <= 0) {
          VRMUtils.deepDispose(loaded);
          loaded = undefined;
          useCharacterCapabilities.setState({current:null,load:{url,phase:"error"}});
          return;
        }
        const scale = 2.9 / height;
        const center = box.getCenter(new THREE.Vector3());
        const expressionPresets = { neutral: "neutral", happy: "happy", curious: "surprised", sad: "sad", surprised: "surprised", relaxed: "relaxed" } as const;
        useCharacterCapabilities.setState({ current: {
          url,
          canWearHeadphones: !!vrm?.humanoid.getNormalizedBoneNode("head"),
          canSing: !!vrm?.expressionManager?.getExpression("aa")?.binds.length,
          canPosture: !!vrm && (["hips", "spine", "head", "leftUpperLeg", "leftLowerLeg", "leftFoot", "rightUpperLeg", "rightLowerLeg", "rightFoot"] as VRMHumanBoneName[]).every(name => !!vrm.humanoid.getNormalizedBoneNode(name)),
          canWalk: !!vrm && (["hips", "leftUpperLeg", "leftLowerLeg", "leftFoot", "rightUpperLeg", "rightLowerLeg", "rightFoot"] as VRMHumanBoneName[]).every(name => !!vrm.humanoid.getNormalizedBoneNode(name)),
          expressions: (Object.keys(expressionPresets) as (keyof typeof expressionPresets)[]).filter(name => name === "neutral" || !!vrm?.expressionManager?.getExpression(expressionPresets[name])?.binds.length),
        } });
        useCharacterCapabilities.setState({load:{url,phase:"ready"}});
        setModel({
          scene: loaded,
          vrm,
          scale,
          floor: -box.min.y * scale,
          centerX: -center.x * scale,
          centerZ: -center.z * scale,
          footHeight: vrm ? Math.min(...["leftFoot", "rightFoot"].map(name => {
            const node = vrm.humanoid.getNormalizedBoneNode(name as VRMHumanBoneName);
            return node ? node.getWorldPosition(new THREE.Vector3()).y * scale - box.min.y * scale : Infinity;
          })) : 0,
        });
      },
      undefined,
      () => {
        if (!cancelled) useCharacterCapabilities.setState({current:null,load:{url,phase:"error"}});
      },
    );
    return () => {
      cancelled = true;
      if (useCharacterCapabilities.getState().current?.url === url) useCharacterCapabilities.setState({ current: null });
      if (loaded) VRMUtils.deepDispose(loaded);
    };
  }, [url]);
  useFrame(({ pointer }, delta) => {
    if (!model || !root.current) return;
    const dt = Math.min(delta, 0.05),
      now = performance.now(),
      t = now / 1000;
    const s = useWorld.getState(),
      prefs = usePreferences.getState(),
      p = usePerformance.getState();
    const walk = s.walking && !reduced ? Math.sin(t * (s.running ? 12 : 8)) : 0;
    const stride = s.running ? 1.9 : 1;
    const resting = isRestAction(s.action) && useCharacterCapabilities.getState().current?.canPosture;
    const sleeping = resting && s.action === "sleep";
    const natural = s.naturalMotion && !reduced;
    const automatic = now >= p.manualUntil && !reduced;
    const strength = Math.min(1, Math.max(0, prefs.motionStrength));
    const temperament = p.temperament;
    const musicEnergy = 0.5 + temperament.energy;
    const w = weights.current;
    const damp = (v: number, target: number, speed = 5) =>
      THREE.MathUtils.damp(v, target, speed, dt);
    if (w.action !== s.action) {
      w.action = s.action;
      w.actionStarted = t;
      if (s.action === "dance") w.danceBeat = 0;
    }
    w.rest = damp(w.rest, resting ? 1 : 0, 4);
    w.sleep = damp(w.sleep, sleeping ? 1 : 0, 4);
    const restPose = restPoses[s.furniture?.kind === "study" ? "study" : s.furniture?.kind === "sit" ? "chair" : resting ? s.action : w.action];
    const actionTime = t - w.actionStarted;
    w.wave = damp(
      w.wave,
      s.action === "wave" && actionTime < 3.2 && !reduced ? strength : 0,
      4.5,
    );
    w.dance = damp(
      w.dance,
      s.action === "dance" && !reduced ? Math.max(0.4, Math.min(1.25, prefs.danceStrength ?? 1)) : 0,
      2.5,
    );
    const musicTarget =
      !resting && !s.walking && !s.singing &&
      automatic &&
      natural &&
      prefs.musicMotion &&
      s.playing &&
      musicMotion.playing
        ? musicMotion.energy * strength * musicEnergy
        : 0;
    w.music = damp(w.music, musicTarget, 1.6);
    const age = (now - p.started) / 1000;
    const manualPreview = p.source === "manual-preview";
    const responding =
      (automatic || (manualPreview && !reduced)) &&
      (prefs.autoExpression || manualPreview) &&
      p.phase === "reply" &&
      p.cue &&
      age < p.cue.duration + 2;
    const faceCue = responding && !sleeping ? p.cue : null;
    const cue = faceCue && !resting && !s.walking && !s.singing ? faceCue : null;
    const smooth = (value: number) => {
      const x = Math.min(1, Math.max(0, value));
      return x * x * (3 - 2 * x);
    };
    const faceEnvelope = faceCue ? smooth(age / 0.7) * smooth((faceCue.duration + 2 - age) / 2) : 0;
    const envelope = cue ? faceEnvelope : 0;
    w.gesture = damp(w.gesture, envelope * (manualPreview ? 1 : strength), 4);
    const thinking =
      automatic && prefs.autoExpression && p.phase === "thinking";
    const listening =
      automatic && prefs.autoExpression && p.phase === "listening";
    const talking = automatic && prefs.autoExpression && (s.speaking || !!cue);
    const phase =
      musicMotion.measured && musicMotion.playing
        ? musicMotion.phase
        : (t * Math.PI * 2 * 72) / 60;
    const movement = cue?.movement || temperament.movement;
    const slow =
      phase *
      (movement === "lively" ? 0.3 : movement === "graceful" ? 0.2 : 0.23);
    w.danceBpm = damp(
      w.danceBpm,
      musicMotion.measured && musicMotion.playing
        ? Math.max(65, Math.min(145, musicMotion.bpm))
        : temperament.movement === "lively"
          ? 108
          : 92,
      1.2,
    );
    w.danceBeat += (dt * w.danceBpm) / 60;
    const d = dancePose(
      w.danceBeat * Math.PI * 2,
      temperament.movement,
      temperament.energy,
    );
    const dw = w.dance;
    const flow = w.music * (1 - Math.min(1, w.dance) * 0.85);
    const sway = Math.sin(slow) * flow;
    const rhythm =
      Math.sin(phase) * flow * (0.15 + musicMotion.confidence * 0.2);
    const breath = natural
      ? (Math.sin(t * 1.7) + 0.16 * Math.sin(t * 0.43)) * 0.012 * s.breath
      : 0;
    const jumpTarget =
      s.action === "jump"
        ? Math.sin(Math.PI * Math.min(1, actionTime / 0.9)) * 0.48
        : 0;
    root.current.position.y = damp(
      root.current.position.y,
      Math.max(0, jumpTarget + d.bounce * dw + (s.running && s.walking ? Math.abs(walk)*.07 : 0)),
      14,
    );
    root.current.position.x = damp(
      root.current.position.x,
      sway * 0.035 + d.shift * dw,
      3,
    );
    root.current.rotation.y = damp(
      root.current.rotation.y,
      THREE.MathUtils.degToRad(s.rotation) + sway * 0.13 + d.turn * dw,
      5,
    );
    const vrm = model.vrm;
    if (!vrm) return;
    const rad = THREE.MathUtils.degToRad;
    const bone = (name: VRMHumanBoneName, x = 0, y = 0, z = 0) => {
      const node = vrm.humanoid.getNormalizedBoneNode(name);
      if (!node) return;
      const target = restPose?.[name];
      // VRM 0's normalized rig is built before its scene is turned through pi.
      // Conjugate the canonical pose by that turn: X/Z reverse, Y is unchanged.
      const direction = rigDirection(vrm.meta.metaVersion);
      node.rotation.set(
        damp(node.rotation.x, (target ? THREE.MathUtils.lerp(x, target[0], w.rest) : x) * direction, 7),
        damp(node.rotation.y, target ? THREE.MathUtils.lerp(y, target[1], w.rest) : y, 7),
        damp(node.rotation.z, (target ? THREE.MathUtils.lerp(z, target[2], w.rest) : z) * direction, 7),
      );
    };
    const look = attention.current;
    if (Math.abs(pointer.x - look.x) + Math.abs(pointer.y - look.y) > 0.015) {
      look.x = pointer.x;
      look.y = pointer.y;
      look.changed = t;
    }
    const interested = t - look.changed < 5;
    w.gazeX = damp(
      w.gazeX,
      s.gazeTracking && !resting
        ? interested
          ? pointer.x * 0.12
          : natural
            ? Math.sin(t * 0.34) * 0.04
            : 0
        : 0,
      2.5,
    );
    w.gazeY = damp(
      w.gazeY,
      s.gazeTracking && !resting
        ? interested
          ? -pointer.y * 0.06
          : natural
            ? Math.sin(t * 0.27) * 0.015
            : 0
        : 0,
      2.5,
    );
    const gesture = cue?.gesture,
      g = w.gesture * (0.65 + (cue?.energy ?? 0.35) * 0.35) * (1 - Math.min(1, w.dance));
    const nod =
      gesture === "nod" && age < 2.4
        ? Math.sin((age * Math.PI) / 0.6) * 0.065 * w.gesture
        : 0;
    const tilt =
      (gesture === "tilt" ? 0.12 * w.gesture : 0) +
      (thinking ? 0.06 * strength : listening ? 0.035 * strength : 0);
    const speechGesture = talking ? Math.sin(t * 2.2) * 0.018 * strength : 0;
    bone(
      "hips",
      0,
      -sway * 0.035 - d.turn * dw * 0.3,
      -sway * 0.025 - d.hip * dw,
    );
    bone(
      "spine",
      breath + (listening ? 0.018 : 0) + (s.running && s.walking ? .12 : 0),
      sway * 0.045,
      rad(s.pose.bodyLean) + sway * 0.035 + d.chest * dw,
    );
    bone(
      "chest",
      breath * 0.6,
      -sway * 0.025 - d.turn * dw * 0.4,
      -sway * 0.014 - d.chest * dw * 0.45,
    );
    bone("neck", nod * 0.25, w.gazeX * 0.2, tilt * 0.25);
    bone(
      "head",
      rad(s.pose.headPitch) + w.gazeY + nod + speechGesture + (cue?.emotion === "sad" ? 0.08 * envelope : 0),
      rad(s.pose.headYaw) + w.gazeX,
      tilt +
        d.head * dw +
        (s.expression === "curious" ? 0.06 * s.expressionIntensity : 0) +
        (natural ? Math.sin(t * 0.65) * 0.01 : 0),
    );
    const open = gesture === "open" ? g : 0,
      heart = gesture === "heart" ? g : 0;
    const idleArms = natural ? Math.sin(t * 0.8) * 0.012 : 0;
    const leftLift =
      0.16 * flow +
      Math.sin(slow + 0.5) * 0.14 * flow +
      open * 0.38 +
      d.leftLift * dw;
    const rightLift =
      0.18 * flow +
      Math.sin(slow - 0.5) * 0.15 * flow +
      open * 0.5 +
      heart * 0.6 +
      d.rightLift * dw;
    bone("leftShoulder", 0, sway * 0.025, leftLift * 0.05);
    bone("rightShoulder", 0, -sway * 0.025, -rightLift * 0.05);
    bone(
      "leftUpperArm",
      -0.08 * flow + d.leftReach * dw - walk * .2 * stride,
      -0.06 * flow,
      -1.24 + rad(s.pose.leftArm) + leftLift + idleArms,
    );
    bone(
      "rightUpperArm",
      -0.09 * flow - heart * 0.4 + d.rightReach * dw + walk * .2 * stride,
      0.08 * flow,
      1.24 -
        rad(s.pose.rightArm) -
        rightLift -
        idleArms -
        w.wave * (1.9 + Math.sin(actionTime * 4.8) * 0.12),
    );
    bone(
      "leftLowerArm",
      -0.04 * flow,
      -rad(s.pose.leftElbow) -
        0.13 -
        flow * (0.2 + Math.sin(slow + 0.7) * 0.12) -
        (s.running && s.walking ? .9 : 0) -
        open * 0.28 -
        d.leftElbow * dw,
      -0.02 * flow,
    );
    bone(
      "rightLowerArm",
      -0.04 * flow,
      rad(s.pose.rightElbow) +
        0.13 +
        flow * (0.22 + Math.sin(slow - 0.7) * 0.12) +
        (s.running && s.walking ? .9 : 0) +
        w.wave * 0.9 +
        heart * 1.9 +
        d.rightElbow * dw,
      0.02 * flow,
    );
    bone(
      "leftHand",
      Math.sin(slow - 0.4) * 0.05 * flow,
      open * -0.25 + d.wristL * dw,
      Math.sin(slow + 1) * 0.065 * flow,
    );
    bone(
      "rightHand",
      Math.sin(slow + 0.4) * 0.05 * flow,
      heart * -0.35 + d.wristR * dw,
      Math.sin(slow - 1) * 0.065 * flow +
        w.wave * Math.sin(actionTime * 5.5) * 0.15,
    );
    bone(
      "leftUpperLeg",
      rad(s.pose.leftLeg) + rhythm * 0.035 - d.legL * dw + walk * .32 * stride,
      0,
      sway * 0.01 + d.stepL * dw,
    );
    bone(
      "rightUpperLeg",
      rad(s.pose.rightLeg) - rhythm * 0.035 - d.legR * dw - walk * .32 * stride,
      0,
      sway * 0.01 + d.stepR * dw,
    );
    bone("leftLowerLeg", Math.max(0, rhythm) * 0.025 + d.kneeL * dw + Math.max(0, -walk) * (s.running ? 1.1 : .4));
    bone("rightLowerLeg", Math.max(0, -rhythm) * 0.025 + d.kneeR * dw + Math.max(0, walk) * (s.running ? 1.1 : .4));
    bone("leftFoot", -Math.max(0, rhythm) * 0.012 - d.toeL * dw);
    bone("rightFoot", -Math.max(0, -rhythm) * 0.012 - d.toeR * dw);
    for (const side of ["left", "right"] as const) {
      for (const finger of ["Index", "Middle", "Ring", "Little"] as const) {
        const sign = side === "left" ? -1 : 1;
        bone(
          `${side}${finger}Proximal` as VRMHumanBoneName,
          0,
          sign * (0.1 + flow * 0.04 + dw * (0.06 + 0.05 * Math.sin(slow + (finger === "Index" ? 0 : 0.6)))),
        );
        bone(
          `${side}${finger}Intermediate` as VRMHumanBoneName,
          0,
          sign * 0.12,
        );
      }
    }
    if (natural && t >= blink.current.next) {
      blink.current.start = t;
      blink.current.next = t + 2.6 + Math.random() * 3.2;
    }
    const blinkAge = t - blink.current.start;
    const expression = vrm.expressionManager;
    const baseline = s.expression === "curious" ? "surprised" : s.expression;
    const mood = faceCue?.emotion === "curious" ? "surprised" : faceCue?.emotion;
    const blend = faceCue ? Math.min(1, faceEnvelope * 1.3) : 0;
    const dancingSmile = dw * (0.22 + 0.06 * Math.sin(w.danceBeat * Math.PI / 4));
    for (const name of ["happy", "sad", "surprised", "relaxed"]) {
      const manual =
        baseline === name
          ? s.expressionIntensity * (s.expression === "curious" ? 0.25 : 1)
          : 0;
      const response =
        mood === name
          ? (faceCue?.intensity ?? 0) * (faceCue?.emotion === "curious" ? 0.22 : 1)
          : 0;
      expression?.setValue(
        name,
        damp(
          expression.getValue(name) || 0,
          Math.min(1, manual * (1 - blend) + response * blend + (name === "happy" && !cue && s.expression === "neutral" ? dancingSmile : 0)),
          3.5,
        ),
      );
    }
    const winkAge = p.wink ? (now - p.wink.started) / 1000 : 10;
    const winkValue = winkAge >= 0 && winkAge < 0.65 ? Math.sin(Math.PI * winkAge / 0.65) : 0;
    const winkPreset = p.wink?.side === "left" ? "blinkLeft" : "blinkRight";
    const supportsWink = !!expression?.getExpression(winkPreset);
    for (const side of ["blinkLeft", "blinkRight"]) expression?.setValue(side, supportsWink && side === winkPreset ? winkValue : 0);
    expression?.setValue(
      "blink",
      sleeping ? 1 : natural && blinkAge >= 0 && blinkAge < 0.17
        ? Math.sin((blinkAge / 0.17) * Math.PI)
        : supportsWink ? 0 : winkValue,
    );
    const mouth = sleeping ? 0 : s.singing ? hummingMotion.energy : s.speaking
      ? speechMotion.measured
        ? speechMotion.energy
        : Math.abs(Math.sin(t * 12) * Math.sin(t * 4.3)) * 0.5
      : 0;
    for (const [name, value] of [
      ["aa", mouth * 0.7],
      ["ou", mouth * (0.12 + 0.08 * Math.sin(t * 3.7))],
      ["ee", mouth * (0.1 + 0.06 * Math.cos(t * 4.1))],
    ] as const)
      expression?.setValue(
        name,
        damp(expression.getValue(name) || 0, value, 13),
      );
    if (vrm.lookAt) {
      vrm.lookAt.autoUpdate = false;
      vrm.lookAt.yaw = w.gazeX * 45;
      vrm.lookAt.pitch = w.gazeY * 45;
    }
    // Recompute from the rest floor every frame, then keep the lowest ankle at its
    // calibrated height. This is height compensation, not a planted-foot IK solver.
    if (body.current) {
      body.current.rotation.x = -Math.PI / 2 * w.sleep;
      body.current.position.y = THREE.MathUtils.lerp(model.floor, .25, w.sleep);
      body.current.position.z = model.centerZ + 1.45 * w.sleep;
    }
    vrm.update(dt);
    if (body.current && s.furniture && s.furniture.kind !== "sleep") {
      root.current.updateWorldMatrix(true, true);
      root.current.getWorldPosition(origin.current);
      const hips = vrm.humanoid.getNormalizedBoneNode("hips");
      if (hips) body.current.position.y += s.furniture.seatHeight + .1 - (hips.getWorldPosition(foot.current).y - origin.current.y);
    }
    if (!s.furniture && body.current && Number.isFinite(model.footHeight) && (dw > 0.001 || s.walking || (w.rest > .001 && w.sleep < .01))) {
      root.current.updateWorldMatrix(true, true);
      root.current.getWorldPosition(origin.current);
      let lowest = Infinity;
      for (const name of ["leftFoot", "rightFoot"] as const) {
        const node = vrm.humanoid.getNormalizedBoneNode(name);
        if (node) lowest = Math.min(lowest, node.getWorldPosition(foot.current).y - origin.current.y);
      }
      if (Number.isFinite(lowest)) body.current.position.y += model.footHeight - lowest;
    }
    if (headphonesRoot.current) {
      root.current.updateWorldMatrix(true,true);
      const head=vrm.humanoid.getRawBoneNode("head"), normalized=vrm.humanoid.getNormalizedBoneNode("head");
      if (head && normalized) {
        const a=accessoryPose.current;
        head.getWorldPosition(a.position);root.current.worldToLocal(a.position);
        normalized.getWorldQuaternion(a.rotation);root.current.getWorldQuaternion(a.parent).invert();
        headphonesRoot.current.position.copy(a.position);
        headphonesRoot.current.quaternion.copy(a.parent.multiply(a.rotation));
      }
    }
  });
  if (!model) return null;
  return (
    <group ref={root}>
      {headphones && model.vrm && <Headphones ref={headphonesRoot}/>}
      <group
        ref={body}
        scale={model.scale}
        position={[model.centerX, model.floor, model.centerZ]}
      >
        <primitive object={model.scene} />
      </group>
    </group>
  );
}
