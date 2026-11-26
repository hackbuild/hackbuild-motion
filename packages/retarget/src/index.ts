// @hackbuild/retarget: motion between rigs through the normalized humanoid
// space, BVH and VMD readers, and motion analysis.
import { HUMAN_BONES, type HumanBone } from "@hackbuild/rig/bones";
import { assertReady, loadWasm, loadWasmSync, type WasmSource } from "./load.js";
import * as wasm from "./wasm/retarget.js";

export type { WasmSource } from "./load.js";
/** A VRM 1.0 humanoid bone name, re-exported from @hackbuild/rig/bones. */
export type { HumanBone } from "@hackbuild/rig/bones";

const PKG = "@hackbuild/retarget";

/** Loads the wasm core once: from a URL, bytes or a compiled module, or from the inlined copy when you pass nothing. Call it before anything else. */
export async function load(source?: WasmSource): Promise<void> {
  await loadWasm(source);
}

/** Loads the wasm core synchronously from bytes or a compiled module. */
export function loadSync(source: ArrayBuffer | ArrayBufferView | WebAssembly.Module): void {
  loadWasmSync(source);
}

/** Joints with rest transforms; parents come before children. */
export interface Skeleton {
  names: string[];
  /** Parent index per joint, -1 for a root. */
  parents: Int32Array;
  /** Rest translation `x y z` per joint. */
  restT: Float64Array;
  /** Rest rotation `x y z w` per joint. */
  restR: Float64Array;
}

/** Local rotations and translations per frame. */
export interface Clip {
  times: Float64Array;
  /** `frames x joints x 4`. */
  rotations: Float64Array;
  /** `frames x joints x 3`. */
  translations: Float64Array;
  /** 1 for joints whose translation is keyed. */
  moves: Uint8Array;
}

/**
 * The interchange format: per humanoid bone, local rotations in the
 * normalized space (identity rest, +Z forward, left on +X), and hip travel
 * in multiples of hip height.
 */
export interface HumanoidMotion {
  times: Float64Array;
  /** `frames x 4` per keyed bone. */
  rotations: Partial<Record<HumanBone, Float64Array>>;
  /** Hips offset from rest, `frames x 3`, in hip heights. */
  hips?: Float64Array;
}

function fromSkeletal(s: wasm.SkeletalClip): { skeleton: Skeleton; clip: Clip } {
  try {
    return {
      skeleton: { names: s.names(), parents: s.parents(), restT: s.restT(), restR: s.restR() },
      clip: { times: s.times(), rotations: s.rotations(), translations: s.translations(), moves: s.moves() },
    };
  } finally {
    s.free();
  }
}

function toWasmMotion(m: HumanoidMotion): wasm.HumanoidMotion {
  const frames = m.times.length;
  const keyed = new Uint8Array(55);
  const rot = new Float64Array(frames * 55 * 4);
  for (let f = 0; f < frames; f++) for (let b = 0; b < 55; b++) rot[(f * 55 + b) * 4 + 3] = 1;
  HUMAN_BONES.forEach((name, b) => {
    const r = m.rotations[name];
    if (!r) return;
    keyed[b] = 1;
    for (let f = 0; f < frames; f++) rot.set(r.subarray(f * 4, f * 4 + 4), (f * 55 + b) * 4);
  });
  return new wasm.HumanoidMotion(m.times, keyed, rot, m.hips ?? new Float64Array(0));
}

function fromWasmMotion(w: wasm.HumanoidMotion, free = true): HumanoidMotion {
  try {
    const times = w.times();
    const frames = times.length;
    const keyed = w.keyed();
    const rot = w.rotations();
    const rotations: Partial<Record<HumanBone, Float64Array>> = {};
    HUMAN_BONES.forEach((name, b) => {
      if (!keyed[b]) return;
      const r = new Float64Array(frames * 4);
      for (let f = 0; f < frames; f++) r.set(rot.subarray((f * 55 + b) * 4, (f * 55 + b) * 4 + 4), f * 4);
      rotations[name] = r;
    });
    const hips = w.hips();
    return hips.length ? { times, rotations, hips } : { times, rotations };
  } finally {
    if (free) w.free();
  }
}

/** Parses a BVH file. */
export function parseBvh(text: string): { skeleton: Skeleton; clip: Clip } {
  assertReady(PKG);
  return fromSkeletal(wasm.parseBvh(text));
}

/** A parsed VMD file: its skeleton, its clip, the unit in meters and its morph keys. */
export interface VmdMotion {
  skeleton: Skeleton;
  clip: Clip;
  /** Meters per MMD unit; pass to `RetargetRig` as `unit`. */
  unit: number;
  morphs: { name: string; frame: number; weight: number }[];
}

/**
 * Parses a MikuMikuDance VMD file. Bone and morph names are Shift-JIS; the
 * default decoder is `TextDecoder("shift_jis")`, present in browsers and in
 * Node with full ICU.
 */
export function parseVmd(bytes: Uint8Array, decode: (b: Uint8Array) => string = (b) => new TextDecoder("shift_jis").decode(b)): VmdMotion {
  assertReady(PKG);
  const f = wasm.VmdFile.parse(bytes);
  try {
    const names = Array.from({ length: f.nameCount() }, (_, i) => decode(f.nameBytes(i)).trim());
    const m = f.morphs();
    const morphs = [];
    for (let i = 0; i + 2 < m.length; i += 3) morphs.push({ name: names[m[i]!] ?? "", frame: m[i + 1]!, weight: m[i + 2]! });
    return { ...fromSkeletal(f.toClip(names)), unit: 0.08, morphs };
  } finally {
    f.free();
  }
}

