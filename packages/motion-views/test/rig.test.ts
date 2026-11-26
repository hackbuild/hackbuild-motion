import { describe, expect, it } from "vitest";
import { Bone, Quaternion } from "three";
import { packClips, packCoverage, type ClipPack } from "../src/clip-pack.js";
import { rigGestureClip } from "../src/gestures.js";

const b64 = (a: number[]) => Buffer.from(new Int16Array(a).buffer).toString("base64");

describe("clip packs", () => {
  it("maps pack roles onto the body's bone order and keeps the rest", () => {
    const half = Math.round(32767 * Math.SQRT1_2);
    const pack: ClipPack = { roles: ["hips", "upperArmR"], fps: 30, clips: { Idle_Loop: { dur: 1 / 30, n: 2, loop: true, q: b64([0, 0, 0, 32767, 0, 0, half, half, 0, 0, 0, 32767, 0, 0, half, half]) } } };
    const names = ["hips", "spine", "rightUpperArm"];
    expect(packCoverage(pack, names)).toBe(2);
    const base = [0, 0, 0, 1, 0.1, 0, 0, 0.995, 0, 0, 0, 1];
    const c = packClips(pack, names, base).Idle_Loop!;
    expect(c.bones).toBe(3);
    expect(c.frames).toBe(2);
    expect(Array.from(c.rotations.slice(4, 8))).toEqual(base.slice(4, 8).map((v) => Math.fround(v)));
    expect(c.rotations[10]).toBeCloseTo(Math.SQRT1_2, 3);
  });
});

// a T pose rig: hips, spine, head, both arms out along x, facing +z
function rig() {
  const mk = (name: string, x: number, y: number, z: number, parent?: Bone) => {
    const b = new Bone();
    b.name = name;
    b.position.set(x, y, z);
    parent?.add(b);
    return b;
  };
  const hips = mk("hips", 0, 1, 0);
  const spine = mk("spine", 0, 0.2, 0, hips);
  const head = mk("head", 0, 0.5, 0, spine);
  const lu = mk("leftUpperArm", 0.2, 0.4, 0, spine);
  const ll = mk("leftLowerArm", 0.3, 0, 0, lu);
  const ru = mk("rightUpperArm", -0.2, 0.4, 0, spine);
  const rl = mk("rightLowerArm", -0.3, 0, 0, ru);
  const rh = mk("rightHand", -0.25, 0, 0, rl);
  hips.updateMatrixWorld(true);
  const bones = [hips, spine, head, lu, ll, ru, rl, rh];
  return { bones, names: bones.map((b) => b.name) };
}

describe("rig gestures", () => {
  it("raises the right arm and ends where it began", () => {
    const { bones, names } = rig();
    const c = rigGestureClip("wave", bones, names)!;
    expect(c.loop).toBe(false);
    const ru = names.indexOf("rightUpperArm");
    const q = (f: number) => new Quaternion().fromArray(c.rotations, (f * c.bones + ru) * 4);
    const mid = Math.floor(c.frames / 2);
    expect(q(mid).angleTo(new Quaternion())).toBeGreaterThan(0.8);
    expect(q(c.frames - 1).angleTo(new Quaternion())).toBeLessThan(0.02);
    expect(bones[ru]!.quaternion.angleTo(new Quaternion())).toBeLessThan(1e-6);
  });

  it("nods the head only", () => {
    const { bones, names } = rig();
    const c = rigGestureClip("nod", bones, names)!;
    const f = Math.floor(c.frames / 4);
    const at = (n: string) => new Quaternion().fromArray(c.rotations, (f * c.bones + names.indexOf(n)) * 4);
    expect(at("head").angleTo(new Quaternion())).toBeGreaterThan(0.1);
    expect(at("rightUpperArm").angleTo(new Quaternion())).toBeLessThan(1e-6);
  });
});
