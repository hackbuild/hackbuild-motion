import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { bakeClips, checkLock, decodePack, goldenTrace, listTextures, load, lockEntry, optimizeModel, sampleClip, sha256Hex, syntheticClips, syntheticGlb, writeLock } from "../src/index.js";

const here = import.meta.dirname;
const golden = JSON.parse(readFileSync(join(here, "../../../crates/bake/tests/golden.json"), "utf8")) as { seed: number; values: number[] };

beforeAll(async () => {
  await load();
});

describe("@hackbuild/bake", () => {
  it("golden trace is bit identical to the native build", () => {
    const got = Array.from(goldenTrace(golden.seed));
    expect(got.length).toBe(golden.values.length);
    got.forEach((v, i) => expect(Object.is(v, golden.values[i]), `value ${i}`).toBe(true));
  });

  it("optimizes a triangle soup and runs the async texture hook", async () => {
    const glb = syntheticGlb(4, 10);
    const seen: string[] = [];
    const { glb: out, report } = await optimizeModel(glb, {
      textures: { baseColor: 1024 },
      resize: async (t) => {
        seen.push(`${t.role} ${t.width}x${t.height} max ${t.maxSize}`);
        expect(t.data.byteLength).toBe(t.bytes);
        return { bytes: new Uint8Array([1, 2, 3, 4]), mime: "image/webp" };
      },
    });
    expect(seen).toEqual(["baseColor 2048x1024 max 1024"]);
    expect(report.verticesIn).toBe(600);
    expect(report.verticesOut).toBe(121);
    expect(report.trianglesOut).toBe(200);
    expect(report.textures[0]).toMatchObject({ role: "baseColor", bytesOut: 4, mime: "image/webp" });
    expect(out.byteLength).toBeLessThan(glb.byteLength / 2);
    expect(listTextures(out)[0]).toMatchObject({ mime: "image/webp", bytes: 4 });
  });

  it("leaves textures alone without a hook and reports bad input", async () => {
    const glb = syntheticGlb(4, 3);
    const { glb: out, report } = await optimizeModel(glb, { ratio: 0.5, error: 0.2 });
    expect(report.textures).toEqual([]);
    expect(listTextures(out)).toEqual(listTextures(glb));
    await expect(optimizeModel(new Uint8Array(16))).rejects.toThrow(/magic/);
  });

  it("bakes clips into a pack that decodes and samples", () => {
    const input = syntheticClips(9);
    const { bytes, pack, report } = bakeClips(input);
    expect(decodePack(bytes)).toEqual(pack);
    expect(pack.roles.length).toBe(8);
    expect(pack.feet).toEqual(["leftFoot", "rightFoot"]);
    const walk = pack.clips["walk"]!;
    expect(walk.n).toBe(31);
    expect(walk.dur).toBeCloseTo(1, 6);
    for (const r of report) expect(r.maxAngleErrorDeg).toBeLessThan(0.01);
    expect(report.find((r) => r.name === "broken_loop")!.seamOk).toBe(false);
    expect(report.find((r) => r.name === "walk")!.seamOk).toBe(true);
    // a sample on a frame returns that frame's source rotation
    const out = new Float32Array(8 * 4);
    const root = sampleClip(pack, walk, 10 / 30, out);
    const src = Array.from(input.clips[0]!.q).slice(10 * 32, 11 * 32);
    out.forEach((v, i) => expect(Math.abs(Math.abs(v) - Math.abs(src[i]!))).toBeLessThan(1e-4));
    expect(root[2]).toBeCloseTo((1.2 * 10) / 30, 3);
    // the loop wraps
    const wrapped = new Float32Array(32);
    sampleClip(pack, walk, 1 + 10 / 30, wrapped);
    wrapped.forEach((v, i) => expect(v).toBeCloseTo(out[i]!, 5));
    expect(() => decodePack(bytes.subarray(0, 40))).toThrow(/ends early/);
  });

  it("writes and checks a lock", () => {
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array(20);
    const text = writeLock([lockEntry("z.glb", b, "synthetic", "CC0-1.0", 32), lockEntry("a.bin", a, "synthetic", "CC-BY-NC-4.0")]);
    expect(text.indexOf("a.bin")).toBeLessThan(text.indexOf("z.glb"));
    expect(checkLock(text, { "a.bin": a, "z.glb": b })).toEqual({ ok: true, failures: [] });
    const bad = checkLock(text, new Map([["z.glb", new Uint8Array(40)]]), ["NC"]);
    expect(bad.ok).toBe(false);
    expect(bad.failures.join("\n")).toMatch(/a\.bin: file is missing/);
    expect(bad.failures.join("\n")).toMatch(/over its budget/);
    expect(bad.failures.join("\n")).toMatch(/forbidden NC/);
  });
});
