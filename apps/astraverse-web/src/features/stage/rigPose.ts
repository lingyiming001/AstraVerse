// VRM 0 faces -Z before rotateVRM0; its normalized axes remain in that frame.
export const rigDirection = (version: string) => version === "0" ? -1 : 1;
