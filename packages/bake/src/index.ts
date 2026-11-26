// @hackbuild/bake: GLB optimize, clip packs and the asset lock, on the Rust
// core compiled to wasm. Texture resizing stays on the caller's side: the
// caller's async hook gets each embedded image and returns new bytes, which
// the wasm swaps into the file. Pack decoding and sampling are plain
// TypeScript so a runtime reader does not need the wasm.
import { assertReady, loadWasm, loadWasmSync, type WasmSource } from "./load.js";
import * as wasm from "./wasm/bake.js";

export type { WasmSource } from "./load.js";

const PKG = "@hackbuild/bake";

/** Loads the wasm core once: from a URL, bytes or a compiled module, or from the inlined copy when you pass nothing. Call it before anything else. */
export async function load(source?: WasmSource): Promise<void> {
  await loadWasm(source);
}

/** Loads the wasm core synchronously from bytes or a compiled module. */
export function loadSync(source: ArrayBuffer | ArrayBufferView | WebAssembly.Module): void {
  loadWasmSync(source);
}

const bytesOf = (b: ArrayBuffer | ArrayBufferView): Uint8Array =>
  b instanceof Uint8Array ? b : ArrayBuffer.isView(b) ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : new Uint8Array(b);

// textures

/** What a texture does in its material, which picks its size limit. */
export type TextureRole = "baseColor" | "emissive" | "normal" | "orm" | "other";

/** One embedded image of a GLB: index, role, mime type, size and pixel dimensions. */
export interface TextureInfo {
  image: number;
  role: TextureRole;
  mime: string;
  bytes: number;
  /** From the PNG or JPEG header; null for other formats. */
  width: number | null;
  height: number | null;
}

/** What the texture hook gets: the image facts, its bytes and its size limit. */
export interface TextureRequest extends TextureInfo {
  data: Uint8Array;
  /** The limit for this role in pixels, 0 when none was set. */
  maxSize: number;
}

/** Returns new bytes and their mime type, or null to keep the image. */
export type TextureHook = (t: TextureRequest) => Promise<{ bytes: Uint8Array; mime: string } | null> | { bytes: Uint8Array; mime: string } | null;

/** Lists the embedded images of a GLB with their roles and sizes. */
export function listTextures(glb: ArrayBuffer | ArrayBufferView): TextureInfo[] {
  assertReady(PKG);
  return JSON.parse(wasm.listTextures(bytesOf(glb))) as TextureInfo[];
}

// optimize

/** Options of `optimizeModel`: simplification, texture limits and the resize hook. */
export interface OptimizeOptions {
  /** Share of triangles to keep, 0 to 1. Default 1, no simplification. */
  ratio?: number;
  /** Largest simplification error relative to the mesh extent. Default 0.01. */
  error?: number;
  /** Keep open borders fixed while simplifying. Default true. */
  lockBorder?: boolean;
  /** Longest side per role in pixels, passed to the hook as `maxSize`. */
  textures?: Partial<Record<TextureRole, number>>;
  /** Called for each embedded image; without it textures pass through. */
  resize?: TextureHook;
}

/** What `optimizeModel` changed: bytes, vertices, triangles, textures and skipped primitives. */
export interface OptimizeReport {
  bytesIn: number;
  bytesOut: number;
  verticesIn: number;
  verticesOut: number;
  trianglesIn: number;
  trianglesOut: number;
  primitives: number;
  textures: { image: number; role: TextureRole; bytesIn: number; bytesOut: number; mime: string }[];
  /** Primitives left as they were, with the reason. */
  skipped: string[];
}

const ROLES: TextureRole[] = ["baseColor", "emissive", "normal", "orm", "other"];

function wasmGlb(glb: ArrayBuffer | ArrayBufferView): Uint8Array {
  // copy once: the hook may hold the caller's buffer while wasm reads
  return bytesOf(glb).slice();
}

