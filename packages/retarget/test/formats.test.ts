import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { faceTracks, isPosingDesktop, parseUnityAnim, convertUnityGeneric, isHumanoidClip, parseVpd, readVmd } from "../src/formats.js";
import { type Clip, type HumanoidMotion, RetargetRig, type Skeleton, load, referenceSkeleton } from "../src/index.js";
import { firstPlayable, pickTake, readVrma } from "../src/three.js";

beforeAll(async () => {
  await load();
});

// fixtures carry UTF-8 names and read back with a UTF-8 decoder; MMD files are Shift-JIS
const utf8 = (b: Uint8Array) => new TextDecoder().decode(b);
const HIPS = 0.95 / 0.08; // reference hip height in MMD units

type BoneKey = { name: string; frame: number; pos?: number[]; rot?: number[] };
type MorphKey = { name: string; frame: number; weight: number };

function vmd(bones: BoneKey[], morphs: MorphKey[] = []): Uint8Array {
  const out: number[] = [];
  const header = new Uint8Array(50);
  header.set(new TextEncoder().encode("Vocaloid Motion Data 0002"));
  out.push(...header);
  const u32 = (n: number) => {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n, true);
    return [...b];
  };
  out.push(...u32(bones.length));
  for (const k of bones) {
    const b = new Uint8Array(111);
    b.set(new TextEncoder().encode(k.name));
    const v = new DataView(b.buffer);
    v.setUint32(15, k.frame, true);
    (k.pos ?? [0, 0, 0]).forEach((x, i) => v.setFloat32(19 + i * 4, x, true));
    (k.rot ?? [0, 0, 0, 1]).forEach((x, i) => v.setFloat32(31 + i * 4, x, true));
    out.push(...b);
  }
  out.push(...u32(morphs.length));
  for (const k of morphs) {
    const b = new Uint8Array(23);
    b.set(new TextEncoder().encode(k.name));
    const v = new DataView(b.buffer);
    v.setUint32(15, k.frame, true);
    v.setFloat32(19, k.weight, true);
    out.push(...b);
  }
  return new Uint8Array(out);
}

/** World positions per joint at frame `f`. */
function world(s: Skeleton, c: Clip, f: number): THREE.Vector3[] {
  const n = s.names.length;
  const wr: THREE.Quaternion[] = [];
  const wp: THREE.Vector3[] = [];
  for (let j = 0; j < n; j++) {
    const r = new THREE.Quaternion().fromArray(c.rotations, (f * n + j) * 4);
    const t = new THREE.Vector3().fromArray(c.moves[j] ? c.translations : s.restT, c.moves[j] ? (f * n + j) * 3 : j * 3);
    const p = s.parents[j]!;
    wr[j] = p < 0 ? r : wr[p]!.clone().multiply(r);
    wp[j] = p < 0 ? t : wp[p]!.clone().add(t.applyQuaternion(wr[p]!));
  }
  return wp;
}

function onReference(m: HumanoidMotion, f: number): Map<string, THREE.Vector3> {
  const s = referenceSkeleton();
  const rig = new RetargetRig(s);
  const c = rig.bind(m);
  rig.dispose();
  const wp = world(s, c, f);
  return new Map(s.names.map((n, i) => [n, wp[i]!]));
}

