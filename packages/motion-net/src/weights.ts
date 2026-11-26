// Weight loading: a JSON manifest and a flat little endian blob. Either
// part can come from a URL, an ArrayBuffer (or view), or a File or Blob.
// Every tensor is checked against the dimensions before anything runs.
import { BONES, BONE_COUNT, STYLES, type StyleLabel } from "./layout.js";

/** The licence line of the network weights, stated on the first load in a page. */
export const WEIGHT_LICENCE =
  "motion-net weights: cc by-nc 4.0, paul starke and sebastian starke, meta, ai4animationpy. fetched at run time, never bundled, not for commercial use.";

/** One public copy of the weights, pinned to a commit. Configuration only. */
export const UPSTREAM = {
  manifest: "https://raw.githubusercontent.com/sweriko/ai4anim-webgpu/b539455f849f284a1e814eb11ab649eb594319dc/public/quadruped.json",
  bin: "https://raw.githubusercontent.com/sweriko/ai4anim-webgpu/b539455f849f284a1e814eb11ab649eb594319dc/public/quadruped.bin",
  /** SHA-256 of that binary, computed from a downloaded copy. */
  binSha256: "9568debf4a41da54f62d19bd7a29fbaf7dcc34c32d4ee472ab8560caefbcb372",
  /** Bytes of that binary (vendor). */
  binBytes: 17_704_644,
} as const;

/** Where a weight part comes from: a URL to fetch, bytes, or a File or Blob. */
export type Source = URL | string | ArrayBuffer | ArrayBufferView | Blob;

/** The storage type of one tensor in the binary. */
export type Dtype = "f16" | "f32";

/** Where one tensor sits in the binary: byte offset, value count, shape and dtype. */
export interface TensorEntry {
  offset: number;
  count: number;
  shape: number[];
  dtype: Dtype;
}

/** The JSON manifest that describes the network and every tensor in the binary. */
export interface Manifest {
  model: {
    input_dim: number;
    output_dim: number;
    latent_dim: number;
    codebook_channels: number;
    codebook_dims: number;
    sequence_length: number;
    denoiser_iterations: number;
    [k: string]: unknown;
  };
  skeleton: { bone_names: string[]; parent_names: (string | null)[]; [k: string]: unknown };
  guidances: string[];
  bin: Record<string, TensorEntry>;
  [k: string]: unknown;
}

/** The network dimensions read from the manifest. */
export interface Dims {
  dIn: number;
  dOut: number;
  hidden: number;
  group: number;
  frames: number;
  passes: number;
}

/** Checked weights, ready for `Predictor.create`. */
export interface Weights {
  manifest: Manifest;
  bin: ArrayBuffer;
  dims: Dims;
  /** Tensors the network reads, in a fixed order. */
  tensors: { key: string; dtype: Dtype; offset: number; count: number }[];
  /** Style poses, 81 values each, as stored. */
  styles: Record<StyleLabel, Float32Array>;
  inputMean: Float32Array;
  inputStd: Float32Array;
  sha256: string | null;
  licence: string;
}

/** Options of `loadWeights`: the two parts, an optional SHA-256 and progress and licence callbacks. */
export interface LoadOptions {
  manifest: Source | Manifest;
  bin: Source;
  /** Expected SHA-256 of the binary in hex; checked when given. */
  sha256?: string;
  /** Receives the licence line on the first load in this page; console.info otherwise. */
  onLicence?: (text: string) => void;
  /** Download progress for URL sources, bytes so far and total (0 when unknown). */
  onProgress?: (loaded: number, total: number) => void;
  fetch?: typeof fetch;
}

let licenceShown = false;

