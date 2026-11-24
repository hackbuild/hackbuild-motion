// Layout data, light math and the set assembler. Kit models are built in
// code; no model or image file is read.
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { MissingFileError, PRESETS, azimuthOfU, brightestAzimuth, direction, missingFor, needsOf, normalizeProbe, presetOf, probeMean } from "../src/index.js";
import { SHADOW_EXTENT, SHADOW_MAP, assemble, buildRig } from "../src/three.js";

/** Equirect floats, RGBA, black with a bright square at column `u`. */
function equirect(w: number, h: number, u: number, extra?: (data: Float32Array) => void): Float32Array {
  const data = new Float32Array(w * h * 4);
  const cx = Math.floor(u * w);
  for (let y = h / 4 - 3; y <= h / 4 + 3; y++)
    for (let x = cx - 3; x <= cx + 3; x++) {
      const i = (y * w + ((x + w) % w)) * 4;
      data[i] = data[i + 1] = data[i + 2] = 10;
    }
  extra?.(data);
  return data;
}

describe("presets", () => {
  it("ship the studio with no file and list the others' files", () => {
    expect(PRESETS.map((p) => p.id)).toEqual(["studio", "room", "cafe", "outdoors"]);
    expect(needsOf(presetOf("studio")!)).toEqual([]);
    const room = needsOf(presetOf("room")!);
    expect(room[0]).toBe("hdri/lythwood_room_1k.hdr");
    expect(room).toContain("kenney-furniture/wall.glb");
    expect(new Set(room).size).toBe(room.length);
    expect(missingFor(presetOf("room")!, (f) => f.startsWith("hdri/"))).not.toContain("hdri/lythwood_room_1k.hdr");
    for (const p of PRESETS) if (p.hdri) expect(p.hdri.licence).toBe("CC0");
  });

  it("names the file in the missing error", () => {
    const e = new MissingFileError("kenney-furniture/wall.glb");
    expect(e.message).toBe("environment: could not load kenney-furniture/wall.glb. drop the file or pick the studio.");
  });
});

describe("light math", () => {
  it("points 0 degrees at the camera and 90 to its right", () => {
    const [x, y, z] = direction(0, 0);
    expect([x, y, z].map((v) => +v.toFixed(6))).toEqual([0, 0, 1]);
    expect(direction(90, 0)[0]).toBeCloseTo(1, 6);
    expect(direction(0, 90)[1]).toBeCloseTo(1, 6);
  });

  it("finds the azimuth of a bright patch and ignores a lone hot pixel", () => {
    const w = 256;
    const h = 128;
    const data = equirect(w, h, 0.7, (d) => {
      const i = (20 * w + 30) * 4;
      d[i] = d[i + 1] = d[i + 2] = 30;
    });
    const got = brightestAzimuth(data, w, h);
    // anywhere on the patch: 3 px either side is 0.074 rad (computed)
    const near = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    expect(near(got, azimuthOfU((Math.floor(0.7 * w) + 0.5) / w))).toBeLessThan(0.075);
    expect(near(got, azimuthOfU(30.5 / w))).toBeGreaterThan(1);
    // below the horizon does not count
    const low = equirect(w, h, 0.2);
    const i = ((h - 10) * w + 10) * 4;
    low[i] = low[i + 1] = low[i + 2] = 1000;
    expect(near(brightestAzimuth(low, w, h), azimuthOfU((Math.floor(0.2 * w) + 0.5) / w))).toBeLessThan(0.075);
  });

  it("normalizes a probe to mean radiance 1 and pulls it to grey", () => {
    const cs: [number, number, number][] = [[40, 30, 20], [3, 2, 1], [1, 1, 1], [0, 0, 0], [0.5, 0.2, 0.1], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const before = probeMean(cs[0]!);
    const mean = normalizeProbe(cs, 0.5);
    expect(mean).toBeCloseTo(before, 9);
    expect(probeMean(cs[0]!)).toBeCloseTo(1, 9);
    const grey: [number, number, number][] = [[40, 30, 20]];
    normalizeProbe(grey, 0);
    expect(grey[0]![0]).toBeCloseTo(grey[0]![2], 9);
  });
});

describe("rig", () => {
  it("gives the key light a 1024 shadow map over 1.6 m each side", () => {
    const rig = buildRig(presetOf("studio")!.layout);
    const key = rig.getObjectByName("environment-key") as THREE.DirectionalLight;
    expect(key.castShadow).toBe(true);
    expect(key.shadow.mapSize.x).toBe(SHADOW_MAP);
    expect(key.shadow.camera.right).toBe(SHADOW_EXTENT);
    expect(SHADOW_EXTENT).toBe(1.6);
    expect(rig.getObjectByName("environment-rim")).toBeTruthy();
  });
});

describe("assemble", () => {
  const tile = () => {
    const root = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x808080, metalness: 1 });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(1, 0.05, 1), mat);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 0.05), mat);
    trim.position.set(0, 0.05, -0.5);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), new THREE.MeshStandardMaterial({ color: 0xffeecc }));
    root.add(floor, trim, lamp);
    return { root, sources: [floor.geometry, trim.geometry, lamp.geometry], mat };
  };

  it("merges a 3 by 3 grid into one mesh per material and frees the sources", async () => {
    const t = tile();
    const freed = new Set<THREE.BufferGeometry>();
    for (const g of t.sources) g.addEventListener("dispose", () => freed.add(g));
    const set = await assemble([{ model: "kit/floor.glb", at: [-1.5, 0, -1.5], grid: [3, 3] }], 2, async () => t.root);
    const meshes = set.children as THREE.Mesh[];
    expect(meshes.length).toBe(2);
    expect(freed.size).toBe(3);
    expect(t.mat.metalness).toBe(0);
    const box = new THREE.Box3().setFromObject(set);
    expect(box.max.x - box.min.x).toBeCloseTo(6, 5);
    expect(meshes.every((m) => m.receiveShadow)).toBe(true);
  });

  it("rejects with the file name when a model is missing", async () => {
    const load = async (f: string) => {
      if (f === "kit/wall.glb") throw new Error("404");
      return tile().root;
    };
    await expect(assemble([{ model: "kit/floor.glb", at: [0, 0, 0] }, { model: "kit/wall.glb", at: [1, 0, 0] }], 1, load)).rejects.toMatchObject({ file: "kit/wall.glb" });
  });
});
