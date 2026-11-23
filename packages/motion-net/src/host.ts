// A quadruped gait host: turns a speed and turn command into network
// inputs, plays the predictions back in time, integrates root motion, pins
// planted paws, and fills the gait package's motor state.
//
// Frames. The network works in a left handed frame (x to the dog's right,
// y up, z forward, a positive yaw turning right). The host's public frame
// is the family one: right handed, +Z forward, +X to the dog's left, a
// positive yaw turning left, as in @hackbuild/gait. Everything inside this
// file is in the network frame; `out` mirrors x and negates yaw at the
// boundary, and bone axes are mirrored the same way.
import { BONE_COUNT, FRAME_DT, FRAMES, IN, OUT, PAW_CHAINS, type StyleLabel } from "./layout.js";
import type { RawPrediction } from "./engine.js";

// The locomotion contract, structurally the same as @hackbuild/gait's, so
// this package does not depend on that one.
export type MotorSource = "procedural" | "neural" | "motion-match" | "clip" | "other";
export interface MotorState {
  source: MotorSource;
  phase: number;
  duty: number;
  strideFrequency: number;
  contacts: boolean[];
}
export interface Capabilities {
  turnInPlace: boolean;
  minStopDistance: number;
  headPitchBias: number;
}
export interface RootMotion {
  x: number;
  z: number;
  yaw: number;
  speed: number;
  turnRate: number;
}
export interface GaitCommand {
  /** Forward speed, m/s. */
  speed: number;
  /** Turn rate, rad/s, positive to the left. */
  turnRate: number;
  posture?: { sit?: number; down?: number; bow?: number; reach?: number };
}
export interface LocomotionBackend {
  readonly capabilities: Capabilities;
  update(dt: number, cmd: GaitCommand): RootMotion;
  motorState(): MotorState;
}

export interface HostCommand extends GaitCommand {
  /** World planar velocity, m/s; overrides `speed` and lets the dog move sideways. */
  velocity?: { x: number; z: number };
  /** World facing to turn toward, radians; overrides `turnRate`. */
  facing?: number;
  /** A style label to hold, or "auto" (the default) to choose by speed. */
  style?: StyleLabel | "auto";
}

export interface Predicts {
  predict(input: Float32Array): Promise<RawPrediction>;
}

export interface HostTuning {
  /** Seconds between prediction requests. */
  interval: number;
  /** Time of trajectory sample k is start + k step, seconds. */
  trajStart: number;
  trajStep: number;
  /** Time constant over which the root's own velocity gives way to the command along the trajectory, s. */
  trajBlend: number;
  /** Half life of the command smoothing, s. */
  commandHalflife: number;
  /** Half life of the seam offset when a new prediction lands, s. */
  seamHalflife: number;
  /** Contact on and off thresholds. */
  contactOn: number;
  contactOff: number;
  /** Largest distance a pinned paw may sit from the network's paw, m. */
  maxPin: number;
  /** Integral gain of the speed loop that leans the trajectory until the dog's speed meets the command, 1/s. */
  speedGain: number;
  /** Largest lean of the speed loop either way, m/s. */
  leanRange: number;
  /** Share of the network's planted paw drift the root takes over, 0 to 1. */
  plantFollow: number;
  /** Half life of the slow pull of the root toward its pinned paws, s; 0 turns it off. */
  plantHalflife: number;
  /** Half life of the low pass on the root's share of the paw drift, s. */
  followHalflife: number;
  /** Speeds (m/s) where auto style moves up from Idle, Walk, Trot. */
  walkAt: number;
  trotAt: number;
  canterAt: number;
}

