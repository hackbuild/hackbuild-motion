import { describe, expect, it } from "vitest";
import { bytesWord, licenceLine, rigCheck, secondsWord, sizeLine } from "../src/index.js";

const FULL = ["hips", "spine", "chest", "neck", "head", "leftUpperLeg", "leftLowerLeg", "leftFoot", "rightUpperLeg", "rightLowerLeg", "rightFoot", "leftUpperArm", "leftLowerArm", "leftHand", "rightUpperArm", "rightLowerArm", "rightHand"];

describe("rigCheck", () => {
  it("passes a full rig with a mouth and blinks", () => {
    const c = rigCheck({ bones: FULL, expressions: ["aa", "blink"], clips: [], mouth: true, blink: true, gaze: true });
    expect(c.tone).toBe("ok");
    expect(c.head).toBe("ready to act");
    expect(c.lines[0]!.text).toBe("17 bones mapped.");
  });
  it("names what a rig without a face cannot do, worst first", () => {
    const c = rigCheck({ bones: FULL.filter((b) => !b.endsWith("Leg") && !b.endsWith("Foot")), expressions: [], clips: ["Idle"], mouth: false, blink: false, gaze: true });
    expect(c.tone).toBe("warn");
    expect(c.lines.map((l) => l.text)).toContain("no leg bones. it stands still and cannot walk.");
    expect(c.lines.map((l) => l.text)).toContain("no mouth shapes. the lips stay still while it talks.");
    expect(c.lines.at(-1)!.tone).toBe("ok");
  });
  it("fails a body with no hips and says nothing works", () => {
    const c = rigCheck({ bones: ["head"], expressions: [], clips: [], mouth: true, blink: true, gaze: true });
    expect(c.tone).toBe("bad");
    expect(c.head).toBe("cannot act");
    expect(c.lines.some((l) => l.tone === "ok")).toBe(false);
  });
  it("passes load warnings through", () => {
    const c = rigCheck({ bones: FULL, expressions: [], clips: [], mouth: true, blink: true, gaze: true, warnings: ["two textures were missing."] });
    expect(c.lines[0]).toEqual({ tone: "warn", text: "two textures were missing." });
  });
});

describe("size and licence lines", () => {
  it("writes sizes in plain units", () => {
    expect(bytesWord(512)).toBe("512 bytes");
    expect(bytesWord(820_000)).toBe("820 kb");
    expect(bytesWord(12_400_000)).toBe("12.4 mb");
    expect(sizeLine({ bytes: 12_400_000, format: "vrm", files: 3, triangles: 38_200 })).toBe("12.4 mb vrm, 3 files, 38 k triangles");
    expect(sizeLine({ bytes: 900, format: "glb", files: 1, triangles: 512 })).toBe("900 bytes glb, 512 triangles");
  });
  it("says a glb carries no licence", () => {
    expect(licenceLine("glb", null).tone).toBe("warn");
  });
  it("reads vrm 1.0 and 0.x licences", () => {
    expect(licenceLine("vrm", { metaVersion: "1", allowRedistribution: true, modification: "prohibited", licenseUrl: "https://vrm.dev/licenses/1.0/", commercialUsage: "corporation" })).toEqual({ tone: "ok", text: "vrm.dev/licenses/1.0: may be shared, no edits." });
    expect(licenceLine("vrm", { metaVersion: "1", allowRedistribution: false }).text).toBe("vrm 1.0 licence: may not be shared, personal use only.");
    expect(licenceLine("vrm", { metaVersion: "0", licenseName: "CC_BY" })).toEqual({ tone: "ok", text: "cc by." });
    expect(licenceLine("vrm", { metaVersion: "0", licenseName: "Redistribution_Prohibited" }).tone).toBe("warn");
  });
  it("writes clip lengths", () => {
    expect(secondsWord(2.4)).toBe("2.4 s");
    expect(secondsWord(42)).toBe("42 s");
    expect(secondsWord(72)).toBe("1 min 12 s");
  });
});
