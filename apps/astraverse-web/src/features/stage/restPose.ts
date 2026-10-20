import type { Action } from "@/shared/state/workspaceStore";
export const isRestAction = (action: Action) => action === "sit" || action === "crouch" || action === "sleep";
export const restPoses: Record<string, Record<string, [number, number, number]>> = {
  sit: {
    hips:[0,0,0], spine:[.06,0,0], head:[0,0,0],
    leftUpperLeg:[-1.55,0,-.08], rightUpperLeg:[-1.55,0,.08],
    leftLowerLeg:[.15,0,0], rightLowerLeg:[.15,0,0], leftFoot:[0,0,0], rightFoot:[0,0,0],
    leftUpperArm:[-.45,0,-1.15], rightUpperArm:[-.45,0,1.15],
    leftLowerArm:[0,-.7,0], rightLowerArm:[0,.7,0],
  },
  study: {
    hips:[0,0,0], spine:[.14,0,0], head:[.25,0,0],
    leftUpperLeg:[-1.57,0,-.06], rightUpperLeg:[-1.57,0,.06],
    leftLowerLeg:[1.57,0,0], rightLowerLeg:[1.57,0,0], leftFoot:[0,0,0],rightFoot:[0,0,0],
    leftUpperArm:[-.65,0,-.65], rightUpperArm:[-.65,0,.65],
    leftLowerArm:[0,-1.35,0],rightLowerArm:[0,1.35,0],
  },
  chair: {
    hips:[0,0,0], spine:[.04,0,0], head:[0,0,0],
    leftUpperLeg:[-1.57,0,-.07], rightUpperLeg:[-1.57,0,.07],
    leftLowerLeg:[1.57,0,0], rightLowerLeg:[1.57,0,0],leftFoot:[0,0,0],rightFoot:[0,0,0],
    leftUpperArm:[-.3,0,-1.15],rightUpperArm:[-.3,0,1.15],leftLowerArm:[0,-.6,0],rightLowerArm:[0,.6,0],
  },
  crouch: {
    hips:[.18,0,0], spine:[.2,0,0], head:[-.15,0,0],
    leftUpperLeg:[-2.1,0,-.12], rightUpperLeg:[-2.1,0,.12],
    leftLowerLeg:[2.5,0,0], rightLowerLeg:[2.5,0,0], leftFoot:[-.58,0,0], rightFoot:[-.58,0,0],
    leftUpperArm:[-.55,0,-1.1], rightUpperArm:[-.55,0,1.1],
    leftLowerArm:[0,-.8,0], rightLowerArm:[0,.8,0],
  },
  sleep: {
    hips:[0,0,0], spine:[0,0,0], head:[0,0,.08],
    leftUpperLeg:[0,0,-.05], rightUpperLeg:[0,0,.05],
    leftLowerLeg:[.05,0,0], rightLowerLeg:[.05,0,0], leftFoot:[0,0,0], rightFoot:[0,0,0],
    leftUpperArm:[0,0,-1.35], rightUpperArm:[0,0,1.35],
    leftLowerArm:[0,-.15,0], rightLowerArm:[0,.15,0],
  },
};
