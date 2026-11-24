// The model pack repair set: baked units, UDIM tiles, UV coverage, stored
// FBX visibility, map readiness, Unicode texture names and the VRM wrap.
// Fixtures are built in memory; no model or image files.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { beforeAll, describe, expect, it } from "vitest";
import { referenceRest } from "@hackbuild/rig";
import { SPHERE_MAP, TextureIndex, hiddenInFile, load } from "../src/index.js";
import { type ImageSample, type RepairReport, SAMPLE_SIZE, applyStartingVisibility, bakeScale, coverage, fillMaps, loadAvatar, managerForFiles, pickMaps, resolveTiles, samplePixels, tileGroups, uvCenters } from "../src/three.js";
import { EYE_RANGE, toVrm } from "../src/vrm.js";
import { MIXAMO, buildGlb, humanoidJoints } from "./glb.js";

beforeAll(async () => {
  await load();
});

type V3 = [number, number, number];
const ref = () => referenceRest() as unknown as Record<string, V3>;
const own = (b: Uint8Array) => b.slice().buffer as ArrayBuffer;
const emptyReport = (): RepairReport => ({ converted: 0, cutouts: 0, whitened: 0, droppedMaps: 0, colorSpace: 0, byName: 0, byTile: 0, byCoverage: 0, misses: [] });

/** A mesh with one triangle per group, each group's UVs centered on `uv`. */
function tiledMesh(groups: { mat: THREE.Material; uv: [number, number]; tris?: number }[]): THREE.Mesh {
  const pos: number[] = [];
  const uvs: number[] = [];
  const g = new THREE.BufferGeometry();
  let start = 0;
  groups.forEach((grp, i) => {
    const n = grp.tris ?? 1;
    for (let t = 0; t < n; t++) {
      pos.push(0, 0, 0, 1, 0, 0, 0, 1, 0);
      const [u, v] = grp.uv;
      uvs.push(u - 0.05, v - 0.05, u + 0.05, v - 0.05, u, v + 0.05);
    }
    g.addGroup(start, n * 3, i);
    start += n * 3;
  });
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  return new THREE.Mesh(g, groups.map((x) => x.mat));
}

const mat = (name: string, file?: string) => {
  const m = new THREE.MeshStandardMaterial({ name });
  if (file) {
    m.map = new THREE.Texture();
    m.map.userData.file = file;
  }
  return m;
};

/** White image with the left half painted red. */
function leftPainted(): ImageSample {
  const px = new Uint8ClampedArray(SAMPLE_SIZE * SAMPLE_SIZE * 4).fill(255);
  for (let y = 1; y < SAMPLE_SIZE - 1; y++)
    for (let x = 1; x < SAMPLE_SIZE / 2; x++) {
      const p = (y * SAMPLE_SIZE + x) * 4;
      px[p + 1] = 0;
      px[p + 2] = 0;
    }
  return samplePixels(px);
}

describe("bakeScale", () => {
  it("scales skinned vertices in world space and leaves the root scale at 1", async () => {
    const glb = buildGlb({ joints: humanoidJoints(ref(), MIXAMO, { scale: 100 }) });
    const gltf = await new GLTFLoader().parseAsync(own(glb), "");
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    const skinned: THREE.SkinnedMesh[] = [];
    root.traverse((o) => (o as THREE.SkinnedMesh).isSkinnedMesh && skinned.push(o as THREE.SkinnedMesh));
    const worldOf = () =>
      skinned.flatMap((m) => {
        const out: THREE.Vector3[] = [];
        for (let i = 0; i < m.geometry.attributes.position!.count; i++) out.push(m.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(m.matrixWorld));
        return out;
      });
    const before = worldOf();
    bakeScale(root, 0.01);
    const after = worldOf();
    expect(after.length).toBe(before.length);
    after.forEach((v, i) => {
      expect(v.x).toBeCloseTo(before[i]!.x * 0.01, 5);
      expect(v.y).toBeCloseTo(before[i]!.y * 0.01, 5);
      expect(v.z).toBeCloseTo(before[i]!.z * 0.01, 5);
    });
    expect(root.scale.x).toBe(1);
  });

  it("puts a centimeter model into meters with an unscaled wrapper", async () => {
    const glb = buildGlb({ joints: humanoidJoints(ref(), MIXAMO, { prefix: "mixamorig:", scale: 100, turn: true }) });
    const a = await loadAvatar(glb, { name: "cm.glb" });
    expect(a.humanoid!.root.scale.x).toBe(1);
    const y = (b: "head" | "leftToes") => a.bones[b]!.getWorldPosition(new THREE.Vector3()).y;
    expect(y("head") - y("leftToes")).toBeCloseTo(ref().head![1] - ref().leftToes![1], 3);
    expect(a.warnings.join(" ")).toContain("centimeters");
  });
});

