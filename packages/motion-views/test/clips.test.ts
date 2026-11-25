import { describe, expect, it } from "vitest";
import { clipFromFindings, clipMeta, clipsFromBody, clipsFromPack, nextClip } from "../src/index.js";

describe("clip items", () => {
  it("reads a pack and its seam check", () => {
    const pack = { fps: 30, clips: { walk: { name: "walk", dur: 1, n: 31, loop: true }, broken: { name: "broken", dur: 1, n: 31, loop: true }, hop: { name: "hop", dur: 0.5, n: 16, loop: false } } };
    const report = [
      { name: "walk", seamAngleDeg: 0.4, seamOk: true, maxAngleErrorDeg: 0.2 },
      { name: "broken", seamAngleDeg: 14.2, seamOk: false, maxAngleErrorDeg: 0.2 },
      { name: "hop", seamAngleDeg: null, seamOk: null, maxAngleErrorDeg: 3.5 },
    ];
    const items = clipsFromPack(pack, report);
    expect(items.map((i) => i.id)).toEqual(["pack:walk", "pack:broken", "pack:hop"]);
    expect(items[0]!.seconds).toBe(1);
    expect(items[0]!.warn).toBeUndefined();
    expect(items[1]!.warn).toBe("the loop jumps 14 degrees at the seam.");
    expect(items[2]!.warn).toBe("packing moved a bone up to 3.5 degrees.");
  });
  it("reads retarget findings and a body's clips", () => {
    const it1 = clipFromFindings("walk", "walk", { duration: 2.4, looping: true, tags: ["walk"] });
    expect(clipMeta(it1)).toBe("walk, 2.4 s, loops");
    const body = clipsFromBody([{ name: "Idle_Loop", duration: 3 }, { name: "", duration: 1 }]);
    expect(body[0]!.loop).toBe(true);
    expect(body[1]!.name).toBe("clip 2");
    expect(clipMeta(body[1]!)).toBe("1.0 s, once");
  });
  it("steps through the strip and wraps", () => {
    const items = clipsFromBody([{ name: "a", duration: 1 }, { name: "b", duration: 1 }, { name: "c", duration: 1 }]);
    expect(nextClip(items, null)).toBe("body:0");
    expect(nextClip(items, "body:2")).toBe("body:0");
    expect(nextClip(items, "body:0", -1)).toBe("body:2");
    expect(nextClip([], null)).toBeNull();
  });
});
