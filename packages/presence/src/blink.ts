// Blink and breath: the two rhythms a resting body never stops.
import { type Rng, sample } from "@hackbuild/organic";

/** Gap, single or double share, and lid timing of spontaneous blinks. */
export interface BlinkOptions {
  /** Shortest and longest gap between blinks in seconds. */
  minGap?: number;
  maxGap?: number;
  /** Share of blinks that come alone; the rest come as a double. */
  single?: number;
  /** Lid close and open times in seconds. */
  close?: number;
  open?: number;
}

/**
 * Spontaneous blinks with gaps from 1 to 8 s (median near 3 s, log normal,
 * inferred from published blink studies), 85 percent single,
 * a triangle lid curve that closes in 0.06 s and opens in 0.12 s. A gaze
 * shift can request a blink through `trigger`.
 */
export class Blink {
  /** Lid weight, 0 open to 1 closed. */
  weight = 0;
  /** Blinks started so far. */
  count = 0;
  private readonly o: Required<BlinkOptions>;
  private wait: number;
  private t = -1;
  private pendingDouble = false;

  constructor(
    private readonly rng: Rng,
    opts: BlinkOptions = {},
  ) {
    this.o = { minGap: 1, maxGap: 8, single: 0.85, close: 0.06, open: 0.12, ...opts };
    this.wait = this.gap();
  }

  private gap(): number {
    return Math.min(this.o.maxGap, Math.max(this.o.minGap, sample.logNormal(3, 0.5, this.rng)));
  }

  /** Starts a blink now unless one is running. */
  trigger(): void {
    if (this.t >= 0) return;
    this.t = 0;
    this.count++;
  }

  update(dt: number): number {
    const { close, open } = this.o;
    if (this.t < 0) {
      this.wait -= dt;
      if (this.wait <= 0) {
        this.trigger();
        this.pendingDouble = this.rng() > this.o.single;
        this.wait = this.gap();
      }
    }
    if (this.t >= 0) {
      this.t += dt;
      const t = this.t;
      this.weight = t < close ? t / close : t < close + open ? 1 - (t - close) / open : 0;
      if (t >= close + open) {
        this.t = -1;
        this.weight = 0;
        if (this.pendingDouble) {
          this.pendingDouble = false;
          this.wait = 0.08;
        }
      }
    }
    return this.weight;
  }
}

/** One breathing frame: cycle phase, lung fill, chest pitch and shoulder rise. */
export interface BreathState {
  /** Phase in the cycle, 0 to 1, 0 at the start of an inhale. */
  phase: number;
  /** Lung fill, 0 empty to 1 full. */
  fill: number;
  /** Chest pitch in radians (positive lifts the chest). */
  chestPitch: number;
  /** Shoulder rise in meters. */
  shoulderRise: number;
}

/**
 * Breathing at a rate in breaths per minute with an inhale of 40 percent of
 * the cycle and a slower exhale. The rate drifts a little through an
 * Ornstein Uhlenbeck term so two characters never breathe in step.
 */
export class Breath {
  rate: number;
  depth = 1;
  private phase = 0;
  private drift = 0;

  constructor(
    private readonly rng: Rng,
    rate = 14,
  ) {
    this.rate = rate;
    this.phase = rng();
  }

  update(dt: number): BreathState {
    const e = Math.exp(-dt / 8);
    this.drift = this.drift * e + 0.06 * Math.sqrt(1 - e * e) * sample.gauss(this.rng);
    const hz = (this.rate / 60) * (1 + Math.max(-0.2, Math.min(0.2, this.drift)));
    this.phase = (this.phase + hz * dt) % 1;
    const p = this.phase;
    const fill = p < 0.4 ? 0.5 - 0.5 * Math.cos((Math.PI * p) / 0.4) : 0.5 + 0.5 * Math.cos((Math.PI * (p - 0.4)) / 0.6);
    return { phase: p, fill, chestPitch: 0.025 * this.depth * fill, shoulderRise: 0.006 * this.depth * fill };
  }
}
