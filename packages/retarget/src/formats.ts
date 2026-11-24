// More motion formats onto the humanoid space: VMD with its face, VPD poses
// and Unity text clips on generic rigs. Every reader returns a
// `HumanoidMotion`; face tracks come out as one weight per frame, the shape
// `@hackbuild/presence` plays.
import { HUMAN_BONES, type HumanBone } from "@hackbuild/rig/bones";
import { PRESET_ALIASES, VRM_EXPRESSIONS, type VrmExpression } from "@hackbuild/rig/expressions";
import { type HumanoidMotion, RetargetRig, type VmdMotion, parseVmd } from "./index.js";
import { assertReady } from "./load.js";
import * as wasm from "./wasm/retarget.js";

const PKG = "@hackbuild/retarget";
const sjis = (b: Uint8Array): string => new TextDecoder("shift_jis").decode(b);

/** One expression's weight per frame, 0 to 1. */
export interface FaceTrack {
  name: VrmExpression;
  weights: Float32Array;
}

// Morph names compare by letters and digits, full and half width alike, with
// numbered variants ("まばたき２", "ウィンク２右") folded onto their base name.
const fold = (s: string): string =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "")
    .replace(/(?<=\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana})\d+/gu, "");

/**
 * VMD morph keys as expression tracks at 30 fps over `frames` frames. Morph
 * names map to presets through the `@hackbuild/rig` alias table; when several
 * morphs feed one preset, the one with the most keys plays. Weights are
 * linear between keys and held past the ends; a track that stays at 0 is
 * left out.
 */
export function faceTracks(morphs: VmdMotion["morphs"], frames: number): FaceTrack[] {
  const byName = new Map<string, { frame: number; weight: number }[]>();
  for (const k of morphs) {
    const list = byName.get(k.name) ?? [];
    list.push(k);
    byName.set(k.name, list);
  }
  const out: FaceTrack[] = [];
  for (const preset of VRM_EXPRESSIONS) {
    const names = new Set([preset, ...PRESET_ALIASES[preset]].map(fold));
    let keys: { frame: number; weight: number }[] | undefined;
    for (const [name, list] of byName) if (names.has(fold(name)) && list.length > (keys?.length ?? 0)) keys = list;
    if (!keys || keys.every((k) => k.weight === 0)) continue;
    keys.sort((a, b) => a.frame - b.frame);
    const weights = new Float32Array(Math.max(1, frames));
    let i = 0;
    for (let f = 0; f < weights.length; f++) {
      while (i + 1 < keys.length && keys[i + 1]!.frame <= f) i++;
      const a = keys[i]!;
      const b = keys[i + 1];
      const w = b && f > a.frame ? a.weight + ((b.weight - a.weight) * (f - a.frame)) / (b.frame - a.frame) : a.weight;
      weights[f] = Math.min(1, Math.max(0, w));
    }
    out.push({ name: preset, weights });
  }
  return out;
}

export interface MotionWithFace {
  motion: HumanoidMotion;
  /** Expression tracks over the same frames as `motion`. */
  faces: FaceTrack[];
}

/**
 * A VMD as a humanoid motion and its face. Legs keyed only by foot IK bones
 * are solved; a face only file gives a still body as long as its face.
 */
export function readVmd(bytes: Uint8Array, decode: (b: Uint8Array) => string = sjis): MotionWithFace {
  const vmd = parseVmd(bytes, decode);
  const rig = new RetargetRig(vmd.skeleton, { unit: vmd.unit });
  try {
    const motion = rig.toHumanoid(vmd.clip);
    return { motion, faces: faceTracks(vmd.morphs, motion.times.length) };
  } finally {
    rig.dispose();
  }
}

/**
 * True for a `.vpd` written by a posing tool as JSON (a Unity humanoid pose)
 * rather than MikuMikuDance's text pose. The two share the extension.
 */
export const isPosingDesktop = (text: string): boolean => text.trimStart().startsWith("{");

/**
 * A MikuMikuDance pose (`.vpd`, Shift-JIS text) as a one frame motion. Foot
 * IK bones in the pose are solved as in a VMD.
 */
