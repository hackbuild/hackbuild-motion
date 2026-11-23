import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { load as loadGait } from "@hackbuild/gait";
import type { GaitCommand, MotorState, RootMotion } from "@hackbuild/gait";
import {
  CodebookGait,
  NeuralFallback,
  codebookManifest,
  createCpuModel,
  createSession,
  goldenTrace,
  halfToFloat,
  licenceNotice,
  load,
  loadQuadrupedGait,
  readWeights,
  sha256Hex,
  type CodebookFile,
  type NetManifest,
  type NetSession,
  type RootedBackend,
} from "../src/index.js";
import * as wasm from "../src/wasm/motion_net.js";
import { parityInputs } from "../scripts/inputs.mjs";

const here = import.meta.dirname;
const golden = JSON.parse(readFileSync(join(here, "../../../crates/motion-net/tests/golden.json"), "utf8")) as { seed: number; values: number[] };

beforeAll(async () => {
  await load();
  await loadGait();
});

// ---------- a seeded weight file built in the test ----------

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Writes tensors into one buffer; `half` names are stored as f16 (rounded through the half table). */
function weightFile(tensors: Record<string, { data: Float32Array; shape: number[] }>, half: Set<string>): { weights: ArrayBuffer; table: NetManifest["tensors"] } {
  const table: NetManifest["tensors"] = {};
  let size = 0;
  for (const [k, t] of Object.entries(tensors)) {
    const bytes = t.data.length * (half.has(k) ? 2 : 4);
    table[k] = { offset: size, count: t.data.length, shape: t.shape, dtype: half.has(k) ? "f16" : "f32" };
    size += Math.ceil(bytes / 4) * 4;
  }
  const buf = new ArrayBuffer(size);
  for (const [k, t] of Object.entries(tensors)) {
    const e = table[k]!;
    if (e.dtype === "f32") new Float32Array(buf, e.offset, e.count).set(t.data);
    else {
      const h = new Uint16Array(buf, e.offset, e.count);
      for (let i = 0; i < e.count; i++) h[i] = toHalf(t.data[i]!);
      for (let i = 0; i < e.count; i++) t.data[i] = halfToFloat(h[i]!);
    }
  }
  return { weights: buf, table };
}

/** Nearest half by search over the decode table (test only). */
const HALVES = (() => {
  const v: [number, number][] = [];
  for (let h = 0; h < 0x7c00; h++) v.push([halfToFloat(h), h]);
  return v;
})();
function toHalf(x: number): number {
  const a = Math.abs(x);
  let lo = 0;
  let hi = HALVES.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (HALVES[mid]![0] <= a) lo = mid;
    else hi = mid;
  }
  const h = a - HALVES[lo]![0] <= HALVES[hi]![0] - a ? HALVES[lo]![1] : HALVES[hi]![1];
  return x < 0 ? h | 0x8000 : h;
}

const SMALL = { input: 11, latent: 12, group: 4, iterations: 2, frames: 4, output: 6 };

function smallCodebook(seed: number) {
  const r = mulberry(seed);
  const vals = (n: number, s: number) => Float32Array.from({ length: n }, () => (r() - 0.5) * 2 * s);
  const { input: n, latent: h, output: o, frames: S } = SMALL;
  const c = n + h;
  const t: Record<string, { data: Float32Array; shape: number[] }> = {};
  const dense = (k: string, rows: number, cols: number) => {
    t[`${k}.weight`] = { data: vals(rows * cols, 1.5 / Math.sqrt(cols)), shape: [rows, cols] };
    t[`${k}.bias`] = { data: vals(rows, 0.1), shape: [rows] };
  };
  for (const [net, first] of [["estimator", n], ["denoiser", c]] as const) {
    dense(`${net}.l1`, h, first);
    dense(`${net}.l2`, h, h);
    dense(`${net}.l3`, h, h);
  }
  for (const [l, rows, cols] of [[1, h, c], [2, h, h], [3, o, h]] as const) {
    for (const k of ["scale", "shift"]) {
      t[`decoder.l${l}.film.${k}.weight`] = { data: vals(cols, 0.2), shape: [cols, 1] };
      t[`decoder.l${l}.film.${k}.bias`] = { data: vals(cols, 0.2).map((v) => v + (k === "scale" ? 1 : 0)), shape: [cols] };
    }
    dense(`decoder.l${l}.linear`, rows, cols);
  }
  t["input_stats.mean"] = { data: vals(n, 0.5), shape: [n] };
  t["input_stats.std"] = { data: vals(n, 0.3).map((v) => v + 1), shape: [n] };
  t["output_stats.mean"] = { data: vals(o, 0.5), shape: [o] };
  t["output_stats.std"] = { data: vals(o, 0.3).map((v) => v + 1), shape: [o] };
  t["time_stats.mean"] = { data: Float32Array.of(0.25), shape: [1] };
  t["time_stats.std"] = { data: Float32Array.of(0.15), shape: [1] };
  t["timing"] = { data: Float32Array.from({ length: S }, (_, i) => (i / (S - 1)) * 0.5), shape: [S] };
  const half = new Set(Object.keys(t).filter((k) => k.endsWith(".weight") && !k.includes("film")));
  const { weights, table } = weightFile(t, half);
  const manifest: NetManifest = { model: { kind: "codebook", ...SMALL }, tensors: table, licence: { name: "test net", licence: "MIT", credit: "seeded in the test" } };
  return { manifest, weights, t };
}

