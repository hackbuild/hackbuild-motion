// A quadruped gait host over a codebook matching network, written for this
// library from the published architecture description (AI4AnimationPy,
// Starke et al.) and the data layout of the published quadruped files.
// The weights are CC BY-NC 4.0 and load from a URL the caller gives; this
// code ships none.
//
// Input, 339 values (data layout of the quadruped file): 27 bone positions
// and 27 bone velocities in the root frame, then 16 trajectory samples as
// xz positions, xz forward directions and xz velocities in the root frame,
// then the 27 by 3 guidance pose. Output per frame, 412 values: the root
// delta (x, yaw in degrees, z) against the frame before, 27 positions,
// 27 forward axes, 27 up axes and 27 velocities in that frame's root
// frame, 4 contacts (left hand, right hand, left foot, right foot); the
// last 81 values are not read here.
//
// Async contract (HACKLE lesson 6): every prediction carries the sim time
// of its request and is sampled at its own age; the previous sequence
// blends into a new one over one request interval from its arrival;
// playback speed follows the requested trajectory length; health reports
// staleness so a caller hands over to the procedural gait; turn in place
// is a mode with zero root velocity and the walk guidance.
import { PhaseEstimator, type Capabilities, type GaitCommand, type LocomotionBackend, type MotorState, type RootMotion } from "@hackbuild/gait";
import type { CodebookFile } from "./manifest.js";
import type { NetSession } from "./session.js";

export type Action = "sit" | "stand" | "lie" | null;

export interface Health {
  /** Sim seconds since the request time of the sequence in use. */
  staleSeconds: number;
  /** Milliseconds of the last inference, measured where it ran. */
  inferenceMs: number;
  /** Consecutive frames longer than 1/15 s. */
  slowFrames: number;
  ok: boolean;
  /** Why ok is false, in page words. */
  reason: string;
}

export interface CodebookGaitOptions {
  /** Requests per second; the file's prediction rate by default, halved for an in page session. */
  rate?: number;
  /** Frames to decode per request; "auto" decodes those used before the next one plus a margin. */
  decodeFrames?: number | "auto";
  /** Stale above this many sim seconds. Default 0.30 (inferred, to tune against a slide metric). */
  staleAfter?: number;
  /** Halflife of the root velocity past the end of a sequence, seconds. Default 0.15 (inferred). */
  coastHalflife?: number;
  /** Allow the turn in place mode. Default true. */
  turnInPlace?: boolean;
}

type V3 = [number, number, number];
type Q4 = [number, number, number, number];

interface Seq {
  /** Sim time of the request. */
  t0: number;
  /** Sim time the result arrived. */
  arrival: number;
  /** Playback position, seconds into the sequence; starts at its age on arrival and advances at the timescale. */
  play: number;
  frames: number;
  /** Root per frame: x, z, yaw. */
  root: Float64Array;
  /** Root velocity per frame, world xz. */
  rootVel: Float64Array;
  /** Bone position, quaternion and velocity per frame in that frame's root frame. */
  pos: Float64Array;
  rot: Float64Array;
  vel: Float64Array;
  contact: Float64Array;
}

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
const damp = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);

/** World offset of a root local vector for a root at `yaw` (yaw 0 faces +Z). */
function toWorld(yaw: number, x: number, y: number, z: number): V3 {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [x * c + z * s, y, -x * s + z * c];
}
function toLocal(yaw: number, x: number, y: number, z: number): V3 {
  return toWorld(-yaw, x, y, z);
}

function normalize(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l > 1e-12 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 0, 1];
}
function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** Quaternion of the basis whose z axis is `fwd` and y axis is near `up`. */
function basisQuat(fwd: V3, up: V3): Q4 {
  const z = normalize(fwd);
  const x = normalize(cross(up, z));
  const y = cross(z, x);
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
  const tr = m00 + m11 + m22;
  let q: Q4;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    q = [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s];
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
  }
  return q;
}

