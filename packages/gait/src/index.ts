// @hackbuild/gait: procedural legged locomotion. The oscillator, body
// dynamics, tail and ears run in wasm; this file gives them typed shapes and
// adds the ground query, which stays on the caller's side.
import { assertReady, loadWasm, loadWasmSync, type WasmSource } from "./load.js";
import * as wasm from "./wasm/gait.js";

export type { WasmSource } from "./load.js";

const PKG = "@hackbuild/gait";

export async function load(source?: WasmSource): Promise<void> {
  await loadWasm(source);
}

export function loadSync(source: ArrayBuffer | ArrayBufferView | WebAssembly.Module): void {
  loadWasmSync(source);
}

/** Uniform numbers in [0, 1); the family contract. Used here only to seed the wasm streams. */
export type Rng = () => number;

export type GaitName = "walk" | "pace" | "trot" | "canter" | "gallop";
export const GAIT_NAMES: readonly GaitName[] = ["walk", "pace", "trot", "canter", "gallop"];

export interface FootfallTable {
  name: GaitName;
  /** Stance start phase per leg, LF RF LH RH. */
  offsets: [number, number, number, number];
  duty: number;
  clearance: number;
  freq0: number;
  freqV: number;
  freqW: number;
}

export function quadrupedTables(): FootfallTable[] {
  assertReady(PKG);
  const f = wasm.quadrupedTables();
  return GAIT_NAMES.map((name, i) => {
    const o = i * 9;
    return { name, offsets: [f[o]!, f[o + 1]!, f[o + 2]!, f[o + 3]!], duty: f[o + 4]!, clearance: f[o + 5]!, freq0: f[o + 6]!, freqV: f[o + 7]!, freqW: f[o + 8]! };
  });
}

/** A leg's rest geometry in the body frame: x to the body's left, z forward. */
export interface LegSpec {
  x: number;
  z: number;
  /** Toe height above the ground at rest. */
  toe: number;
  front: boolean;
}

export interface GaitCommand {
  /** Forward speed, m/s. */
  speed: number;
  /** Turn rate, rad/s. */
  turnRate: number;
  /** Posture weights, 0 to 1. */
  posture?: { sit?: number; down?: number; bow?: number; reach?: number };
}

export interface FootState {
  x: number;
  /** World height: ground plus the swing height. */
  y: number;
  z: number;
  stance: boolean;
  swing: number;
}

export interface GaitState {
  phase: number;
  weights: Record<GaitName, number>;
  feet: FootState[];
  standing: boolean;
  frequency: number;
  duty: number;
  froude: number;
  /** Legs that touched down this frame. */
  touchdowns: number[];
}

export type Ground = (x: number, z: number) => number;

const seedOf = (rng: Rng): number => Math.floor(rng() * 4294967296) >>> 0;

/** The leg oscillator for a quadruped (LF RF LH RH). */
export class QuadrupedGait {
  private readonly core: wasm.Gait;
  constructor(
    readonly legs: readonly LegSpec[],
    readonly legLength: number,
    private readonly opts: { ground?: Ground; rng: Rng; paceBias?: number },
  ) {
    assertReady(PKG);
    this.core = new wasm.Gait(Float64Array.from(legs.flatMap((l) => [l.x, l.z, l.toe, l.front ? 1 : 0])), legLength, seedOf(opts.rng));
    if (opts.paceBias !== undefined) this.core.setPaceBias(opts.paceBias);
  }
  reset(x: number, z: number, yaw: number): void {
    this.core.reset(x, z, yaw);
  }
  /** World nominal foot spots for a body pose. */
  nominal(x: number, z: number, yaw: number): [number, number][] {
    const n = this.core.nominal(x, z, yaw);
    return this.legs.map((_, i) => [n[i * 2]!, n[i * 2 + 1]!]);
  }
  /** Posture foot offsets in the body frame, from `BodyDynamics`. */
  setOffsets(offsets: readonly [number, number][]): void {
    this.core.setOffsets(Float64Array.from(offsets.flat()));
  }
  update(dt: number, pose: { x: number; z: number; yaw: number }, cmd: GaitCommand): GaitState {
    const p = cmd.posture ?? {};
    const posed = (p.sit ?? 0) + (p.down ?? 0) + (p.bow ?? 0) + (p.reach ?? 0);
    const touch = this.core.update(dt, pose.x, pose.z, pose.yaw, cmd.speed, cmd.turnRate, posed);
    const f = this.core.feet();
    const w = this.core.weights();
    const ground = this.opts.ground ?? (() => 0);
    const feet = this.legs.map((_, i) => {
      const o = i * 5;
      return { x: f[o]!, y: ground(f[o]!, f[o + 2]!) + f[o + 1]!, z: f[o + 2]!, stance: f[o + 3] === 1, swing: f[o + 4]! };
    });
    const weights = Object.fromEntries(GAIT_NAMES.map((n, i) => [n, w[i] ?? 0])) as Record<GaitName, number>;
    return {
      phase: this.core.phase(),
      weights,
      feet,
      standing: this.core.standing(),
      frequency: this.core.frequency(),
      duty: this.core.duty(),
      froude: this.core.froude(),
      touchdowns: this.legs.map((_, i) => i).filter((i) => touch & (1 << i)),
    };
  }
  dispose(): void {
    this.core.free();
  }
}