/** A plain double precision reference written from the architecture description. */
function reference(t: Record<string, { data: Float32Array }>, input: Float32Array): Float64Array {
  const { latent: h, group, iterations, frames: S, output: o } = SMALL;
  const d = (k: string) => t[k]!.data;
  const lin = (k: string, x: ArrayLike<number>, rows: number, bias = true) => {
    const w = d(`${k}.weight`);
    const cols = x.length;
    return Float64Array.from({ length: rows }, (_, r) => {
      let s = bias ? d(`${k}.bias`)[r]! : 0;
      for (let i = 0; i < cols; i++) s += w[r * cols + i]! * x[i]!;
      return s;
    });
  };
  const elu = (v: Float64Array) => v.map((x) => (x > 0 ? x : Math.exp(x) - 1));
  const soft = (v: Float64Array) => {
    for (let g = 0; g < v.length; g += group) {
      const m = Math.max(...v.slice(g, g + group));
      let s = 0;
      for (let i = 0; i < group; i++) s += Math.exp(v[g + i]! - m);
      for (let i = 0; i < group; i++) v[g + i] = Math.exp(v[g + i]! - m) / s;
    }
    return v;
  };
  const x = Float64Array.from(input, (v, i) => (v - d("input_stats.mean")[i]!) / d("input_stats.std")[i]!);
  const mlp = (net: string, z: ArrayLike<number>) => soft(lin(`${net}.l3`, elu(lin(`${net}.l2`, elu(lin(`${net}.l1`, z, h)), h)), h));
  let code = mlp("estimator", x);
  for (let k = 0; k < iterations; k++) code = mlp("denoiser", [...code, ...x]);
  const cat = [...code, ...x];
  const out = new Float64Array(S * o);
  for (let f = 0; f < S; f++) {
    const tt = (d("timing")[f]! - 0.25) / 0.15;
    const film = (l: number, z: ArrayLike<number>) => Array.from(z, (v, i) => (d(`decoder.l${l}.film.scale.weight`)[i]! * tt + d(`decoder.l${l}.film.scale.bias`)[i]!) * v + d(`decoder.l${l}.film.shift.weight`)[i]! * tt + d(`decoder.l${l}.film.shift.bias`)[i]!);
    const y1 = elu(lin("decoder.l1.linear", film(1, cat), h));
    const y2 = elu(lin("decoder.l2.linear", film(2, y1), h));
    const y3 = lin("decoder.l3.linear", film(3, y2), o);
    for (let k = 0; k < o; k++) out[f * o + k] = y3[k]! * d("output_stats.std")[k]! + d("output_stats.mean")[k]!;
  }
  return out;
}

const maxDiff = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i]! - b[i]!));
  return m;
};

