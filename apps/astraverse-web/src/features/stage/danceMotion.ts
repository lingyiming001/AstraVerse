/** Authored 16-beat dance phrase, cyclic cubic interpolation and bounded joints. */
const rest = {
  shift: 0,
  bounce: 0,
  turn: 0,
  hip: 0,
  chest: 0,
  head: 0,
  leftLift: 0.32,
  rightLift: 0.32,
  leftReach: 0,
  rightReach: 0,
  leftElbow: 0.24,
  rightElbow: 0.24,
  wristL: 0,
  wristR: 0,
  legL: 0,
  legR: 0,
  kneeL: 0,
  kneeR: 0,
  toeL: 0,
  toeR: 0,
  stepL: 0,
  stepR: 0,
};
type Pose = typeof rest;
const frame = (pose: Partial<Pose>): Pose => ({ ...rest, ...pose });
// Settle → side step → trace → open → recover → mirror → gather → release.
const phrase: Pose[] = [
  frame({ leftLift: 0.25, rightLift: 0.32, leftElbow: 0.4, rightElbow: 0.5 }),
  frame({
    shift: 0.08,
    hip: 0.045,
    chest: -0.035,
    turn: 0.1,
    leftLift: 0.55,
    rightLift: 0.3,
    leftReach: -0.18,
    rightReach: 0.16,
    rightElbow: 0.7,
    legR: 0.08,
    kneeR: 0.14,
    toeR: 0.05,
    wristL: -0.13,
  }),
  frame({
    shift: 0.03,
    turn: 0.18,
    chest: 0.025,
    leftLift: 0.95,
    rightLift: 0.42,
    leftReach: -0.25,
    rightReach: 0.12,
    leftElbow: 0.45,
    rightElbow: 0.8,
    wristL: 0.15,
    head: -0.025,
  }),
  frame({
    shift: -0.07,
    hip: -0.045,
    chest: 0.035,
    turn: -0.08,
    leftLift: 0.62,
    rightLift: 1.06,
    leftReach: 0.12,
    rightReach: -0.25,
    leftElbow: 0.6,
    rightElbow: 0.3,
    legL: 0.07,
    kneeL: 0.14,
    toeL: 0.04,
    wristR: -0.16,
  }),
  frame({
    shift: 0,
    turn: -0.15,
    leftLift: 0.88,
    rightLift: 0.88,
    leftReach: -0.12,
    rightReach: -0.12,
    leftElbow: 0.32,
    rightElbow: 0.32,
    wristL: 0.1,
    wristR: -0.1,
  }),
  frame({
    shift: 0.07,
    hip: 0.04,
    chest: -0.03,
    turn: 0.07,
    leftLift: 1.08,
    rightLift: 0.48,
    leftReach: -0.24,
    rightReach: 0.2,
    leftElbow: 0.3,
    rightElbow: 0.76,
    legR: 0.065,
    kneeR: 0.12,
    toeR: 0.04,
    head: 0.02,
  }),
  frame({
    shift: 0.02,
    turn: 0.14,
    leftLift: 0.5,
    rightLift: 0.58,
    leftReach: 0.17,
    rightReach: 0.14,
    leftElbow: 0.86,
    rightElbow: 0.8,
    wristL: -0.16,
    wristR: 0.16,
  }),
  frame({
    shift: -0.065,
    hip: -0.04,
    chest: 0.03,
    turn: -0.1,
    leftLift: 0.28,
    rightLift: 0.92,
    leftReach: 0.1,
    rightReach: -0.2,
    leftElbow: 0.55,
    rightElbow: 0.42,
    legL: 0.06,
    kneeL: 0.12,
    toeL: 0.04,
    wristR: -0.14,
  }),
];
const cubic = (a: number, b: number, c: number, d: number, t: number) =>
  0.5 *
  (2 * b +
    (-a + c) * t +
    (2 * a - 5 * b + 4 * c - d) * t * t +
    (-a + 3 * b - 3 * c + d) * t * t * t);
export function dancePose(
  phase: number,
  movement: "soft" | "graceful" | "lively",
  energy: number,
): Pose {
  const beat = phase / (Math.PI * 2),
    sample = (((beat / 2) % phrase.length) + phrase.length) % phrase.length;
  const index = Math.floor(sample),
    u = sample - index;
  const gain =
    (movement === "lively" ? 1.04 : movement === "graceful" ? 0.93 : 0.84) *
    (0.88 + Math.min(1, Math.max(0, energy)) * 0.16);
  const pose = { ...rest };
  for (const key of Object.keys(rest) as (keyof Pose)[]) {
    const value =
      cubic(
        phrase[(index + phrase.length - 1) % phrase.length][key],
        phrase[index][key],
        phrase[(index + 1) % phrase.length][key],
        phrase[(index + 2) % phrase.length][key],
        u,
      ) * gain;
    pose[key] = [
      "legL",
      "legR",
      "kneeL",
      "kneeR",
      "toeL",
      "toeR",
      "leftLift",
      "rightLift",
      "leftElbow",
      "rightElbow",
    ].includes(key)
      ? Math.max(0, Math.min(2.2, value))
      : Math.max(-0.35, Math.min(0.35, value));
  }
  // Alternate a step and a recovery each two beats; arms follow the authored phrase.
  // Knees flex on the lifted leg. The avatar renderer compensates ground height.
  const stride = Math.sin(phase / 2);
  const liftL = Math.max(0, stride), liftR = Math.max(0, -stride);
  pose.legL += liftL * 0.34 * gain;
  pose.legR += liftR * 0.34 * gain;
  pose.kneeL += liftL * 0.64 * gain;
  pose.kneeR += liftR * 0.64 * gain;
  pose.toeL += liftL * 0.18 * gain;
  pose.toeR += liftR * 0.18 * gain;
  pose.stepL = -liftL * 0.16 * gain;
  pose.stepR = liftR * 0.16 * gain;
  pose.shift += stride * 0.075 * gain;
  pose.hip += Math.sin(phase / 2 - 0.3) * 0.055 * gain;
  pose.chest -= Math.sin(phase / 2 - 0.6) * 0.045 * gain;
  pose.leftLift *= 1.65;
  pose.rightLift *= 1.65;
  pose.leftReach *= 1.8;
  pose.rightReach *= 1.8;
  pose.head += Math.sin(phase / 4 - 0.6) * 0.045 * gain;
  // Delayed wrist finishing avoids moving every joint in lockstep.
  pose.wristL += Math.sin(phase / 2 - 0.8) * 0.025 * gain;
  pose.wristR += Math.sin(phase / 2 + 0.8) * 0.025 * gain;
  return pose;
}
