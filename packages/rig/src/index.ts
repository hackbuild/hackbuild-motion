// @hackbuild/rig: bone name mapper, limb chains, rest analysis, and the
// family's expression and viseme table.
import { HUMAN_BONES, type HumanBone } from "./bones.js";
import { assertReady, loadWasm, loadWasmSync, type WasmSource } from "./load.js";
import * as wasm from "./wasm/rig.js";

export * from "./bones.js";
export * from "./expressions.js";
export type { WasmSource } from "./load.js";

const PKG = "@hackbuild/rig";

/** Loads the wasm. With no argument the inlined copy is used (works from file://). */
export async function load(source?: WasmSource): Promise<void> {
  await loadWasm(source);
}

/** Loads the wasm synchronously from bytes or a compiled module. */
export function loadSync(source: ArrayBuffer | ArrayBufferView | WebAssembly.Module): void {
  loadWasmSync(source);
}

/** A point or direction as `[x, y, z]`, +Y up. */
export type Vec3 = [number, number, number];
/** A rotation as a unit quaternion `[x, y, z, w]`. */
export type Quat = [number, number, number, number];

/** A bone of the source skeleton: its name and its parent's index or name. */
export interface RigNodeInput {
  name: string;
  parent: number | string | null;
}

/** The naming family a rig was recognised as, from its bone names. */
export type Dialect = "mixamo" | "mixamo-like" | "vroid" | "biped" | "unreal" | "blender" | "character-creator" | "smpl" | "mmd" | "generic";

/** The result of `mapRig`: the humanoid bone of each source node, what is missing or unmapped, the dialect, and the share of required bones found. */
export interface RigMapReport {
  /** Humanoid bone to source node index. */
  byBone: Partial<Record<HumanBone, number>>;
  /** Humanoid bone per source node index, null when unmapped. */
  bones: (HumanBone | null)[];
  missingRequired: HumanBone[];
  unmapped: number[];
  helpers: number[];
  /** Candidates that lost a bone to a better one. */
  ambiguous: { node: number; bone: HumanBone }[];
  /** MMD D deform bones and the bone each deforms. */
  deform: { node: number; bone: HumanBone }[];
  dialect: Dialect;
  /** Share of the 15 required bones that mapped. */
  coverage: number;
}

function parentsOf(nodes: readonly RigNodeInput[]): Int32Array {
  const index = new Map<string, number>();
  nodes.forEach((n, i) => {
    if (!index.has(n.name)) index.set(n.name, i);
  });
  return Int32Array.from(nodes, (n) => (typeof n.parent === "number" ? n.parent : n.parent == null ? -1 : (index.get(n.parent) ?? -1)));
}

const bone = (i: number): HumanBone => HUMAN_BONES[i]!;
const pairs = (a: Uint32Array): { node: number; bone: HumanBone }[] => {
  const out = [];
  for (let i = 0; i + 1 < a.length; i += 2) out.push({ node: a[i]!, bone: bone(a[i + 1]!) });
  return out;
};

/** Maps source bone names to VRM 1.0 humanoid bones, with no per rig table. */
export function mapRig(nodes: readonly RigNodeInput[]): RigMapReport {
  assertReady(PKG);
  const r = wasm.mapRig(nodes.map((n) => n.name), parentsOf(nodes));
  try {
    const raw = Array.from(r.bones());
    const bones = raw.map((b) => (b < 0 ? null : bone(b)));
    const byBone: Partial<Record<HumanBone, number>> = {};
    bones.forEach((b, i) => {
      if (b) byBone[b] = i;
    });
    return {
      byBone,
      bones,
      missingRequired: Array.from(r.missingRequired(), bone),
      unmapped: Array.from(r.unmapped()),
      helpers: Array.from(r.helpers()),
      ambiguous: pairs(r.ambiguous()),
      deform: pairs(r.deform()),
      dialect: r.dialect() as Dialect,
      coverage: r.coverage(),
    };
  } finally {
    r.free();
  }
}

