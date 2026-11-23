// @hackbuild/presence: the procedural layers that make a standing humanoid
// read as present. Gaze with aversion and saccades, head recruitment and
// clamped eye aim, blink, breath, an idle scheduler, point, reach and throw
// timing, and a layered clip player with loop seams and idle handback.
// Plain TypeScript over @hackbuild/organic scalar code; no wasm.
export type { Rng } from "@hackbuild/organic";
export * from "./angles.js";
export * from "./blink.js";
export * from "./gaze.js";
export * from "./gesture.js";
export * from "./quat.js";
export * from "./clip.js";
