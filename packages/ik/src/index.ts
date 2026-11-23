// @hackbuild/ik: solvers on positions that return world space rotation
// deltas. Premultiply a delta onto a bone's world rotation, then convert
// back into the parent's space; ./three.ts does that for three.js bones.
import { assertReady, loadWasm, loadWasmSync, type WasmSource } from "./load.js";
import * as wasm from "./wasm/ik.js";

export type { WasmSource } from "./load.js";
export { ContactLock } from "./wasm/ik.js";

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

const PKG = "@hackbuild/ik";

export async function load(source?: WasmSource): Promise<void> {
  await loadWasm(source);
}

export function loadSync(source: ArrayBuffer | ArrayBufferView | WebAssembly.Module): void {
  loadWasmSync(source);
}

const f64 = (...v: number[][]): Float64Array => Float64Array.from(v.flat());
const v3 = (a: Float64Array, i: number): Vec3 => [a[i]!, a[i + 1]!, a[i + 2]!];
const q4 = (a: Float64Array, i: number): Quat => [a[i]!, a[i + 1]!, a[i + 2]!, a[i + 3]!];

export interface TwoBoneResult {
  mid: Vec3;
  end: Vec3;
  /** World delta for the upper bone. */
  upper: Quat;
  /** World delta for the lower bone after the upper one moved it. */
  lower: Quat;
  reached: boolean;
}

/** Two bone solve of root `a`, middle `b`, end `c` toward `target`, bending toward the `pole` direction. */
export function twoBone(a: Vec3, b: Vec3, c: Vec3, target: Vec3, pole: Vec3, soft = 0): TwoBoneResult {
  assertReady(PKG);
  const o = wasm.twoBone(f64(a, b, c), f64(target), f64(pole), soft);
  return { mid: v3(o, 0), end: v3(o, 3), upper: q4(o, 6), lower: q4(o, 10), reached: o[14] === 1 };
}

export type JointLimit = { kind: "none" } | { kind: "cone"; max: number } | { kind: "hinge"; axis: Vec3 };

export interface ChainOptions {
  iterations?: number;
  tolerance?: number;
}

export interface SolveInfo {
  iterations: number;
  error: number;
}

const limitsOf = (limits?: readonly JointLimit[]): Float64Array =>
  f64(...(limits ?? []).map((l) => (l.kind === "cone" ? [1, l.max, 0, 0] : l.kind === "hinge" ? [2, ...l.axis] : [0, 0, 0, 0])));

/** FABRIK in place on `positions` (root first); lengths and root are kept. */
export function fabrik(positions: Vec3[], target: Vec3, opts: ChainOptions & { limits?: readonly JointLimit[] } = {}): SolveInfo {
  assertReady(PKG);
  const p = f64(...positions);
  const o = wasm.fabrik(p, f64(target), opts.iterations ?? 32, opts.tolerance ?? 1e-4, limitsOf(opts.limits));
  positions.forEach((_, i) => (positions[i] = v3(p, i * 3)));
  return { iterations: o[0]!, error: o[1]! };
}

/** CCD in place on `positions`; `maxStep` caps radians per joint per pass. */
export function ccd(positions: Vec3[], target: Vec3, opts: ChainOptions & { maxStep?: number } = {}): SolveInfo {
  assertReady(PKG);
  const p = f64(...positions);
  const o = wasm.ccd(p, f64(target), opts.iterations ?? 32, opts.tolerance ?? 1e-4, opts.maxStep ?? 0);
  positions.forEach((_, i) => (positions[i] = v3(p, i * 3)));
  return { iterations: o[0]!, error: o[1]! };
}

/** World delta per segment that turns chain `old` into chain `next`. */
export function segmentDeltas(old: readonly Vec3[], next: readonly Vec3[]): Quat[] {
  assertReady(PKG);
  const o = wasm.segmentDeltas(f64(...old), f64(...next));
  return Array.from({ length: o.length / 4 }, (_, i) => q4(o, i * 4));
}

export interface LookLimits {
  yawMin: number;
  yawMax: number;
  pitchMin: number;
  pitchMax: number;
}

export const DEFAULT_LOOK_LIMITS: LookLimits = { yawMin: -1.25, yawMax: 1.25, pitchMin: -0.8, pitchMax: 0.6 };

export interface LookResult {
  yaw: number;
  pitch: number;
  clamped: boolean;
  /** The target lies past the yaw limit: turn the body. */
  behind: boolean;
  /** Yaw the chain cannot take, for body turning. */
  bodyYaw: number;
}

/**
 * Clamped yaw and pitch of `target` from `origin` in `frame` (+Z forward,
 * +X left). Pass last frame's `yaw + bodyYaw` as `prevYaw`: past 2.2 rad a
 * sign flip keeps the previous side, so a target crossing behind does not
 * whip the head across.
 */
export function lookAngles(frame: Quat, origin: Vec3, target: Vec3, limits: LookLimits = DEFAULT_LOOK_LIMITS, prevYaw = 0): LookResult {
  assertReady(PKG);
  const o = wasm.lookAngles(f64(frame), f64(origin), f64(target), f64([limits.yawMin, limits.yawMax, limits.pitchMin, limits.pitchMax]), prevYaw);
  return { yaw: o[0]!, pitch: o[1]!, clamped: o[2] === 1, behind: o[3] === 1, bodyYaw: o[4]! };
}

/** World deltas that share yaw and pitch over a chain by weight; apply parent first. */
export function lookChain(frame: Quat, yaw: number, pitch: number, weights: readonly number[]): Quat[] {
  assertReady(PKG);
  const o = wasm.lookChain(f64(frame), yaw, pitch, Float64Array.from(weights));
  return weights.map((_, i) => q4(o, i * 4));
}

/** A direction limited to within the given yaw and pitch of the head's forward. */
export function clampDirection(head: Quat, dir: Vec3, maxYaw = 0.43, maxPitch = 0.17): Vec3 {
  assertReady(PKG);
  return v3(wasm.clampDirection(f64(head), f64(dir), maxYaw, maxPitch), 0);
}

export interface HandCurl {
  forward: Vec3;
  across: Vec3;
  normal: Vec3;
  /** Where a held object sits. */
  grip: Vec3;
  fingerAxis: Vec3;
  /** Proximal, intermediate, distal. */
  fingerAngles: [number, number, number];
  thumbAxis: Vec3;
  thumbAngle: number;
}

/** Palm frame from the knuckles (or the forearm), and a curl of `amount` (0 to 1). */
export function handCurl(hand: Vec3, lowerArm: Vec3, side: "left" | "right", amount: number, index1?: Vec3, little1?: Vec3): HandCurl {
  assertReady(PKG);
  const pts = index1 && little1 ? f64(hand, lowerArm, index1, little1) : f64(hand, lowerArm);
  const o = wasm.handCurl(pts, side === "left", amount);
  return {
    forward: v3(o, 0),
    across: v3(o, 3),
    normal: v3(o, 6),
    grip: v3(o, 9),
    fingerAxis: v3(o, 12),
    fingerAngles: [o[15]!, o[16]!, o[17]!],
    thumbAxis: v3(o, 18),
    thumbAngle: o[21]!,
  };
}

/** Drop along -up the hip needs so `foot` is within `reach`. */
export function pelvisDrop(hip: Vec3, foot: Vec3, reach: number, up: Vec3 = [0, 1, 0]): number {
  assertReady(PKG);
  return wasm.pelvisDrop(f64(hip), f64(foot), reach, f64(up));
}

export function goldenTrace(seed: number): Float64Array {
  assertReady(PKG);
  return wasm.goldenTrace(seed);
}
