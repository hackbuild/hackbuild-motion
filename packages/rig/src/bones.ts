// The VRM 1.0 humanoid bone set, parents before children. The order equals
// the Rust `HumanBone` enum; a test checks the two against each other.

/** The VRM 1.0 humanoid bone names, in the order the wasm core numbers them. */
export const HUMAN_BONES = [
  "hips", "spine", "chest", "upperChest", "neck", "head", "leftEye", "rightEye", "jaw",
  "leftUpperLeg", "leftLowerLeg", "leftFoot", "leftToes", "rightUpperLeg", "rightLowerLeg", "rightFoot", "rightToes",
  "leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand", "rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand",
  "leftThumbMetacarpal", "leftThumbProximal", "leftThumbDistal",
  "leftIndexProximal", "leftIndexIntermediate", "leftIndexDistal",
  "leftMiddleProximal", "leftMiddleIntermediate", "leftMiddleDistal",
  "leftRingProximal", "leftRingIntermediate", "leftRingDistal",
  "leftLittleProximal", "leftLittleIntermediate", "leftLittleDistal",
  "rightThumbMetacarpal", "rightThumbProximal", "rightThumbDistal",
  "rightIndexProximal", "rightIndexIntermediate", "rightIndexDistal",
  "rightMiddleProximal", "rightMiddleIntermediate", "rightMiddleDistal",
  "rightRingProximal", "rightRingIntermediate", "rightRingDistal",
  "rightLittleProximal", "rightLittleIntermediate", "rightLittleDistal",
] as const;

/** One VRM 1.0 humanoid bone name. */
export type HumanBone = (typeof HUMAN_BONES)[number];

/** The 15 bones VRM 1.0 requires. */
export const REQUIRED_BONES: readonly HumanBone[] = [
  "hips", "spine", "head",
  "leftUpperLeg", "leftLowerLeg", "leftFoot", "rightUpperLeg", "rightLowerLeg", "rightFoot",
  "leftUpperArm", "leftLowerArm", "leftHand", "rightUpperArm", "rightLowerArm", "rightHand",
];

/** The index of a bone in `HUMAN_BONES`. */
export const boneIndex = (b: HumanBone): number => HUMAN_BONES.indexOf(b);
/** True when a string is a VRM 1.0 humanoid bone name. */
export const isHumanBone = (s: string): s is HumanBone => (HUMAN_BONES as readonly string[]).includes(s);