describe("vmd foot ik", () => {
  it("puts the foot on a target 0.1 hip heights forward with the knee forward", () => {
    const bytes = vmd([
      { name: "センター", frame: 0, pos: [0, -0.15 * HIPS, 0] },
      { name: "左足ＩＫ", frame: 0, pos: [0, 0, -0.1 * HIPS] },
      { name: "右足ＩＫ", frame: 0 },
    ]);
    const { motion } = readVmd(bytes, utf8);
    const rest = onReference({ times: Float64Array.of(0), rotations: {} }, 0);
    const pose = onReference(motion, 0);
    const target = rest.get("leftFoot")!.clone().add(new THREE.Vector3(0, 0, 0.1 * 0.95));
    expect(pose.get("leftFoot")!.distanceTo(target)).toBeLessThan(1e-3);
    expect(pose.get("rightFoot")!.distanceTo(rest.get("rightFoot")!)).toBeLessThan(1e-3);
    const mid = pose.get("leftUpperLeg")!.clone().add(pose.get("leftFoot")!).multiplyScalar(0.5);
    expect(pose.get("leftLowerLeg")!.z).toBeGreaterThan(mid.z + 0.01);
  });

  it("clamps a target out of reach with no NaN", () => {
    const { motion } = readVmd(vmd([{ name: "左足ＩＫ", frame: 0, pos: [0, -3 * HIPS, 0] }]), utf8);
    for (const r of Object.values(motion.rotations)) expect(r!.every(Number.isFinite)).toBe(true);
    const pose = onReference(motion, 0);
    const leg = pose.get("leftUpperLeg")!.distanceTo(pose.get("leftFoot")!);
    expect(leg).toBeCloseTo(0.83, 3);
  });
});

describe("vmd face", () => {
  it("gives a face only file a clip of the right length", () => {
    const { motion, faces } = readVmd(vmd([], [{ name: "あ", frame: 0, weight: 0 }, { name: "あ", frame: 45, weight: 1 }]), utf8);
    expect(motion.times.length).toBe(46);
    const aa = faces.find((f) => f.name === "aa")!;
    expect(aa.weights.length).toBe(46);
    expect(aa.weights[45]).toBeCloseTo(1, 6);
    expect(aa.weights[15]).toBeCloseTo(1 / 3, 6);
  });

  it("keeps the busier of two morphs that feed one preset", () => {
    const morphs = [
      { name: "まばたき", frame: 0, weight: 1 },
      { name: "まばたき", frame: 9, weight: 1 },
      ...[0, 3, 6, 9].map((frame) => ({ name: "まばたき２", frame, weight: frame % 2 ? 0.5 : 0 })),
      { name: "ｳｨﾝｸ右", frame: 0, weight: 0 },
    ];
    const faces = faceTracks(morphs, 10);
    const blink = faces.find((f) => f.name === "blink")!;
    expect(Array.from(blink.weights.slice(0, 4))).toEqual([0, 0.5 / 3, 1 / 3, 0.5].map(Math.fround));
    // a track that stays at zero is left out
    expect(faces.some((f) => f.name === "blinkRight")).toBe(false);
  });
});

describe("vpd", () => {
  const pose = `Vocaloid Pose Data file\r\n\r\nmodel.osm;\t\t// parent\r\n2;\r\n\r\nBone0{左腕\r\n  0.000000,0.000000,0.000000;\t// trans x,y,z\r\n  0.000000,0.000000,0.300706,0.953717;\t// quaternion\r\n}\r\n\r\nBone1{センター\r\n  0.000000,-1.000000,0.000000;\r\n  0.000000,0.000000,0.000000,1.000000;\r\n}\r\n`;

  it("tells MMD text from posing tool JSON by the first character", () => {
    expect(isPosingDesktop(pose)).toBe(false);
    expect(isPosingDesktop('  {"CharacterList": []}')).toBe(true);
    const m = parseVpd(new TextEncoder().encode(pose), utf8);
    expect(m.times.length).toBe(1);
    expect(m.rotations.leftUpperArm).toBeDefined();
    expect(() => parseVpd(new TextEncoder().encode('{"CharacterList": []}'), utf8)).toThrow(/posing tool pose/);
  });
});

const animHeader = `%YAML 1.1\n--- !u!74 &7400000\nAnimationClip:\n  m_Name: wave\n`;
const curve = (path: string, keys: [number, string][], attribute?: string) =>
  `  - curve:\n      serializedVersion: 2\n      m_Curve:\n${keys
    .map(([t, v]) => `      - serializedVersion: 3\n        time: ${t}\n        value: ${v}\n        inSlope: {x: 0, y: 0, z: 0, w: 0}\n`)
    .join("")}      m_PreInfinity: 2\n${attribute === undefined ? "" : `    attribute: ${attribute}\n`}    path: ${path}\n`;

