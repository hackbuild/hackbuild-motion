// @hackbuild/motion-match: classic motion matching. The database, search,
// trajectory prediction and inertialized transitions run in wasm; this
// file gives them typed shapes and the gait backend contract.
import { assertReady, loadWasm, loadWasmSync, type WasmSource } from "./load.js";
import * as wasm from "./wasm/motion_match.js";

export type { WasmSource } from "./load.js";

const PKG = "@hackbuild/motion-match";

/** Loads the wasm core once: from a URL, bytes or a compiled module, or from the inlined copy when you pass nothing. Call it before anything else. */
export async function load(source?: WasmSource): Promise<void> {
  await loadWasm(source);
}

/** Loads the wasm core synchronously from bytes or a compiled module. */
export function loadSync(source: ArrayBuffer | ArrayBufferView | WebAssembly.Module): void {
  loadWasmSync(source);
}

// The locomotion backend contract, structurally the same as the one in
// @hackbuild/gait, so a matcher stands in for the procedural gait without
// this package depending on that one.

/** What drives a locomotion backend. */
export type MotorSource = "procedural" | "neural" | "motion-match" | "clip" | "other";

/** Stride phase, duty and foot contacts of a backend, for layers that follow the feet. */
export interface MotorState {
  source: MotorSource;
  /** Stride phase of the reference foot (the first), 0 at its touchdown. */
  phase: number;
  duty: number;
  strideFrequency: number;
  contacts: boolean[];
}

/** What a locomotion backend can do. */
export interface Capabilities {
  turnInPlace: boolean;
  /** The closest this backend can stop to a goal, meters. */
  minStopDistance: number;
  /** Head pitch the backend's own motion carries, radians. */
  headPitchBias: number;
}

/** Root position, facing and velocity on the ground after one update: meters, radians, m/s and rad/s. */
export interface RootMotion {
  x: number;
  z: number;
  yaw: number;
  speed: number;
  turnRate: number;
}

/** A locomotion command: forward speed, turn rate and an optional posture blend. */
export interface GaitCommand {
  /** Forward speed, m/s. */
  speed: number;
  /** Turn rate, rad/s. */
  turnRate: number;
  posture?: { sit?: number; down?: number; bow?: number; reach?: number };
}

/** The locomotion backend contract shared with @hackbuild/gait, so a matcher stands in for the procedural gait. */
export interface LocomotionBackend {
  readonly capabilities: Capabilities;
  update(dt: number, cmd: GaitCommand): RootMotion;
  motorState(): MotorState;
}

/**
 * One clip on a shared rig. `root` is `x z yaw` per frame on the ground
 * (yaw 0 faces +Z, unwrapped), `rotations` `x y z w` per bone per frame,
 * `hips` and `feet` `x y z` in the root's frame, `contacts` one flag per
 * foot per frame. Every clip in a set has the same bones and feet.
 */
export interface ClipInput {
  looped: boolean;
  root: ArrayLike<number>;
  rotations: ArrayLike<number>;
  hips: ArrayLike<number>;
  feet: ArrayLike<number>;
  contacts: ArrayLike<number | boolean>;
}

/** Settings of a synthetic two foot gait clip made in code. */
export interface SyntheticGait {
  /** Speed at the start, m/s. */
  speed: number;
  /** Speed at the end; defaults to `speed`. */
  speedEnd?: number;
  turnRate?: number;
  strides?: number;
  /** Defaults to true for a steady gait and false when `speedEnd` differs, since a start or stop cannot loop. */
  looped?: boolean;
}

