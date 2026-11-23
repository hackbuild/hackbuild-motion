// Test fixtures that need no weights: a small random network in the
// manifest format, a plain double precision forward pass of the equations,
// and a kinematic stand in for the quadruped network that trots along the
// trajectory it is given, with planted paws that slip like the real one.
import { BONES as BONE_NAMES, STYLES, type StyleLabel } from "../src/layout.js";
import { requiredTensors, type Dims, type Manifest, type TensorEntry } from "../src/weights.js";
import type { RawPrediction } from "../src/engine.js";
import { lcg } from "../src/index.js";

const f16bits = (v: number): number => {
  const b = new DataView(new ArrayBuffer(4));
  b.setFloat32(0, v);
  const u = b.getUint32(0);
  const sign = (u >>> 16) & 0x8000;
  const e = ((u >>> 23) & 0xff) - 112;
  if (e <= 0) return sign;
  return sign | (Math.min(e, 30) << 10) | ((u >>> 13) & 0x3ff);
};
const f16val = (h: number): number => {
  const s = h & 0x8000 ? -1 : 1;
  const e = (h >> 10) & 0x1f;
  const m = h & 0x3ff;
  return e === 0 ? s * m * 2 ** -24 : s * (1 + m / 1024) * 2 ** (e - 15);
};

export const SMALL: Dims = { dIn: 23, dOut: 19, hidden: 40, group: 4, frames: 16, passes: 3 };

/** A random network in the published format with small dimensions. */
export function smallWeights(seed: number): { manifest: Manifest; bin: ArrayBuffer; values: Record<string, number[]> } {
  const r = lcg(seed);
  const sym = (s: number) => (r() * 2 - 1) * s;
  const d = SMALL;
  const bin: Record<string, TensorEntry> = {};
  const parts: Uint8Array[] = [];
  const values: Record<string, number[]> = {};
  let off = 0;
  for (const t of requiredTensors(d)) {
    const n = t.shape.reduce((a, b) => a * b, 1);
    let v: number[];
    if (t.dtype === "f16") {
      const cols = t.shape[1]!;
      const h = Array.from({ length: n }, () => f16bits(sym(1.5 / Math.sqrt(cols))));
      v = h.map(f16val);
      const bytes = new Uint8Array(Math.ceil((n * 2) / 4) * 4);
      const dv = new DataView(bytes.buffer);
      h.forEach((x, i) => dv.setUint16(i * 2, x, true));
      parts.push(bytes);
    } else {
      if (t.key.endsWith("std")) v = Array.from({ length: n }, () => 0.2 + Math.abs(sym(1)));
      else if (t.key === "time_stats.mean") v = [0.25];
      else if (t.key === "time_stats.std") v = [0.1537];
      else if (t.key === "timing") v = Array.from({ length: n }, (_, k) => k / 30);
      else if (t.key.includes("film.scale.bias")) v = Array.from({ length: n }, () => 1 + sym(0.3));
      else v = Array.from({ length: n }, () => sym(0.3));
      const f = Float32Array.from(v);
      v = Array.from(f);
      parts.push(new Uint8Array(f.buffer));
    }
    values[t.key] = v;
    bin[t.key] = { offset: off, count: n, shape: t.shape, dtype: t.dtype };
    off += parts[parts.length - 1]!.byteLength;
  }
  const out = new Uint8Array(off);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.byteLength;
  }
  const manifest: Manifest = {
    model: { input_dim: d.dIn, output_dim: d.dOut, latent_dim: d.hidden, codebook_channels: d.hidden / d.group, codebook_dims: d.group, sequence_length: d.frames, denoiser_iterations: d.passes },
    skeleton: { bone_names: [...BONE_NAMES], parent_names: [] },
    guidances: [...STYLES],
    bin,
  };
  return { manifest, bin: out.buffer, values };
}