describe("runtime", () => {
  it("wasm reproduces the native golden trace bit for bit", () => {
    expect(Array.from(goldenTrace(golden.seed))).toEqual(golden.values);
  });

  it("decodes every half the same in JavaScript and in wasm", () => {
    const all = Uint16Array.from({ length: 65536 }, (_, i) => i);
    const w = wasm.f16ToF32(all);
    for (let h = 0; h < 65536; h++) {
      const js = halfToFloat(h);
      if (Number.isNaN(js)) expect(Number.isNaN(w[h]!)).toBe(true);
      else expect(w[h]).toBe(js);
    }
  });

  it("the codebook net matches a double precision reference", () => {
    const { manifest, weights, t } = smallCodebook(7);
    const r = mulberry(8);
    for (const accum of ["f64", "f32"] as const) {
      const m = createCpuModel(manifest, weights, accum);
      for (let k = 0; k < 4; k++) {
        const x = Float32Array.from({ length: SMALL.input }, () => (r() - 0.5) * 3);
        const got = m.run(x);
        expect(got.length).toBe(SMALL.frames * SMALL.output);
        expect(maxDiff(got, reference(t, x))).toBeLessThan(accum === "f64" ? 2e-6 : 5e-5);
        // fewer frames gives the same leading frames
        expect(Array.from(m.run(x, 2))).toEqual(Array.from(got.slice(0, 2 * SMALL.output)));
      }
      m.dispose();
    }
  });

  it("an mlp with stats matches a reference", () => {
    const r = mulberry(3);
    const vals = (n: number, s: number) => Float32Array.from({ length: n }, () => (r() - 0.5) * 2 * s);
    const dims = [5, 8, 3];
    const t: Record<string, { data: Float32Array; shape: number[] }> = {
      "layer0.weight": { data: vals(40, 0.6), shape: [8, 5] },
      "layer0.bias": { data: vals(8, 0.1), shape: [8] },
      "layer1.weight": { data: vals(24, 0.6), shape: [3, 8] },
      "layer1.bias": { data: vals(3, 0.1), shape: [3] },
      "input_stats.mean": { data: vals(5, 1), shape: [5] },
      "input_stats.std": { data: vals(5, 0.2).map((v) => v + 1), shape: [5] },
      "output_stats.mean": { data: vals(3, 1), shape: [3] },
      "output_stats.std": { data: vals(3, 0.2).map((v) => v + 1), shape: [3] },
    };
    const { weights, table } = weightFile(t, new Set(["layer0.weight"]));
    const manifest: NetManifest = { model: { kind: "mlp", prefix: "layer", dims, activations: ["relu", "none"], stats: true }, tensors: table, licence: { name: "test mlp", licence: "MIT", credit: "seeded" } };
    const m = createCpuModel(manifest, weights);
    const x = vals(5, 2);
    const z = Array.from(x, (v, i) => (v - t["input_stats.mean"]!.data[i]!) / t["input_stats.std"]!.data[i]!);
    const h = Array.from({ length: 8 }, (_, o) => Math.max(0, t["layer0.bias"]!.data[o]! + z.reduce((s, v, i) => s + v * t["layer0.weight"]!.data[o * 5 + i]!, 0)));
    const y = Array.from({ length: 3 }, (_, o) => (t["layer1.bias"]!.data[o]! + h.reduce((s, v, i) => s + v * t["layer1.weight"]!.data[o * 8 + i]!, 0)) * t["output_stats.std"]!.data[o]! + t["output_stats.mean"]!.data[o]!);
    expect(maxDiff(m.run(x), y)).toBeLessThan(2e-6);
    m.dispose();
  });

  it("names a missing tensor and a short weight file", () => {
    const { manifest, weights } = smallCodebook(1);
    const broken = { ...manifest, tensors: { ...manifest.tensors } };
    delete broken.tensors["denoiser.l2.bias"];
    expect(() => createCpuModel(broken, weights)).toThrow(/denoiser\.l2\.bias/);
    expect(() => createCpuModel(manifest, weights.slice(0, 64))).toThrow(/runs past the end/);
  });

  it("steps down from webgpu to the cpu and from the worker to the page, saying why", async () => {
    const { manifest, weights } = smallCodebook(2);
    const lines: string[] = [];
    const s = await createSession(manifest, weights, { onNotice: (l) => lines.push(l) });
    expect(s.backend).toBe("wasm-simd");
    expect(s.where).toBe("page");
    expect(lines).toContain("no webgpu adapter. the network runs on cpu.");
    expect(lines).toContain("blob workers are refused here. the network runs in the page at a lower rate.");
    expect(lines.filter((l) => l === licenceNotice(manifest.licence))).toHaveLength(1);
    const direct = createCpuModel(manifest, weights);
    const x = Float32Array.from({ length: SMALL.input }, (_, i) => Math.sin(i));
    expect(Array.from(await s.run(x))).toEqual(Array.from(direct.run(x)));
    // the caller's buffer is left intact
    expect(weights.byteLength).toBeGreaterThan(0);
    s.dispose();
    direct.dispose();
    // the licence line is stated once per weight name
    const again: string[] = [];
    (await createSession(manifest, weights, { prefer: ["wasm-simd"], worker: false, onNotice: (l) => again.push(l) })).dispose();
    expect(again).toHaveLength(0);
  });

  it("checks a sha-256 when one is given", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
    const hash = await sha256Hex(bytes);
    expect(hash).toBe("9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a");
    await expect(readWeights(bytes, { sha256: hash })).resolves.toBe(bytes);
    await expect(readWeights(bytes, { sha256: "00".repeat(32) })).rejects.toThrow(/sha-256 mismatch/);
  });
});

