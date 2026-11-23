// Gestures as timing curves: pointing, reaching, throwing, and the idle
// scheduler that fills a still body with fidgets, weight shifts and face
// touches. The curves return weights and angles; the /three adapter or the
// caller's own rig code turns them into bone rotations.
import { type Rng, keyed, minimumJerk, sample } from "@hackbuild/organic";

export interface PointPhase {
  /** Arm weight toward the target, 0 to 1. */
  weight: number;
  /** True on the frame (and after) the arm reaches the apex. */
  apex: boolean;
  done: boolean;
}

/**
 * Pointing timing after Peeters 2013 (vendor): onset 0.53 s, the arm
 * travels for 0.83 s, apex at 1.37 s, hold about 1.2 s. The 0.6 s retract
 * is inferred. `t` is seconds since the gesture began.
 */
export const POINT_TIMING = { onset: 0.53, travel: 0.83, apex: 1.37, holdEnd: 2.56, retract: 0.6, end: 3.3 } as const;

export function pointGesture(t: number): PointPhase {
  const P = POINT_TIMING;
  const weight = minimumJerk((t - P.onset) / P.travel) * (1 - minimumJerk((t - P.holdEnd) / P.retract));
  return { weight, apex: t >= P.apex, done: t >= P.end };
}

export interface ReachPlan {
  /** Seconds to the target. */
  duration: number;
  /** Seconds at the target before the release. */
  hold: number;
  /** Seconds back to rest. */
  retract: number;
}

/**
 * A reach plan whose duration grows with distance in the manner of Fitts'
 * law: 0.35 s plus 0.12 s per bit of log2(1 + distance / 0.04) (constants
 * inferred), with a small seeded spread.
 */
export function planReach(distance: number, rng: Rng, hold = 0.4): ReachPlan {
  const bits = Math.log2(1 + Math.max(0, distance) / 0.04);
  const duration = (0.35 + 0.12 * bits) * (1 + 0.06 * sample.gauss(rng));
  return { duration: Math.max(0.25, duration), hold, retract: Math.max(0.3, duration * 0.8) };
}

/** Weight of a reach at `t` seconds: minimum jerk in, hold, minimum jerk out. */
export function reachWeight(t: number, plan: ReachPlan): number {
  const out = plan.duration + plan.hold;
  return minimumJerk(t / plan.duration) * (1 - minimumJerk((t - out) / plan.retract));
}

export interface ThrowPlan {
  effort: number;
  /** Total time in seconds. */
  T: number;
  /** End of stride, cocking, acceleration (release), deceleration, in seconds. */
  stride: number;
  cock: number;
  release: number;
  decel: number;
  /** Pelvis and thorax lags that swap the textbook order on some throws. */
  lagPelvis: number;
  lagThorax: number;
  /** Aim error in radians and a distance factor around 1. */
  aimError: number;
  distance: number;
}

/**
 * A throw as a proximal to distal chain. Phase shares after Owens 2024
 * (vendor): stride 37, cocking 14, acceleration 3, deceleration 20,
 * follow through 26 percent. Segment timing is jittered per throw and the
 * pelvis and thorax order swaps on 30 percent of throws (inferred from
 * reports that real throwers rarely keep the textbook order).
 */
export function planThrow(effort: number, rng: Rng): ThrowPlan {
  const e = Math.min(1, Math.max(0, effort));
  const j = () => 1 + sample.gauss(rng) * 0.07;
  const shares = [0.373 * j(), 0.143 * j(), 0.032 * j(), 0.195 * j(), 0.258];
  const total = shares.reduce((a, b) => a + b, 0);
  const T = 1.05 / (0.8 + 0.4 * e);
  let c = 0;
  const t = shares.map((x) => (c += (x / total) * T));
  const swap = rng() < 0.3;
  return {
    effort: e,
    T,
    stride: t[0]!,
    cock: t[1]!,
    release: t[2]!,
    decel: t[3]!,
    lagPelvis: swap ? 0.05 : 0,
    lagThorax: swap ? 0 : 0.05,
    aimError: sample.gauss(rng) * (0.05 + 0.08 * (1 - e)),
    distance: 1 + sample.gauss(rng) * 0.08,
  };
}

export interface ThrowPose {
  /** Pelvis and thorax yaw toward the throw, radians. */
  pelvis: number;
  thorax: number;
  /** Throwing shoulder swing angle along the arc, radians (0 rest, 2 pi back at rest). */
  shoulder: number;
  /** Elbow flexion, radians (negative bends). */
  elbow: number;
  /** Forward lean, radians. */
  lean: number;
  released: boolean;
  done: boolean;
}