describe("tiles and coverage", () => {
  it("gives each tile its own file when material names cross", () => {
    const body = mat("Body");
    const legs = mat("Legs");
    const crossed = mat("Body Upper");
    const mesh = tiledMesh([
      { mat: body, uv: [0.5, 0.5], tris: 6 },
      { mat: legs, uv: [1.5, 0.5], tris: 4 },
      { mat: crossed, uv: [1.5, 0.5], tris: 1 },
    ]);
    const groups = tileGroups(mesh);
    expect(groups.map((g) => g.tile)).toEqual(["0,0", "1,0", "1,0"]);
    const names: Record<string, string> = { Body: "body.png", Legs: "legs.png", "Body Upper": "body.png" };
    const out = resolveTiles(groups, (m) => names[m.name] ?? null);
    expect(out.get(body)).toBe("body.png");
    expect(out.get(legs)).toBe("legs.png");
    expect(out.get(crossed)).toBe("legs.png");
  });

  it("returns nothing for a mesh on one tile", () => {
    const mesh = tiledMesh([{ mat: mat("A"), uv: [0.2, 0.2] }, { mat: mat("B"), uv: [0.7, 0.7] }]);
    expect(resolveTiles(tileGroups(mesh), () => "a.png").size).toBe(0);
  });

  it("scores coverage on painted pixels and finds the background", () => {
    const img = leftPainted();
    expect(img.background).toEqual([252, 252, 252]);
    expect(coverage(img, Float32Array.from([0.25, 0.5, 0.3, 0.4]))).toBe(1);
    expect(coverage(img, Float32Array.from([0.75, 0.5, 0.25, 0.5]))).toBe(0.5);
    expect(coverage(img, new Float32Array(0))).toBe(0);
  });

  it("takes a sibling's image that covers the uvs and refuses one under 0.6", async () => {
    const skin = mat("Skin", "skin.png");
    const left = mat("Nails");
    const right = mat("Metal");
    const mesh = tiledMesh([
      { mat: skin, uv: [0.25, 0.5], tris: 3 },
      { mat: left, uv: [0.25, 0.3] },
      { mat: right, uv: [0.75, 0.5] },
    ]);
    expect(uvCenters(mesh, left).length).toBe(2);
    const picked = await pickMaps([mesh], {
      own: (m) => ((m as THREE.MeshStandardMaterial).map?.userData.file as string | undefined) ?? null,
      byName: () => null,
      sample: async () => leftPainted(),
    });
    expect(picked.get(left)).toEqual({ file: "skin.png", via: "coverage" });
    expect(picked.get(right)).toBeNull();
    expect(picked.has(skin)).toBe(false);
  });

  it("prefers a name match and reports it", async () => {
    const m = mat("Torso.001");
    const mesh = tiledMesh([{ mat: m, uv: [0.5, 0.5] }]);
    const index = new TextureIndex(["tex/torso.png", "tex/legs.png"], "model");
    const picked = await pickMaps([mesh], { own: () => null, byName: (n) => index.forReference(n), sample: async () => null });
    expect(picked.get(m)).toEqual({ file: "tex/torso.png", via: "name" });
  });
});

describe("texture readiness", () => {
  it("resolves ready false for a reference no file matches, and drops the map", async () => {
    const files = managerForFiles(new Map<string, string>([["body.png", "data:image/png;base64,AA"]]), "model");
    const handler = files.manager.getHandler(".png") as unknown as { load(name: string): THREE.Texture } | null;
    expect(handler).toBeTruthy();
    const t = handler!.load("C:\\work\\missing.png");
    expect(await t.userData.ready).toBe(false);
    expect(files.misses).toContain("C:\\work\\missing.png");
    const m = new THREE.MeshStandardMaterial({ name: "Hat", map: t });
    const root = new THREE.Group().add(new THREE.Mesh(new THREE.BufferGeometry(), m));
    const report = emptyReport();
    await fillMaps(root, { index: files.index, texture: () => t }, report);
    expect(m.map).toBeNull();
    expect(report.droppedMaps).toBe(1);
    files.dispose();
  });

  it("matches a Japanese file name by key words and never a sphere map", () => {
    const index = new TextureIndex(["tex/体.png", "tex/顔.png", "tex/toon.sph"], "モデル");
    expect(index.forReference("C:\\work\\モデル_体.png")).toBe("tex/体.png");
    expect(index.forReference("顔_texture.png")).toBe("tex/顔.png");
    expect(index.forReference("toon.sph")).toBeNull();
    expect(SPHERE_MAP.test("a.spa")).toBe(true);
  });
});

