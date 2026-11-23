import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { referenceRest } from "@hackbuild/rig";
import { TextureIndex, alternates, categorize, checkRedistribution, guessUnit, load, partLabel, probeFbx, sniffFormat } from "../src/index.js";
import { ExpressionRig, HeadHider, Wardrobe, loadAvatar, managerForFiles, repairMaterials, roughnessFromShininess } from "../src/three.js";
import { vrmHook } from "../src/vrm.js";
import { MIXAMO, UAL, buildGlb, humanoidJoints } from "./glb.js";

beforeAll(async () => {
  await load();
});

type V3 = [number, number, number];
const ref = () => referenceRest() as unknown as Record<string, V3>;
const world = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());

describe("format", () => {
  it("sniffs glb, vrm, vrma and fbx from content", () => {
    const glb = buildGlb({ joints: humanoidJoints(ref(), UAL) });
    expect(sniffFormat(glb)).toBe("glb");
    expect(sniffFormat(buildGlb({ joints: humanoidJoints(ref(), UAL), extensionsUsed: ["VRMC_vrm"] }))).toBe("vrm");
    expect(sniffFormat(buildGlb({ joints: humanoidJoints(ref(), UAL), extensionsUsed: ["VRM"] }))).toBe("vrm");
    expect(sniffFormat(buildGlb({ joints: humanoidJoints(ref(), UAL), extensionsUsed: ["VRMC_vrm_animation"] }))).toBe("vrma");
    const fbx = new TextEncoder().encode("Kaydara FBX Binary  \0\x1a\0");
    expect(sniffFormat(fbx, "x.glb")).toBe("fbx");
    expect(sniffFormat(new TextEncoder().encode("; FBX 7.4.0 project file"))).toBe("fbx");
    expect(sniffFormat(new Uint8Array([1, 2, 3]), "a.FBX")).toBe("fbx");
    expect(sniffFormat(new Uint8Array([1, 2, 3]))).toBe("unknown");
  });

  it("tells an fbx character from an fbx clip", () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(probeFbx(enc("Kaydara FBX Binary ... Definitions ObjectType Model ObjectType Geometry ObjectType Deformer Objects ...")).kind).toBe("character");
    expect(probeFbx(enc("Kaydara FBX Binary ... Definitions ObjectType Model ObjectType AnimationCurve Objects Geometry Deformer")).kind).toBe("clip");
    expect(probeFbx(enc("no sections")).kind).toBe("unknown");
  });

  it("guesses units from head height", () => {
    expect(guessUnit(1.5)).toBe(1);
    expect(guessUnit(150)).toBe(0.01);
    expect(guessUnit(1500)).toBe(0.001);
    expect(guessUnit(15)).toBe(0.1);
    expect(guessUnit(2e6) * 2e6).toBeCloseTo(1.6 * 0.87, 6);
  });

  it("gates redistribution on VRM 1.0 and 0.x metadata", () => {
    expect(checkRedistribution({ metaVersion: "1", allowRedistribution: true, modification: "allowModification" }, { modified: false }).ok).toBe(true);
    expect(checkRedistribution({ metaVersion: "1", allowRedistribution: true, modification: "allowModification" }, { modified: true }).ok).toBe(false);
    expect(checkRedistribution({ metaVersion: "1", allowRedistribution: false }, { modified: false }).ok).toBe(false);
    expect(checkRedistribution({ metaVersion: "0", licenseName: "CC_BY_ND" }, { modified: true }).ok).toBe(false);
    expect(checkRedistribution({ metaVersion: "0", licenseName: "CC_BY_ND" }, { modified: false }).ok).toBe(true);
    expect(checkRedistribution({ metaVersion: "0", licenseName: "Redistribution_Prohibited" }, { modified: false }).ok).toBe(false);
    expect(checkRedistribution({ metaVersion: "0", licenseName: "Other" }, { modified: false }).needsConfirm).toBe(true);
    expect(checkRedistribution(null, { modified: false }).ok).toBe(false);
  });
});