/** The throw curves at `t` seconds into a plan. */
export function throwPose(plan: ThrowPlan, t: number): ThrowPose {
  const p = plan;
  const e = p.effort;
  return {
    pelvis: keyed(t, [[0, 0], [p.stride, -0.42 * e], [p.cock + p.lagPelvis, 0.25 * e], [p.release + 0.08, 0.42 * e], [p.T, 0]]),
    thorax: keyed(t, [[0, 0], [p.stride + 0.03, -0.3 * e], [p.cock + p.lagThorax, 0.2 * e], [p.release + 0.1, 0.35 * e], [p.T, 0]]),
    shoulder: keyed(t, [[0, 0], [p.stride, 2.3], [p.cock, 2.6], [p.release, 4.9], [p.decel, 5.8], [p.T, Math.PI * 2]]),
    elbow: keyed(t, [[0, 0], [p.stride * 0.6, -0.6], [p.cock, -1.25], [p.release, -0.05], [p.T, 0]]),
    lean: keyed(t, [[0, 0], [p.stride, -0.08 * e], [p.release + 0.1, 0.22 * e], [p.T, 0]]),
    released: t >= p.release,
    done: t >= p.T,
  };
}

export type IdleKind = "fidget" | "weightShift" | "faceTouch";

export interface IdleEvent {
  kind: IdleKind;
  /** Seconds since the scheduler started. */
  at: number;
  duration: number;
  side: "L" | "R";
  /** Weight shift target in meters (signed, along the body's right axis). */
  shift?: number;
  /** For a face touch: the mouth (true) or the cheek (false). */
  mouth?: boolean;
}

export interface IdleState {
  /** Events that started this step. */
  started: IdleEvent[];
  /** Running events with their weight, 0 to 1. */
  active: { event: IdleEvent; weight: number }[];
  /** Current lateral weight shift target, meters. */
  shift: number;
}

/**
 * Idle scheduler: a postural change about every 20 s, half fidgets, a third
 * weight shifts, the rest easing back to centre (Duarte and Zatsiorsky,
 * vendor), and face touches about 23 an hour (Kwok 2015, vendor). Leaving
 * idle cancels running events and centres the weight.
 */
export class IdleScheduler {
  private now = 0;
  private nextChange: number;
  private nextFace: number;
  private shift = 0;
  private running: IdleEvent[] = [];

  constructor(
    private readonly rng: Rng,
    public changeRate = 1 / 20,
    public faceRate = 23 / 3600,
  ) {
    this.nextChange = sample.poissonGap(changeRate, rng);
    this.nextFace = sample.poissonGap(faceRate, rng);
  }

  update(dt: number, idle: boolean): IdleState {
    this.now += dt;
    const started: IdleEvent[] = [];
    if (!idle) {
      this.running = [];
      this.shift = 0;
      // the clocks keep running so a long walk does not bank events
      if (this.now > this.nextChange) this.nextChange = this.now + sample.poissonGap(this.changeRate, this.rng);
      if (this.now > this.nextFace) this.nextFace = this.now + sample.poissonGap(this.faceRate, this.rng);
      return { started, active: [], shift: 0 };
    }
    const side = (): "L" | "R" => (this.rng() < 0.5 ? "L" : "R");
    if (this.now >= this.nextChange) {
      this.nextChange = this.now + sample.poissonGap(this.changeRate, this.rng);
      const r = this.rng();
      if (r < 0.5) started.push({ kind: "fidget", at: this.now, duration: sample.exGaussian(1.5, 0.4, 0.8, this.rng), side: side() });
      else if (r < 0.85) {
        const s = side();
        this.shift = (s === "L" ? -1 : 1) * (0.02 + 0.02 * this.rng());
        started.push({ kind: "weightShift", at: this.now, duration: 1.2, side: s, shift: this.shift });
      } else {
        this.shift *= 0.5;
        started.push({ kind: "weightShift", at: this.now, duration: 1.2, side: this.shift < 0 ? "L" : "R", shift: this.shift });
      }
    }
    if (this.now >= this.nextFace && !this.running.some((e) => e.kind === "faceTouch")) {
      this.nextFace = this.now + sample.poissonGap(this.faceRate, this.rng);
      started.push({ kind: "faceTouch", at: this.now, duration: sample.exGaussian(1.2, 0.3, 0.8, this.rng), side: this.rng() < 0.6 ? "R" : "L", mouth: this.rng() < 0.44 });
    }
    this.running.push(...started);
    this.running = this.running.filter((e) => this.now - e.at < e.duration);
    const active = this.running.map((event) => {
      const u = (this.now - event.at) / event.duration;
      const weight = event.kind === "fidget" ? Math.sin(Math.PI * u) : minimumJerk(u * 3) * (1 - minimumJerk((u - 0.75) * 4));
      return { event, weight };
    });
    return { started, active, shift: this.shift };
  }
}