// Each value is chosen for a reason given beside it.
export const DEFAULT_TUNING: HostTuning = {
  // 0.1 s: ten replans a second answer a command within one step, and each
  // prediction covers 0.5 s, so a late one still has frames to play. At
  // 0.05 s the seams between predictions moved the paws 20 percent more
  // (measured); at 0.2 s the dog stuck in a gallop at 2 m/s (measured)
  interval: 0.1,
  // the training trajectories put sample 0 about 0.25 s ahead of the root
  // and sample 15 about 0.5 s ahead (input_stats means over the mean
  // forward speed); sampling the command at 0.25 + k/60 s matches that
  trajStart: 0.25,
  trajStep: 1 / 60,
  // 0.2 s: the first samples continue the motion the dog already has, so a
  // command step does not ask the network for a velocity jump
  trajBlend: 0.2,
  // 0.15 s: a dog reaches a new trot speed in roughly half a second; a
  // shorter half life passes key taps straight through as speed steps
  commandHalflife: 0.15,
  // 0.06 s: consecutive predictions overlap by 0.4 s and differ by
  // millimeters; 94 percent of a seam is gone within 0.24 s, shorter than
  // a walking stance, so a pinned paw is not dragged by the blend
  seamHalflife: 0.06,
  // planted values sit near 1 and swing near 0. Inside a prediction a paw
  // with a value of 0.85 or more moves under 7 mm per frame, one near 0.6
  // moves 18 mm and one near 0.5 moves 33 mm (measured), so a paw pins
  // above 0.8 and lets go below 0.6
  contactOn: 0.8,
  contactOff: 0.6,
  // 0.12 m is about a quarter of the 0.45 m hip height; past that the leg
  // solve bends the limb visibly out of the network's shape
  maxPin: 0.12,
  // inside its own predictions the network's stance paws drift forward
  // about 0.08 m/s at a walk or trot (measured), so its root runs ahead of
  // its feet. The root takes over 90 percent of that drift through a 0.08 s
  // low pass, and a 0.25 s pull toward the pins removes what is left. A
  // shorter low pass doubled the frame to frame speed change of the body
  // (measured); a longer one let pinned paws slide at 1.6 m/s (measured)
  plantFollow: 0.9,
  plantHalflife: 0.25,
  followHalflife: 0.08,
  // the network's speeds come in bands (about 0.8 to 1.4, 1.9 to 2.0 and
  // 3.2 to 3.3 m/s at a plain trajectory, measured); the speed loop leans
  // the trajectory up to 2 m/s either way and reaches the command within
  // about 0.05 m/s from 0.6 to 3.5 m/s (measured). A gain of 1.5 per second
  // settles in about two seconds; 3 overshot at 2 and 3.5 m/s (measured)
  speedGain: 1.5,
  leanRange: 2,
  // the style pose barely moves the speed (measured: Walk, Trot, Canter and
  // Pace give the same speed bands); it picks the footfall pattern, so Walk
  // below 1 m/s, Trot to 2.1 m/s where the second band sits, Canter above
  walkAt: 0.15,
  trotAt: 1.0,
  canterAt: 2.1,
};

interface Prediction {
  frames: Float32Array;
  /** Host clock at the request. */
  t0: number;
  /** Request to arrival, s on the host clock. */
  latency: number;
  evalMs: number;
}

const N = BONE_COUNT * 3;
const LN2 = Math.LN2;
const decay = (dt: number, halflife: number) => Math.exp((-LN2 * dt) / Math.max(halflife, 1e-6));
const wallMs = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const finite = (x: number) => (Number.isFinite(x) ? x : 0);

/** Pose in the root frame of the moment it describes. */
class Pose {
  pos = new Float64Array(N);
  zax = new Float64Array(N);
  yax = new Float64Array(N);
  vel = new Float64Array(N);
  contacts = new Float64Array(4);
  /** Root velocity in the root frame, m/s, and yaw rate, rad/s (network sign). */
  vx = 0;
  vz = 0;
  w = 0;
  copy(o: Pose): void {
    this.pos.set(o.pos);
    this.zax.set(o.zax);
    this.yax.set(o.yax);
    this.vel.set(o.vel);
    this.contacts.set(o.contacts);
    this.vx = o.vx;
    this.vz = o.vz;
    this.w = o.w;
  }
}

function sample(p: Prediction, tau: number, out: Pose): void {
  const f = Math.min(Math.max(tau / FRAME_DT, 0), FRAMES - 1);
  const k0 = Math.floor(f);
  const k1 = Math.min(k0 + 1, FRAMES - 1);
  const a = f - k0;
  const F = p.frames;
  const o0 = k0 * OUT.length;
  const o1 = k1 * OUT.length;
  const lerp = (i: number) => F[o0 + i]! + (F[o1 + i]! - F[o0 + i]!) * a;
  for (let i = 0; i < N; i++) {
    out.pos[i] = lerp(OUT.positions + i);
    out.zax[i] = lerp(OUT.axisZ + i);
    out.yax[i] = lerp(OUT.axisY + i);
    out.vel[i] = lerp(OUT.velocities + i);
  }
  for (let i = 0; i < 4; i++) out.contacts[i] = lerp(OUT.contacts + i);
  // frame k1's delta is the motion from frame k0 into k1
  const d = k0 === k1 ? o0 : o1;
  out.vx = F[d + OUT.dx]! / FRAME_DT;
  out.vz = F[d + OUT.dz]! / FRAME_DT;
  out.w = ((F[d + OUT.dyaw]! / FRAME_DT) * Math.PI) / 180;
  // past the window the prediction has nothing more to say: hold the last
  // pose and let the root come to rest with a 0.1 s half life rather than
  // slide a frozen pose along
  const over = tau - (FRAMES - 1) * FRAME_DT;
  if (over > 0) {
    const k = decay(over, 0.1);
    out.vx *= k;
    out.vz *= k;
    out.w *= k;
    for (let i = 0; i < N; i++) out.vel[i]! *= k;
  }
}