/** A named chain of nodes from root to tip, with the direction its middle joint bends. */
export interface LimbChain {
  /** LF, RF, LH, RH, tail, earL, earR, spine, neck, head. */
  name: string;
  region: "Front" | "Hind" | "Tail" | "Ear" | "Spine" | "Neck" | "Head";
  side: "left" | "right" | null;
  /** Node indices from root to tip. */
  bones: number[];
  /** Unit direction the middle joint bends toward. */
  pole: Vec3;
}

/** Limb chains by name for quadrupeds and other rigs; `rest` gives measured poles. */
export function limbChains(nodes: readonly RigNodeInput[], rest?: readonly Vec3[]): LimbChain[] {
  assertReady(PKG);
  const pos = rest && rest.length === nodes.length ? Float64Array.from(rest.flat()) : new Float64Array(0);
  return JSON.parse(wasm.limbChains(nodes.map((n) => n.name), parentsOf(nodes), pos)) as LimbChain[];
}

/** The length unit a rig was authored in, guessed from its height. */
export type Units = "meters" | "centimeters" | "millimeters" | "unknown" | "decimeters" | "inches";

/** What `analyzeRest` found about a rest pose: the turn, scale and floor that bring it into the normalized space, and the arm and leg fixes toward a T pose. */
export interface RestReport {
  /** Rotation that turns the rig to face +Z with +Y up and its left on +X. */
  fix: Quat;
  /** Head joint height above the lowest foot joint, source units. */
  height: number;
  units: Units;
  /** Source units to meters. */
  scale: number;
  /** Lowest foot joint after fix and scale, meters; subtract to stand on y = 0. */
  floor: number;
  hipsHeight: number;
  /** Upper arm angle below horizontal, degrees, left and right. */
  armDown: [number, number];
  /** World rotations (fixed frame) that lift each upper arm into the T pose. */
  armFix: [Quat, Quat];
  legSplay: [number, number];
  legFix: [Quat, Quat];
  aPose: boolean;
}

const UNITS: Units[] = ["meters", "centimeters", "millimeters", "unknown", "decimeters", "inches"];

/** Rest analysis from world positions of mapped bones. Null without hips, head and arms. */
export function analyzeRest(positions: Partial<Record<HumanBone, Vec3>>): RestReport | null {
  assertReady(PKG);
  const flat = new Float64Array(HUMAN_BONES.length * 3).fill(Number.NaN);
  HUMAN_BONES.forEach((b, i) => {
    const p = positions[b];
    if (p) flat.set(p, i * 3);
  });
  const o = wasm.analyzeRest(flat);
  if (o.length < 31) return null;
  const q = (i: number): Quat => [o[i]!, o[i + 1]!, o[i + 2]!, o[i + 3]!];
  return {
    fix: q(1),
    height: o[5]!,
    units: UNITS[o[6]!] ?? "unknown",
    scale: o[7]!,
    floor: o[8]!,
    hipsHeight: o[9]!,
    armDown: [o[10]!, o[11]!],
    armFix: [q(12), q(16)],
    legSplay: [o[20]!, o[21]!],
    legFix: [q(22), q(26)],
    aPose: o[30] === 1,
  };
}

/** Reference humanoid joint positions in the normalized space (1.70 m, T pose). */
export function referenceRest(): Record<HumanBone, Vec3> {
  assertReady(PKG);
  const f = wasm.referenceRest();
  return Object.fromEntries(HUMAN_BONES.map((b, i) => [b, [f[i * 3]!, f[i * 3 + 1]!, f[i * 3 + 2]!] as Vec3])) as Record<HumanBone, Vec3>;
}

/** Bone names as the wasm build orders them. */
export function wasmBoneNames(): string[] {
  assertReady(PKG);
  return wasm.boneNames();
}

/** The golden scenario run in wasm, for the native and wasm agreement test. */
export function goldenTrace(seed: number): Float64Array {
  assertReady(PKG);
  return wasm.goldenTrace(seed);
}
