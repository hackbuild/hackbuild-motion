// @hackbuild/avatar: characters from VRM, Mixamo, UAL, generic GLB and FBX
// into the normalized humanoid space (VRM 1.0 bone names, T pose, +Z
// forward, meters, feet at y = 0). This entry holds the parts with no
// three.js: format sniffing, the FBX probe, the wardrobe classifier,
// lenient texture lookup, the unit guess and the redistribution gate.
// `/three` loads and repairs models; `/vrm` adds @pixiv/three-vrm.

export * from "./format.js";
export * from "./textures.js";
export * from "./wardrobe.js";
export { load, loadSync } from "@hackbuild/rig";
export type { HumanBone } from "@hackbuild/rig/bones";
export * from "./visibility.js";
