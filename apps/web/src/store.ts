import { create } from "zustand";
export type Action = "idle" | "wave" | "dance" | "jump";
export type World = "lunar" | "aurora" | "sunset";
export type Expression =
  | "neutral"
  | "happy"
  | "curious"
  | "sad"
  | "surprised"
  | "relaxed";
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
  expression: Expression;
  expressionIntensity: number;
  pose: Pose;
  naturalMotion: boolean;
  gazeTracking: boolean;
  breath: number;
  speaking: boolean;
  rotation: number;
  character: number;
  world: World;
  action: Action;
  position: [number, number, number];
  playing: boolean;
  volume: number;
  modelUrl: string | null;
  sceneUrl: string | null;
  set: (value: Partial<State>) => void;
}
export const useWorld = create<State>((set) => ({
  expression: "neutral",
  expressionIntensity: 0.7,
  pose: neutralPose,
  naturalMotion: true,
  gazeTracking: true,
  breath: 0.6,
  speaking: false,
  rotation: 0,
  character: 0,
  world: "lunar",
  action: "idle",
  position: [0, 0, 0],
  playing: false,
  volume: 65,
  modelUrl: null,
  sceneUrl: null,
  set,
}));
export const characters = [
  {
    name: "星澜",
    en: "ASTRA",
    color: "#b9a0ff",
    tag: "温柔的星际旅人",
    desc: "对宇宙里的每一个小小瞬间，都充满好奇。",
  },
  {
    name: "弥音",
    en: "MION",
    color: "#89dcd4",
    tag: "自由的旋律精灵",
    desc: "把每一次相遇，写成一首新的歌。",
  },
  {
    name: "绯月",
    en: "LUNA",
    color: "#f2a7bc",
    tag: "浪漫的月光诗人",
    desc: "陪你收集落日、月光和未说完的故事。",
  },
];