// ---------- parity with the legacy port, on the owner's local weights ----------

const NN_DIR = process.env["HB_QUADRUPED_DIR"] ?? join(here, "../../../../web-ai-knowledge/sources/hackle_pack/nn");
const LEGACY = join(here, "golden/quadruped-legacy.json");
const haveWeights = existsSync(join(NN_DIR, "quadruped.bin")) && existsSync(LEGACY);

describe.skipIf(!haveWeights)("quadruped weights (local, CC BY-NC 4.0, not in git)", () => {
  const read = () => {
    const file = JSON.parse(readFileSync(join(NN_DIR, "quadruped.json"), "utf8")) as CodebookFile;
    const b = readFileSync(join(NN_DIR, "quadruped.bin"));
    return { file, weights: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer };
  };

  it("matches the legacy port within 1e-5 on the seeded inputs", () => {
    const { file, weights } = read();
    const legacy = JSON.parse(readFileSync(LEGACY, "utf8")) as { outputs: number[][] };
    const manifest = codebookManifest(file);
    const inputs = parityInputs(file.model.input_dim);
    const report: string[] = [];
    for (const accum of ["f64", "f32"] as const) {
      const m = createCpuModel(manifest, weights, accum);
      let worst = 0;
      let ms = 0;
      inputs.forEach((x, k) => {
        const t0 = performance.now();
        const y = m.run(x);
        ms = Math.max(ms, performance.now() - t0);
        worst = Math.max(worst, maxDiff(y, legacy.outputs[k]!));
      });
      report.push(`${accum}: max abs diff ${worst.toExponential(2)}, worst run ${ms.toFixed(1)} ms (measured)`);
      if (accum === "f64") expect(worst).toBeLessThan(1e-5);
      m.dispose();
    }
    console.info(`parity over ${inputs.length} inputs: ${report.join("; ")}`);
  });

  it("drives a dog root at the commanded speed in real time", async () => {
    const { file, weights } = read();
    const bind = JSON.parse(readFileSync(join(NN_DIR, "bind.json"), "utf8")) as number[][];
    const g = await loadQuadrupedGait({ manifest: file, weights, bind, session: { worker: false, onNotice: () => {} } });
    const dt = 1 / 30;
    const z0 = g.root.z;
    let finite = true;
    // time scale 1: one sim frame per 33 ms of wall time
    for (let f = 0; f < 120; f++) {
      g.update(dt, { speed: 1.0, turnRate: 0 });
      finite &&= g.pose().positions.every(Number.isFinite);
      await new Promise((r) => setTimeout(r, 33));
    }
    const h = g.health();
    console.info(`real weights, in page: inference ${h.inferenceMs.toFixed(0)} ms, stale ${h.staleSeconds.toFixed(2)} s, root moved ${(g.root.z - z0).toFixed(2)} m in 4 s, guidance ${g.guidance} (measured)`);
    expect(finite).toBe(true);
    expect(g.guidance).toBe("Walk");
    expect(h.ok).toBe(true);
    // 4 s at 1 m/s, the first fraction of a second spent starting (computed bound)
    expect(g.root.z - z0).toBeGreaterThan(2.8);
    expect(g.root.z - z0).toBeLessThan(4.4);
    g.dispose();
  }, 60000);
});

