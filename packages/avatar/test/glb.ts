// Builds small skinned humanoid GLB files in memory for the tests: a named
// skeleton at given world joint positions, one skinned triangle per bone,
// a face mesh with named morph targets, and chosen materials. No files on
// disk, no network.

export interface JointSpec {
  name: string;
  parent: string | null;
  /** World position. */
  p: [number, number, number];
}

export interface MaterialSpec {
  name: string;
  alphaMode?: "OPAQUE" | "MASK" | "BLEND";
  color?: [number, number, number, number];
}

export interface GlbSpec {
  joints: JointSpec[];
  /** Mesh name and material index per skinned body mesh; each gets one triangle on the hips. */
  meshes?: { name: string; material: number }[];
  materials?: MaterialSpec[];
  morphs?: { mesh: string; names: string[] };
  extensionsUsed?: string[];
  extensions?: Record<string, unknown>;
  /** Called with the node index of each joint to fill a root extension that names nodes. */
  nodeIndex?: (index: Map<string, number>) => Record<string, unknown>;
}

export function buildGlb(spec: GlbSpec): Uint8Array {
  const chunks: Uint8Array[] = [];
  let offset = 0;
  const views: Record<string, unknown>[] = [];
  const accessors: Record<string, unknown>[] = [];
  const add = (data: Float32Array | Uint16Array, type: string, componentType: number, count: number, extra: Record<string, unknown> = {}) => {
    const bytes = new Uint8Array(data.buffer.slice(0));
    const pad = (4 - (bytes.length % 4)) % 4;
    views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length });
    chunks.push(bytes, new Uint8Array(pad));
    offset += bytes.length + pad;
    accessors.push({ bufferView: views.length - 1, componentType, count, type, ...extra });
    return accessors.length - 1;
  };
  const vec3 = (a: number[]) => {
    const f = Float32Array.from(a);
    const n = a.length / 3;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i++)
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k]!, f[i * 3 + k]!);
        max[k] = Math.max(max[k]!, f[i * 3 + k]!);
      }
    return add(f, "VEC3", 5126, n, { min, max });
  };

  const byName = new Map(spec.joints.map((j, i) => [j.name, i]));
  const nodes: Record<string, unknown>[] = spec.joints.map((j) => {
    const parent: [number, number, number] = j.parent ? spec.joints[byName.get(j.parent)!]!.p : [0, 0, 0];
    return { name: j.name, translation: [j.p[0] - parent[0], j.p[1] - parent[1], j.p[2] - parent[2]] };
  });
  spec.joints.forEach((j, i) => {
    if (!j.parent) return;
    const pn = nodes[byName.get(j.parent)!]!;
    ((pn.children as number[] | undefined) ?? (pn.children = [] as number[]) as number[]).push(i);
  });
  const rootJoints = spec.joints.map((j, i) => (j.parent ? -1 : i)).filter((i) => i >= 0);
  const ibm = new Float32Array(spec.joints.length * 16);
  spec.joints.forEach((j, i) => {
    const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -j.p[0], -j.p[1], -j.p[2], 1];
    ibm.set(m, i * 16);
  });
  const ibmAcc = add(ibm, "MAT4", 5126, spec.joints.length);
  const skin = { joints: spec.joints.map((_, i) => i), inverseBindMatrices: ibmAcc, skeleton: rootJoints[0] };

  const materials = (spec.materials ?? [{ name: "Body" }]).map((m) => ({
    name: m.name,
    alphaMode: m.alphaMode ?? "OPAQUE",
    pbrMetallicRoughness: { baseColorFactor: m.color ?? [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 },
  }));
  const hips = spec.joints[1]?.p ?? [0, 1, 0];
  const meshes: Record<string, unknown>[] = [];
  const meshNodes: number[] = [];
  const tri = (dy: number) => [hips[0], hips[1] + dy, hips[2], hips[0] + 0.1, hips[1] + dy, hips[2], hips[0], hips[1] + dy + 0.1, hips[2]];
  for (const [k, m] of (spec.meshes ?? [{ name: "Body", material: 0 }]).entries()) {
    const pos = vec3(tri(k * 0.01));
    const joints = add(new Uint16Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), "VEC4", 5123, 3);
    const weights = add(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), "VEC4", 5126, 3);
    const prim: Record<string, unknown> = { attributes: { POSITION: pos, JOINTS_0: joints, WEIGHTS_0: weights }, material: m.material };
    const mesh: Record<string, unknown> = { name: m.name, primitives: [prim] };
    if (spec.morphs && spec.morphs.mesh === m.name) {
      prim.targets = spec.morphs.names.map(() => ({ POSITION: vec3([0, 0.01, 0, 0, 0.01, 0, 0, 0.01, 0]) }));
      mesh.extras = { targetNames: spec.morphs.names };
      mesh.weights = spec.morphs.names.map(() => 0);
    }
    meshes.push(mesh);
    nodes.push({ name: m.name, mesh: meshes.length - 1, skin: 0 });
    meshNodes.push(nodes.length - 1);
  }
  const json: Record<string, unknown> = {
    asset: { version: "2.0", generator: "hackbuild-avatar-test" },
    scene: 0,
    scenes: [{ nodes: [...rootJoints, ...meshNodes] }],
    nodes,
    meshes,
    skins: [skin],
    materials,
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: offset }],
  };
  if (spec.extensionsUsed) json.extensionsUsed = spec.extensionsUsed;
  const ext = { ...(spec.extensions ?? {}), ...(spec.nodeIndex ? spec.nodeIndex(byName) : {}) };
  if (Object.keys(ext).length) json.extensions = ext;

  const enc = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = (4 - (enc.length % 4)) % 4;
  const jsonLen = enc.length + jsonPad;
  const total = 12 + 8 + jsonLen + 8 + offset;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonLen, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(enc, 20);
  out.fill(0x20, 20 + enc.length, 20 + jsonLen);
  let o = 20 + jsonLen;
  dv.setUint32(o, offset, true);
  dv.setUint32(o + 4, 0x004e4942, true);
  o += 8;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

