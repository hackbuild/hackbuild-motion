// The scalar kernel in plain TypeScript. These run per call inside a frame
// loop, where a call into wasm costs more than the arithmetic, so they live
// on this side. The formulas are written in the same operation order as the
// Rust crate, so the fast springs and the seeded stream agree bit for bit.

/** Uniform numbers in [0, 1). The family contract: injected, never Math.random. */
export type Rng = () => number;

/** FNV-1a over UTF-16 code units, equal to the Rust `hash_seed`. */
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Mulberry32, the same stream as the Rust `Mulberry32` and the wasm `SeededRng`. */
export function seededRng(seed: number | string): Rng {
  let a = (typeof seed === "string" ? hashSeed(seed) : seed) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a) >>> 0;
    t = ((t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Position `x`, velocity `v` and acceleration `a` of one scalar spring, changed in place by the spring calls. */
export interface SpringState {
  x: number;
  v: number;
  a: number;
}

/** A spring state at rest at `x` (default 0). */
export const springState = (x = 0): SpringState => ({ x, v: 0, a: 0 });

const EPS = 1e-5;
/** The damping constant for a half life in seconds, the time the spring takes to cover half the distance to its goal. */
export const halflifeToDamping = (halflife: number): number => (4 * Math.LN2) / (halflife + EPS);
/** A rational approximation of `exp(-x)` for x of 0 or more, used when `exact` is false. */
export const fastNegexp = (x: number): number => 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
const negexp = (x: number, exact: boolean): number => (exact ? Math.exp(-x) : fastNegexp(x));

/** Critically damped spring toward `goal`. `exact` false uses the fast exp. */
export function spring(s: SpringState, goal: number, halflife: number, dt: number, exact = true): number {
  const y = halflifeToDamping(halflife) / 2;
  const j0 = s.x - goal;
  const j1 = s.v + j0 * y;
  const e = negexp(y * dt, exact);
  s.x = e * (j0 + j1 * dt) + goal;
  s.v = e * (s.v - j1 * y * dt);
  return s.x;
}

/** Decays an offset toward zero, the inertialization core. */
export function decay(s: SpringState, halflife: number, dt: number, exact = true): number {
  const y = halflifeToDamping(halflife) / 2;
  const j1 = s.v + s.x * y;
  const e = negexp(y * dt, exact);
  s.x = e * (s.x + j1 * dt);
  s.v = e * (s.v - j1 * y * dt);
  return s.x;
}

/** Velocity eases toward `vGoal`; position integrates it exactly. Returns x. */
export function velocitySpring(s: SpringState, vGoal: number, halflife: number, dt: number, exact = true): number {
  const y = halflifeToDamping(halflife) / 2;
  const j0 = s.v - vGoal;
  const j1 = s.a + j0 * y;
  const e = negexp(y * dt, exact);
  s.x = s.x + (e * (-j1 / (y * y) + (-j0 - j1 * dt) / y) + j1 / (y * y) + j0 / y + vGoal * dt);
  s.v = e * (j0 + j1 * dt) + vGoal;
  s.a = e * (s.a - j1 * y * dt);
  return s.x;
}

/** Spring damper with a damping ratio (1 critical, below 1 overshoots). */
export function springDamper(s: SpringState, goal: number, vGoal: number, ratio: number, halflife: number, dt: number): number {
  const d = halflifeToDamping(halflife);
  const r = Math.max(ratio, 1e-6);
  const k = (d / (r * 2)) * (d / (r * 2));
  const c = goal + (d * vGoal) / (k + EPS);
  const y = d / 2;
  const x0 = s.x - c;
  const disc = k - (d * d) / 4;
  if (Math.abs(disc) < EPS) {
    const j1 = s.v + x0 * y;
    const e = Math.exp(-y * dt);
    s.x = x0 * e + dt * j1 * e + c;
    s.v = -y * x0 * e - y * dt * j1 * e + j1 * e;
  } else if (disc > 0) {
    const w = Math.sqrt(disc);
    let j = Math.sqrt(((s.v + y * x0) * (s.v + y * x0)) / (w * w + EPS) + x0 * x0);
    const p = Math.atan((s.v + x0 * y) / (-x0 * w + EPS));
    if (x0 <= 0) j = -j;
    const e = Math.exp(-y * dt);
    s.x = j * e * Math.cos(w * dt + p) + c;
    s.v = -y * j * e * Math.cos(w * dt + p) - w * j * e * Math.sin(w * dt + p);
  } else {
    const q = Math.sqrt(d * d - 4 * k);
    const y0 = (d + q) / 2;
    const y1 = (d - q) / 2;
    const j1 = (c * y0 - s.x * y0 - s.v) / (y1 - y0);
    const j0 = s.x - j1 - c;
    const e0 = Math.exp(-y0 * dt);
    const e1 = Math.exp(-y1 * dt);
    s.x = j0 * e0 + j1 * e1 + c;
    s.v = -y0 * j0 * e0 - y1 * j1 * e1;
  }
  return s.x;
}

/** Minimum jerk profile on t in 0 to 1. */
export function minimumJerk(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return u * u * u * (10 - 15 * u + 6 * u * u);
}

/** Piecewise minimum jerk through [time, value] keys sorted by time. */
export function keyed(t: number, keys: readonly (readonly [number, number])[]): number {
  const first = keys[0];
  if (!first) return 0;
  if (t <= first[0]) return first[1];
  for (let i = 1; i < keys.length; i++) {
    const [t0, a] = keys[i - 1]!;
    const [t1, b] = keys[i]!;
    if (t <= t1) return a + (b - a) * minimumJerk((t - t0) / Math.max(t1 - t0, 1e-3));
  }
  return keys[keys.length - 1]![1];
}

const open01 = (rng: Rng): number => {
  for (;;) {
    const u = rng();
    if (u > 0) return u;
  }
};

function gauss(rng: Rng): number {
  const u = open01(rng);
  const v = open01(rng);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function gamma(k: number, theta: number, rng: Rng): number {
  if (k < 1) return gamma(k + 1, theta, rng) * Math.pow(open01(rng), 1 / k);
  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = gauss(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = open01(rng);
    if (u < 1 - 0.0331 * x * x * x * x || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * theta;
  }
}

/** Samplers. Each takes the random source last and keeps no state. */
export const sample = {
  gauss,
  /** Normal(mu, sigma) plus Exponential(tau): reaction times. Mean mu + tau. */
  exGaussian: (mu: number, sigma: number, tau: number, rng: Rng): number => {
    const g = gauss(rng);
    return mu + sigma * g - tau * Math.log(1 - rng());
  },
  /** Power law step length with exponent mu in (1, 3], clipped to max. */
  truncatedPowerLaw: (min: number, mu: number, max: number, rng: Rng): number => Math.min(max, min * Math.pow(1 - rng(), -1 / (mu - 1))),
  /** Von Mises angle around zero (Best and Fisher 1979). */
  vonMises: (kappa: number, rng: Rng): number => {
    if (kappa < 1e-6) return (rng() * 2 - 1) * Math.PI;
    const a = 1 + Math.sqrt(1 + 4 * kappa * kappa);
    const b = (a - Math.sqrt(2 * a)) / (2 * kappa);
    const r = (1 + b * b) / (2 * b);
    for (;;) {
      const z = Math.cos(Math.PI * rng());
      const f = (1 + r * z) / (r + z);
      const c = kappa * (r - f);
      const u = open01(rng);
      if (c * (2 - c) - u > 0 || Math.log(c / u) + 1 - c >= 0) return (rng() < 0.5 ? -1 : 1) * Math.acos(Math.min(1, Math.max(-1, f)));
    }
  },
  /** Seconds to the next event of a Poisson process. */
  poissonGap: (rate: number, rng: Rng): number => -Math.log(1 - rng()) / Math.max(rate, 1e-12),
  /** Whether a Poisson event lands in a step of dt seconds; exact for any dt. */
  eventInStep: (rate: number, dt: number, rng: Rng): boolean => rng() < 1 - Math.exp(-Math.max(rate, 0) * dt),
  gamma,
  logNormal: (median: number, sigma: number, rng: Rng): number => Math.exp(Math.log(median) + sigma * gauss(rng)),
  /** Index drawn with probability proportional to its weight. */
  weightedIndex: (weights: readonly number[], rng: Rng): number => {
    const total = weights.reduce((s, w) => s + Math.max(w, 0), 0);
    if (!(total > 0)) return 0;
    let r = rng() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= Math.max(weights[i]!, 0);
      if (r < 0) return i;
    }
    return weights.length - 1;
  },
};

/** Ornstein Uhlenbeck noise with the exact discrete update. */
export class OU {
  x: number;
  constructor(
    public tau: number,
    public sigma: number,
    public mu: number,
    private rng: Rng,
  ) {
    this.x = mu + sigma * gauss(rng) * 0.5;
  }
  step(dt: number): number {
    const e = Math.exp(-dt / Math.max(this.tau, 1e-9));
    this.x = this.mu + (this.x - this.mu) * e + this.sigma * Math.sqrt(1 - e * e) * gauss(this.rng);
    return this.x;
  }
}

/** Summed OU octaves: an approximately 1/f drift with unit variance. */
export class Pink {
  x = 0;
  private readonly octaves: OU[] = [];
  constructor(tau0: number, octaves: number, rng: Rng) {
    const n = Math.max(1, octaves);
    for (let k = 0; k < n; k++) this.octaves.push(new OU(tau0 * 2 ** k, 1 / Math.sqrt(n), 0, rng));
  }
  step(dt: number): number {
    let s = 0;
    for (const o of this.octaves) s += o.step(dt);
    this.x = s;
    return s;
  }
}

/** Game time, circadian drive and sleep pressure (two process model). */
export class BodyClock {
  pressure = 0.3;
  asleep = false;
  constructor(
    public minutes: number,
    public rate: number,
  ) {}
  tick(dt: number): void {
    const dm = dt * this.rate;
    this.minutes += dm;
    const hours = dm / 60;
    if (this.asleep) this.pressure *= Math.exp(-hours / 4.2);
    else this.pressure = 1 - (1 - this.pressure) * Math.exp(-hours / 18.2);
  }
  hour(): number {
    return (this.minutes - 1440 * Math.floor(this.minutes / 1440)) / 60;
  }
  day(): number {
    return Math.floor(this.minutes / 1440);
  }
  circadian(): number {
    return 0.5 + 0.5 * Math.cos((2 * Math.PI * (this.hour() - 16)) / 24);
  }
  sleepiness(): number {
    return Math.min(1, Math.max(0, this.pressure - 0.5 * this.circadian() + 0.25));
  }
}