describe("unity clips", () => {
  const arm = "Hips/Spine/Chest/LeftShoulder/LeftUpperArm";
  const text =
    animHeader +
    `  m_RotationCurves:\n` +
    curve(arm, [
      [0, "{x: 0, y: 0, z: 0, w: 1}"],
      [1, "{x: 0, y: 0.38268343, z: 0, w: 0.9238795}"],
    ]) +
    `  m_EulerCurves:\n` +
    curve("Hips/Spine", [[0, "{x: 0, y: 0, z: 30}"]]) +
    `  m_PositionCurves:\n` +
    curve("Hips", [
      [0, "{x: 0, y: 1, z: 0}"],
      [1, "{x: 0.5, y: 1, z: 2}"],
    ]) +
    `  m_ScaleCurves: []\n  m_FloatCurves: []\n  m_SampleRate: 60\n`;

  it("maps a generic transform clip through the rig mapper", () => {
    const c = parseUnityAnim(text);
    expect(isHumanoidClip(c)).toBe(false);
    const m = convertUnityGeneric(c);
    expect(m.times.length).toBe(31);
    const q = m.rotations.leftUpperArm!;
    // 45 degrees about Unity +Y reads as 45 degrees about -Y once X is mirrored
    expect(Array.from(q.slice(30 * 4, 31 * 4))).toEqual([0, -0.38268343, -0, 0.9238795].map((x) => expect.closeTo(x, 6)));
    const s = m.rotations.spine!;
    expect(s[2]).toBeCloseTo(-Math.sin(Math.PI / 12), 6);
    expect(m.hips![30 * 3]).toBeCloseTo(-0.5, 6);
    expect(m.hips![30 * 3 + 2]).toBeCloseTo(2, 6);
  });

  it("refuses a humanoid muscle clip and says why", () => {
    const muscle = animHeader + `  m_FloatCurves:\n` + curve("", [[0, "0.5"]], "Left Arm Down-Up") + `  m_SampleRate: 30\n`;
    const c = parseUnityAnim(muscle);
    expect(c.float.get("Left Arm Down-Up")?.[0]?.value).toEqual([0.5]);
    expect(isHumanoidClip(c)).toBe(true);
    expect(() => convertUnityGeneric(c)).toThrow(/humanoid muscle clip/);
  });
});

describe("takes and variants", () => {
  it("picks the mixamo.com take over a longer one", () => {
    const clips = [
      { name: "Take 001", duration: 5 },
      { name: "mixamo.com", duration: 2 },
    ];
    expect(pickTake(clips).name).toBe("mixamo.com");
    expect(pickTake(clips.slice(0, 1).concat({ name: "b", duration: 9 })).name).toBe("b");
    expect(pickTake(clips, "Take 001").duration).toBe(5);
    expect(() => pickTake(clips, "run")).toThrow(/no take named "run"/);
  });

  it("falls through variants until one plays", async () => {
    const r = await firstPlayable(
      3,
      async (i) => {
        if (i === 0) throw new Error("unreadable");
        return i;
      },
      (m) => (m === 2 ? "bound" : null),
    );
    expect(r).toEqual({ motion: 2, bound: "bound", variant: 2 });
    await expect(firstPlayable(1, async () => 0, () => null)).rejects.toThrow(/no bones/);
  });
});