describe("fbx stored visibility", () => {
  const enc = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
  const u32 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255];
  const str = (s: string) => [0x53, ...u32(s.length), ...enc(s)];
  const f64 = (v: number) => {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setFloat64(0, v, true);
    return [0x44, ...b];
  };
  const model = (name: string, visible: number) => [...str(`${name}\u0000\u0001Model`), ...str("Mesh"), ...enc("Properties70"), ...str("Visibility"), ...str("Visibility"), ...str(""), ...str("A"), ...f64(visible)];

  it("reads hidden models from a binary fragment", () => {
    const bytes = Uint8Array.from([...enc("Kaydara FBX Binary  \u0000\u001a\u0000"), 0, 0, 0, 0, ...model("Shorts_down", 0), ...model("Shirt", 1), ...model("Hat", 0)]);
    expect([...hiddenInFile(bytes)].sort()).toEqual(["Hat", "Shorts_down"]);
  });

  it("reads hidden models from an ascii fragment and hides them", () => {
    const text = [
      "; FBX 7.4.0 project file",
      "Objects:  {",
      '\tModel: 1, "Model::Cape", "Mesh" {',
      '\t\tProperties70:  {',
      '\t\t\tP: "Visibility", "Visibility", "", "A",0',
      "\t\t}",
      "\t}",
      '\tModel: 2, "Model::Body", "Mesh" {',
      '\t\tProperties70:  {',
      '\t\t\tP: "Visibility", "Visibility", "", "A",1',
      "\t\t}",
      "\t}",
      "}",
    ].join("\n");
    const hidden = hiddenInFile(new TextEncoder().encode(text));
    expect([...hidden]).toEqual(["Cape"]);
    const root = new THREE.Group();
    const cape = new THREE.Mesh();
    cape.name = "Cape";
    const body = new THREE.Mesh();
    body.name = "Body";
    root.add(cape, body);
    expect(applyStartingVisibility(root, hidden)).toBe(1);
    expect(cape.visible).toBe(false);
    expect(body.visible).toBe(true);
  });
});

describe("toVrm", () => {
  it("wraps a Mixamo named GLB with identity rest rotations on normalized bones", async () => {
    const glb = buildGlb({
      joints: humanoidJoints(ref(), MIXAMO, { prefix: "mixamorig:", scale: 100, turn: true, aPoseDeg: 40 }),
      morphs: { mesh: "Body", names: ["Blink", "vrc.v_aa"] },
    });
    const a = await loadAvatar(glb, { name: "mixamo.glb" });
    const vrm = toVrm(a);
    for (const b of ["hips", "spine", "head", "leftUpperArm", "rightLowerLeg"] as const) {
      const n = vrm.humanoid.getNormalizedBoneNode(b)!;
      expect(n, b).toBeTruthy();
      expect(Math.abs(n.quaternion.w)).toBeCloseTo(1, 6);
    }
    const raw = vrm.humanoid.getRawBoneNode("leftUpperArm")!;
    const lower = vrm.humanoid.getRawBoneNode("leftLowerArm")!;
    const elbow = () => lower.getWorldPosition(new THREE.Vector3());
    const y0 = elbow().y;
    // turning the normalized left upper arm down about +Z lowers the elbow
    vrm.humanoid.getNormalizedBoneNode("leftUpperArm")!.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 4);
    vrm.update(1 / 60);
    vrm.scene.updateMatrixWorld(true);
    expect(elbow().y).toBeLessThan(y0 - 0.05);
    expect(raw).toBe(a.bones.leftUpperArm);
    expect(vrm.expressionManager?.getExpression("blink")).toBeTruthy();
    expect(vrm.expressionManager?.getExpression("aa")).toBeTruthy();
    expect(EYE_RANGE).toEqual({ yaw: 12, pitch: 8 });
  });

  it("names the missing bones", () => {
    expect(() => toVrm({ root: new THREE.Group(), bones: {}, vrm: null })).toThrow(/missing hips/);
  });
});
