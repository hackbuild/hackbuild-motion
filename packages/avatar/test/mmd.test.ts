// MMD loading on synthetic data only: a skeleton built in code with MMD
// bone names, and a rigid body list written here. No model file is read.
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { load } from "../src/index.js";
import { type MmdModelData, type MmdRigidBody, MMD_LOCAL_COPY, buildSprings, loadMmd, mmdFormat, spineUnderHips, springSettings } from "../src/mmd.js";

beforeAll(async () => {
  await load();
});

type V3 = [number, number, number];
// world rest positions in MMD units (about 20 to a figure), parent name
const SKELETON: [string, string | null, V3][] = [
  ["センター", null, [0, 8, 0]],
  ["上半身", "センター", [0, 11, 0]],
  ["上半身2", "上半身", [0, 12.5, 0]],
  ["首", "上半身2", [0, 15, 0]],
  ["頭", "首", [0, 16, 0]],
  ["髪1", "頭", [0, 17, 1]],
  ["髪2", "髪1", [0, 15, 1.5]],
  ["下半身", "センター", [0, 11, 0]],
  ["スカート_0", "下半身", [0, 10, -1]],
  ["スカート_1", "スカート_0", [0, 8, -1.5]],
];
for (const [side, s] of [["左", 1], ["右", -1]] as const) {
  SKELETON.push(
    [`${side}肩`, "上半身2", [s * 0.5, 14.5, 0]],
    [`${side}腕`, `${side}肩`, [s * 1.5, 14.3, 0]],
    [`${side}ひじ`, `${side}腕`, [s * 4.5, 12.5, 0]],
    [`${side}手首`, `${side}ひじ`, [s * 7, 10.8, 0]],
    [`${side}足`, "下半身", [s * 1, 10, 0]],
    [`${side}ひざ`, `${side}足`, [s * 1, 5.5, 0]],
    [`${side}足首`, `${side}ひざ`, [s * 1, 1, 0]],
    [`${side}足D`, "下半身", [s * 1, 10, 0]],
    [`${side}ひざD`, `${side}足D`, [s * 1, 5.5, 0]],
    [`${side}足首D`, `${side}ひざD`, [s * 1, 1, 0]],
  );
}

function skeleton(): { bones: THREE.Bone[]; byName: Map<string, THREE.Bone>; model: MmdModelData["bones"] } {
  const byName = new Map<string, THREE.Bone>();
  const world = new Map<string, V3>();
  const bones = SKELETON.map(([name, parent, p]) => {
    const b = new THREE.Bone();
    b.name = name;
    const pp = parent ? world.get(parent)! : ([0, 0, 0] as V3);
    b.position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]);
    if (parent) byName.get(parent)!.add(b);
    byName.set(name, b);
    world.set(name, p);
    return b;
  });
  return { bones, byName, model: SKELETON.map(([, , p]) => ({ position: p })) };
}

const index = (name: string) => SKELETON.findIndex(([n]) => n === name);
const body = (bone: string, physicsMode: number, shapeType = 0, at?: V3): MmdRigidBody => ({
  name: bone,
  boneIndex: index(bone),
  shapeType,
  shapeSize: [0.5, 2, 0.5],
  shapePosition: at ?? SKELETON[index(bone)]![2],
  shapeRotation: [0, 0, 0],
  linearDamping: 0.5,
  physicsMode,
});
const BODIES: MmdRigidBody[] = [
  body("頭", 0, 0, [0, 16.8, 0]),
  body("上半身", 0, 2),
  body("下半身", 0, 1),
  body("左腕", 0, 2),
  body("髪1", 1),
  body("髪2", 1),
  body("スカート_0", 1),
  body("スカート_1", 2),
];