describe("wardrobe classifier", () => {
  it("cleans VRoid names and puts parts in slots", () => {
    expect(partLabel("N00_002_01_Tops_01_CLOTH (Instance)")).toBe("Tops");
    const cases: [string, string | null][] = [
      ["N00_002_01_Tops_01_CLOTH (Instance)", "top"],
      ["Earrings", "ear"],
      ["GoldRing", "hand"],
      ["Megane", "eyewear"],
      ["Kanzashi_01", "hairAccessory"],
      ["Hakama", "bottom"],
      ["Haori.001", "outerwear"],
      ["HairBack", "hair"],
      ["Face", "face"],
      ["Body", "body"],
      ["KneeSocks_L", "legwear"],
      ["Sneakers", "footwear"],
      ["Cube.004", null],
    ];
    for (const [name, label] of cases) expect(categorize(name)?.label ?? null, name).toBe(label);
  });

  it("finds alternate garment states", () => {
    const alt = alternates(["Shorts", "Shorts_down", "Shorts_on_leg", "stocking_L", "No_stocking_L", "Shirt"]);
    expect([...alt].sort()).toEqual(["No_stocking_L", "Shorts_down", "Shorts_on_leg"]);
  });
});

describe("texture index", () => {
  it("finds images behind wrong references", () => {
    const idx = new TextureIndex(["Textures/body.png", "Textures/Face_Diffuse.PNG", "eyes.png.004", "other/deep/body.png", "readme.txt", "Hair.001.jpg"], "Aiko");
    expect(idx.files).not.toContain("readme.txt");
    expect(idx.forReference("C:\\Users\\x\\Textures\\body.png")).toBe("Textures/body.png");
    expect(idx.forReference("Aiko_Body_Texture.png")).toBe("Textures/body.png");
    expect(idx.forReference("face.tga")).toBe("Textures/Face_Diffuse.PNG");
    expect(idx.forReference("eyes.png")).toBe("eyes.png.004");
    expect(idx.forReference("hair.jpg")).toBe("Hair.001.jpg");
    expect(idx.forReference("missing.png")).toBeNull();
  });

  it("routes loader references through the index", () => {
    const files = new Map<string, Blob | string>([["tex/skin.png", "https://example.invalid/skin.png"]]);
    const m = managerForFiles(files, "Model");
    expect(m.manager.resolveURL("..\\textures\\Model_Skin_Texture.png")).toBe("https://example.invalid/skin.png");
    expect(m.manager.resolveURL("nothing.png")).toBe("nothing.png");
    expect(m.misses).toEqual(["nothing.png"]);
    m.dispose();
  });
});