export interface BodyGeometry {
  frontZ: number;
  rearZ: number;
  halfWidth: number;
  /** Length scale against the 0.78 m dog the defaults were tuned on. */
  size: number;
}

export interface BodyPose {
  rootY: number;
  drop: number;
  dz: number;
  pitch: number;
  roll: number;
  bend: number;
  flex: number;
  breathe: number;
  posture: { sit: number; down: number; bow: number; reach: number };
  legOffsets: [number, number][];
  tilt: number[];
}

/** Posture springs, terrain pitch and roll, gait bob, lean and load shift. */
export class BodyDynamics {
  private readonly core: wasm.BodyDynamics;
  constructor(geometry: BodyGeometry, rng: Rng) {
    assertReady(PKG);
    this.core = new wasm.BodyDynamics(Float64Array.of(geometry.frontZ, geometry.rearZ, geometry.halfWidth, geometry.size), seedOf(rng));
  }
  /** `ground` holds the ground height under each nominal foot spot. */
  update(dt: number, gait: GaitState, cmd: GaitCommand, ground: readonly number[], breath: { rate: number; depth: number } = { rate: 0.32, depth: 0.003 }): BodyPose {
    const p = cmd.posture ?? {};
    const o = this.core.update(
      dt,
      Float64Array.from(GAIT_NAMES.map((n) => gait.weights[n])),
      gait.phase,
      gait.standing,
      cmd.speed,
      cmd.turnRate,
      Float64Array.of(p.sit ?? 0, p.down ?? 0, p.bow ?? 0, p.reach ?? 0),
      Float64Array.from(ground),
      breath.rate,
      breath.depth,
    );
    return {
      rootY: o[0]!,
      drop: o[1]!,
      dz: o[2]!,
      pitch: o[3]!,
      roll: o[4]!,
      bend: o[5]!,
      flex: o[6]!,
      breathe: o[7]!,
      posture: { sit: o[8]!, down: o[9]!, bow: o[10]!, reach: o[11]! },
      legOffsets: [0, 1, 2, 3].map((i) => [o[12 + i * 2]!, o[13 + i * 2]!] as [number, number]),
      tilt: [o[20]!, o[21]!, o[22]!, o[23]!],
    };
  }
  dispose(): void {
    this.core.free();
  }
}

export const WAG_MODES = ["still", "slow wide", "fast small", "loose broad", "helicopter", "high stiff", "tucked", "tip flick"] as const;

export interface WagInput {
  modeWeights: readonly number[];
  arousal: number;
  lift?: number;
  bias?: number;
  turnRate?: number;
  ampScale?: number;
  hzScale?: number;
}

/** Tail wag through a spring chain, with eight wag modes. */
export class TailWag {
  private readonly core: wasm.Wag;
  constructor(links: number, halflife: number, rng: Rng) {
    assertReady(PKG);
    this.core = new wasm.Wag(links, halflife, seedOf(rng));
  }
  update(dt: number, inp: WagInput): { mode: (typeof WAG_MODES)[number]; lift: number; yaw: number[] } {
    const o = this.core.update(dt, Float64Array.from(inp.modeWeights), inp.arousal, inp.lift ?? 0, inp.bias ?? 0, inp.turnRate ?? 0, inp.ampScale ?? 1, inp.hzScale ?? 1);
    return { mode: WAG_MODES[o[0]!]!, lift: o[1]!, yaw: Array.from(o.subarray(2)) };
  }
  dispose(): void {
    this.core.free();
  }
}