type V3 = [number, number, number];

/** VRM bone to source name tables for two rig families. */
export const MIXAMO: Record<string, string> = {
  hips: "Hips", spine: "Spine", chest: "Spine1", upperChest: "Spine2", neck: "Neck", head: "Head",
  leftShoulder: "LeftShoulder", leftUpperArm: "LeftArm", leftLowerArm: "LeftForeArm", leftHand: "LeftHand",
  rightShoulder: "RightShoulder", rightUpperArm: "RightArm", rightLowerArm: "RightForeArm", rightHand: "RightHand",
  leftUpperLeg: "LeftUpLeg", leftLowerLeg: "LeftLeg", leftFoot: "LeftFoot", leftToes: "LeftToeBase",
  rightUpperLeg: "RightUpLeg", rightLowerLeg: "RightLeg", rightFoot: "RightFoot", rightToes: "RightToeBase",
};
export const UAL: Record<string, string> = {
  hips: "pelvis", spine: "spine_01", chest: "spine_02", upperChest: "spine_03", neck: "neck_01", head: "Head",
  leftShoulder: "clavicle_l", leftUpperArm: "upperarm_l", leftLowerArm: "lowerarm_l", leftHand: "hand_l",
  rightShoulder: "clavicle_r", rightUpperArm: "upperarm_r", rightLowerArm: "lowerarm_r", rightHand: "hand_r",
  leftUpperLeg: "thigh_l", leftLowerLeg: "calf_l", leftFoot: "foot_l", leftToes: "ball_l",
  rightUpperLeg: "thigh_r", rightLowerLeg: "calf_r", rightFoot: "foot_r", rightToes: "ball_r",
};
const PARENT: Record<string, string> = {
  hips: "", spine: "hips", chest: "spine", upperChest: "chest", neck: "upperChest", head: "neck",
  leftShoulder: "upperChest", leftUpperArm: "leftShoulder", leftLowerArm: "leftUpperArm", leftHand: "leftLowerArm",
  rightShoulder: "upperChest", rightUpperArm: "rightShoulder", rightLowerArm: "rightUpperArm", rightHand: "rightLowerArm",
  leftUpperLeg: "hips", leftLowerLeg: "leftUpperLeg", leftFoot: "leftLowerLeg", leftToes: "leftFoot",
  rightUpperLeg: "hips", rightLowerLeg: "rightUpperLeg", rightFoot: "rightLowerLeg", rightToes: "rightFoot",
};

/**
 * Joints from reference positions under a root node, renamed by `table`
 * with `prefix`, optionally with arms lowered by `aPoseDeg`, turned 180
 * degrees about +Y, and multiplied by `scale`.
 */
export function humanoidJoints(ref: Record<string, V3>, table: Record<string, string>, opts: { prefix?: string; aPoseDeg?: number; turn?: boolean; scale?: number; rootName?: string } = {}): JointSpec[] {
  const pre = opts.prefix ?? "";
  const world: Record<string, V3> = {};
  for (const b of Object.keys(table)) world[b] = [...ref[b]!] as V3;
  const a = ((opts.aPoseDeg ?? 0) * Math.PI) / 180;
  for (const side of ["left", "right"] as const) {
    const pivot = world[`${side}UpperArm`]!;
    const s = side === "left" ? -1 : 1;
    for (const b of [`${side}LowerArm`, `${side}Hand`]) {
      const p = world[b]!;
      const dx = p[0] - pivot[0];
      const dy = p[1] - pivot[1];
      const c = Math.cos(s * a);
      const n = Math.sin(s * a);
      world[b] = [pivot[0] + dx * c - dy * n, pivot[1] + dx * n + dy * c, p[2]];
    }
  }
  const k = opts.scale ?? 1;
  const tf = (p: V3): V3 => (opts.turn ? [-p[0] * k, p[1] * k, -p[2] * k] : [p[0] * k, p[1] * k, p[2] * k]);
  const rootName = opts.rootName ?? "root";
  const out: JointSpec[] = [{ name: rootName, parent: null, p: [0, 0, 0] }];
  for (const b of Object.keys(table)) out.push({ name: pre + table[b]!, parent: PARENT[b] ? pre + table[PARENT[b]!]! : rootName, p: tf(world[b]!) });
  return out;
}