/** Clips collected before a matcher builds its database from them. */
export class ClipSet {
  readonly core: wasm.ClipSet;
  constructor(readonly fps: number) {
    assertReady(PKG);
    this.core = new wasm.ClipSet(fps);
  }
  /** Adds a clip; returns its index. Throws when the arrays disagree. */
  add(c: ClipInput): number {
    return this.core.addClip(
      c.looped,
      Float64Array.from(c.root),
      Float64Array.from(c.rotations),
      Float64Array.from(c.hips),
      Float64Array.from(c.feet),
      Uint8Array.from(Array.from(c.contacts, (x) => (x ? 1 : 0))),
    );
  }
  /** A synthetic two foot gait clip with planted feet (three bones: hips, left leg, right leg). */
  addSynthetic(g: SyntheticGait): number {
    return this.core.addSynth(g.speed, g.speedEnd ?? g.speed, g.turnRate ?? 0, g.strides ?? 3, g.looped ?? (g.speedEnd === undefined || g.speedEnd === g.speed));
  }
  get count(): number {
    return this.core.count;
  }
  frames(): number[] {
    return Array.from(this.core.frames());
  }
  dispose(): void {
    this.core.free();
  }
}

/** Feature layout and search settings of the matching database. */
export interface MatchConfig {
  /** Future trajectory sample times, seconds. Default 1/3, 2/3, 1. */
  trajTimes: number[];
  weights: { footPosition: number; footVelocity: number; hipVelocity: number; trajectoryPosition: number; trajectoryDirection: number };
  /** Frames around the current one that a search skips. */
  ignoreWindow: number;
  boxSmall: number;
  boxLarge: number;
}

/** The default feature layout and search settings. */
export const DEFAULT_CONFIG: MatchConfig = {
  trajTimes: [1 / 3, 2 / 3, 1],
  weights: { footPosition: 0.75, footVelocity: 1, hipVelocity: 1, trajectoryPosition: 1, trajectoryDirection: 1.5 },
  ignoreWindow: 6,
  boxSmall: 16,
  boxLarge: 64,
};

/** Runtime settings of a matcher: search interval, transition halflife and jump threshold. */
export interface MatcherParams {
  /** Seconds between searches. */
  searchInterval: number;
  /** Inertialization halflife, seconds. */
  halflife: number;
  /** A jump needs a cost this much below the current frame's. */
  minImprovement: number;
  /** Halflife of the predicted trajectory's velocity, seconds. */
  trajectoryHalflife: number;
}

/** The default runtime settings of a matcher. */
export const DEFAULT_PARAMS: MatcherParams = { searchInterval: 0.1, halflife: 0.1, minImprovement: 0.05, trajectoryHalflife: 0.25 };

/** Options of a new matcher: config, params, start frame and capabilities. */
export interface MatcherOptions {
  config?: Partial<MatchConfig>;
  params?: Partial<MatcherParams>;
  start?: { clip?: number; frame?: number; x?: number; z?: number; yaw?: number };
  /** What the clip set can do; a set without turn in place clips should say so. */
  capabilities?: Partial<Capabilities>;
}

/** The blended pose of the current frame. */
export interface MatchPose {
  /** `x y z w` per bone, local rotations after inertialization. */
  rotations: Float64Array;
  /** Hip position in the root's frame. */
  hips: [number, number, number];
  /** Foot positions in the root's frame. */
  feet: [number, number, number][];
}

/** One matcher step: root motion plus the clip and frame playing and whether it jumped. */
export interface MatchFrame extends RootMotion {
  clip: number;
  frame: number;
  /** A transition happened this frame. */
  jumped: boolean;
  /** Cost of the last search's best frame. */
  cost: number;
  transitions: number;
}