/** The tensors the network reads and the dtype the format fixes for each. */
export function requiredTensors(d: Dims): { key: string; dtype: Dtype; shape: number[] }[] {
  const c = d.hidden + d.dIn;
  const h = d.hidden;
  const out: { key: string; dtype: Dtype; shape: number[] }[] = [];
  const lin = (p: string, rows: number, cols: number) => {
    out.push({ key: `${p}.weight`, dtype: "f16", shape: [rows, cols] });
    out.push({ key: `${p}.bias`, dtype: "f32", shape: [rows] });
  };
  lin("estimator.l1", h, d.dIn);
  lin("estimator.l2", h, h);
  lin("estimator.l3", h, h);
  lin("denoiser.l1", h, c);
  lin("denoiser.l2", h, h);
  lin("denoiser.l3", h, h);
  lin("decoder.l1.linear", h, c);
  lin("decoder.l2.linear", h, h);
  lin("decoder.l3.linear", d.dOut, h);
  [c, h, h].forEach((n, i) => {
    for (const part of ["scale", "shift"]) {
      out.push({ key: `decoder.l${i + 1}.film.${part}.weight`, dtype: "f32", shape: [n, 1] });
      out.push({ key: `decoder.l${i + 1}.film.${part}.bias`, dtype: "f32", shape: [n] });
    }
  });
  out.push({ key: "input_stats.mean", dtype: "f32", shape: [d.dIn] }, { key: "input_stats.std", dtype: "f32", shape: [d.dIn] });
  out.push({ key: "output_stats.mean", dtype: "f32", shape: [d.dOut] }, { key: "output_stats.std", dtype: "f32", shape: [d.dOut] });
  out.push({ key: "time_stats.mean", dtype: "f32", shape: [1] }, { key: "time_stats.std", dtype: "f32", shape: [1] });
  out.push({ key: "timing", dtype: "f32", shape: [d.frames] });
  return out;
}

const fail = (msg: string): never => {
  throw new Error(`motion-net: ${msg}`);
};

/** Dimensions from the manifest `model` section, checked for consistency. */
export function dimsOf(m: Manifest): Dims {
  const md = m.model ?? fail("manifest has no model section");
  const num = (k: keyof Manifest["model"]) => {
    const v = md[k];
    if (typeof v !== "number" || !Number.isInteger(v) || v <= 0) fail(`model.${String(k)} is missing or not a positive integer`);
    return v as number;
  };
  const d: Dims = {
    dIn: num("input_dim"),
    dOut: num("output_dim"),
    hidden: num("latent_dim"),
    group: num("codebook_dims"),
    frames: num("sequence_length"),
    passes: num("denoiser_iterations"),
  };
  if (num("codebook_channels") * d.group !== d.hidden) fail("codebook_channels times codebook_dims is not latent_dim");
  return d;
}

/** Checks a manifest against a binary of `binBytes` bytes. Returns the problems, empty when fine. */
export function validate(m: Manifest, binBytes: number): string[] {
  const errs: string[] = [];
  let d: Dims;
  try {
    d = dimsOf(m);
  } catch (e) {
    return [(e as Error).message];
  }
  const bin = m.bin ?? {};
  const size = { f16: 2, f32: 4 } as const;
  const check = (key: string, dtype: Dtype, shape: number[]) => {
    const t = bin[key];
    if (!t) return void errs.push(`tensor ${key} is missing`);
    if (t.dtype !== dtype) errs.push(`tensor ${key} is ${t.dtype}, expected ${dtype}`);
    if (!Array.isArray(t.shape) || t.shape.join(",") !== shape.join(",")) errs.push(`tensor ${key} has shape [${t.shape}], expected [${shape}]`);
    const n = shape.reduce((a, b) => a * b, 1);
    if (t.count !== n) errs.push(`tensor ${key} has ${t.count} elements, expected ${n}`);
    if (t.offset % 4 !== 0) errs.push(`tensor ${key} offset ${t.offset} is not a multiple of 4`);
    const s = size[t.dtype as Dtype];
    if (s && t.offset + t.count * s > binBytes) errs.push(`tensor ${key} runs past the end of the ${binBytes} byte binary`);
  };
  for (const t of requiredTensors(d)) check(t.key, t.dtype, t.shape);
  const names = m.skeleton?.bone_names ?? [];
  if (names.length !== BONE_COUNT || names.some((n, i) => n !== BONES[i])) errs.push("skeleton.bone_names differ from the 27 bone order");
  if (d.dIn === 339) for (const s of STYLES) check(`guidance.${s}`, "f32", [27, 3]);
  return errs;
}