/** A GLB holding the reference body under arbitrary node names, an arm raise and an `aa` track. */
function vrmaFixture(): ArrayBuffer {
  const s = referenceSkeleton();
  const n = s.names.length;
  const times = [0, 1];
  const raise = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 3);
  const floats = [...times, 0, 0, 0, 1, ...raise.toArray(), 0, 0, 0, 1, 0, 0, ...[0, 0.95, 0, 0, 0.95, 0.5]];
  const bin = new Float32Array(floats);
  const arm = s.names.indexOf("leftUpperArm");
  const hips = s.names.indexOf("hips");
  const children = (i: number) => s.parents.reduce<number[]>((a, p, j) => (p === i ? [...a, j] : a), []);
  const nodes = s.names.map((_, i) => ({ name: `n${i}`, translation: Array.from(s.restT.slice(i * 3, i * 3 + 3)), ...(children(i).length ? { children: children(i) } : {}) }));
  nodes.push({ name: "face_a", translation: [0, 0, 0] });
  const roots = s.names.map((_, i) => i).filter((i) => s.parents[i]! < 0);
  const json = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [...roots, n] }],
    nodes,
    buffers: [{ byteLength: bin.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.byteLength }],
    accessors: [
      { bufferView: 0, byteOffset: 0, componentType: 5126, count: 2, type: "SCALAR", min: [0], max: [1] },
      { bufferView: 0, byteOffset: 8, componentType: 5126, count: 2, type: "VEC4" },
      { bufferView: 0, byteOffset: 40, componentType: 5126, count: 2, type: "VEC3" },
      { bufferView: 0, byteOffset: 64, componentType: 5126, count: 2, type: "VEC3" },
    ],
    animations: [
      {
        channels: [
          { sampler: 0, target: { node: arm, path: "rotation" } },
          { sampler: 1, target: { node: n, path: "translation" } },
          { sampler: 2, target: { node: hips, path: "translation" } },
        ],
        samplers: [
          { input: 0, output: 1 },
          { input: 0, output: 2 },
          { input: 0, output: 3 },
        ],
      },
    ],
    extensionsUsed: ["VRMC_vrm_animation"],
    extensions: {
      VRMC_vrm_animation: {
        specVersion: "1.0",
        humanoid: { humanBones: Object.fromEntries(s.names.map((b, i) => [b, { node: i }])) },
        expressions: { preset: { aa: { node: n } } },
      },
    },
  };
  // the aa node's X goes 0 to 1; the hips move 0.5 m forward
  const pad = (b: Uint8Array, fill: number) => {
    const out = new Uint8Array(Math.ceil(b.length / 4) * 4).fill(fill);
    out.set(b);
    return out;
  };
  const jb = pad(new TextEncoder().encode(JSON.stringify(json)), 0x20);
  const bb = pad(new Uint8Array(bin.buffer), 0);
  const glb = new Uint8Array(12 + 8 + jb.length + 8 + bb.length);
  const v = new DataView(glb.buffer);
  v.setUint32(0, 0x46546c67, true);
  v.setUint32(4, 2, true);
  v.setUint32(8, glb.length, true);
  v.setUint32(12, jb.length, true);
  v.setUint32(16, 0x4e4f534a, true);
  glb.set(jb, 20);
  v.setUint32(20 + jb.length, bb.length, true);
  v.setUint32(24 + jb.length, 0x004e4942, true);
  glb.set(bb, 28 + jb.length);
  return glb.buffer;
}

describe("vrma", () => {
  it("reads bones by the file's own table, travel from the origin and the face", async () => {
    const { motion, faces } = await readVrma(vrmaFixture());
    expect(motion.times.length).toBe(31);
    const q = new THREE.Quaternion().fromArray(motion.rotations.leftUpperArm!, 30 * 4);
    const dir = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    expect(Math.asin(dir.y) * (180 / Math.PI)).toBeCloseTo(60, 4);
    expect(motion.hips![0]).toBeCloseTo(0, 9);
    // on a body of the same size the hips travel the same 0.5 m
    expect(onReference(motion, 30).get("hips")!.z).toBeCloseTo(0.5, 4);
    const aa = faces.find((f) => f.name === "aa")!;
    expect(aa.weights[0]).toBe(0);
    expect(aa.weights[30]).toBeCloseTo(1, 6);
    expect(aa.weights[15]).toBeCloseTo(0.5, 6);
  });
});