function slerp(a: ArrayLike<number>, ao: number, b: ArrayLike<number>, bo: number, t: number, out: Q4): Q4 {
  let [bx, by, bz, bw] = [b[bo]!, b[bo + 1]!, b[bo + 2]!, b[bo + 3]!];
  let d = a[ao]! * bx + a[ao + 1]! * by + a[ao + 2]! * bz + a[ao + 3]! * bw;
  if (d < 0) {
    [bx, by, bz, bw, d] = [-bx, -by, -bz, -bw, -d];
  }
  let wa = 1 - t;
  let wb = t;
  if (d < 0.9995) {
    const th = Math.acos(d);
    const s = Math.sin(th);
    wa = Math.sin((1 - t) * th) / s;
    wb = Math.sin(t * th) / s;
  }
  out[0] = a[ao]! * wa + bx * wb;
  out[1] = a[ao + 1]! * wa + by * wb;
  out[2] = a[ao + 2]! * wa + bz * wb;
  out[3] = a[ao + 3]! * wa + bw * wb;
  const l = Math.hypot(...out);
  for (let i = 0; i < 4; i++) out[i]! /= l;
  return out;
}

/** Yaw rotation of a quaternion's frame by `yaw` about +Y, applied on the left. */
function yawQuat(yaw: number, q: ArrayLike<number>, o: number): Q4 {
  const s = Math.sin(yaw / 2);
  const c = Math.cos(yaw / 2);
  const [x, y, z, w] = [q[o]!, q[o + 1]!, q[o + 2]!, q[o + 3]!];
  return [c * x + s * z, c * y + s * w, c * z - s * x, c * w - s * y];
}

/** Bind pose: 27 column major 4x4 world matrices, root at the origin facing +Z. */
export type BindPose = readonly (readonly number[])[];

export interface CodebookGaitData {
  file: CodebookFile;
  bind: BindPose;
  /** Guidance poses by name, 27 by 3 each, from the weight file. */
  guidance: Record<string, Float32Array>;
}

/** The guidance poses out of a weight file, by the manifest's table. */
export function readGuidance(file: CodebookFile, weights: ArrayBuffer): Record<string, Float32Array> {
  const out: Record<string, Float32Array> = {};
  for (const g of file.guidances) {
    const e = file.bin[`guidance.${g}`];
    if (e) out[g] = new Float32Array(weights.slice(e.offset, e.offset + e.count * 4));
  }
  return out;
}

export class CodebookGait implements LocomotionBackend {
  readonly capabilities: Capabilities;
  readonly boneNames: readonly string[];
  readonly parents: readonly number[];
  /** Sim seconds since construction. */
  time = 0;
  /** Root, network units (about meters for the quadruped file). */
  root = { x: 0, z: 0, yaw: 0 };
  /** Guidance in use. */
  guidance = "Idle";
  /** Playback speed relative to the network's frame rate. */
  timescale = 1;
  /** Turn in place was active on the last update. */
  turningInPlace = false;

  private readonly n: number;
  private readonly S: number;
  private readonly win: number;
  private readonly c: CodebookFile["control"];
  private readonly lengths: Float64Array;
  private readonly bindLocal: Float64Array;
  private readonly bindRot: Float64Array;
  private readonly pos: Float64Array;
  private readonly rot: Float64Array;
  private readonly vel: Float64Array;
  readonly contacts = new Float64Array(4);
  private rootVel: [number, number] = [0, 0];
  private cur: Seq | null = null;
  private prev: Seq | null = null;
  private pending = false;
  private generation = 0;
  private lastRequest = -Infinity;
  private slowFrames = 0;
  private sync = 0;
  private pidI = 0;
  private heading = 0;
  private lastError = "";
  // trajectories: x, z, yaw, vx, vz per sample
  private readonly sim: Float64Array;
  private readonly ctl: Float64Array;
  private readonly est: PhaseEstimator;
  private motor: MotorState;
  private readonly rate: number;
  private readonly opts: Required<CodebookGaitOptions>;