export function parseVpd(bytes: Uint8Array, decode: (b: Uint8Array) => string = sjis): HumanoidMotion {
  assertReady(PKG);
  const text = decode(bytes);
  if (isPosingDesktop(text)) throw new Error("this .vpd is a posing tool pose of unity muscle values, which is not read. save it as a vrma.");
  if (!text.startsWith("Vocaloid Pose Data")) throw new Error("not a vpd pose file");
  const names: string[] = [];
  const keys: number[] = [];
  for (const m of text.matchAll(/Bone\d+\s*\{([^\r\n]*)\r?\n([^}]*)\}/g)) {
    const nums = m[2]!
      .split(/\r?\n/)
      .map((l) => l.replace(/\/\/.*$/, ""))
      .join(" ")
      .split(/[\s,;]+/)
      .filter(Boolean)
      .map(Number);
    if (nums.length < 7 || nums.some((x) => !Number.isFinite(x))) continue;
    keys.push(names.length, 0, ...nums.slice(0, 7));
    names.push(m[1]!.trim());
  }
  if (!names.length) throw new Error("this vpd has no bones");
  const f = wasm.VmdFile.fromKeys(Float64Array.from(keys), names.length);
  let skeletal: wasm.SkeletalClip;
  try {
    skeletal = f.toClip(names);
  } finally {
    f.free();
  }
  const skeleton = { names: skeletal.names(), parents: skeletal.parents(), restT: skeletal.restT(), restR: skeletal.restR() };
  const clip = { times: skeletal.times(), rotations: skeletal.rotations(), translations: skeletal.translations(), moves: skeletal.moves() };
  skeletal.free();
  const rig = new RetargetRig(skeleton, { unit: 0.08 });
  try {
    return rig.toHumanoid(clip);
  } finally {
    rig.dispose();
  }
}

export interface UnityKey {
  time: number;
  value: number[];
}

/** The curves of a text serialized Unity AnimationClip. */
export interface UnityClip {
  name: string;
  sampleRate: number;
  /** Transform path to `x y z w` keys. */
  rotation: Map<string, UnityKey[]>;
  /** Transform path to `x y z` keys in degrees. */
  euler: Map<string, UnityKey[]>;
  /** Transform path to `x y z` keys. */
  position: Map<string, UnityKey[]>;
  /** Attribute, or `path/attribute` when the path is set, to one value keys. */
  float: Map<string, UnityKey[]>;
}

const SECTIONS: Record<string, keyof Pick<UnityClip, "rotation" | "euler" | "position" | "float">> = {
  m_RotationCurves: "rotation",
  m_EulerCurves: "euler",
  m_PositionCurves: "position",
  m_FloatCurves: "float",
};

/**
 * Reads a Unity `.anim` saved as text (Force Text serialization). Keys keep
 * their values; tangents are dropped and the curves sample linearly.
 */
export function parseUnityAnim(text: string): UnityClip {
  if (!/^%YAML|AnimationClip:/m.test(text.slice(0, 400))) throw new Error("not a text unity .anim. save the project with force text serialization.");
  const clip: UnityClip = {
    name: text.match(/^\s+m_Name:\s*(.+)$/m)?.[1]?.trim() ?? "clip",
    sampleRate: Number(text.match(/^\s+m_SampleRate:\s*([\d.]+)/m)?.[1] ?? 60),
    rotation: new Map(),
    euler: new Map(),
    position: new Map(),
    float: new Map(),
  };
  let section: (typeof SECTIONS)[string] | null = null;
  let keys: UnityKey[] = [];
  let time: number | null = null;
  let attribute = "";
  for (const line of text.split(/\r?\n/)) {
    const top = line.match(/^ {2}(m_\w+):/);
    if (top) {
      section = SECTIONS[top[1]!] ?? null;
      keys = [];
      continue;
    }
    if (!section) continue;
    if (/^ {2}- curve:/.test(line)) {
      keys = [];
      attribute = "";
      continue;
    }
    const t = line.match(/^\s+time:\s*(\S+)/);
    if (t) {
      time = Number(t[1]);
      continue;
    }
    const v = line.match(/^\s+value:\s*(.+)$/);
    if (v && time !== null) {
      const raw = v[1]!.trim();
      const value = raw.startsWith("{") ? [...raw.matchAll(/[xyzw]:\s*([-\d.eE+]+)/g)].map((m) => Number(m[1])) : [Number(raw)];
      keys.push({ time, value });
      time = null;
      continue;
    }
    const a = line.match(/^ {4}attribute:\s*(.*)$/);
    if (a) {
      attribute = a[1]!.trim();
      continue;
    }
    const p = line.match(/^ {4}path:\s*(.*)$/);
    if (p && keys.length) {
      const path = p[1]!.trim();
      clip[section].set(section === "float" ? (path ? `${path}/${attribute}` : attribute) : path, keys);
      keys = [];
    }
  }
  return clip;
}

/** True when the clip drives a humanoid avatar through muscle curves. */
export function isHumanoidClip(c: UnityClip): boolean {
  for (const k of c.float.keys()) if (/^Root[TQ]\.|(Front-Back|Left-Right|Down-Up|In-Out|Stretch(ed)?|Spread|Close)$/.test(k)) return true;
  return false;
}