/** Rotation quaternion (x, y, z, w) from orthonormal columns X, Y, Z. */
function quatFromAxes(X: number[], Y: number[], Z: number[], q: Float32Array, o: number): void {
  const [m00, m10, m20] = X as [number, number, number];
  const [m01, m11, m21] = Y as [number, number, number];
  const [m02, m12, m22] = Z as [number, number, number];
  const tr = m00 + m11 + m22;
  let x: number, y: number, z: number, w: number;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    w = 0.25 * s;
    x = (m21 - m12) / s;
    y = (m02 - m20) / s;
    z = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    w = (m21 - m12) / s;
    x = 0.25 * s;
    y = (m01 + m10) / s;
    z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    w = (m02 - m20) / s;
    x = (m01 + m10) / s;
    y = 0.25 * s;
    z = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    w = (m10 - m01) / s;
    x = (m02 + m20) / s;
    y = (m12 + m21) / s;
    z = 0.25 * s;
  }
  const n = Math.hypot(x, y, z, w) || 1;
  q[o] = x / n;
  q[o + 1] = y / n;
  q[o + 2] = z / n;
  q[o + 3] = w / n;
}

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3) => Math.sqrt(dot(a, a));
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = len(a);
  return l > 1e-9 ? scale(a, 1 / l) : [0, 0, 1];
};
/** Rotates v by the shortest arc that takes unit a to unit b. */
function rotateArc(v: V3, a: V3, b: V3): V3 {
  const c = dot(a, b);
  const k = cross(a, b);
  if (c < -0.9999) return v;
  // Rodrigues with the unnormalized axis: v c + (k x v) + k (k.v) / (1 + c)
  return add(add(scale(v, c), cross(k, v)), scale(k, dot(k, v) / (1 + c)));
}

export interface PawState {
  /** Raw contact value of the network, sampled now. */
  contact: number;
  stance: boolean;
  /** Pinned world position in the host frame while in stance. */
  pin: V3 | null;
  /** Phase since touchdown over the last stride period, 0 to 1. */
  phase: number;
}

/** Drives the quadruped network and fills the gait motor state. */
export class QuadrupedHost implements LocomotionBackend {
  readonly capabilities: Capabilities = { turnInPlace: true, minStopDistance: 0.15, headPitchBias: 0 };
  readonly tuning: HostTuning;
  /** Root in the host frame: position on the ground and yaw (positive left). */
  root = { x: 0, z: 0, yaw: 0 };
  /** Root velocity in the host frame, m/s, and turn rate, rad/s. */
  rootVelocity = { x: 0, z: 0, turnRate: 0 };
  /** World bone positions, host frame, x y z per bone. */
  readonly positions = new Float32Array(N);
  /** World bone rotations, host frame, x y z w per bone. */
  readonly rotations = new Float32Array(BONE_COUNT * 4);
  readonly paws: PawState[] = [0, 1, 2, 3].map(() => ({ contact: 1, stance: true, pin: null, phase: 0 }));
  style: StyleLabel = "Idle";
  /** Request to arrival of the last prediction, wall clock ms (measured). */
  latencyMs = 0;
  /** Request to first use of the last prediction, ms on the host clock: what playback skips (measured). */
  lagMs = 0;
  /** Evaluation time of the last prediction where it ran, ms (measured). */
  evalMs = 0;
  /** Seconds since the playing prediction was requested; past 0.5 the dog holds. */
  predictionAge = 0;
  /** Horizontal travel of each stance paw this frame, m, after pinning and before. */
  footSlide = [0, 0, 0, 0];
  rawFootSlide = [0, 0, 0, 0];
  /** Distance from each pinned paw to where the network puts it, m; 0 when free. */
  pinGap = [0, 0, 0, 0];
  /** Predictions received and requests sent. */
  received = 0;
  requested = 0;

