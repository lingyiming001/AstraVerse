import { create } from "zustand";
export type Action = "idle" | "wave" | "dance" | "jump" | "sit" | "crouch" | "sleep";
export type World = "lunar" | "aurora" | "sunset";
export type Expression =
  "neutral" | "happy" | "curious" | "sad" | "surprised" | "relaxed";
export interface Pose {
  headYaw: number;
  headPitch: number;
  leftArm: number;
  rightArm: number;
  leftElbow: number;
  rightElbow: number;
  leftLeg: number;
  rightLeg: number;
  bodyLean: number;
}
export const neutralPose: Pose = {
  headYaw: 0,
  headPitch: 0,
  leftArm: 0,
  rightArm: 0,
  leftElbow: 0,
  rightElbow: 0,
  leftLeg: 0,
  rightLeg: 0,
  bodyLean: 0,
};
export interface State {
  clientId: string;
  actorId: string;
  expression: Expression;
  expressionIntensity: number;
  pose: Pose;
  naturalMotion: boolean;
  gazeTracking: boolean;
  breath: number;
  speaking: boolean;
  rotation: number;
  viewRevision: number;
  interactionRevision: number;
  characterVisible: boolean;
  sceneVisible: boolean;
  character: number;
  world: World;
  action: Action;
  furniture: { kind: "sleep" | "study" | "sit"; seatHeight: number } | null;
  position: [number, number, number];
  playing: boolean;
  volume: number;
  modelUrl: string | null;
  sceneUrl: string | null;
  walkMode: boolean;
  walking: boolean;
  running: boolean;
  movementMode: "walk" | "run";
  singing: boolean;
  headphones: boolean;
  walkTarget: [number, number] | null;
  walkRoute: [[number,number],[number,number]] | null;
  set: (value: Partial<State>) => void;
}
export const useWorld = create<State>((set) => ({
  clientId: crypto.randomUUID(),
  actorId: "character-0",
  expression: "neutral",
  expressionIntensity: 0.7,
  pose: neutralPose,
  naturalMotion: true,
  gazeTracking: true,
  breath: 0.6,
  speaking: false,
  rotation: 0,
  viewRevision: 0,
  interactionRevision: 0,
  characterVisible: true,
  sceneVisible: true,
  character: 0,
  world: "lunar",
  action: "idle",
  furniture: null,
  position: [0, 0, 0],
  playing: false,
  volume: 65,
  modelUrl: null,
  sceneUrl: null,
  walkMode: false,
  walking: false,
  running: false,
  movementMode: "walk",
  singing: false,
  headphones: false,
  walkTarget: null,
  walkRoute: null,
  set: (patch) => set(current => {
    const changedScene = (patch.sceneUrl !== undefined && patch.sceneUrl !== current.sceneUrl) || patch.sceneVisible === false;
    const changedModel = (patch.actorId !== undefined && patch.actorId !== current.actorId) || (patch.modelUrl !== undefined && patch.modelUrl !== current.modelUrl) || (patch.character !== undefined && patch.character !== current.character) || patch.characterVisible === false;
    const next = {...patch};
    if (patch.walkMode === true || patch.singing === true) next.action = "idle";
    const leaving = current.furniture && (changedScene || changedModel || next.walkMode === true || next.singing === true || (next.action !== undefined && next.action !== (current.furniture.kind === "sleep" ? "sleep" : "sit")));
    const stopMotion = changedScene || changedModel || (next.action !== undefined && next.action !== "idle") || next.singing === true || next.walkMode === false;
    const result: Partial<State> = {
      ...(leaving ? {furniture:null,rotation:0,position:[0,0,0],walking:false,walkTarget:null} : {}),
      ...next,
      interactionRevision:current.interactionRevision + (next.action !== undefined || next.furniture !== undefined || next.pose !== undefined || next.expression !== undefined || next.headphones !== undefined || next.singing !== undefined || changedScene || changedModel ? 1 : 0),
    };
    if (stopMotion) Object.assign(result,{walking:false,running:false,walkTarget:null,walkRoute:null,walkMode:false});
    if (next.walkMode === true && !changedScene && !changedModel) Object.assign(result,{walkMode:true,singing:false,pose:{...neutralPose}});
    if (next.action !== undefined && next.action !== "idle" || changedScene || changedModel || next.walkMode === true) result.singing=false;
    if (next.singing === true && !changedScene && !changedModel) Object.assign(result,{singing:true,playing:false,pose:{...neutralPose}});
    if (next.playing === true || next.speaking === true) result.singing=false;
    if (changedScene || changedModel) result.furniture=null;
    if (changedModel) Object.assign(result,{action:"idle",expression:"neutral",expressionIntensity:.7,pose:{...neutralPose},rotation:0,headphones:false,singing:false,position:[0,0,0]});
    if (!(result.walking ?? current.walking)) result.running=false;
    return result;
  }),
}));
export const characters = [
  {
    name: "星澜",
    modelUrl: "/models/vrm-sample.vrm",
    thumbnail: "/models/vrm-sample.png",
    modelName: "VRM1 Constraint Twist Sample",
    author: "pixiv Inc.",
    license: "VRM Public License 1.0",
    sourceUrl:
      "https://github.com/pixiv/three-vrm/blob/dev/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm",
    en: "ASTRA",
    color: "#b9a0ff",
    tag: "温柔的星际旅人",
    desc: "对宇宙里的每一个小小瞬间，都充满好奇。",
  },
  {
    name: "弥音",
    modelUrl: "/models/vita.vrm",
    thumbnail: "/models/vita.png",
    modelName: "Vita · β AvatarSample_3",
    author: "pixiv Inc.",
    license: "CC0",
    sourceUrl:
      "https://github.com/madjin/vrm-samples/blob/e16eb187100149a315ad92c3c9968f1d5baa6c7d/vroid/beta/Vita.vrm",
    en: "MION",
    color: "#89dcd4",
    tag: "自由的旋律精灵",
    desc: "把每一次相遇，写成一首新的歌。",
  },
  {
    name: "绯月",
    modelUrl: "/models/vivi.vrm",
    thumbnail: "/models/vivi.png",
    modelName: "Vivi · β AvatarSample_2",
    author: "pixiv Inc.",
    license: "CC0",
    sourceUrl:
      "https://github.com/madjin/vrm-samples/blob/e16eb187100149a315ad92c3c9968f1d5baa6c7d/vroid/beta/Vivi.vrm",
    en: "LUNA",
    color: "#f2a7bc",
    tag: "浪漫的月光诗人",
    desc: "陪你收集落日、月光和未说完的故事。",
  },
];