describe("mmd springs", () => {
  it("gives one collider per bone following body and one joint per simulated bone", () => {
    const { bones, byName, model } = skeleton();
    const humanoid = new Set<THREE.Object3D>(["頭", "上半身", "下半身", "左腕"].map((n) => byName.get(n)!));
    const m = buildSprings({ bones: model, rigidBodies: BODIES }, bones, humanoid, 0.08)!;
    expect(m).not.toBeNull();
    const joints = [...m.joints];
    expect(joints.map((j) => j.bone.name).sort()).toEqual(["スカート_0", "スカート_1", "髪1", "髪2"].sort());
    const colliders = new Set(joints.flatMap((j) => j.colliderGroups.flatMap((g) => g.colliders)));
    expect(colliders.size).toBe(4);
    for (const n of ["頭", "上半身", "下半身", "左腕"]) expect(byName.get(n)!.children.filter((c) => c.name.startsWith("collider")).length).toBe(1);
    // the head body sits 0.8 units above its bone: 0.064 m in the bone frame
    const head = byName.get("頭")!.children.find((c) => c.name.startsWith("collider")) as unknown as { shape: { offset: THREE.Vector3 } };
    expect(head.shape.offset.y).toBeCloseTo(0.064, 6);
    // a chain links to its simulated child
    expect(joints.find((j) => j.bone.name === "髪1")!.child?.name).toBe("髪2");
  });

  it("gives a skirt named bone the stiffer setting", () => {
    expect(springSettings("スカート_0", 0.5, 1, 0.08).stiffness).toBe(1.6);
    expect(springSettings("left skirt", 0.5, 1, 0.08).stiffness).toBe(1.6);
    expect(springSettings("髪1", 0.5, 1, 0.08).stiffness).toBe(1.2);
    const { bones, byName, model } = skeleton();
    const m = buildSprings({ bones: model, rigidBodies: BODIES }, bones, new Set([byName.get("頭")!]), 0.08)!;
    const stiff = Object.fromEntries([...m.joints].map((j) => [j.bone.name, j.settings.stiffness]));
    expect(stiff["スカート_0"]).toBe(1.6);
    expect(stiff["髪1"]).toBe(1.2);
  });

  it("returns null when no body is simulated", () => {
    const { bones, model } = skeleton();
    expect(buildSprings({ bones: model, rigidBodies: BODIES.filter((b) => b.physicsMode === 0) }, bones, new Set(), 0.08)).toBeNull();
  });
});

describe("spine under hips", () => {
  it("moves the upper body under the lower body at the same world transform", () => {
    const { byName } = skeleton();
    const root = byName.get("センター")!;
    root.rotation.set(0.1, 0.4, 0);
    byName.get("上半身")!.rotation.set(0.2, 0, 0.05);
    root.updateMatrixWorld(true);
    const spine = byName.get("上半身")!;
    const before = spine.matrixWorld.clone();
    expect(spineUnderHips({ hips: byName.get("下半身")!, spine })).toBe(true);
    expect(spine.parent).toBe(byName.get("下半身"));
    spine.updateMatrixWorld(true);
    spine.matrixWorld.elements.forEach((v, i) => expect(v).toBeCloseTo(before.elements[i]!, 6));
    expect(spineUnderHips({ hips: byName.get("下半身")!, spine })).toBe(false);
  });
});

describe("loadMmd", () => {
  const fakeParser = () => {
    const { bones, model } = skeleton();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 20, 0, 1, 10, 0], 3));
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    mesh.add(bones[0]!);
    mesh.bind(new THREE.Skeleton(bones));
    class MMDLoader {
      setResourcePath() {}
      loadAsync() {
        return Promise.resolve({ mesh, pmx: { bones: model, rigidBodies: BODIES } });
      }
    }
    return async () => ({ MMDLoader });
  };

  it("loads into the normalized space as a local vrm with springs", async () => {
    const a = await loadMmd("blob:model", { name: "figure.pmx", parser: fakeParser() });
    expect(a.local).toBe(true);
    expect(a.warnings[0]).toBe(MMD_LOCAL_COPY);
    expect(a.dialect).toBe("mmd");
    // the D bones drive the legs
    expect(a.humanoid!.bones.leftUpperLeg!.name).toBe("左足D");
    // spine grows out of the hips
    let p = a.humanoid!.bones.spine!.parent;
    while (p && p !== a.humanoid!.bones.hips) p = p.parent;
    expect(p).toBe(a.humanoid!.bones.hips);
    expect(a.physics).toEqual({ colliders: 4, joints: 4 });
    // head 15 units above the ankle at 0.08 m per unit: 1.2 m (computed)
    expect(a.humanoid!.headHeight).toBeCloseTo(1.2, 4);
    a.update(1 / 60);
    a.dispose();
  });
});

describe("mmd sniff", () => {
  it("reads pmx and pmd from the first bytes", () => {
    expect(mmdFormat(new TextEncoder().encode("PMX \0\0\0@"))).toBe("pmx");
    expect(mmdFormat(new TextEncoder().encode("Pmd\0"))).toBe("pmd");
    expect(mmdFormat(new Uint8Array([0x67, 0x6c, 0x54, 0x46]))).toBeNull();
  });
});