  // network frame state
  private t = 0;
  private yaw = 0;
  private px = 0;
  private pz = 0;
  private cmdV = { x: 0, z: 0 };
  private cmdW = 0;
  /** Speed added to the trajectory by the speed loop, m/s. */
  private lean = 0;
  /** Ground speed of the root, smoothed over 0.1 s, m/s. */
  private speedNow = 0;
  /** Turn rate of the root, smoothed over 0.1 s, rad/s (network sign). */
  private turnNow = 0;
  private turnLean = 0;
  /** Pinned paw positions, network frame world. */
  private readonly pins: (V3 | null)[] = [null, null, null, null];
  /** The network's paw ends last frame, network frame world x z. */
  private readonly follow: [number, number] = [0, 0];
  /** Last knee bend direction per leg, root frame. */
  private readonly bend: (V3 | null)[] = [null, null, null, null];
  private readonly prevRaw: ([number, number] | null)[] = [null, null, null, null];
  private active: Prediction | null = null;
  private pending: { t0: number; sent: number } | null = null;
  private lastRequest = -Infinity;
  private readonly pose = new Pose();
  private readonly fresh = new Pose();
  private readonly seam = new Pose();
  private seamOn = false;
  private readonly input = new Float32Array(IN.length);
  private readonly lastSite: (V3 | null)[] = [null, null, null, null];
  private readonly lastRawSite: (V3 | null)[] = [null, null, null, null];
  private readonly release: V3[] = [0, 1, 2, 3].map(() => [0, 0, 0] as V3);
  private readonly touch: { last: number; period: number; stanceStart: number; duty: number }[] = [0, 1, 2, 3].map(() => ({ last: -1, period: 0, stanceStart: 0, duty: 0 }));
  private lastCmd: HostCommand = { speed: 0, turnRate: 0 };

  constructor(
    private readonly predictor: Predicts,
    private readonly styles: Record<StyleLabel, ArrayLike<number>>,
    tuning: Partial<HostTuning> = {},
  ) {
    this.tuning = { ...DEFAULT_TUNING, ...tuning };
    // no history yet: the Idle style pose with zero velocity and rest axes
    const idle = styles.Idle;
    for (let i = 0; i < N; i++) this.pose.pos[i] = idle[i] ?? 0;
    for (let b = 0; b < BONE_COUNT; b++) {
      this.pose.zax[b * 3 + 2] = 1;
      this.pose.yax[b * 3 + 1] = 1;
    }
    this.pose.contacts.fill(1);
    this.output(0);
  }

  /** Places the dog, host frame, and forgets any motion. */
  reset(x: number, z: number, yaw: number): void {
    this.px = -x;
    this.pz = z;
    this.yaw = -yaw;
    this.root = { x, z, yaw };
    this.active = null;
    this.seamOn = false;
    this.paws.forEach((p) => (p.pin = null));
    this.pins.fill(null);
    this.prevRaw.fill(null);
    this.lastSite.fill(null);
    this.lastRawSite.fill(null);
  }