/** Welds, simplifies and repacks a GLB, swapping in the images your resize hook returns. */
export async function optimizeModel(glb: ArrayBuffer | ArrayBufferView, opts: OptimizeOptions = {}): Promise<{ glb: Uint8Array; report: OptimizeReport }> {
  assertReady(PKG);
  const input = wasmGlb(glb);
  const limits = Uint32Array.from(ROLES.map((r) => opts.textures?.[r] ?? 0));
  const images: number[] = [];
  const lengths: number[] = [];
  const parts: Uint8Array[] = [];
  const mimes: string[] = [];
  if (opts.resize) {
    const list = listTextures(input);
    const views = imageViews(input);
    for (const t of list) {
      const data = views.get(t.image);
      if (!data) continue;
      const out = await opts.resize({ ...t, data, maxSize: opts.textures?.[t.role] ?? 0 });
      if (!out) continue;
      images.push(t.image);
      lengths.push(out.bytes.byteLength);
      parts.push(out.bytes);
      mimes.push(out.mime);
    }
  }
  const joined = new Uint8Array(lengths.reduce((a, b) => a + b, 0));
  let at = 0;
  for (const p of parts) {
    joined.set(p, at);
    at += p.byteLength;
  }
  const r = wasm.optimizeGlb(input, opts.ratio ?? 1, opts.error ?? 0.01, opts.lockBorder ?? true, limits, Uint32Array.from(images), Uint32Array.from(lengths), joined, mimes.join("\n"));
  try {
    return { glb: r.bytes(), report: JSON.parse(r.report()) as OptimizeReport };
  } finally {
    r.free();
  }
}

/** Embedded image bytes by image index, read from the GLB in TypeScript. */
function imageViews(glb: Uint8Array): Map<number, Uint8Array> {
  const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const out = new Map<number, Uint8Array>();
  let at = 12;
  let json: { images?: { bufferView?: number }[]; bufferViews?: { byteOffset?: number; byteLength: number }[] } | null = null;
  let bin: Uint8Array | null = null;
  while (at + 8 <= glb.byteLength) {
    const len = dv.getUint32(at, true);
    const kind = dv.getUint32(at + 4, true);
    const body = glb.subarray(at + 8, at + 8 + len);
    if (kind === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(body));
    else if (kind === 0x004e4942 && !bin) bin = body;
    at += 8 + len;
  }
  if (!json || !bin) return out;
  (json.images ?? []).forEach((im, i) => {
    const v = im.bufferView === undefined ? undefined : json.bufferViews?.[im.bufferView];
    if (v) out.set(i, bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength));
  });
  return out;
}

// clips

/** The rig of a clip set: role names, parents and rest translations. */
export interface Skeleton {
  roles: string[];
  /** Parent index per role, -1 for the root; parents come first. */
  parents: number[];
  /** Rest local translation per role in meters. */
  rest: [number, number, number][];
}

/** One clip to bake: name, loop flag, local rotations and optional root translation. */
export interface SourceClip {
  name: string;
  loop?: boolean;
  /** Local rotations, frame major then role, `x y z w`. */
  q: ArrayLike<number>;
  /** Root local translation per frame; omit for the rest offset. */
  p?: ArrayLike<number>;
}

/** How foot contacts are found: foot roles, height and speed limits and the shortest contact. */
export interface ContactRule {
  feet: string[];
  height: number;
  speed: number;
  minFrames: number;
}

/** Everything `bakeClips` takes: frame rate, skeleton, clips, contact rule and seam limit. */
export interface BakeInput {
  fps: number;
  skeleton: Skeleton;
  clips: SourceClip[];
  contacts?: ContactRule;
  seamLimitDeg?: number;
}

/** Quantization error, seam and contacts of one baked clip. */
export interface ClipReport {
  name: string;
  frames: number;
  maxAngleErrorDeg: number;
  worstRole: string;
  worstFrame: number;
  maxPositionErrorM: number;
  seamAngleDeg: number | null;
  largestStepDeg: number | null;
  seamOk: boolean | null;
  contactFrames: number[];
}