/** Two ear springs. Returns [left, right] in radians. */
export class Ears {
  private readonly core: wasm.EarPair;
  constructor(halflife = 0.07) {
    assertReady(PKG);
    this.core = new wasm.EarPair(halflife);
  }
  update(dt: number, perk: number, negative: number, headYawRate: number, flap = 0, bounce = 0): [number, number] {
    const o = this.core.update(dt, perk, negative, headYawRate, flap, bounce);
    return [o[0]!, o[1]!];
  }
  dispose(): void {
    this.core.free();
  }
}

export interface Obstacle {
  x: number;
  z: number;
  r: number;
}

export interface SteerParams {
  speed: number;
  stopDistance: number;
  clearance: number;
  influence: number;
  turnSlow: number;
  turnFast: number;
  /** Fence radius around the origin, 0 for none. */
  fence: number;
}

export const DEFAULT_STEER: SteerParams = { speed: 1.6, stopDistance: 0.3, clearance: 0.3, influence: 1.6, turnSlow: 3.2, turnFast: 1.6, fence: 0 };

/** Potential field steering toward a goal; a pure function. */
export function steer(pose: { x: number; z: number; yaw: number; v: number }, goal: { x: number; z: number }, obstacles: readonly Obstacle[] = [], params: Partial<SteerParams> = {}): { speed: number; turnRate: number; arrived: boolean } {
  assertReady(PKG);
  const p = { ...DEFAULT_STEER, ...params };
  const o = wasm.steer(pose.x, pose.z, pose.yaw, pose.v, goal.x, goal.z, Float64Array.from(obstacles.flatMap((b) => [b.x, b.z, b.r])), Float64Array.of(p.speed, p.stopDistance, p.clearance, p.influence, p.turnSlow, p.turnFast, p.fence));
  return { speed: o[0]!, turnRate: o[1]!, arrived: o[2] === 1 };
}

export interface Capabilities {
  turnInPlace: boolean;
  /** The closest this backend can stop to a goal, meters. */
  minStopDistance: number;
  /** Head pitch the backend's own motion carries, radians. */
  headPitchBias: number;
}

export interface RootMotion {
  x: number;
  z: number;
  yaw: number;
  speed: number;
  turnRate: number;
}

/**
 * A locomotion backend (procedural gait, neural network, motion matcher)
 * declares what it can do, so a caller asks it for its stop distance
 * instead of assuming one.
 */
export interface LocomotionBackend {
  readonly capabilities: Capabilities;
  update(dt: number, cmd: GaitCommand): RootMotion;
}

/** The procedural gait as a backend: integrates the command into root motion and steps the legs. */
export class ProceduralBackend implements LocomotionBackend {
  readonly capabilities: Capabilities = { turnInPlace: true, minStopDistance: 0.05, headPitchBias: 0 };
  root: RootMotion = { x: 0, z: 0, yaw: 0, speed: 0, turnRate: 0 };
  state: GaitState | null = null;
  constructor(readonly gait: QuadrupedGait) {}
  update(dt: number, cmd: GaitCommand): RootMotion {
    const r = this.root;
    r.speed = cmd.speed;
    r.turnRate = cmd.turnRate;
    r.yaw += cmd.turnRate * dt;
    r.x += Math.sin(r.yaw) * cmd.speed * dt;
    r.z += Math.cos(r.yaw) * cmd.speed * dt;
    this.state = this.gait.update(dt, r, cmd);
    return { ...r };
  }
}

/** Two bone leg solve; same layout as `@hackbuild/ik` twoBone. */
export function solveLeg(a: [number, number, number], b: [number, number, number], c: [number, number, number], target: [number, number, number], pole: [number, number, number]) {
  assertReady(PKG);
  const o = wasm.solveLeg(Float64Array.from([...a, ...b, ...c]), Float64Array.from(target), Float64Array.from(pole));
  return { upper: [o[6]!, o[7]!, o[8]!, o[9]!] as [number, number, number, number], lower: [o[10]!, o[11]!, o[12]!, o[13]!] as [number, number, number, number], reached: o[14] === 1 };
}

export function goldenTrace(seed: number): Float64Array {
  assertReady(PKG);
  return wasm.goldenTrace(seed);
}