  constructor(
    private readonly session: NetSession,
    private readonly data: CodebookGaitData,
    opts: CodebookGaitOptions = {},
  ) {
    const f = data.file;
    this.c = f.control;
    this.n = f.skeleton.bone_count;
    this.S = f.control.sequence_length;
    this.win = f.control.sequence_window;
    this.boneNames = f.skeleton.bone_names;
    this.parents = f.skeleton.parent_names.map((p) => (p ? f.skeleton.bone_names.indexOf(p) : -1));
    this.opts = { rate: opts.rate ?? 0, decodeFrames: opts.decodeFrames ?? "auto", staleAfter: opts.staleAfter ?? 0.3, coastHalflife: opts.coastHalflife ?? 0.15, turnInPlace: opts.turnInPlace ?? true };
    this.rate = opts.rate ?? (session.where === "page" ? f.control.prediction_fps / 2 : f.control.prediction_fps);
    // minimum stop distance 0.5 and head pitch 0.3 rad: what the HACKLE brain allowed for this network (vendor, inferred)
    this.capabilities = { turnInPlace: this.opts.turnInPlace, minStopDistance: 0.5, headPitchBias: 0.3 };
    const n = this.n;
    this.bindLocal = new Float64Array(n * 3);
    this.bindRot = new Float64Array(n * 4);
    this.lengths = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const m = data.bind[i]!;
      this.bindLocal.set([m[12]!, m[13]!, m[14]!], i * 3);
      this.bindRot.set(basisQuat([m[8]!, m[9]!, m[10]!], [m[4]!, m[5]!, m[6]!]), i * 4);
      const p = this.parents[i]!;
      if (p >= 0) {
        const q = data.bind[p]!;
        this.lengths[i] = Math.hypot(m[12]! - q[12]!, m[13]! - q[13]!, m[14]! - q[14]!);
      }
    }
    this.pos = new Float64Array(n * 3);
    this.rot = new Float64Array(n * 4);
    this.vel = new Float64Array(n * 3);
    this.sim = new Float64Array(this.S * 5);
    this.ctl = new Float64Array(this.S * 5);
    this.est = new PhaseEstimator(4, "neural", 0);
    this.motor = { source: "neural", phase: 0, duty: 0, strideFrequency: 0, contacts: [true, true, true, true] };
    this.enter({ x: 0, z: 0, yaw: 0, speed: 0 });
  }

  /**
   * Seeds the body at a root pose and forward speed (from the outgoing
   * backend), bind pose carried along at that speed, and requests the
   * first prediction at once.
   */
  enter(from: { x: number; z: number; yaw: number; speed: number }): void {
    this.root = { x: from.x, z: from.z, yaw: from.yaw };
    this.heading = from.yaw;
    const v = toWorld(from.yaw, 0, 0, from.speed);
    this.rootVel = [v[0], v[2]];
    for (let i = 0; i < this.n; i++) this.placeBind(i, v);
    for (let s = 0; s < this.S; s++) {
      const t = (s / (this.S - 1)) * this.win;
      this.sim.set([from.x + v[0] * t, from.z + v[2] * t, from.yaw, v[0], v[2]], s * 5);
    }
    this.ctl.set(this.sim);
    this.cur = this.prev = null;
    this.generation++;
    this.pending = false;
    this.lastRequest = -Infinity;
    this.timescale = 1;
    this.sync = 0;
    this.pidI = 0;
  }

  private placeBind(i: number, v: V3): void {
    const b = this.bindLocal;
    const w = toWorld(this.root.yaw, b[i * 3]!, b[i * 3 + 1]!, b[i * 3 + 2]!);
    this.pos.set([this.root.x + w[0], w[1], this.root.z + w[2]], i * 3);
    this.rot.set(yawQuat(this.root.yaw, this.bindRot, i * 4), i * 4);
    this.vel.set(v, i * 3);
  }

  /** Moves the root without a prediction, for a caller whose other backend drives the body. */
  follow(r: { x: number; z: number; yaw: number }): void {
    const dx = r.x - this.root.x;
    const dz = r.z - this.root.z;
    const dyaw = wrap(r.yaw - this.root.yaw);
    for (let i = 0; i < this.n; i++) {
      const lx = this.pos[i * 3]! - this.root.x;
      const lz = this.pos[i * 3 + 2]! - this.root.z;
      const w = toWorld(dyaw, lx, 0, lz);
      this.pos[i * 3] = this.root.x + w[0] + dx;
      this.pos[i * 3 + 2] = this.root.z + w[2] + dz;
      this.rot.set(yawQuat(dyaw, this.rot, i * 4), i * 4);
    }
    this.root = { x: r.x, z: r.z, yaw: r.yaw };
    this.heading = r.yaw;
  }

  health(): Health {
    const stale = this.cur ? this.time - this.cur.t0 : Infinity;
    let reason = "";
    if (this.lastError) reason = `the network failed: ${this.lastError}`;
    else if (!this.cur) reason = "no prediction yet";
    else if (stale > this.opts.staleAfter) reason = `prediction ${stale.toFixed(2)} s old`;
    else if (this.slowFrames >= 3) reason = "frames slower than 1/15 s";
    return { staleSeconds: stale, inferenceMs: this.session.lastMs, slowFrames: this.slowFrames, ok: reason === "", reason };
  }

  motorState(): MotorState {
    return this.motor;
  }

  /** The pose in network units: world positions, quaternions (x y z w), velocities, contacts. */
  pose(): { positions: Float64Array; rotations: Float64Array; velocities: Float64Array; contacts: Float64Array } {
    return { positions: this.pos, rotations: this.rot, velocities: this.vel, contacts: this.contacts };
  }

  update(dt: number, cmd: GaitCommand): RootMotion {
    this.time += dt;
    this.slowFrames = dt > 1 / 15 ? this.slowFrames + 1 : 0;
    const { vel, yaw, act } = this.command(dt, cmd);
    this.control(dt, vel, yaw, act);
    this.animate(dt);
    // the request stamps the pose of this sim time, so it goes after animate
    if (!this.pending && this.time - this.lastRequest >= 1 / this.rate) this.request();
    this.motor = this.est.update(dt, Array.from(this.contacts), 0.55);
    const speed = Math.hypot(this.rootVel[0], this.rootVel[1]);
    return { x: this.root.x, z: this.root.z, yaw: this.root.yaw, speed, turnRate: cmd.turnRate };
  }

  /** The command as a target velocity, heading and action. */
  private command(dt: number, cmd: GaitCommand): { vel: [number, number]; yaw: number; act: Action } {
    const p = cmd.posture ?? {};
    const act: Action = (p.sit ?? 0) > 0.5 ? "sit" : (p.down ?? 0) > 0.5 ? "lie" : null;
    this.heading = wrap(this.heading + cmd.turnRate * dt);
    const moving = Math.abs(cmd.speed) > this.c.input_deadzone;
    this.turningInPlace = this.opts.turnInPlace && !moving && !act && Math.abs(cmd.turnRate) > 0.05;
    if (!moving) return { vel: [0, 0], yaw: this.heading, act };
    const d = toWorld(this.heading, 0, 0, cmd.speed);
    return { vel: [d[0], d[2]], yaw: this.heading, act };
  }

  private seqSpeed(s: Seq | null): number {
    if (!s || s.frames < 2) return 0;
    let l = 0;
    for (let f = 1; f < s.frames; f++) l += Math.hypot(s.root[f * 3]! - s.root[f * 3 - 3]!, s.root[f * 3 + 1]! - s.root[f * 3 - 2]!);
    return l / (((s.frames - 1) / (this.S - 1)) * this.win);
  }

  private control(dt: number, want: [number, number], yaw: number, act: Action): void {
    const C = this.c;
    const req = Math.hypot(want[0], want[1]);
    // the speed the body shows: the predicted speed at the playback rate
    const cur = this.seqSpeed(this.cur) * this.timescale;
    const action = cur < C.action_trigger_speed_max ? act : null;
    const target = action ? 0 : req;
    // the request leads the target by a bias that integrates the speed
    // error, the file's kp read as a gain per second (inferred); a network
    // that follows its request at once then settles without overshoot
    const err = this.cur ? target - cur : 0;
    this.pidI = clamp(this.pidI + C.pid.kp * err * dt, -target, target);
    if (target === 0) this.pidI = 0;
    const speed = Math.max(target + this.pidI + C.pid.ki * err, 0);
    const vel: [number, number] = req > 1e-6 && !action ? [(want[0] / req) * speed, (want[1] / req) * speed] : [0, 0];
    const m = C.locomotion_modes;
    this.guidance =
      action === "sit" ? "Sit" : action === "lie" ? "Lie" : this.turningInPlace ? "Walk" : target < 0.1 ? "Idle" : target < (m["pace"] ?? 1.2) ? "Walk" : target < (m["trot"] ?? 2) ? "Pace" : target < (m["canter"] ?? 4) ? "Trot" : "Canter";
    // the requested series: velocity eases toward the target along the window, faster near the start
    const h = this.win / (this.S - 1);
    const sim = this.sim;
    const ax = sim[0]! + (this.root.x - sim[0]!) * this.sync;
    const az = sim[1]! + (this.root.z - sim[1]!) * this.sync;
    const k0 = damp(10, dt);
    sim[3] = sim[3]! + (vel[0] - sim[3]!) * k0;
    sim[4] = sim[4]! + (vel[1] - sim[4]!) * k0;
    sim[0] = ax + sim[3]! * dt;
    sim[1] = az + sim[4]! * dt;
    sim[2] = sim[2]! + wrap(yaw - sim[2]!) * damp(10, dt);
    for (let s = 1; s < this.S; s++) {
      const r = s / (this.S - 1);
      const k = damp(r * 10, h);
      const o = s * 5;
      sim[o + 3] = sim[o - 2]! + (vel[0] - sim[o - 2]!) * k;
      sim[o + 4] = sim[o - 1]! + (vel[1] - sim[o - 1]!) * k;
      sim[o] = sim[o - 5]! + sim[o + 3]! * h;
      sim[o + 1] = sim[o - 4]! + sim[o + 4]! * h;
      sim[o + 2] = sim[2]! + wrap(yaw - sim[2]!) * r;
    }
    // the control series pulls the requested one toward the last prediction
    const tc = C.trajectory_correction;
    const ctl = this.ctl;
    const c = this.cur;
    for (let s = 0; s < this.S; s++) {
      const o = s * 5;
      if (!c || s >= c.frames) {
        ctl.set(sim.subarray(o, o + 5), o);
        continue;
      }
      ctl[o] = sim[o]! + (c.root[s * 3]! - sim[o]!) * tc;
      ctl[o + 1] = sim[o + 1]! + (c.root[s * 3 + 1]! - sim[o + 1]!) * tc;
      ctl[o + 2] = sim[o + 2]! + wrap(c.root[s * 3 + 2]! - sim[o + 2]!) * tc;
      const tm = Math.max((s / (this.S - 1)) * this.win, 1e-3);
      const vx = (ctl[o]! - this.root.x) / tm;
      const vz = (ctl[o + 1]! - this.root.z) / tm;
      ctl[o + 3] = vx + (c.rootVel[s * 2]! - vx) * tc;
      ctl[o + 4] = vz + (c.rootVel[s * 2 + 1]! - vz) * tc;
    }
  }

  /** The network input for the current state. */
  feed(): Float32Array {
    const n = this.n;
    const x = new Float32Array(this.data.file.model.input_dim);
    const { x: rx, z: rz, yaw } = this.root;
    let p = 0;
    for (let i = 0; i < n; i++) {
      const l = toLocal(yaw, this.pos[i * 3]! - rx, this.pos[i * 3 + 1]!, this.pos[i * 3 + 2]! - rz);
      x[p++] = l[0];
      x[p++] = l[1];
      x[p++] = l[2];
    }
    for (let i = 0; i < n; i++) {
      const l = toLocal(yaw, this.vel[i * 3]!, this.vel[i * 3 + 1]!, this.vel[i * 3 + 2]!);
      x[p++] = l[0];
      x[p++] = l[1];
      x[p++] = l[2];
    }
    const ctl = this.ctl;
    for (let s = 0; s < this.S; s++) {
      const l = toLocal(yaw, ctl[s * 5]! - rx, 0, ctl[s * 5 + 1]! - rz);
      x[p++] = l[0];
      x[p++] = l[2];
    }
    for (let s = 0; s < this.S; s++) {
      const d = wrap(ctl[s * 5 + 2]! - yaw);
      x[p++] = Math.sin(d);
      x[p++] = Math.cos(d);
    }
    for (let s = 0; s < this.S; s++) {
      const l = toLocal(yaw, ctl[s * 5 + 3]!, 0, ctl[s * 5 + 4]!);
      x[p++] = l[0];
      x[p++] = l[2];
    }
    const g = this.data.guidance[this.guidance] ?? this.data.guidance["Idle"];
    if (g) x.set(g.subarray(0, n * 3), p);
    return x;
  }

  private framesToDecode(): number {
    if (this.opts.decodeFrames !== "auto") return clamp(this.opts.decodeFrames, 2, this.S);
    // frames played before the next sequence lands, at the fastest playback, plus two
    const latency = Math.max(this.session.lastMs / 1000, 0);
    const seconds = (1 / this.rate + latency) * this.c.max_timescale;
    return clamp(Math.ceil(seconds * this.c.sequence_fps) + 2, 2, this.S);
  }

  private request(): void {
    this.pending = true;
    this.lastRequest = this.time;
    const t0 = this.time;
    const root = { ...this.root };
    const gen = this.generation;
    const frames = this.framesToDecode();
    this.session.run(this.feed(), frames).then(
      (out) => {
        if (gen !== this.generation) return;
        this.pending = false;
        this.lastError = "";
        const s = this.build(out, root, t0, frames);
        this.prev = this.cur ?? s;
        this.cur = s;
      },
      (e: unknown) => {
        if (gen !== this.generation) return;
        this.pending = false;
        this.lastError = e instanceof Error ? e.message : String(e);
      },
    );
  }

  /** Decodes network output into a sequence in world space. */
  build(out: Float32Array, root: { x: number; z: number; yaw: number }, t0: number, frames: number): Seq {
    const n = this.n;
    const O = this.data.file.model.output_dim;
    const C = this.c;
    const F = Math.min(frames, Math.floor(out.length / O));
    const s: Seq = {
      t0,
      arrival: this.time,
      play: this.time - t0,
      frames: F,
      root: new Float64Array(F * 3),
      rootVel: new Float64Array(F * 2),
      pos: new Float64Array(F * n * 3),
      rot: new Float64Array(F * n * 4),
      vel: new Float64Array(F * n * 3),
      contact: new Float64Array(F * 4),
    };
    let cx = 0;
    let cz = 0;
    let cyaw = 0;
    const th = C.contact_threshold;
    for (let f = 0; f < F; f++) {
      let p = f * O;
      const dx = out[p++]!;
      const dyaw = out[p++]!;
      const dz = out[p++]!;
      if (f > 0) {
        cx += dx;
        cyaw += dyaw;
        cz += dz;
      }
      const off = toWorld(root.yaw, cx, 0, cz);
      const yaw = root.yaw + (cyaw * Math.PI) / 180;
      s.root.set([root.x + off[0], root.z + off[2], yaw], f * 3);
      const v = toWorld(yaw, dx * C.sequence_fps, 0, dz * C.sequence_fps);
      s.rootVel.set([v[0], v[2]], f * 2);
      const P = p;
      const Z = P + n * 3;
      const Y = Z + n * 3;
      const V = Y + n * 3;
      for (let i = 0; i < n; i++) {
        s.pos.set([out[P + i * 3]!, out[P + i * 3 + 1]!, out[P + i * 3 + 2]!], (f * n + i) * 3);
        s.rot.set(basisQuat([out[Z + i * 3]!, out[Z + i * 3 + 1]!, out[Z + i * 3 + 2]!], [out[Y + i * 3]!, out[Y + i * 3 + 1]!, out[Y + i * 3 + 2]!]), (f * n + i) * 4);
        s.vel.set([out[V + i * 3]!, out[V + i * 3 + 1]!, out[V + i * 3 + 2]!], (f * n + i) * 3);
      }
      const K = V + n * 3;
      for (let k = 0; k < 4; k++) {
        const t = clamp((clamp(out[K + k]!, 0, 1) - th) / (1 - th), 0, 1);
        s.contact[f * 4 + k] = Math.pow(3 * t * t - 2 * t * t * t, C.contact_power);
      }
    }
    return s;
  }

  /** Frame pair and weight for a sequence at `age` seconds of playback. */
  private pair(s: Seq, age: number): [number, number, number] {
    const r = clamp((age / this.win) * (this.S - 1), 0, s.frames - 1);
    const a = Math.floor(r);
    const b = Math.min(a + 1, s.frames - 1);
    return [a, b, a === b ? 0 : r - a];
  }

  private animate(dt: number): void {
    const cur = this.cur;
    const C = this.c;
    if (!cur || !this.prev) {
      this.coast(dt);
      return;
    }
    const prev = this.prev;
    // playback speed follows the requested trajectory length
    let reqLen = 0;
    for (let s = 1; s < this.S; s++) reqLen += Math.hypot(this.sim[s * 5]! - this.sim[s * 5 - 5]!, this.sim[s * 5 + 1]! - this.sim[s * 5 - 4]!);
    const reqS = (Math.hypot(this.root.x - this.sim[0]!, this.root.z - this.sim[1]!) + reqLen) / this.win;
    const predS = this.seqSpeed(cur);
    const synced = reqS > 0.1 && predS > 0.1;
    const ts = synced ? reqS / predS : 1;
    this.timescale = clamp(this.timescale + (ts - this.timescale) * damp(C.timescale_sensitivity, dt), C.min_timescale, C.max_timescale);
    this.sync += ((synced ? 1 : 0) - this.sync) * damp(C.synchronization_sensitivity, dt);
    const sdt = dt * this.timescale;
    // each sequence keeps its own playhead, so a timescale change bends
    // playback speed and never jumps the playhead
    if (prev !== cur) prev.play += sdt;
    cur.play += sdt;
    const agePrev = prev.play;
    const ageCur = cur.play;
    const lastAge = ((cur.frames - 1) / (this.S - 1)) * this.win;
    if (ageCur > lastAge) {
      // past the decoded frames: hold the last pose relative to a coasting root
      this.coast(dt);
      return;
    }
    // blend from the previous sequence over one request interval after arrival
    const u = clamp((this.time - cur.arrival) * this.rate, 0, 1);
    const bl = u * u * (3 - 2 * u);
    const [a0, a1, aw] = this.pair(prev, agePrev);
    const [b0, b1, bw] = this.pair(cur, ageCur);
    const rootAt = (s: Seq, i: number, j: number, w: number): [number, number, number] => [
      s.root[i * 3]! + (s.root[j * 3]! - s.root[i * 3]!) * w,
      s.root[i * 3 + 1]! + (s.root[j * 3 + 1]! - s.root[i * 3 + 1]!) * w,
      s.root[i * 3 + 2]! + wrap(s.root[j * 3 + 2]! - s.root[i * 3 + 2]!) * w,
    ];
    const ra = rootAt(prev, a0, a1, aw);
    const rb = rootAt(cur, b0, b1, bw);
    let contactSum = 0;
    for (let k = 0; k < 4; k++) {
      const ca = prev.contact[a0 * 4 + k]! + (prev.contact[a1 * 4 + k]! - prev.contact[a0 * 4 + k]!) * aw;
      const cb = cur.contact[b0 * 4 + k]! + (cur.contact[b1 * 4 + k]! - cur.contact[b0 * 4 + k]!) * bw;
      this.contacts[k] = ca + (cb - ca) * bl;
      contactSum += this.contacts[k]!;
    }
    // standing on all four feet with no predicted travel: the root keeps
    // its place, so a standing dog does not drift; yaw still follows
    const hold = contactSum / 4 > 0.75 && predS < 0.1 ? 1 : 0;
    const nx = ra[0] + (rb[0] - ra[0]) * bl;
    const nz = ra[1] + (rb[1] - ra[1]) * bl;
    const nyaw = ra[2] + wrap(rb[2] - ra[2]) * bl;
    const before = { ...this.root };
    this.root = { x: nx + (before.x - nx) * hold, z: nz + (before.z - nz) * hold, yaw: nyaw };
    if (dt > 0) this.rootVel = [(this.root.x - before.x) / dt, (this.root.z - before.z) / dt];
    const n = this.n;
    const qa: Q4 = [0, 0, 0, 1];
    const qb: Q4 = [0, 0, 0, 1];
    const q: Q4 = [0, 0, 0, 1];
    const { x: rx, z: rz, yaw } = this.root;
    for (let i = 0; i < n; i++) {
      const lerp3 = (s: Seq, arr: Float64Array, f0: number, f1: number, w: number): V3 => {
        const o0 = (f0 * n + i) * 3;
        const o1 = (f1 * n + i) * 3;
        return [arr[o0]! + (arr[o1]! - arr[o0]!) * w, arr[o0 + 1]! + (arr[o1 + 1]! - arr[o0 + 1]!) * w, arr[o0 + 2]! + (arr[o1 + 2]! - arr[o0 + 2]!) * w];
      };
      const pa = lerp3(prev, prev.pos, a0, a1, aw);
      const pb = lerp3(cur, cur.pos, b0, b1, bw);
      const va = lerp3(prev, prev.vel, a0, a1, aw);
      const vb = lerp3(cur, cur.vel, b0, b1, bw);
      slerp(prev.rot, (a0 * n + i) * 4, prev.rot, (a1 * n + i) * 4, aw, qa);
      slerp(cur.rot, (b0 * n + i) * 4, cur.rot, (b1 * n + i) * 4, bw, qb);
      slerp(qa, 0, qb, 0, bl, q);
      const lp: V3 = [pa[0] + (pb[0] - pa[0]) * bl, pa[1] + (pb[1] - pa[1]) * bl, pa[2] + (pb[2] - pa[2]) * bl];
      const lv: V3 = [va[0] + (vb[0] - va[0]) * bl, va[1] + (vb[1] - va[1]) * bl, va[2] + (vb[2] - va[2]) * bl];
      const wp = toWorld(yaw, lp[0], lp[1], lp[2]);
      const wv = toWorld(yaw, lv[0], lv[1], lv[2]);
      // half the predicted position, half the current one carried by the predicted velocity
      const o = i * 3;
      for (let k = 0; k < 3; k++) {
        const target = (k === 0 ? rx : k === 2 ? rz : 0) + wp[k]!;
        const carried = this.pos[o + k]! + wv[k]! * sdt;
        this.pos[o + k] = carried + (target - carried) * 0.5;
      }
      this.vel.set(wv, o);
      this.rot.set(yawQuat(yaw, q, 0), i * 4);
    }
    this.restoreLengths();
  }

  /** Root continues with its last velocity, decaying; the pose rides along. */
  private coast(dt: number): void {
    const k = Math.exp((-Math.LN2 * dt) / this.opts.coastHalflife);
    this.rootVel = [this.rootVel[0] * k, this.rootVel[1] * k];
    const dx = this.rootVel[0] * dt;
    const dz = this.rootVel[1] * dt;
    this.root.x += dx;
    this.root.z += dz;
    for (let i = 0; i < this.n; i++) {
      this.pos[i * 3] = this.pos[i * 3]! + dx;
      this.pos[i * 3 + 2] = this.pos[i * 3 + 2]! + dz;
    }
  }

  private restoreLengths(): void {
    for (let i = 0; i < this.n; i++) {
      const p = this.parents[i]!;
      if (p < 0) continue;
      const d: V3 = [this.pos[i * 3]! - this.pos[p * 3]!, this.pos[i * 3 + 1]! - this.pos[p * 3 + 1]!, this.pos[i * 3 + 2]! - this.pos[p * 3 + 2]!];
      const l = Math.hypot(d[0], d[1], d[2]);
      if (l < 1e-6) continue;
      const k = this.lengths[i]! / l;
      for (let j = 0; j < 3; j++) this.pos[i * 3 + j] = this.pos[p * 3 + j]! + d[j]! * k;
    }
  }

  dispose(): void {
    this.generation++;
    this.est.dispose();
  }
}

