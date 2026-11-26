// The placeholder body: a mannequin of capsules on a humanoid skeleton,
// built in code, so a stage is whole before any model file arrives. It
// stands in the normalized humanoid space (VRM 1.0 bone names, T pose, +Z
// forward, meters, feet at y = 0) with identity rest rotations, so gaze,
// clips and the follow camera treat it as any loaded body. No asset file.
import { Bone, CapsuleGeometry, Group, Mesh, MeshStandardMaterial, type Object3D, SphereGeometry, Vector3 } from "three";
import type { HumanBone } from "@hackbuild/rig/bones";
import { type Avatar, ExpressionRig, HeadHider, Wardrobe, disposeObject } from "@hackbuild/avatar/three";

/** Body colour, joint colour and height scale of the placeholder body built in code. */
export interface PlaceholderOptions {
  /** Body colour. Default a warm grey. */
  color?: number;
  /** Joint colour. */
  jointColor?: number;
  /** Overall height scale; 1 puts the head top near 1.74 m (computed from the joint table). */
  scale?: number;
}

type J = [HumanBone, HumanBone | null, number, number, number];
// joint offsets from the parent, meters
const JOINTS: J[] = [
  ["hips", null, 0, 0.95, 0],
  ["spine", "hips", 0, 0.1, 0],
  ["chest", "spine", 0, 0.14, 0],
  ["upperChest", "chest", 0, 0.12, 0],
  ["neck", "upperChest", 0, 0.13, 0],
  ["head", "neck", 0, 0.09, 0.01],
  ["leftEye", "head", 0.032, 0.07, 0.08],
  ["rightEye", "head", -0.032, 0.07, 0.08],
];
for (const [side, s] of [["left", 1], ["right", -1]] as const) {
  JOINTS.push(
    [`${side}Shoulder`, "upperChest", s * 0.04, 0.09, 0],
    [`${side}UpperArm`, `${side}Shoulder`, s * 0.13, 0, 0],
    [`${side}LowerArm`, `${side}UpperArm`, s * 0.27, 0, 0],
    [`${side}Hand`, `${side}LowerArm`, s * 0.25, 0, 0],
    [`${side}UpperLeg`, "hips", s * 0.09, -0.05, 0],
    [`${side}LowerLeg`, `${side}UpperLeg`, 0, -0.42, 0],
    [`${side}Foot`, `${side}LowerLeg`, 0, -0.42, 0],
    [`${side}Toes`, `${side}Foot`, 0, -0.06, 0.13],
  );
}

// segment radius per parent bone, meters
const RADIUS: Partial<Record<HumanBone, number>> = { hips: 0.11, spine: 0.11, chest: 0.12, upperChest: 0.1, neck: 0.045 };
const radiusOf = (b: HumanBone): number => RADIUS[b] ?? (/Upper(Leg|Arm)/.test(b) ? 0.055 : /Lower/.test(b) ? 0.045 : 0.035);

/** A placeholder body as an Avatar: format unknown, dialect placeholder, no clips, no morphs. */
export function placeholderBody(opts: PlaceholderOptions = {}): Avatar {
  const scale = opts.scale ?? 1;
  const skin = new MeshStandardMaterial({ name: "placeholder", color: opts.color ?? 0xc9c1b3, roughness: 0.75 });
  const joint = new MeshStandardMaterial({ name: "placeholder joint", color: opts.jointColor ?? 0x8f877a, roughness: 0.6 });
  const root = new Group();
  root.name = "placeholder";
  const bones: Partial<Record<HumanBone, Object3D>> = {};
  for (const [name, parent, x, y, z] of JOINTS) {
    const b = new Bone();
    b.name = name;
    b.position.set(x * scale, y * scale, z * scale);
    (parent ? bones[parent]! : root).add(b);
    bones[name] = b;
  }
  const up = new Vector3(0, 1, 0);
  for (const [name, parent] of JOINTS) {
    if (!parent || name.endsWith("Eye") || (parent === "upperChest" && name !== "neck")) continue;
    const child = bones[name]!;
    const len = child.position.length();
    const r = radiusOf(parent) * scale;
    const seg = new Mesh(new CapsuleGeometry(r, Math.max(1e-3, len - r), 4, 12), skin);
    seg.name = `${parent} segment`;
    seg.position.copy(child.position).multiplyScalar(0.5);
    seg.quaternion.setFromUnitVectors(up, child.position.clone().normalize());
    bones[parent]!.add(seg);
  }
  const head = new Mesh(new SphereGeometry(0.105 * scale, 24, 16), skin);
  head.name = "head";
  head.position.set(0, 0.09 * scale, 0.01 * scale);
  head.scale.set(0.9, 1.1, 0.95);
  bones.head!.add(head);
  for (const side of ["left", "right"] as const) {
    const eye = new Mesh(new SphereGeometry(0.016 * scale, 12, 8), joint);
    eye.name = `${side} eye`;
    eye.position.set(0, 0, 0.022 * scale);
    bones[`${side}Eye`]!.add(eye);
    const hand = new Mesh(new SphereGeometry(0.045 * scale, 12, 8), joint);
    hand.name = `${side} hand`;
    hand.position.set((side === "left" ? 1 : -1) * 0.05 * scale, 0, 0);
    bones[`${side}Hand`]!.add(hand);
  }
  root.updateMatrixWorld(true);
  const expressions = new ExpressionRig(root);
  return {
    format: "unknown",
    dialect: "placeholder",
    root,
    bones,
    humanoid: null,
    wardrobe: new Wardrobe(),
    expressions,
    head: new HeadHider(bones.head!),
    animations: [],
    repair: null,
    vrm: null,
    warnings: [],
    update() {
      expressions.apply();
    },
    dispose() {
      disposeObject(root);
    },
  };
}