  update(dtIn: number, cmd: HostCommand): RootMotion {
    // a stalled or backward clock adds no time; a long gap (tab switch) is
    // cut to 0.1 s so a stale prediction is not integrated for a second
    const dt = Number.isFinite(dtIn) && dtIn > 0 ? Math.min(dtIn, 0.1) : 0;
    this.lastCmd = cmd;
    this.t += dt;
    this.steer(dt, cmd);
    this.schedule();
    if (this.active) {
      this.predictionAge = this.t - this.active.t0;
      sample(this.active, this.predictionAge, this.fresh);
      if (this.seamOn) {
        const k = decay(dt, this.tuning.seamHalflife);
        const s = this.seam;
        for (let i = 0; i < N; i++) {
          s.pos[i]! *= k;
          s.zax[i]! *= k;
          s.yax[i]! *= k;
          s.vel[i]! *= k;
        }
        s.vx *= k;
        s.vz *= k;
        s.w *= k;
        this.pose.copy(this.fresh);
        for (let i = 0; i < N; i++) {
          this.pose.pos[i]! += s.pos[i]!;
          this.pose.zax[i]! += s.zax[i]!;
          this.pose.yax[i]! += s.yax[i]!;
          this.pose.vel[i]! += s.vel[i]!;
        }
        this.pose.vx += s.vx;
        this.pose.vz += s.vz;
        this.pose.w += s.w;
      } else this.pose.copy(this.fresh);
    }
    // root: the network's own root motion
    const p = this.pose;
    const { vx, vz, w } = p;
    const x0 = this.px;
    const z0 = this.pz;
    this.yaw += w * dt;
    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    this.px += (cy * vx + sy * vz) * dt;
    this.pz += (-sy * vx + cy * vz) * dt;
    // then the root takes over the network's paw slip: the network's planted
    // paws drift in the world (its root runs ahead of its feet), so the
    // root moves back by the weighted drift of the paws in stance, each
    // weighted by how firmly its contact value says it is down
    const T = this.tuning;
    const rawNow = PAW_CHAINS.map((ch) => {
      const lx = p.pos[ch.site * 3]!;
      const lz = p.pos[ch.site * 3 + 2]!;
      return [this.px + cy * lx + sy * lz, this.pz - sy * lx + cy * lz] as [number, number];
    });
    if (dt > 0) {
      let sx = 0;
      let sz = 0;
      let sw = 0;
      let gx = 0;
      let gz = 0;
      let gn = 0;
      PAW_CHAINS.forEach((_, i) => {
        const prev = this.prevRaw[i];
        const paw = this.paws[i]!;
        if (prev && paw.stance) {
          const wgt = Math.max(0, Math.min(1, (p.contacts[i]! - T.contactOff) / Math.max(1e-3, T.contactOn - T.contactOff)));
          sx += wgt * (rawNow[i]![0] - prev[0]);
          sz += wgt * (rawNow[i]![1] - prev[1]);
          sw += wgt;
        }
        const pin = this.pins[i];
        if (pin) {
          gx += pin[0] - rawNow[i]![0];
          gz += pin[2] - rawNow[i]![1];
          gn++;
        }
      });
      // the drift is noisy frame to frame (frame interpolation, seams); the
      // root takes it through a low pass and the pinned legs absorb the rest
      const n = Math.max(1, sw);
      const kf = 1 - decay(dt, T.followHalflife);
      this.follow[0] += ((-T.plantFollow * sx) / n / dt - this.follow[0]) * kf;
      this.follow[1] += ((-T.plantFollow * sz) / n / dt - this.follow[1]) * kf;
      let mx = this.follow[0] * dt;
      let mz = this.follow[1] * dt;
      // and a slow pull toward the pins for what the follow leaves behind
      if (gn > 0 && T.plantHalflife > 0) {
        const k = 1 - decay(dt, T.plantHalflife);
        mx += (gx / gn) * k;
        mz += (gz / gn) * k;
      }
      this.px += mx;
      this.pz += mz;
      rawNow.forEach((r) => {
        r[0] += mx;
        r[1] += mz;
      });
    }
    PAW_CHAINS.forEach((_, i) => (this.prevRaw[i] = rawNow[i]!));
    const wx = dt > 0 ? (this.px - x0) / dt : 0;
    const wz = dt > 0 ? (this.pz - z0) / dt : 0;
    if (dt > 0) {
      const k = 1 - decay(dt, 0.1);
      this.speedNow += (Math.hypot(wx, wz) - this.speedNow) * k;
      this.turnNow += (w - this.turnNow) * k;
    }
    this.rootVelocity = { x: -wx, z: wz, turnRate: -w };
    this.output(dt);
    this.root = { x: -this.px, z: this.pz, yaw: -this.yaw };
    return { x: this.root.x, z: this.root.z, yaw: this.root.yaw, speed: Math.hypot(wx, wz), turnRate: -w };
  }

  motorState(): MotorState {
    const lf = this.touch[0]!;
    const standing = this.t - lf.last > 2 || lf.period === 0;
    return {
      source: "neural",
      phase: this.paws[0]!.phase,
      duty: standing ? 1 : this.touch.reduce((a, b) => a + b.duty, 0) / 4,
      strideFrequency: standing ? 0 : 1 / lf.period,
      contacts: this.paws.map((p) => p.stance),
    };
  }