/** A motion matcher over a clip set, usable as a locomotion backend. */
export class MotionMatcher implements LocomotionBackend {
  readonly capabilities: Capabilities;
  readonly core: wasm.Matcher;
  last: MatchFrame = { x: 0, z: 0, yaw: 0, speed: 0, turnRate: 0, clip: 0, frame: 0, jumped: false, cost: Infinity, transitions: 0 };
  private motor: MotorState;
  constructor(set: ClipSet, opts: MatcherOptions = {}) {
    assertReady(PKG);
    const c = { ...DEFAULT_CONFIG, ...opts.config, weights: { ...DEFAULT_CONFIG.weights, ...opts.config?.weights } };
    const w = c.weights;
    const config = [c.trajTimes.length, ...c.trajTimes, w.footPosition, w.footVelocity, w.hipVelocity, w.trajectoryPosition, w.trajectoryDirection, c.ignoreWindow, c.boxSmall, c.boxLarge];
    const p = { ...DEFAULT_PARAMS, ...opts.params };
    const s = opts.start ?? {};
    this.core = new wasm.Matcher(
      set.core,
      Float64Array.from(config),
      Float64Array.from([p.searchInterval, p.halflife, p.minImprovement, p.trajectoryHalflife]),
      Float64Array.from([s.clip ?? 0, s.frame ?? 0, s.x ?? 0, s.z ?? 0, s.yaw ?? 0]),
    );
    this.capabilities = { turnInPlace: false, minStopDistance: 0.3, headPitchBias: 0, ...opts.capabilities };
    this.motor = { source: "motion-match", phase: 0, duty: 0, strideFrequency: 0, contacts: Array.from({ length: this.core.feet }, () => true) };
  }
  /** The desired trajectory for a command, from the current root velocity (`x z` per time, then facing `dx dz` per time). */
  trajectory(speed: number, turnRate: number): Float64Array {
    return this.core.trajectory(speed, turnRate);
  }
  /** One frame toward a desired trajectory in the layout `trajectory()` returns. */
  step(dt: number, trajectory: ArrayLike<number>): MatchFrame {
    const o = this.core.update(dt, Float64Array.from(trajectory));
    const f = this.core.feet;
    this.last = {
      x: o[0]!,
      z: o[1]!,
      yaw: o[2]!,
      speed: Math.hypot(o[3]!, o[4]!),
      turnRate: o[5]!,
      clip: o[6]!,
      frame: o[7]!,
      jumped: o[8] === 1,
      cost: o[9]!,
      transitions: o[13]!,
    };
    this.motor = { source: "motion-match", phase: o[10]!, duty: o[11]!, strideFrequency: o[12]!, contacts: Array.from(o.subarray(14, 14 + f), (x) => x === 1) };
    return this.last;
  }
  /** The backend contract: a speed and turn rate command. */
  update(dt: number, cmd: GaitCommand): RootMotion {
    const r = this.step(dt, this.trajectory(cmd.speed, cmd.turnRate));
    return { x: r.x, z: r.z, yaw: r.yaw, speed: r.speed, turnRate: r.turnRate };
  }
  motorState(): MotorState {
    return { ...this.motor, contacts: [...this.motor.contacts] };
  }
  /** Search on the next step whatever the interval says. */
  forceSearch(): void {
    this.core.forceSearch();
  }
  pose(): MatchPose {
    const o = this.core.pose();
    const b = this.core.bones;
    const h = 4 * b;
    const feet: [number, number, number][] = [];
    for (let k = 0; k < this.core.feet; k++) feet.push([o[h + 3 + 3 * k]!, o[h + 4 + 3 * k]!, o[h + 5 + 3 * k]!]);
    return { rotations: o.slice(0, h), hips: [o[h]!, o[h + 1]!, o[h + 2]!], feet };
  }
  /** Normalized feature row of a global frame. */
  featureRow(index: number): Float64Array {
    return this.core.featureRow(index);
  }
  /** Search a normalized query; `brute` walks every frame. */
  search(query: ArrayLike<number>, brute = false): { index: number; cost: number } {
    const o = this.core.search(Float64Array.from(query), brute);
    return { index: o[0]!, cost: o[1]! };
  }
  get frames(): number {
    return this.core.frames;
  }
  get dims(): number {
    return this.core.dims;
  }
  dispose(): void {
    this.core.free();
  }
}

/** A deterministic trace of the core for one seed, compared between the native and wasm builds in tests. */
export function goldenTrace(seed: number): Float64Array {
  assertReady(PKG);
  return wasm.goldenTrace(seed);
}