/** The equations of the specification in double precision, frame by frame. */
export function referenceForward(V: Record<string, number[]>, d: Dims, u: ArrayLike<number>): { code0: number[]; code: number[]; frames: number[] } {
  const lin = (w: number[], b: number[] | null, x: number[], rows: number) =>
    Array.from({ length: rows }, (_, o) => {
      let s = 0;
      for (let i = 0; i < x.length; i++) s += w[o * x.length + i]! * x[i]!;
      return s + (b ? b[o]! : 0);
    });
  const elu = (v: number[]) => v.map((z) => (z > 0 ? z : Math.exp(z) - 1));
  const gs = (v: number[]) => {
    const o = v.slice();
    for (let g = 0; g < o.length; g += d.group) {
      const s = o.slice(g, g + d.group);
      const m = Math.max(...s);
      const e = s.map((z) => Math.exp(z - m));
      const t = e.reduce((a, b) => a + b, 0);
      e.forEach((z, i) => (o[g + i] = z / t));
    }
    return o;
  };
  const mlp = (p: string, x: number[]) => gs(lin(V[`${p}.l3.weight`]!, V[`${p}.l3.bias`]!, elu(lin(V[`${p}.l2.weight`]!, V[`${p}.l2.bias`]!, elu(lin(V[`${p}.l1.weight`]!, V[`${p}.l1.bias`]!, x, d.hidden)), d.hidden)), d.hidden));
  const x = Array.from({ length: d.dIn }, (_, i) => (u[i]! - V["input_stats.mean"]![i]!) / V["input_stats.std"]![i]!);
  const code0 = mlp("estimator", x);
  let p = code0;
  for (let r = 0; r < d.passes; r++) p = mlp("denoiser", [...p, ...x]);
  const c = [...p, ...x];
  const frames: number[] = [];
  for (let k = 0; k < d.frames; k++) {
    const t = (V.timing![k]! - V["time_stats.mean"]![0]!) / V["time_stats.std"]![0]!;
    const M = (j: number, z: number[], rows: number) => {
      const f = (n: string) => V[`decoder.l${j}.film.${n}`]!;
      const zz = z.map((zi, i) => (f("scale.weight")[i]! * t + f("scale.bias")[i]!) * zi + (f("shift.weight")[i]! * t + f("shift.bias")[i]!));
      return lin(V[`decoder.l${j}.linear.weight`]!, V[`decoder.l${j}.linear.bias`]!, zz, rows);
    };
    const v = M(3, elu(M(2, elu(M(1, c, d.hidden)), d.hidden)), d.dOut);
    frames.push(...v.map((vi, i) => vi * V["output_stats.std"]![i]! + V["output_stats.mean"]![i]!));
  }
  return { code0, code: p, frames };
}

/** Style poses of a small box dog: 27 bones, left side at negative x as in the network's data. */
export function boxStyles(): Record<StyleLabel, Float32Array> {
  const L = (x: number, y: number, z: number) => [x, y, z];
  const side = (s: number) => [
    L(0.06 * s, 0.45, 0.22),
    L(0.07 * s, 0.33, 0.22),
    L(0.07 * s, 0.19, 0.23),
    L(0.07 * s, 0.05, 0.22),
    L(0.07 * s, 0.0, 0.25),
  ];
  const hind = (s: number) => [L(0.07 * s, 0.42, -0.2), L(0.07 * s, 0.26, -0.23), L(0.07 * s, 0.08, -0.2), L(0.07 * s, 0.0, -0.17)];
  const bones = [
    L(0, 0.45, 0),
    L(0, 0.46, 0.08),
    L(0, 0.47, 0.18),
    L(0, 0.53, 0.27),
    L(0, 0.6, 0.33),
    L(0, 0.6, 0.43),
    ...side(-1),
    ...side(1),
    ...hind(-1),
    ...hind(1),
    L(0, 0.46, -0.26),
    L(0, 0.48, -0.36),
    L(0, 0.5, -0.46),
  ];
  const pose = Float32Array.from(bones.flat());
  return Object.fromEntries(STYLES.map((s) => [s, pose])) as Record<StyleLabel, Float32Array>;
}