// ---------- the gait host against a scripted network ----------

const NB = 5;
const SEQ = 16;

function fakeFile(): CodebookFile {
  const names = ["Hips", "Spine", "Head", "LeftFoot", "RightFoot"];
  return {
    model: { input_dim: NB * 6 + SEQ * 6 + NB * 3, output_dim: 3 + NB * 12 + 4, latent_dim: 8, codebook_channels: 2, codebook_dims: 4, sequence_length: SEQ, sequence_window: 0.5, denoiser_iterations: 1 },
    skeleton: { bone_names: names, parent_names: [null, "Hips", "Spine", "Hips", "Hips"], bone_count: NB },
    control: {
      sequence_length: SEQ, sequence_window: 0.5, prediction_fps: 10, sequence_fps: 30, min_timescale: 1, max_timescale: 1.5,
      synchronization_sensitivity: 5, timescale_sensitivity: 5, contact_power: 3, contact_threshold: 2 / 3, trajectory_correction: 0.33,
      locomotion_modes: { walk: 0.7, pace: 1.2, trot: 2, canter: 4 }, pid: { kp: 2, ki: 0.03, kd: 0 }, input_deadzone: 0.25, action_trigger_speed_max: 0.5,
    },
    guidances: ["Idle", "Walk", "Trot"],
    bin: {},
  };
}

const BIND: number[][] = [
  [0, 0.45, 0],
  [0, 0.47, 0.15],
  [0, 0.55, 0.35],
  [0.08, 0.02, -0.15],
  [-0.08, 0.02, -0.15],
].map(([x, y, z]) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x!, y!, z!, 1]);

/**
 * A scripted network: it reads the requested trajectory from its input
 * and returns a sequence that follows it, with a 2 Hz contact pattern.
 * Replies wait for `step()` calls, so latency and stalls are in sim time.
 */
class ScriptedNet implements NetSession {
  readonly backend = "wasm-simd" as const;
  readonly where = "worker" as const;
  lastMs = 40;
  stalled = false;
  latencyFrames = 2;
  simTime = 0;
  private queue: { due: number; ok: (o: Float32Array) => void; out: Float32Array }[] = [];
  private frame = 0;
  run(input: Float32Array, frames = SEQ): Promise<Float32Array> {
    const O = 3 + NB * 12 + 4;
    const out = new Float32Array(frames * O);
    const t = NB * 6;
    // last trajectory sample: position, direction, velocity in the root frame
    const vx = input[t + 64 + (SEQ - 1) * 2]!;
    const vz = input[t + 64 + (SEQ - 1) * 2 + 1]!;
    const dirX = input[t + 32 + (SEQ - 1) * 2]!;
    const dirZ = input[t + 32 + (SEQ - 1) * 2 + 1]!;
    const turn = (Math.atan2(dirX, dirZ) * 180) / Math.PI / (SEQ - 1);
    for (let f = 0; f < frames; f++) {
      let p = f * O;
      out[p++] = vx / 30;
      out[p++] = turn;
      out[p++] = vz / 30;
      for (let i = 0; i < NB; i++) out.set([BIND[i]![12]!, BIND[i]![13]!, BIND[i]![14]!], p + i * 3);
      p += NB * 3;
      for (let i = 0; i < NB; i++) out.set([0, 0, 1], p + i * 3);
      p += NB * 3;
      for (let i = 0; i < NB; i++) out.set([0, 1, 0], p + i * 3);
      p += NB * 3;
      p += NB * 3;
      const moving = Math.hypot(vx, vz) > 0.1;
      const ph = (this.simTime + f / 30) * 2;
      for (let k = 0; k < 4; k++) out[p + k] = !moving ? 1 : (ph + (k === 0 || k === 3 ? 0 : 0.5)) % 1 < 0.6 ? 1 : 0;
    }
    return new Promise((ok) => this.queue.push({ due: this.frame + this.latencyFrames, ok, out }));
  }
  /** One sim frame: replies that are due arrive. */
  async step(dt: number): Promise<void> {
    this.frame++;
    this.simTime += dt;
    if (!this.stalled) {
      const due = this.queue.filter((q) => q.due <= this.frame);
      this.queue = this.queue.filter((q) => q.due > this.frame);
      for (const q of due) q.ok(q.out);
    }
    await Promise.resolve();
    await Promise.resolve();
  }
  dispose(): void {}
}

