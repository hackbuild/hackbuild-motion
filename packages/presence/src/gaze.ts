// Gaze: where the eyes and head point, with aversion episodes, small
// saccades inside a fixation, head recruitment past the eye only range,
// clamped eye aim, gaze evoked blinks and hysteresis at the seam behind.
import { type Rng, sample, spring, springState } from "@hackbuild/organic";
import { DEG, SeamHold, type Vec3, clamp, direction, yawPitch } from "./angles.js";
import { Blink, type BlinkOptions } from "./blink.js";

/** The conversation state that sets aversion timing: listen, talk or think. */
export type GazeMode = "listen" | "talk" | "think";

/** Random source, eye and head ranges, spring halflife and the organic switch of a gaze controller. */
export interface GazeOptions {
  rng: Rng;
  /** Half width of the range the eyes cover alone before the head joins, degrees. */
  eyeOnlyDeg?: number;
  /** Head share of the gaze past the eye only range (Stahl 1999 reports about 0.77, vendor). */
  headSlope?: number;
  /** Head spring halflife in seconds. */
  headHalflife?: number;
  /** Eye limits from where the head points, degrees. */
  eyeYawDeg?: number;
  eyePitchDeg?: number;
  /** Head limits from the body, radians. */
  headYawLimit?: number;
  headPitchUp?: number;
  headPitchDown?: number;
  /** Yaw past which the seam hold keeps the previous side, radians. */
  seamLimit?: number;
  /** Aversion and saccades on (the organic layer); off gives a plain stare. */
  organic?: boolean;
  blink?: BlinkOptions;
}

/** One gaze frame: head and eye angles, world direction, lid weight, aversion flag and the body turn asked for. */
export interface GazeOutput {
  /** Head angles from the body, radians. */
  headYaw: number;
  headPitch: number;
  /** Eye angles from the head, radians, inside the eye limits. */
  eyeYaw: number;
  eyePitch: number;
  /** World gaze direction. */
  direction: [number, number, number];
  /** Lid weight, 0 open to 1 closed. */
  blink: number;
  /** True while an aversion episode holds the gaze off the target. */
  averted: boolean;
  /**
   * Yaw the body should turn by, radians, when the target sits past the
   * head range (behind the body). Zero otherwise.
   */
  bodyTurn: number;
  /** Target yaw from the body after the seam hold, radians. */
  targetYaw: number;
}

interface Offset {
  dy: number;
  dp: number;
}

// Aversion directions in degrees (0 right, 90 up) and their weights, from
// Lee, Badler and Badler 2002 (vendor); thinking favours up and down.
const SACCADE_BINS: readonly (readonly [number, number])[] = [
  [270, 0.204], [90, 0.177], [180, 0.168], [0, 0.155], [45, 0.074], [135, 0.074], [225, 0.074], [315, 0.074],
];
const THINK_BINS: readonly (readonly [number, number])[] = [
  [90, 0.34], [270, 0.34], [0, 0.1], [180, 0.1], [45, 0.03], [135, 0.03], [225, 0.03], [315, 0.03],
];

/**
 * Aversion timing after Andrist 2014 (vendor): while talking, episodes of
 * about 1.96 s every 4.75 s; while listening, about 1.14 s every 7.21 s;
 * while thinking, about 3.5 s, mostly up or down.
 */
const AVERSION = {
  talk: { dur: [1.5, 0.3, 0.45], gap: [2.3, 0.5, 0.5] },
  listen: { dur: [0.85, 0.2, 0.3], gap: [5.3, 1, 1] },
  think: { dur: [2.6, 0.5, 0.9], gap: [3, 0.6, 1] },
} as const;

/** Where the eyes and head point each frame, with aversion episodes, saccades, head recruitment, clamped eye aim, blinks and a seam hold behind the body. */
export class GazeController {
  readonly blinker: Blink;
  private readonly rng: Rng;
  private readonly o: Required<Omit<GazeOptions, "rng" | "blink">>;
  private target: Vec3 | null = null;
  private mode: GazeMode = "listen";
  private now = 0;
  private aversion: (Offset & { end: number }) | null = null;
  private nextAversion = 0;
  private micro: Offset = { dy: 0, dp: 0 };
  private nextMicro = 0;
  private readonly seam: SeamHold;
  private readonly hy = springState();
  private readonly hp = springState();
  private readonly ey = springState();
  private readonly ep = springState();
  private goalY = 0;
  private goalP = 0;
  private pendY = 0;
  private pendP = 0;
  private pendAt = 0;
  private lastGy = 0;
  private lastGp = 0;

  constructor(opts: GazeOptions) {
    this.rng = opts.rng;
    this.o = {
      eyeOnlyDeg: 16,
      headSlope: 0.77,
      headHalflife: 0.12,
      eyeYawDeg: 25,
      eyePitchDeg: 10,
      headYawLimit: 1.3,
      headPitchUp: 0.6,
      headPitchDown: 0.7,
      seamLimit: 2.2,
      organic: true,
      ...stripUndefined(opts),
    };
    this.seam = new SeamHold(this.o.seamLimit);
    this.blinker = new Blink(this.rng, opts.blink ?? {});
    this.nextAversion = exg(AVERSION.listen.gap, this.rng);
  }

  setTarget(p: Vec3 | null): void {
    this.target = p;
  }