export interface FallbackOptions {
  /** Seconds the procedural gait keeps the body after a stale handover. Default 2 (inferred). */
  holdSeconds?: number;
  /** Called on every switch with the new source and the reason, so the caller inertializes bones and paw targets. */
  onSwitch?: (to: "neural" | "procedural", reason: string) => void;
}

/** The procedural backend shape the fallback drives: a root it can set. */
export interface RootedBackend extends LocomotionBackend {
  root: RootMotion;
}

/**
 * Neural gait with a procedural fallback. The network keeps predicting
 * while the procedural gait drives, so it is warm when it takes over
 * again; diagnostics read `motorState()`, which names the active source.
 */
export class NeuralFallback implements LocomotionBackend {
  active: "neural" | "procedural" = "procedural";
  private hold = 0;
  private readonly opts: { holdSeconds: number; onSwitch: FallbackOptions["onSwitch"] | undefined };
  constructor(
    readonly neural: CodebookGait,
    readonly cpg: RootedBackend,
    opts: FallbackOptions = {},
  ) {
    this.opts = { holdSeconds: opts.holdSeconds ?? 2, onSwitch: opts.onSwitch };
  }
  get capabilities(): Capabilities {
    return this.active === "neural" ? this.neural.capabilities : this.cpg.capabilities;
  }
  update(dt: number, cmd: GaitCommand): RootMotion {
    if (this.active === "neural") {
      const r = this.neural.update(dt, cmd);
      const h = this.neural.health();
      if (!h.ok) {
        this.active = "procedural";
        this.hold = this.opts.holdSeconds;
        this.cpg.root = { ...r, speed: r.speed, turnRate: cmd.turnRate };
        this.opts.onSwitch?.("procedural", h.reason);
      }
      return r;
    }
    const r = this.cpg.update(dt, cmd);
    this.neural.follow(r);
    this.neural.update(dt, cmd);
    this.neural.follow(r);
    this.hold = Math.max(0, this.hold - dt);
    if (this.hold === 0 && this.neural.health().ok) {
      this.active = "neural";
      this.opts.onSwitch?.("neural", "fresh predictions");
    }
    return r;
  }
  motorState(): MotorState {
    return this.active === "neural" ? this.neural.motorState() : this.cpg.motorState();
  }
}