function fakeGait(opts = {}) {
  const net = new ScriptedNet();
  const file = fakeFile();
  const guidance = { Idle: new Float32Array(NB * 3), Walk: new Float32Array(NB * 3).fill(0.5), Trot: new Float32Array(NB * 3).fill(1) };
  return { net, g: new CodebookGait(net, { file, bind: BIND, guidance }, opts) };
}

async function drive(g: CodebookGait, net: ScriptedNet, seconds: number, cmd: GaitCommand, dt = 1 / 60, each?: (f: number) => void) {
  const n = Math.round(seconds / dt);
  for (let f = 0; f < n; f++) {
    g.update(dt, cmd);
    each?.(f);
    await net.step(dt);
  }
}

describe("codebook gait host", () => {
  it("reports no prediction, then healthy, then stale when replies stop", async () => {
    const { net, g } = fakeGait();
    expect(g.health()).toMatchObject({ ok: false, reason: "no prediction yet" });
    await drive(g, net, 0.5, { speed: 1, turnRate: 0 });
    expect(g.health().ok).toBe(true);
    expect(g.health().staleSeconds).toBeLessThan(0.2);
    net.stalled = true;
    await drive(g, net, 0.4, { speed: 1, turnRate: 0 });
    const h = g.health();
    expect(h.ok).toBe(false);
    expect(h.staleSeconds).toBeGreaterThan(0.3);
    expect(h.reason).toMatch(/s old$/);
  });

  it("counts frames slower than 1/15 s", async () => {
    const { net, g } = fakeGait();
    await drive(g, net, 0.5, { speed: 1, turnRate: 0 });
    for (let k = 0; k < 3; k++) {
      g.update(0.1, { speed: 1, turnRate: 0 });
      await net.step(0.1);
    }
    expect(g.health()).toMatchObject({ slowFrames: 3, ok: false, reason: "frames slower than 1/15 s" });
  });

  it("reaches the commanded speed and keeps the root free of pops when sequences land", async () => {
    const { net, g } = fakeGait();
    let worstJerk = 0;
    let last: RootMotion | null = null;
    let lastV = 0;
    const dt = 1 / 60;
    await drive(g, net, 4, { speed: 1.2, turnRate: 0 }, dt, (f) => {
      const r: RootMotion = { ...g.root, speed: 0, turnRate: 0 };
      if (last && f > 120) {
        const v = Math.hypot(r.x - last.x, r.z - last.z) / dt;
        worstJerk = Math.max(worstJerk, Math.abs(v - lastV));
        lastV = v;
      } else if (last) lastV = Math.hypot(r.x - last.x, r.z - last.z) / dt;
      last = r;
    });
    const speed = Math.hypot(g.root.x, g.root.z) / 4;
    expect(g.motorState().source).toBe("neural");
    expect(Math.abs(g.update(dt, { speed: 1.2, turnRate: 0 }).speed - 1.2)).toBeLessThan(0.12);
    expect(speed).toBeGreaterThan(0.8);
    // speed change between frames after the first two seconds, m/s per frame (computed)
    expect(worstJerk).toBeLessThan(0.05);
    expect(g.guidance).toBe("Pace");
  });

  it("turns in place with the walk guidance and no root travel", async () => {
    const { net, g } = fakeGait();
    await drive(g, net, 3, { speed: 0, turnRate: 1.0 });
    expect(g.turningInPlace).toBe(true);
    expect(g.guidance).toBe("Walk");
    expect(Math.hypot(g.root.x, g.root.z)).toBeLessThan(0.02);
    expect(Math.abs(g.root.yaw)).toBeGreaterThan(1.0);
    const { net: n2, g: g2 } = fakeGait({ turnInPlace: false });
    await drive(g2, n2, 1, { speed: 0, turnRate: 1.0 });
    expect(g2.turningInPlace).toBe(false);
    expect(g2.capabilities.turnInPlace).toBe(false);
  });

  it("coasts past the end of a sequence with the velocity halving every 0.15 s", async () => {
    const { net, g } = fakeGait({ decodeFrames: 16 });
    await drive(g, net, 2, { speed: 1.5, turnRate: 0 });
    net.stalled = true;
    // play out the last sequence (0.5 s window at timescale >= 1)
    await drive(g, net, 0.55, { speed: 1.5, turnRate: 0 });
    const v0 = g.update(1 / 60, { speed: 1.5, turnRate: 0 }).speed;
    await drive(g, net, 0.15 - 1 / 60, { speed: 1.5, turnRate: 0 });
    const v1 = g.update(1 / 60, { speed: 1.5, turnRate: 0 }).speed;
    expect(v0).toBeGreaterThan(0.3);
    expect(v1 / v0).toBeGreaterThan(0.45);
    expect(v1 / v0).toBeLessThan(0.55);
  });

  it("fills the motor state from predicted contacts", async () => {
    const { net, g } = fakeGait();
    await drive(g, net, 5, { speed: 1.2, turnRate: 0 });
    const m = g.motorState();
    expect(m.source).toBe("neural");
    // the scripted contacts cycle at 2 Hz
    expect(Math.abs(m.strideFrequency - 2)).toBeLessThan(0.2);
    expect(m.contacts).toHaveLength(4);
  });

  it("decodes only the frames used before the next request", async () => {
    const { net, g } = fakeGait();
    const asked: number[] = [];
    const run = net.run.bind(net);
    net.run = (x, frames) => {
      asked.push(frames ?? SEQ);
      return run(x, frames);
    };
    await drive(g, net, 1, { speed: 1, turnRate: 0 });
    // (0.1 s + 40 ms) at timescale 1.5 is 6.3 frames at 30 fps, so 7 plus 2 (computed)
    expect(asked.every((f) => f === 9)).toBe(true);
  });
});