  setMode(mode: GazeMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === "think" && !this.aversion) this.nextAversion = this.now;
  }

  /**
   * One step. `eye` is the point between the eyes in world space, `bodyYaw`
   * the facing of the body. With no target the gaze rests ahead and a
   * little down.
   */
  update(dt: number, eye: Vec3, bodyYaw: number): GazeOutput {
    this.now += dt;
    const o = this.o;
    let ty: number;
    let tp: number;
    if (this.target) {
      const [y, p] = yawPitch(eye, this.target);
      ty = this.seam.update(y - bodyYaw);
      tp = p;
    } else {
      ty = this.seam.update(0);
      tp = -0.2;
    }

    let off: Offset = { dy: 0, dp: 0 };
    let averted = false;
    if (o.organic) {
      if (this.aversion && this.now >= this.aversion.end) this.aversion = null;
      if (!this.aversion && this.target && this.now >= this.nextAversion) this.startAversion();
      if (this.now >= this.nextMicro) {
        const talk = this.mode === "talk";
        this.nextMicro = this.now + sample.exGaussian(talk ? 0.42 : 0.7, 0.12, talk ? 0.35 : 0.8, this.rng);
        // amplitude from P(A) = 15.7 exp(-A / 6.9) (vendor), capped at 9 degrees and halved inside a fixation
        const a = Math.min(-6.9 * Math.log(Math.max(this.rng(), 1e-3)), 9) * DEG * 0.5;
        const th = this.rng() * Math.PI * 2;
        this.micro = { dy: Math.cos(th) * a, dp: Math.sin(th) * a };
      }
      if (this.aversion) {
        off = { dy: this.aversion.dy + this.micro.dy, dp: this.aversion.dp + this.micro.dp };
        averted = true;
      } else if (this.target) off = this.micro;
    }

    // gaze goal from the body; the seam held yaw may run past pi
    const reach = o.headYawLimit + o.eyeYawDeg * DEG;
    const gy = clamp(ty + off.dy, -reach, reach);
    const gp = clamp(tp + off.dp, -o.headPitchDown - o.eyePitchDeg * DEG, o.headPitchUp + o.eyePitchDeg * DEG);
    const bodyTurn = Math.abs(ty) > o.headYawLimit ? ty - Math.sign(ty) * o.headYawLimit : 0;

    // a large gaze shift brings a blink with it
    if (Math.hypot(gy - this.lastGy, gp - this.lastGp) > 0.3 && this.rng() < 0.6) this.blinker.trigger();
    this.lastGy = gy;
    this.lastGp = gp;

    // head recruitment past the eye only range, after a short head latency
    const half = o.eyeOnlyDeg * DEG;
    let hy = Math.sign(gy) * Math.max(0, o.headSlope * (Math.abs(gy) - half));
    let hp = Math.sign(gp) * Math.max(0, o.headSlope * (Math.abs(gp) - half * 0.6));
    if (!o.organic) {
      hy = gy * 0.9;
      hp = gp * 0.9;
    }
    // the head must leave room for the eyes to reach the goal
    hy = clamp(hy, gy - o.eyeYawDeg * DEG, gy + o.eyeYawDeg * DEG);
    hp = clamp(hp, gp - o.eyePitchDeg * DEG, gp + o.eyePitchDeg * DEG);
    hy = clamp(hy, -o.headYawLimit, o.headYawLimit);
    hp = clamp(hp, -o.headPitchDown, o.headPitchUp);
    if (Math.abs(hy - this.pendY) > 0.03 || Math.abs(hp - this.pendP) > 0.03) {
      this.pendY = hy;
      this.pendP = hp;
      this.pendAt = this.now + (o.organic ? 0.02 + 0.03 * this.rng() : 0);
    }
    if (this.now >= this.pendAt) {
      this.goalY = this.pendY;
      this.goalP = this.pendP;
    }
    spring(this.hy, this.goalY, o.headHalflife, dt);
    spring(this.hp, this.goalP, o.headHalflife, dt);

    // eyes: a fast spring (saccade scale) toward the rest of the gaze, clamped
    const eyMax = o.eyeYawDeg * DEG;
    const epMax = o.eyePitchDeg * DEG;
    spring(this.ey, clamp(gy - this.hy.x, -eyMax, eyMax), 0.012, dt);
    spring(this.ep, clamp(gp - this.hp.x, -epMax, epMax), 0.012, dt);
    const eyeYaw = clamp(this.ey.x, -eyMax, eyMax);
    const eyePitch = clamp(this.ep.x, -epMax, epMax);

    const blink = this.blinker.update(dt);
    return {
      headYaw: this.hy.x,
      headPitch: this.hp.x,
      eyeYaw,
      eyePitch,
      direction: direction(bodyYaw + this.hy.x + eyeYaw, this.hp.x + eyePitch),
      blink,
      averted,
      bodyTurn,
      targetYaw: ty,
    };
  }

  private startAversion(): void {
    const think = this.mode === "think";
    const t = AVERSION[this.mode];
    const dur = exg(t.dur, this.rng);
    const bins = think ? THINK_BINS : SACCADE_BINS;
    const dir = bins[sample.weightedIndex(bins.map((b) => b[1]), this.rng)]![0] * DEG;
    const a = (think ? 16 + 16 * this.rng() : 9 + 17 * this.rng()) * DEG;
    this.aversion = { dy: Math.cos(dir) * a, dp: Math.sin(dir) * a * 0.8, end: this.now + dur };
    this.nextAversion = this.now + dur + exg(t.gap, this.rng);
  }
}

const exg = (p: readonly [number, number, number], rng: Rng): number => sample.exGaussian(p[0], p[1], p[2], rng);

function stripUndefined<T extends object>(o: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined && k !== "rng" && k !== "blink") (out as Record<string, unknown>)[k] = v;
  return out;
}