/** One clip in a pack: int16 rotations and root positions and a contact byte per frame. */
export interface PackedClip {
  name: string;
  /** Time of the last frame, (n - 1) / fps. */
  dur: number;
  n: number;
  loop: boolean;
  posScale: number;
  /** int16 quaternion components, value / 32767, frame major then role. */
  q: Int16Array;
  /** int16 root position, value times posScale meters. */
  p: Int16Array;
  /** One byte per frame, bit k set while foot k is down. */
  contacts: Uint8Array;
}

/** A decoded clip pack: frame rate, roles, parents, feet and clips by name. */
export interface ClipPack {
  fps: number;
  roles: string[];
  parents: number[];
  feet: string[];
  clips: Record<string, PackedClip>;
}

/** Bakes clips into the compact HBCP pack and reports error, seams and contacts per clip. */
export function bakeClips(input: BakeInput): { bytes: Uint8Array; pack: ClipPack; report: ClipReport[] } {
  assertReady(PKG);
  const json = JSON.stringify({ ...input, clips: input.clips.map((c) => ({ name: c.name, loop: c.loop ?? false, q: Array.from(c.q), p: Array.from(c.p ?? []) })) });
  const r = wasm.bakeClips(json);
  try {
    const bytes = r.bytes();
    return { bytes, pack: decodePack(bytes), report: JSON.parse(r.report()) as ClipReport[] };
  } finally {
    r.free();
  }
}

/** Reads the HBCP pack format; no wasm needed. */
export function decodePack(buf: ArrayBuffer | ArrayBufferView): ClipPack {
  const b = bytesOf(buf);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let at = 0;
  const need = (n: number) => {
    if (at + n > b.byteLength) throw new Error("bake: the pack ends early");
  };
  const u8 = () => (need(1), dv.getUint8(at++));
  const u16 = () => (need(2), (at += 2), dv.getUint16(at - 2, true));
  const u32 = () => (need(4), (at += 4), dv.getUint32(at - 4, true));
  const f32 = () => (need(4), (at += 4), dv.getFloat32(at - 4, true));
  const str = () => {
    const n = u16();
    need(n);
    at += n;
    return new TextDecoder().decode(b.subarray(at - n, at));
  };
  const i16s = (n: number) => {
    need(n * 2);
    const o = new Int16Array(n);
    for (let i = 0; i < n; i++) o[i] = dv.getInt16(at + i * 2, true);
    at += n * 2;
    return o;
  };
  need(4);
  if (String.fromCharCode(b[0]!, b[1]!, b[2]!, b[3]!) !== "HBCP") throw new Error("bake: no HBCP magic. this is not a clip pack");
  at = 4;
  if (u16() !== 1) throw new Error("bake: unknown pack version");
  const fps = f32();
  const nr = u16();
  const nf = u8();
  const nc = u16();
  const roles = Array.from({ length: nr }, str);
  const parents = Array.from(i16s(nr));
  const feet = Array.from({ length: nf }, str);
  const clips: Record<string, PackedClip> = {};
  for (let c = 0; c < nc; c++) {
    const name = str();
    const dur = f32();
    const n = u32();
    const loop = u8() !== 0;
    const posScale = f32();
    const q = i16s(n * nr * 4);
    const p = i16s(n * 3);
    need(n);
    const contacts = b.slice(at, at + n);
    at += n;
    clips[name] = { name, dur, n, loop, posScale, q, p, contacts };
  }
  return { fps, roles, parents, feet, clips };
}

/**
 * Samples a packed clip at time `t` seconds into `out` (roles times 4
 * quaternion components) with normalized linear blending between frames.
 * Loop clips wrap, others clamp. Returns the root position in meters.
 */