  /** Smooths the command into a network frame world velocity and yaw rate, and picks the style. */
  private steer(dt: number, cmd: HostCommand): void {
    let vx: number, vz: number, w: number;
    const speed = finite(cmd.speed);
    if (cmd.velocity) {
      vx = -finite(cmd.velocity.x);
      vz = finite(cmd.velocity.z);
    } else {
      vx = Math.sin(this.yaw) * speed;
      vz = Math.cos(this.yaw) * speed;
    }
    if (cmd.facing !== undefined && Number.isFinite(cmd.facing)) {
      let d = -cmd.facing - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      // close a facing error at up to 3 rad/s, about a dog's fast pivot
      w = Math.max(-3, Math.min(3, d * 4));
    } else w = -finite(cmd.turnRate);
    const k = 1 - decay(dt, this.tuning.commandHalflife);
    this.cmdV.x += (vx - this.cmdV.x) * k;
    this.cmdV.z += (vz - this.cmdV.z) * k;
    this.cmdW += (w - this.cmdW) * k;
    // speed loop: the network's speeds come in bands, so lean the
    // trajectory by the integral of the speed error; the lean is held
    // between -1 and 1.5 m/s and drops to zero when the dog is asked to stop
    const want = Math.hypot(this.cmdV.x, this.cmdV.z);
    if (want < 0.1 || !this.active) this.lean *= decay(dt, 0.2);
    else {
      const got = this.speedNow;
      this.lean = Math.max(-this.tuning.leanRange, Math.min(this.tuning.leanRange, this.lean + this.tuning.speedGain * (want - got) * dt));
    }
    // the same loop on the turn rate: the network turns about 17 percent
    // short of the trajectory (measured at 1 rad/s); the lean is held within
    // 1.5 rad/s and drops when no turn is asked for
    if (Math.abs(this.cmdW) < 0.05 || !this.active) this.turnLean *= decay(dt, 0.2);
    else this.turnLean = Math.max(-1.5, Math.min(1.5, this.turnLean + this.tuning.speedGain * (this.cmdW - this.turnNow) * dt));
    if (cmd.style && cmd.style !== "auto") {
      this.style = cmd.style;
      return;
    }
    // auto style with 0.1 m/s of hysteresis so a speed near a threshold does not flicker
    const v = Math.hypot(this.cmdV.x, this.cmdV.z);
    const T = this.tuning;
    const h = 0.1;
    const order: StyleLabel[] = ["Idle", "Walk", "Trot", "Canter"];
    const up = [T.walkAt, T.trotAt, T.canterAt];
    let i = Math.max(0, order.indexOf(this.style));
    if (!order.includes(this.style)) i = v < T.walkAt ? 0 : v < T.trotAt ? 1 : v < T.canterAt ? 2 : 3;
    while (i < 3 && v > up[i]! + h / 2) i++;
    while (i > 0 && v < up[i - 1]! - h / 2) i--;
    // turning in place steps around at a walk
    if (i === 0 && Math.abs(this.cmdW) > 0.3) i = 1;
    this.style = order[i]!;
  }

  private toLocal(x: number, z: number): [number, number] {
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    return [c * x - s * z, s * x + c * z];
  }

  private schedule(): void {
    const T = this.tuning;
    // a request older than a second is treated as lost so the host can ask again
    if (this.pending && this.t - this.pending.sent > 1) this.pending = null;
    if (this.pending || this.t - this.lastRequest < T.interval) return;
    this.buildInput();
    const req = { t0: this.t, sent: this.t, wall: wallMs() };
    this.pending = req;
    this.lastRequest = this.t;
    this.requested++;
    this.predictor.predict(this.input).then(
      (r) => this.land(r, req),
      () => {
        if (this.pending === req) this.pending = null;
      },
    );
  }

  private land(r: RawPrediction, req: { t0: number; sent: number; wall: number }): void {
    if (this.pending === req) this.pending = null;
    if (this.active && req.t0 <= this.active.t0) return;
    if (!r.frames.every(Number.isFinite)) return;
    const next: Prediction = { frames: r.frames, t0: req.t0, latency: this.t - req.t0, evalMs: r.ms };
    this.received++;
    this.lagMs = next.latency * 1000;
    this.latencyMs = wallMs() - req.wall;
    this.evalMs = r.ms;
    // the seam: what the dog shows now minus what the new prediction says for now
    sample(next, this.t - next.t0, this.fresh);
    if (this.active) {
      const s = this.seam;
      for (let i = 0; i < N; i++) {
        s.pos[i] = this.pose.pos[i]! - this.fresh.pos[i]!;
        s.zax[i] = this.pose.zax[i]! - this.fresh.zax[i]!;
        s.yax[i] = this.pose.yax[i]! - this.fresh.yax[i]!;
        s.vel[i] = this.pose.vel[i]! - this.fresh.vel[i]!;
      }
      s.vx = this.pose.vx - this.fresh.vx;
      s.vz = this.pose.vz - this.fresh.vz;
      s.w = this.pose.w - this.fresh.w;
      this.seamOn = true;
    }
    this.active = next;
  }