describe("neural fallback", () => {
  class Cpg implements RootedBackend {
    readonly capabilities = { turnInPlace: true, minStopDistance: 0.05, headPitchBias: 0 };
    root: RootMotion = { x: 0, z: 0, yaw: 0, speed: 0, turnRate: 0 };
    update(dt: number, cmd: GaitCommand): RootMotion {
      this.root.yaw += cmd.turnRate * dt;
      this.root.x += Math.sin(this.root.yaw) * cmd.speed * dt;
      this.root.z += Math.cos(this.root.yaw) * cmd.speed * dt;
      return { ...this.root, speed: cmd.speed, turnRate: cmd.turnRate };
    }
    motorState(): MotorState {
      return { source: "procedural", phase: 0, duty: 0.6, strideFrequency: 1, contacts: [true, true, true, true] };
    }
  }

  it("hands over to the procedural gait when stale and holds it two seconds", async () => {
    const { net, g } = fakeGait();
    const switches: [string, string, number][] = [];
    let t = 0;
    const gap: number[] = [];
    const fb: NeuralFallback = new NeuralFallback(g, new Cpg(), {
      onSwitch: (to, why) => {
        switches.push([to, why, t]);
        if (to === "procedural") gap.push(Math.hypot(fb.cpg.root.x - g.root.x, fb.cpg.root.z - g.root.z));
      },
    });
    const dt = 1 / 60;
    const run = async (s: number) => {
      for (let f = 0; f < Math.round(s / dt); f++) {
        fb.update(dt, { speed: 1, turnRate: 0 });
        t += dt;
        await net.step(dt);
      }
    };
    expect(fb.motorState().source).toBe("procedural");
    await run(0.5);
    expect(fb.active).toBe("neural");
    expect(fb.motorState().source).toBe("neural");
    net.stalled = true;
    await run(0.5);
    expect(fb.active).toBe("procedural");
    expect(switches[1]![0]).toBe("procedural");
    expect(switches[1]![1]).toMatch(/s old/);
    // the procedural root starts where the neural root was
    expect(gap[0]).toBe(0);
    net.stalled = false;
    const handover = switches[1]![2];
    await run(1.5);
    expect(fb.active).toBe("procedural");
    await run(1.0);
    expect(fb.active).toBe("neural");
    expect(switches[2]![2] - handover).toBeGreaterThanOrEqual(2 - 1e-9);
  });
});