/** When the first frame is the better T pose: that frame as the rest and the clip without it. */
export function restFromFirstFrame(skeleton: Skeleton, clip: Clip): { skeleton: Skeleton; clip: Clip } | null {
  assertReady(PKG);
  const r = wasm.restFromFirstFrame(skeleton.names, skeleton.parents, skeleton.restT, skeleton.restR, clip.times, clip.rotations, clip.translations, clip.moves);
  return r ? fromSkeletal(r) : null;
}

/** The 1.70 m reference humanoid as a skeleton with VRM bone names. */
export function referenceSkeleton(): Skeleton {
  assertReady(PKG);
  return fromSkeletal(wasm.referenceSkeleton()).skeleton;
}

/** A mapped and measured skeleton: facing, units, per bone rest alignment. */
export class RetargetRig {
  readonly core: wasm.Rig;
  constructor(
    readonly skeleton: Skeleton,
    opts: { unit?: number } = {},
  ) {
    assertReady(PKG);
    this.core = new wasm.Rig(skeleton.names, skeleton.parents, skeleton.restT, skeleton.restR, opts.unit ?? Number.NaN);
  }
  get unit(): number {
    return this.core.unit();
  }
  get hipsHeight(): number {
    return this.core.hipsHeight();
  }
  /** Humanoid bone per joint, null when unmapped. */
  bones(): (HumanBone | null)[] {
    return Array.from(this.core.bones(), (b) => (b < 0 ? null : HUMAN_BONES[b]!));
  }
  toHumanoid(clip: Clip, opts: { startAtOrigin?: boolean; settle?: boolean } = {}): HumanoidMotion {
    const w = this.core.toHumanoid(clip.times, clip.rotations, clip.translations, clip.moves);
    if (opts.startAtOrigin !== false) w.startAtOrigin();
    if (opts.settle) w.settleOnFloor();
    return fromWasmMotion(w);
  }
  bind(motion: HumanoidMotion): Clip {
    const w = toWasmMotion(motion);
    try {
      return fromSkeletal(this.core.bind(w)).clip;
    } finally {
      w.free();
    }
  }
  /** One pose from `src` (joint world rotations and positions) as this rig's locals. */
  retargetPose(src: RetargetRig, worldR: Float64Array, worldP: Float64Array): { rotations: Float64Array; translations: Float64Array } {
    const o = this.core.retargetPose(src.core, worldR, worldP);
    const n = this.skeleton.names.length;
    return { rotations: o.subarray(0, n * 4), translations: o.subarray(n * 4) };
  }
  dispose(): void {
    this.core.free();
  }
}

/** Retargets `clip` from one skeleton onto another. */
export function retargetClip(src: Skeleton, clip: Clip, dst: Skeleton, opts: { srcUnit?: number; dstUnit?: number } = {}): Clip {
  const a = new RetargetRig(src, opts.srcUnit === undefined ? {} : { unit: opts.srcUnit });
  const b = new RetargetRig(dst, opts.dstUnit === undefined ? {} : { unit: opts.dstUnit });
  try {
    return b.bind(a.toHumanoid(clip));
  } finally {
    a.dispose();
    b.dispose();
  }
}

/** Settles a motion on the floor; returns the shifted motion and the shift in meters. */
export function settleOnFloor(m: HumanoidMotion): { motion: HumanoidMotion; shift: number } {
  assertReady(PKG);
  const w = toWasmMotion(m);
  const shift = w.settleOnFloor();
  return { motion: fromWasmMotion(w), shift };
}

/** What `analyzeMotion` finds in a motion: duration, loop, head pitch, energy and tags. */
export interface MotionFindings {
  duration: number;
  looping: boolean;
  pose: boolean;
  /** Mean head pitch relative to the hips, radians. */
  headPitch: number;
  /** Hand and hip travel per second, in hip heights. */
  energy: number;
  tags: string[];
}

/** Tags a motion by what the body does: wave, squat, nod, spin, walk, dance, idle and more. */
export function analyzeMotion(m: HumanoidMotion): MotionFindings {
  assertReady(PKG);
  const w = toWasmMotion(m);
  try {
    const a = w.analyze();
    const tags = w.tags();
    return { duration: a[0]!, looping: a[1] === 1, pose: a[2] === 1, headPitch: a[3]!, energy: a[4]!, tags: tags ? tags.split(",") : [] };
  } finally {
    w.free();
  }
}

/** The compact binary form (`HBM1`, f32, about 16 bytes per bone per frame). */
export function packMotion(m: HumanoidMotion): Uint8Array {
  assertReady(PKG);
  const w = toWasmMotion(m);
  try {
    return w.pack();
  } finally {
    w.free();
  }
}

/** Reads the compact binary form back into a motion; null when the bytes are not that form. */
export function unpackMotion(bytes: Uint8Array): HumanoidMotion | null {
  assertReady(PKG);
  const w = wasm.HumanoidMotion.unpack(bytes);
  return w ? fromWasmMotion(w) : null;
}

/** End effector target for a limb of another length. */
export function retargetLimb(srcTop: [number, number, number], srcEnd: [number, number, number], srcLength: number, dstTop: [number, number, number], dstLength: number): [number, number, number] {
  assertReady(PKG);
  const o = wasm.retargetLimb(Float64Array.from(srcTop), Float64Array.from(srcEnd), srcLength, Float64Array.from(dstTop), dstLength);
  return [o[0]!, o[1]!, o[2]!];
}

/** A deterministic trace of the core for one seed, compared between the native and wasm builds in tests. */
export function goldenTrace(seed: number): Float64Array {
  assertReady(PKG);
  return wasm.goldenTrace(seed);
}