async function bytesOf(src: Source, opts: LoadOptions): Promise<ArrayBuffer> {
  if (src instanceof ArrayBuffer) return src;
  if (ArrayBuffer.isView(src)) return src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength) as ArrayBuffer;
  if (typeof Blob !== "undefined" && src instanceof Blob) return src.arrayBuffer();
  const f = opts.fetch ?? globalThis.fetch;
  let res: Response;
  try {
    res = await f(String(src));
  } catch (e) {
    return fail(`could not fetch ${String(src)}: ${(e as Error).message}`);
  }
  if (!res.ok) fail(`fetch ${String(src)} answered ${res.status}`);
  // with a content-encoding the length header is the compressed size; report no total
  const total = res.headers.get("content-encoding") ? 0 : Number(res.headers.get("content-length") ?? 0);
  if (!opts.onProgress || !res.body) return res.arrayBuffer();
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    loaded += value.byteLength;
    opts.onProgress(loaded, total);
  }
  const out = new Uint8Array(loaded);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.byteLength;
  }
  return out.buffer;
}

/** The SHA-256 of a buffer as lowercase hex. */
export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

function f32At(bin: ArrayBuffer, t: TensorEntry): Float32Array {
  // offsets are multiples of 4, so an aligned view is safe; copy so the result outlives the blob
  return new Float32Array(bin, t.offset, t.count).slice();
}

/** Fetches or reads both parts, checks them, and states the licence once per page. */
export async function loadWeights(opts: LoadOptions): Promise<Weights> {
  if (!licenceShown) {
    licenceShown = true;
    (opts.onLicence ?? ((t: string) => console.info(t)))(WEIGHT_LICENCE);
  }
  let manifest: Manifest;
  const ms = opts.manifest;
  if (typeof ms === "object" && ms !== null && "bin" in ms && "model" in ms) manifest = ms as Manifest;
  else {
    const text = new TextDecoder().decode(await bytesOf(ms as Source, opts));
    try {
      manifest = JSON.parse(text) as Manifest;
    } catch {
      return fail("the manifest is not JSON");
    }
  }
  const bin = await bytesOf(opts.bin, opts);
  let sha: string | null = null;
  if (opts.sha256) {
    sha = await sha256Hex(bin);
    if (sha !== opts.sha256.toLowerCase()) fail(`sha-256 of the binary is ${sha}, expected ${opts.sha256}`);
  }
  const errs = validate(manifest, bin.byteLength);
  if (errs.length) fail(`the weights do not match the format: ${errs.slice(0, 4).join("; ")}${errs.length > 4 ? `; and ${errs.length - 4} more` : ""}`);
  const dims = dimsOf(manifest);
  const tensors = requiredTensors(dims).map((t) => {
    const e = manifest.bin[t.key]!;
    return { key: t.key, dtype: t.dtype, offset: e.offset, count: e.count };
  });
  const styles = Object.fromEntries(STYLES.map((s) => [s, manifest.bin[`guidance.${s}`] ? f32At(bin, manifest.bin[`guidance.${s}`]!) : new Float32Array(81)])) as Record<StyleLabel, Float32Array>;
  return {
    manifest,
    bin,
    dims,
    tensors,
    styles,
    inputMean: f32At(bin, manifest.bin["input_stats.mean"]!),
    inputStd: f32At(bin, manifest.bin["input_stats.std"]!),
    sha256: sha,
    licence: WEIGHT_LICENCE,
  };
}