describe("material repair", () => {
  it("converts, cuts out, whitens and drops duplicate alpha", () => {
    const tex = new THREE.Texture();
    const phong = new THREE.MeshPhongMaterial({ name: "skin", shininess: 30, map: tex, color: 0x000000 });
    const glass = new THREE.MeshStandardMaterial({ name: "teeth", transparent: true, opacity: 1 });
    const hidden = new THREE.MeshStandardMaterial({ name: "lace", map: tex, opacity: 0 });
    const dup = new THREE.MeshLambertMaterial({ name: "hair", map: tex, alphaMap: tex });
    const root = new THREE.Group();
    const geo = new THREE.BufferGeometry();
    root.add(new THREE.Mesh(geo, phong), new THREE.Mesh(geo, [glass, hidden]), new THREE.Mesh(geo, dup));
    const skinned = new THREE.SkinnedMesh(geo, phong);
    root.add(skinned);
    const r = repairMaterials(root);
    expect(r.converted).toBe(2);
    expect(r.whitened).toBe(1);
    expect(r.cutouts).toBe(2);
    expect(r.droppedMaps).toBe(1);
    expect(skinned.frustumCulled).toBe(false);
    const m0 = (root.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect(m0).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(m0.roughness).toBeCloseTo(roughnessFromShininess(30), 9);
    expect(m0.color.getHex()).toBe(0xffffff);
    expect(skinned.material).toBe(m0);
    expect(tex.colorSpace).toBe(THREE.SRGBColorSpace);
    const [g, h] = (root.children[1] as THREE.Mesh).material as THREE.Material[];
    expect(g!.transparent).toBe(false);
    expect(g!.alphaTest).toBe(0.5);
    expect(h!.opacity).toBe(1);
    expect(((root.children[2] as THREE.Mesh).material as THREE.MeshStandardMaterial).alphaMap).toBeNull();
  });
});

describe("loading into the normalized space", () => {
  it("wraps a turned, centimeter, A pose Mixamo GLB", async () => {
    const joints = humanoidJoints(ref(), MIXAMO, { prefix: "mixamorig:", aPoseDeg: 40, turn: true, scale: 100, rootName: "Armature" });
    const glb = buildGlb({
      joints,
      meshes: [{ name: "Body", material: 0 }, { name: "Tops", material: 1 }, { name: "Glasses", material: 2 }, { name: "Shorts", material: 1 }, { name: "Shorts_down", material: 1 }],
      materials: [{ name: "Skin" }, { name: "Cloth", alphaMode: "BLEND" }, { name: "Lens" }],
      morphs: { mesh: "Body", names: ["eyeBlinkLeft", "eyeBlinkRight", "jawOpen", "mouthPucker", "mouthFunnel", "mouthSmileLeft", "mouthSmileRight", "mouthStretchLeft", "mouthStretchRight", "mouthLowerDownLeft", "mouthLowerDownRight"] },
    });
    const holder = new THREE.Group();
    const a = await loadAvatar(glb.buffer as ArrayBuffer, { name: "mixamo.glb" });
    holder.add(a.root);
    holder.updateMatrixWorld(true);
    expect(a.format).toBe("glb");
    expect(a.dialect).toBe("mixamo");
    expect(a.humanoid!.rest.units).toBe("centimeters");
    expect(a.humanoid!.rest.aPose).toBe(true);
    expect(a.warnings.length).toBe(2);
    const p = (b: string) => world(a.bones[b as "head"]!);
    expect(p("leftUpperArm").x).toBeGreaterThan(0);
    expect(p("head").z).toBeCloseTo(0, 4);
    expect(p("leftLowerArm").sub(p("leftUpperArm")).normalize().x).toBeCloseTo(1, 5);
    expect(Math.min(p("leftToes").y, p("rightToes").y)).toBeCloseTo(0, 5);
    expect(a.humanoid!.headHeight).toBeCloseTo(ref().head![1] - ref().leftToes![1], 3);
    // blend mode cloth with full opacity became a cutout
    expect(a.repair!.cutouts).toBeGreaterThanOrEqual(1);
    // wardrobe: alternate starts hidden, clothing sorts first, equip hides the slot
    const parts = a.wardrobe.parts;
    expect(parts[0]!.group).toBe("clothing");
    const down = parts.find((x) => x.name === "Shorts_down")!;
    const shorts = parts.find((x) => x.name === "Shorts")!;
    expect(down.visible).toBe(false);
    expect(down.meshes[0]!.visible).toBe(false);
    a.wardrobe.equip(down.id);
    expect(shorts.visible).toBe(false);
    expect(down.visible).toBe(true);
    const snap = a.wardrobe.snapshot();
    a.wardrobe.toggle(parts.find((x) => x.label === "eyewear")!.id);
    a.wardrobe.restore(snap);
    expect(parts.find((x) => x.label === "eyewear")!.visible).toBe(true);
    // expressions resolve through ARKit composites and write morph influences
    const face = a.expressions as ExpressionRig;
    expect(face.found.blink?.source).toBe("arkit");
    expect(face.found.aa?.source).toBe("arkit");
    face.setValue("blink", 1);
    face.setValue("aa", 0.5);
    a.update(1 / 60);
    const body = a.root.getObjectByName("Body") as THREE.Mesh;
    const infl = (n: string) => body.morphTargetInfluences![body.morphTargetDictionary![n]!]!;
    expect(infl("eyeBlinkLeft")).toBe(1);
    expect(infl("jawOpen")).toBeCloseTo(0.35, 6);
    face.reset();
    face.apply();
    expect(infl("eyeBlinkLeft")).toBe(0);
  });

  it("wraps a UAL style GLB already in meters", async () => {
    const a = await loadAvatar(buildGlb({ joints: humanoidJoints(ref(), UAL) }));
    expect(a.humanoid!.report.missingRequired).toEqual([]);
    expect(a.humanoid!.rest.units).toBe("meters");
    expect(a.humanoid!.rest.aPose).toBe(false);
    expect(a.warnings).toEqual([]);
    a.root.updateMatrixWorld(true);
    expect(world(a.bones.hips!).y).toBeCloseTo(ref().hips![1] - Math.min(ref().leftToes![1], ref().rightToes![1]), 4);
  });

  it("names the missing bones of a non humanoid", async () => {
    const joints = [
      { name: "root", parent: null, p: [0, 0, 0] as V3 },
      { name: "body", parent: "root", p: [0, 1, 0] as V3 },
    ];
    await expect(loadAvatar(buildGlb({ joints }))).rejects.toThrow(/missing required bones: .*hips/);
    await expect(loadAvatar(new TextEncoder().encode("plain text"))).rejects.toThrow(/unknown model format/);
  });

  it("loads a VRM 1.0 through the three-vrm hook", async () => {
    const joints = humanoidJoints(ref(), UAL);
    const glb = buildGlb({
      joints,
      extensionsUsed: ["VRMC_vrm"],
      nodeIndex: (idx) => ({
        VRMC_vrm: {
          specVersion: "1.0",
          meta: { name: "test", authors: ["test"], licenseUrl: "https://vrm.dev/licenses/1.0/", allowRedistribution: true, modification: "prohibited", avatarPermission: "everyone", commercialUsage: "personalNonProfit" },
          humanoid: { humanBones: Object.fromEntries(Object.entries(UAL).map(([b, n]) => [b, { node: idx.get(n)! }])) },
        },
      }),
    });
    const plain = await loadAvatar(glb);
    expect(plain.vrm).toBeNull();
    expect(plain.warnings[0]).toMatch(/vrm loaded as plain gltf/);
    const a = await loadAvatar(glb, { vrm: vrmHook() });
    expect(a.format).toBe("vrm");
    expect(a.vrm).not.toBeNull();
    expect(a.humanoid).toBeNull();
    expect(a.bones.hips).toBeDefined();
    expect(Object.keys(a.bones).length).toBe(Object.keys(UAL).length);
    expect(checkRedistribution(a.vrm!.meta as never, { modified: true }).ok).toBe(false);
    expect(checkRedistribution(a.vrm!.meta as never, { modified: false }).ok).toBe(true);
    a.update(1 / 60);
  });
});

describe("first person", () => {
  it("scales the head to 0.001 for one render and restores it", () => {
    const head = new THREE.Bone();
    head.scale.set(1.05, 1.05, 1.05);
    const h = new HeadHider(head);
    const seen: number[] = [];
    h.render({ render: () => seen.push(head.scale.x) }, new THREE.Scene(), new THREE.PerspectiveCamera());
    expect(seen).toEqual([0.001]);
    expect(head.scale.x).toBe(1.05);
    expect(() =>
      h.during(() => {
        throw new Error("draw failed");
      }),
    ).toThrow("draw failed");
    expect(head.scale.x).toBe(1.05);
  });
});