  /** Current pose and velocities, the trajectory and the style pose, in the current root frame. */
  private buildInput(): void {
    const u = this.input;
    const p = this.pose;
    for (let i = 0; i < N; i++) {
      u[IN.positions + i] = p.pos[i]!;
      u[IN.velocities + i] = p.vel[i]!;
    }
    // desired root velocity in the root frame, and the root's own velocity
    const T = this.tuning;
    const want = Math.hypot(this.cmdV.x, this.cmdV.z);
    const gain = want > 1e-6 ? Math.max(0, want + this.lean) / want : 0;
    const [dvx, dvz] = this.toLocal(this.cmdV.x * gain, this.cmdV.z * gain);
    const w = this.cmdW + this.turnLean;
    const v0x = p.vx;
    const v0z = p.vz;
    // the commanded velocity turns with the facing; the root's current
    // velocity gives way to it over 0.2 s, a little longer than the command
    // half life, so the first samples continue the motion the dog has
    const velAt = (s: number): [number, number] => {
      const a = w * s;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const rx = ca * dvx + sa * dvz;
      const rz = -sa * dvx + ca * dvz;
      const b = T.trajBlend > 0 ? Math.exp(-s / T.trajBlend) : 0;
      return [rx + (v0x - rx) * b, rz + (v0z - rz) * b];
    };
    let x = 0;
    let z = 0;
    let s = 0;
    const h = 1 / 240;
    for (let k = 0; k < 16; k++) {
      const target = T.trajStart + k * T.trajStep;
      while (s < target - 1e-9) {
        const step = Math.min(h, target - s);
        const [a, b] = velAt(s + step / 2);
        x += a * step;
        z += b * step;
        s += step;
      }
      const [vx, vz] = velAt(target);
      const yaw = w * target;
      u[IN.trajPositions + 2 * k] = x;
      u[IN.trajPositions + 2 * k + 1] = z;
      u[IN.trajDirections + 2 * k] = Math.sin(yaw);
      u[IN.trajDirections + 2 * k + 1] = Math.cos(yaw);
      u[IN.trajVelocities + 2 * k] = vx;
      u[IN.trajVelocities + 2 * k + 1] = vz;
    }
    const st = this.styles[this.style];
    for (let i = 0; i < N; i++) u[IN.style + i] = st[i] ?? 0;
  }

  /** World transforms, pins, phases and slide readouts from the current pose. */
  private output(dt: number): void {
    const p = this.pose;
    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    const toWorld = (l: V3): V3 => [this.px + cy * l[0] + sy * l[2], l[1], this.pz - sy * l[0] + cy * l[2]];
    const toRoot = (g: V3): V3 => {
      const dx = g[0] - this.px;
      const dz = g[2] - this.pz;
      return [cy * dx - sy * dz, g[1], sy * dx + cy * dz];
    };
    const at = (a: Float64Array, b: number): V3 => [a[b * 3]!, a[b * 3 + 1]!, a[b * 3 + 2]!];
    // root frame positions and axes, then pinned
    const pos = Float64Array.from(p.pos);
    const zax = Float64Array.from(p.zax);
    const yax = Float64Array.from(p.yax);
    const put = (a: Float64Array, b: number, v: V3) => {
      a[b * 3] = v[0];
      a[b * 3 + 1] = v[1];
      a[b * 3 + 2] = v[2];
    };
    const T = this.tuning;
    PAW_CHAINS.forEach((ch, i) => {
      const paw = this.paws[i]!;
      const c = finite(p.contacts[i]!);
      paw.contact = c;
      const rawSite = toWorld(at(pos, ch.site));
      const was = paw.stance;
      paw.stance = was ? c > T.contactOff : c > T.contactOn;
      const tr = this.touch[i]!;
      if (paw.stance && !was) {
        // touchdown: a stride period between 0.15 and 2 s is a plausible dog stride
        if (tr.last >= 0) {
          const per = this.t - tr.last;
          if (per > 0.15 && per < 2) tr.period = per;
        }
        tr.last = this.t;
        tr.stanceStart = this.t;
        // pin where the paw is shown, which may still carry a release offset
        this.pins[i] = toWorld(add(at(pos, ch.site), this.release[i]!));
        this.release[i] = [0, 0, 0];
      }
      if (!paw.stance && was) {
        if (tr.period > 0) tr.duty = Math.min(1, (this.t - tr.stanceStart) / tr.period);
        const pin = this.pins[i];
        if (pin) this.release[i] = sub(toRoot(pin), at(pos, ch.site));
        this.pins[i] = null;
      }
      paw.phase = tr.period > 0 && tr.last >= 0 ? Math.min(0.999, (this.t - tr.last) / tr.period) : 0;
      // where the paw end should be, in the root frame
      let target: V3 | null = null;
      this.pinGap[i] = 0;
      const pin = this.pins[i];
      if (paw.stance && pin) {
        const pinned = toRoot(pin);
        this.pinGap[i] = len(sub(pinned, at(pos, ch.site)));
        if (this.pinGap[i]! > T.maxPin) {
          // too far to hold: let go and blend back to the network's paw; no new pin before the next touchdown
          this.release[i] = sub(pinned, at(pos, ch.site));
          this.pins[i] = null;
        } else target = pinned;
      }
      if (!this.pins[i]) {
        this.release[i] = scale(this.release[i]!, decay(dt, 0.05));
        if (len(this.release[i]!) > 1e-5) target = add(at(pos, ch.site), this.release[i]!);
      }
      const held = this.pins[i];
      paw.pin = held ? [-held[0], held[1], held[2]] : null;
      if (target) this.pinLeg(pos, zax, yax, ch, target, put, at);
      const site = toWorld(at(pos, ch.site));
      const slide = (a: V3 | null, b: V3) => (a ? Math.hypot(b[0] - a[0], b[2] - a[2]) : 0);
      this.footSlide[i] = paw.stance && was ? slide(this.lastSite[i]!, site) : 0;
      this.rawFootSlide[i] = paw.stance && was ? slide(this.lastRawSite[i]!, rawSite) : 0;
      this.lastSite[i] = site;
      this.lastRawSite[i] = rawSite;
    });
    // world transforms in the host frame: mirror x
    for (let b = 0; b < BONE_COUNT; b++) {
      const g = toWorld(at(pos, b));
      this.positions[b * 3] = -g[0];
      this.positions[b * 3 + 1] = g[1];
      this.positions[b * 3 + 2] = g[2];
      // axes to world (network frame), then mirrored; X completes a right handed triad
      const zl = norm(at(zax, b));
      let yl = at(yax, b);
      yl = norm(sub(yl, scale(zl, dot(yl, zl))));
      const rot = (v: V3): V3 => [cy * v[0] + sy * v[2], v[1], -sy * v[0] + cy * v[2]];
      const Z = rot(zl);
      const Y = rot(yl);
      const Zh: V3 = [-Z[0], Z[1], Z[2]];
      const Yh: V3 = [-Y[0], Y[1], Y[2]];
      const Xh = cross(Yh, Zh);
      quatFromAxes(Xh, Yh, Zh, this.rotations, b * 4);
    }
  }