export function sampleClip(pack: ClipPack, clip: PackedClip, t: number, out: Float32Array): [number, number, number] {
  const nr = pack.roles.length;
  const f = t * pack.fps;
  const last = clip.n - 1;
  const x = clip.loop && last > 0 ? ((f % last) + last) % last : Math.min(Math.max(f, 0), last);
  const i0 = Math.floor(x);
  const i1 = Math.min(i0 + 1, last);
  const w = x - i0;
  for (let r = 0; r < nr; r++) {
    const a = (i0 * nr + r) * 4;
    const b = (i1 * nr + r) * 4;
    let l = 0;
    for (let k = 0; k < 4; k++) {
      const v = (clip.q[a + k]! * (1 - w) + clip.q[b + k]! * w) / 32767;
      out[r * 4 + k] = v;
      l += v * v;
    }
    l = Math.sqrt(l) || 1;
    for (let k = 0; k < 4; k++) out[r * 4 + k]! /= l;
  }
  const p = (k: number) => (clip.p[i0 * 3 + k]! * (1 - w) + clip.p[i1 * 3 + k]! * w) * clip.posScale;
  return [p(0), p(1), p(2)];
}

// lock

/** One row of assets.lock.json: path, source, licence, SHA-256, bytes and an optional budget. */
export interface AssetEntry {
  path: string;
  source: string;
  licence: string;
  sha256: string;
  bytes: number;
  budget?: number;
}

/** The SHA-256 of bytes as lowercase hex, computed in the wasm core. */
export function sha256Hex(bytes: ArrayBuffer | ArrayBufferView): string {
  assertReady(PKG);
  return wasm.sha256Hex(bytesOf(bytes));
}

/** A lock row for one file, with its SHA-256 and byte count measured from the bytes. */
export function lockEntry(path: string, bytes: ArrayBuffer | ArrayBufferView, source: string, licence: string, budget?: number): AssetEntry {
  const b = bytesOf(bytes);
  const e: AssetEntry = { path, source, licence, sha256: sha256Hex(b), bytes: b.byteLength };
  if (budget !== undefined) e.budget = budget;
  return e;
}

/** assets.lock.json text, sorted by path. */
export function writeLock(entries: AssetEntry[]): string {
  assertReady(PKG);
  return wasm.writeLock(JSON.stringify(entries));
}

/** Checks files against assets.lock.json: hashes, sizes, budgets, missing licences and licences matching a forbidden substring such as "NC". */
export function checkLock(lockText: string, files: Map<string, Uint8Array> | Record<string, Uint8Array>, forbid: string[] = []): { ok: boolean; failures: string[] } {
  assertReady(PKG);
  const list = files instanceof Map ? [...files.entries()] : Object.entries(files);
  const lengths = Uint32Array.from(list.map(([, b]) => b.byteLength));
  const joined = new Uint8Array(lengths.reduce((a, b) => a + b, 0));
  let at = 0;
  for (const [, b] of list) {
    joined.set(b, at);
    at += b.byteLength;
  }
  return JSON.parse(wasm.checkLock(lockText, list.map(([n]) => n).join("\n"), lengths, joined, forbid.join("\n"))) as { ok: boolean; failures: string[] };
}

// fixtures for tests and demos

/** A deterministic trace of the core for one seed, compared between the native and wasm builds in tests. */
export function goldenTrace(seed: number): Float64Array {
  assertReady(PKG);
  return wasm.goldenTrace(seed);
}

/** A bumpy unindexed grid GLB with a line mesh and a fake 2048 px PNG. */
export function syntheticGlb(seed: number, grid: number): Uint8Array {
  assertReady(PKG);
  return wasm.syntheticGlb(seed, grid);
}

/** A walk loop, a broken loop and a one shot on an eight role leg rig. */
export function syntheticClips(seed: number): BakeInput {
  assertReady(PKG);
  return JSON.parse(wasm.syntheticClips(seed)) as BakeInput;
}