function sampleKeys(keys: UnityKey[], t: number): number[] {
  if (t <= keys[0]!.time) return keys[0]!.value;
  const last = keys[keys.length - 1]!;
  if (t >= last.time) return last.value;
  let i = 1;
  while (keys[i]!.time < t) i++;
  const a = keys[i - 1]!;
  const b = keys[i]!;
  const u = (t - a.time) / (b.time - a.time || 1);
  return a.value.map((x, k) => x + ((b.value[k] ?? x) - x) * u);
}

const FPS = 30;

/** Euler degrees in Unity's order (Z, then X, then Y) as `x y z w`. */
function unityEuler(x: number, y: number, z: number): [number, number, number, number] {
  const r = Math.PI / 360;
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(x * r), Math.sin(x * r), Math.cos(y * r), Math.sin(y * r), Math.cos(z * r), Math.sin(z * r)];
  // qy * qx * qz
  return [cy * sx * cz + sy * cx * sz, sy * cx * cz - cy * sx * sz, cy * cx * sz - sy * sx * cz, cy * cx * cz + sy * sx * sz];
}

/**
 * A Unity clip of transform curves (a generic rig) as a humanoid motion.
 * Paths map to bones through the rig mapper by name and hierarchy. Rotations
 * pass through unchanged apart from the handedness flip, so the source rig
 * must rest in a T pose with identity bone rotations (VRoid and most rigs
 * exported from a VRM do). Hip travel comes from the hips position curve, in
 * multiples of its first frame height. Humanoid muscle clips are refused:
 * how a muscle turns a bone depends on per avatar constants Unity does not
 * publish.
 */
export function convertUnityGeneric(c: UnityClip): HumanoidMotion {
  assertReady(PKG);
  if (isHumanoidClip(c)) throw new Error("this .anim is a humanoid muscle clip, which is not read. export it from a generic rig or as a vrma.");
  const paths = [...new Set([...c.rotation.keys(), ...c.euler.keys(), ...c.position.keys()])];
  const nodes: string[] = [];
  const parents: number[] = [];
  const index = new Map<string, number>();
  for (const path of paths) {
    const segs = path.split("/");
    for (let i = 1; i <= segs.length; i++) {
      const sub = segs.slice(0, i).join("/");
      if (index.has(sub)) continue;
      index.set(sub, nodes.length);
      parents.push(i > 1 ? index.get(segs.slice(0, i - 1).join("/"))! : -1);
      nodes.push(segs[i - 1]!);
    }
  }
  const bones = wasm.mapBones(nodes, Int32Array.from(parents));
  const boneOf = (path: string): HumanBone | null => {
    const b = bones[index.get(path)!]!;
    return b < 0 ? null : HUMAN_BONES[b]!;
  };
  let end = 0;
  for (const m of [c.rotation, c.euler, c.position]) for (const k of m.values()) end = Math.max(end, k[k.length - 1]?.time ?? 0);
  const frames = end > 0 ? Math.max(2, Math.round(end * FPS) + 1) : 1;
  const times = Float64Array.from({ length: frames }, (_, i) => Math.min(i / FPS, end));
  const rotations: HumanoidMotion["rotations"] = {};
  for (const path of new Set([...c.rotation.keys(), ...c.euler.keys()])) {
    const bone = boneOf(path);
    if (!bone || rotations[bone]) continue;
    const quat = c.rotation.get(path);
    const eul = c.euler.get(path);
    const out = new Float64Array(frames * 4);
    times.forEach((t, f) => {
      let [x, y, z, w] = quat ? sampleKeys(quat, t) : unityEuler(...(sampleKeys(eul!, t) as [number, number, number]));
      const n = Math.hypot(x!, y!, z!, w!) || 1;
      // Unity is left handed with +X to the right; mirroring X puts the left on +X
      out.set([x! / n, -y! / n, -z! / n, w! / n], f * 4);
    });
    rotations[bone] = out;
  }
  if (!Object.keys(rotations).length) throw new Error("no curve in this .anim drives a humanoid bone");
  const motion: HumanoidMotion = { times, rotations };
  const hipsPath = [...c.position.keys()].find((p) => boneOf(p) === "hips");
  const hk = hipsPath ? c.position.get(hipsPath)! : null;
  const h0 = hk ? sampleKeys(hk, 0) : null;
  if (hk && h0 && h0[1]! > 1e-6) {
    const hips = new Float64Array(frames * 3);
    times.forEach((t, f) => {
      const [x, y, z] = sampleKeys(hk, t);
      hips.set([-(x! - h0[0]!) / h0[1]!, (y! - h0[1]!) / h0[1]!, (z! - h0[2]!) / h0[1]!], f * 3);
    });
    motion.hips = hips;
  }
  return motion;
}