  /** Moves the paw end to `target` (root frame) and bends the knee to keep both limb lengths. */
  private pinLeg(
    pos: Float64Array,
    zax: Float64Array,
    yax: Float64Array,
    ch: (typeof PAW_CHAINS)[number],
    target: V3,
    put: (a: Float64Array, b: number, v: V3) => void,
    at: (a: Float64Array, b: number) => V3,
  ): void {
    const a = at(pos, ch.upper);
    const knee = at(pos, ch.lower);
    const paw = at(pos, ch.paw);
    const site = at(pos, ch.site);
    const shift = sub(target, site);
    let pawT = add(paw, shift);
    const l1 = len(sub(knee, a));
    const l2 = len(sub(paw, knee));
    let d = sub(pawT, a);
    let dl = len(d);
    const lo = Math.abs(l1 - l2) + 1e-4;
    const hi = l1 + l2 - 1e-4;
    if (dl < 1e-6) return;
    if (dl > hi || dl < lo) {
      // out of reach: the paw stops where the limb can put it
      const c = Math.min(hi, Math.max(lo, dl));
      pawT = add(a, scale(d, c / dl));
      d = sub(pawT, a);
      dl = c;
    }
    const u = scale(d, 1 / dl);
    const x = (l1 * l1 - l2 * l2 + dl * dl) / (2 * dl);
    const y = Math.sqrt(Math.max(0, l1 * l1 - x * x));
    // bend toward the network's own knee. A nearly straight limb leaves that
    // direction undefined, so last frame's bend counts as a 3 cm offset of
    // the knee (about a fifth of a limb bone) and a 1 cm hint (elbows back,
    // stifles forward) settles the first frame; the bend cannot flip
    // between frames unless the network's knee moves well past the line
    const leg = PAW_CHAINS.indexOf(ch);
    const hint: V3 = [0, 0, ch.upper < 16 ? -0.01 : 0.01];
    const kd = add(add(sub(knee, a), hint), scale(this.bend[leg] ?? [0, 0, 0], 0.03));
    let n = sub(kd, scale(u, dot(kd, u)));
    n = len(n) > 1e-6 ? norm(n) : norm(cross(u, [1, 0, 0]));
    if (leg >= 0) this.bend[leg] = n;
    const kneeT = add(add(a, scale(u, x)), scale(n, y));
    // turn the two limb bones' axes with their segments
    const turn = (b: number, from: V3, to: V3) => {
      const f = norm(from);
      const t = norm(to);
      put(zax, b, rotateArc(at(zax, b), f, t));
      put(yax, b, rotateArc(at(yax, b), f, t));
    };
    turn(ch.upper, sub(knee, a), sub(kneeT, a));
    turn(ch.lower, sub(paw, knee), sub(pawT, kneeT));
    const move = sub(pawT, paw);
    put(pos, ch.lower, kneeT);
    put(pos, ch.paw, pawT);
    put(pos, ch.site, add(site, move));
  }

  /** The last command passed to update. */
  get command(): HostCommand {
    return this.lastCmd;
  }
}

