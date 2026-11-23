// Data facts of the published quadruped network: bone order, input and
// output layout, style labels. Fixed by training; the host reads them from
// here and checks the manifest against them.

export const BONES = [
  "Hips",
  "Spine",
  "Spine1",
  "Neck",
  "Head",
  "HeadSite",
  "LeftShoulder",
  "LeftArm",
  "LeftForeArm",
  "LeftHand",
  "LeftHandSite",
  "RightShoulder",
  "RightArm",
  "RightForeArm",
  "RightHand",
  "RightHandSite",
  "LeftUpLeg",
  "LeftLeg",
  "LeftFoot",
  "LeftFootSite",
  "RightUpLeg",
  "RightLeg",
  "RightFoot",
  "RightFootSite",
  "Tail",
  "Tail1",
  "Tail1Site",
] as const;
export type BoneName = (typeof BONES)[number];
export const BONE_COUNT = 27;

/** Parent index per bone, -1 for the root. */
export const PARENTS: readonly number[] = BONES.map((name, i) => {
  if (i === 0) return -1;
  if (name === "Spine" || name === "LeftUpLeg" || name === "RightUpLeg" || name === "Tail") return 0;
  if (name === "Neck" || name === "LeftShoulder" || name === "RightShoulder") return 2;
  return i - 1;
});

export const STYLES = ["Canter", "Idle", "Jump", "Lie", "Pace", "Sit", "Stand", "Trot", "Walk"] as const;
export type StyleLabel = (typeof STYLES)[number];

/** Paws in contact order: front left, front right, hind left, hind right. */
export const PAWS = ["front left", "front right", "hind left", "hind right"] as const;
/** Per paw: the end site, the paw bone, the lower and upper limb bones. */
export const PAW_CHAINS: readonly { site: number; paw: number; lower: number; upper: number }[] = [
  { site: 10, paw: 9, lower: 8, upper: 7 },
  { site: 15, paw: 14, lower: 13, upper: 12 },
  { site: 19, paw: 18, lower: 17, upper: 16 },
  { site: 23, paw: 22, lower: 21, upper: 20 },
];

/** Input vector offsets. */
export const IN = {
  positions: 0,
  velocities: 81,
  trajPositions: 162,
  trajDirections: 194,
  trajVelocities: 226,
  style: 258,
  length: 339,
} as const;

/** Output vector offsets, per frame. */
export const OUT = {
  dx: 0,
  dyaw: 1,
  dz: 2,
  positions: 3,
  axisZ: 84,
  axisY: 165,
  velocities: 246,
  contacts: 327,
  style: 331,
  length: 412,
} as const;

export const FRAMES = 16;
/** Seconds between predicted frames and between trajectory samples. */
export const FRAME_DT = 1 / 30;
export const TRAJ_SAMPLES = 16;