export interface MockOptions {
  /** Share of the trajectory speed the stand in actually moves at. */
  speedScale?: number;
  /** Share of the root speed by which planted paws slip forward. */
  slip?: number;
  /** Host seconds before the n-th prediction (from 0) is delivered. */
  delay?: (n: number) => number;
}

/**
 * A kinematic stand in for the network: moves at a share of the
 * trajectory's velocity, turns at the trajectory's facing rate, and trots
 * at 2 strides a second with paws that stay down for half the stride.
 */
export class MockNet {
  private queue: { due: number; resolve: (r: RawPrediction) => void; out: RawPrediction }[] = [];
  private n = 0;
  now = 0;
  constructor(
    private readonly styles: Record<StyleLabel, Float32Array>,
    private readonly opts: MockOptions = {},
  ) {}
  predict(u: Float32Array): Promise<RawPrediction> {
    const scale = this.opts.speedScale ?? 0.8;
    const slip = this.opts.slip ?? 0.1;
    // trajectory sample 8 velocity, and the facing of sample 15 over its time (0.25 + 15/60 s)
    const vx = u[226 + 16]! * scale;
    const vz = u[226 + 17]! * scale;
    const yawRate = Math.atan2(u[194 + 30]!, u[194 + 31]!) / 0.5;
    const speed = Math.hypot(vx, vz);
    const frames = new Float32Array(16 * 412);
    const pose = this.styles.Idle;
    const t0 = this.now;
    for (let k = 0; k < 16; k++) {
      const o = k * 412;
      const t = t0 + k / 30;
      frames[o] = vx / 30;
      frames[o + 1] = ((yawRate / 30) * 180) / Math.PI;
      frames[o + 2] = vz / 30;
      for (let i = 0; i < 81; i++) frames[o + 3 + i] = pose[i]!;
      for (let b = 0; b < 27; b++) {
        frames[o + 84 + b * 3 + 2] = 1;
        frames[o + 165 + b * 3 + 1] = 1;
      }
      const moving = speed > 0.05 || Math.abs(yawRate) > 0.1;
      const offsets = [0, 0.5, 0.5, 0];
      const chains = [
        [9, 10],
        [14, 15],
        [18, 19],
        [22, 23],
      ];
      const veff = speed * (1 - slip);
      chains.forEach(([paw, site], i) => {
        let contact = 1;
        if (moving) {
          const ph = (((t * 2 + offsets[i]!) % 1) + 1) % 1;
          let dz: number;
          let dy = 0;
          if (ph < 0.5) dz = veff * (0.125 - ph * 0.5);
          else {
            const a = (ph - 0.5) / 0.5;
            dz = veff * (-0.125 + 0.25 * a);
            dy = 0.05 * Math.sin(Math.PI * a);
            contact = 0;
          }
          for (const b of [paw!, site!]) {
            frames[o + 3 + b * 3 + 1]! += dy;
            frames[o + 3 + b * 3 + 2]! += dz;
          }
          // the knee follows the paw half way, as a swinging limb does
          frames[o + 3 + (paw! - 1) * 3 + 1]! += dy / 2;
          frames[o + 3 + (paw! - 1) * 3 + 2]! += dz / 2;
        }
        frames[o + 327 + i] = contact;
      });
    }
    const out: RawPrediction = { frames, code: new Float32Array(4), code0: new Float32Array(4), ms: 0 };
    const delay = this.opts.delay?.(this.n++) ?? 1 / 60;
    return new Promise((resolve) => this.queue.push({ due: t0 + delay, resolve, out }));
  }
  /** Delivers every prediction due by host time `t`. */
  flush(t: number): void {
    this.now = t;
    const due = this.queue.filter((q) => q.due <= t + 1e-9);
    this.queue = this.queue.filter((q) => q.due > t + 1e-9);
    for (const q of due) q.resolve(q.out);
  }
}
