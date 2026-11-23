import { readFileSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type HumanoidMotion,
  RetargetRig,
  analyzeMotion,
  goldenTrace,
  load,
  packMotion,
  parseBvh,
  parseVmd,
  referenceSkeleton,
  restFromFirstFrame,
  retargetClip,
  retargetLimb,
  settleOnFloor,
  unpackMotion,
} from "../src/index.js";
import { LiveRetarget, retargetAnimation, skeletonFromObject3D } from "../src/three.js";

const here = import.meta.dirname;
const golden = JSON.parse(readFileSync(join(here, "../../../crates/retarget/tests/golden.json"), "utf8")) as { seed: number; values: number[] };

beforeAll(async () => {
  await load();
});

const BVH = `HIERARCHY
ROOT Hips
{
OFFSET 0 0 0
CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation
JOINT Spine
{
OFFSET 0 10 0
CHANNELS 3 Zrotation Xrotation Yrotation
JOINT Spine1
{
OFFSET 0 15 0
CHANNELS 3 Zrotation Xrotation Yrotation
JOINT Neck
{
OFFSET 0 25 0
CHANNELS 3 Zrotation Xrotation Yrotation
JOINT Head
{
OFFSET 0 10 0
CHANNELS 3 Zrotation Xrotation Yrotation
End Site
{
OFFSET 0 10 0
}
}
}
JOINT LeftArm
{
OFFSET 17 21 0
CHANNELS 3 Zrotation Xrotation Yrotation
JOINT LeftForeArm
{
OFFSET 28 0 0
CHANNELS 3 Zrotation Xrotation Yrotation
JOINT LeftHand
{
OFFSET 25 0 0
CHANNELS 3 Zrotation Xrotation Yrotation
}
}
}
JOINT RightArm
{
OFFSET -17 21 0
CHANNELS 3 Zrotation Xrotation Yrotation
JOINT RightForeArm
{
OFFSET -28 0 0
CHANNELS 3 Zrotation Xrotation Yrotation
JOINT RightHand
{
OFFSET -25 0 0
CHANNELS 3 Zrotation Xrotation Yrotation
}
}
}
}
}
JOINT LeftUpLeg
{
OFFSET 9 -4 0
CHANNELS 3 Zrotation Xrotation Yrotation
JOINT LeftLeg
{
OFFSET 0 -41 0
CHANNELS 3 Zrotation Xrotation Yrotation
JOINT LeftFoot
{
OFFSET 0 -42 0
CHANNELS 3 Zrotation Xrotation Yrotation
}
}
}
JOINT RightUpLeg
{
OFFSET -9 -4 0
CHANNELS 3 Zrotation Xrotation Yrotation
JOINT RightLeg
{
OFFSET 0 -41 0
CHANNELS 3 Zrotation Xrotation Yrotation
JOINT RightFoot
{
OFFSET 0 -42 0
CHANNELS 3 Zrotation Xrotation Yrotation
}
}
}
}
MOTION
Frames: 3
Frame Time: 0.0333333
${[0, 1, 2].map((f) => [0, 95 + f, f * 5, 0, 0, 0, ...Array(12).fill(0), -60 + f * 10, 0, 0, 0, 0, 0, 0, 0, 0, 60, 0, 0, ...Array(24).fill(0)].join(" ")).join("\n")}`;

describe("wasm and native agree", () => {
  it("golden trace is bit identical to the native build", () => {
    const got = Array.from(goldenTrace(golden.seed));
    expect(got.length).toBe(golden.values.length);
    got.forEach((v, i) => expect(Object.is(v, golden.values[i]), `value ${i}`).toBe(true));
  });
});

describe("readers", () => {
  it("parses BVH and lowers the left arm 60 degrees in normalized space", () => {
    const { skeleton, clip } = parseBvh(BVH);
    expect(skeleton.names).toContain("HeadEnd");
    const rig = new RetargetRig(skeleton);
    expect(rig.unit).toBeCloseTo(0.01, 12);
    const m = rig.toHumanoid(clip);
    const q = m.rotations.leftUpperArm!;
    const dir = new THREE.Vector3(1, 0, 0).applyQuaternion(new THREE.Quaternion(q[0], q[1], q[2], q[3]));
    expect(Math.asin(-dir.y) * (180 / Math.PI)).toBeCloseTo(60, 6);
    expect(m.hips![0]).toBe(0);
    rig.dispose();
  });

  it("parses VMD with Shift-JIS names and corrects the A pose", () => {
    const sjis = { arm: [0x8d, 0xb6, 0x98, 0x72], center: [0x83, 0x5a, 0x83, 0x93, 0x83, 0x5e, 0x81, 0x5b] };
    const header = new Uint8Array(50);
    header.set(new TextEncoder().encode("Vocaloid Motion Data 0002"));
    const key = (name: number[], frame: number, pos: [number, number, number]) => {
      const b = new Uint8Array(111);
      b.set(name);
      const v = new DataView(b.buffer);
      v.setUint32(15, frame, true);
      pos.forEach((x, i) => v.setFloat32(19 + i * 4, x, true));
      v.setFloat32(43, 1, true);
      return b;
    };
    const keys = [key(sjis.arm, 0, [0, 0, 0]), key(sjis.center, 0, [0, 0, 0]), key(sjis.center, 5, [0, 0, 5])];
    const count = new Uint8Array(4);
    new DataView(count.buffer).setUint32(0, keys.length, true);
    const bytes = new Uint8Array([...header, ...count, ...keys.flatMap((k) => [...k]), 0, 0, 0, 0]);
    const vmd = parseVmd(bytes);
    expect(vmd.clip.times.length).toBe(6);
    const rig = new RetargetRig(vmd.skeleton, { unit: vmd.unit });
    const m = rig.toHumanoid(vmd.clip, { startAtOrigin: false });
    const q = m.rotations.leftUpperArm!;
    const dir = new THREE.Vector3(1, 0, 0).applyQuaternion(new THREE.Quaternion(q[0], q[1], q[2], q[3]));
    expect(Math.asin(-dir.y) * (180 / Math.PI)).toBeCloseTo(35, 6);
    expect(m.hips![5 * 3 + 2]! * rig.hipsHeight).toBeCloseTo(-0.4, 6);
    rig.dispose();
  });
});

describe("motion format", () => {
  it("packs and unpacks within f32 precision (property)", () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: -1, max: 1, noNaN: true }), { minLength: 12, maxLength: 12 }), (xs) => {
        const q = new THREE.Quaternion(xs[0], xs[1], xs[2], xs[3]! + 2).normalize();
        const m: HumanoidMotion = {
          times: Float64Array.of(0, 1 / 30, 2 / 30),
          rotations: { hips: Float64Array.from([...q.toArray(), ...q.toArray(), ...q.toArray()]) },
          hips: Float64Array.from(xs.slice(3, 12)),
        };
        const u = unpackMotion(packMotion(m))!;
        return u.times.length === 3 && Math.abs(u.rotations.hips![0]! - q.x) < 1e-6 && Math.abs(u.hips![8]! - xs[11]!) < 1e-6 && !u.rotations.spine;
      }),
      { numRuns: 100 },
    );
  });

  it("settles a hovering clip and tags motion", () => {
    const n = 60;
    const m: HumanoidMotion = { times: Float64Array.from({ length: n }, (_, i) => i / 30), rotations: {}, hips: new Float64Array(n * 3).fill(0) };
    for (let i = 0; i < n; i++) m.hips![i * 3 + 1] = 0.03 / 0.95;
    const s = settleOnFloor(m);
    expect(s.shift).toBeCloseTo(0.03, 9);
    expect(analyzeMotion(s.motion).tags).toContain("pose");
    const walk: HumanoidMotion = { ...m, hips: Float64Array.from({ length: n * 3 }, (_, i) => (i % 3 === 2 ? Math.floor(i / 3) * 0.03 : 0)) };
    expect(analyzeMotion(walk).tags).toContain("walk");
  });

  it("finds a T pose kept in the first frame", () => {
    const { skeleton, clip } = parseBvh(BVH);
    expect(restFromFirstFrame(skeleton, clip)).toBeNull();
  });

  it("scales limb targets by length", () => {
    expect(retargetLimb([0, 0, 0], [0, -0.8, 0], 0.8, [1, 1, 0], 0.4)).toEqual([1, 0.6, 0]);
  });
});

/** The reference skeleton as three.js bones, scaled and turned, with Mixamo names. */
function mixamoBody(scale: number, turn: number): THREE.Group {
  const ref = referenceSkeleton();
  const root = new THREE.Group();
  const holder = new THREE.Group();
  holder.name = "Armature";
  holder.scale.setScalar(scale);
  holder.rotation.y = turn;
  root.add(holder);
  const rename: Record<string, string> = { hips: "Hips", spine: "Spine", chest: "Spine1", upperChest: "Spine2", neck: "Neck", head: "Head", leftUpperLeg: "LeftUpLeg", leftLowerLeg: "LeftLeg", leftFoot: "LeftFoot", leftToes: "LeftToeBase", rightUpperLeg: "RightUpLeg", rightLowerLeg: "RightLeg", rightFoot: "RightFoot", rightToes: "RightToeBase", leftShoulder: "LeftShoulder", leftUpperArm: "LeftArm", leftLowerArm: "LeftForeArm", leftHand: "LeftHand", rightShoulder: "RightShoulder", rightUpperArm: "RightArm", rightLowerArm: "RightForeArm", rightHand: "RightHand" };
  const bones: THREE.Bone[] = [];
  ref.names.forEach((n, i) => {
    const b = new THREE.Bone();
    b.name = `mixamorig${rename[n] ?? n}`;
    b.position.fromArray(ref.restT, i * 3);
    const p = ref.parents[i]!;
    (p < 0 ? holder : bones[p]!).add(b);
    bones.push(b);
  });
  root.updateMatrixWorld(true);
  return root;
}

describe("three adapter", () => {
  it("retargets a clip between bodies of different size, units and facing", () => {
    const src = mixamoBody(1, 0);
    const dst = mixamoBody(60, Math.PI);
    const arm = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -1.0);
    const anim = new THREE.AnimationClip("raise", 1, [
      new THREE.QuaternionKeyframeTrack("mixamorigLeftArm.quaternion", [0, 1], [0, 0, 0, 1, ...arm.toArray()]),
      new THREE.VectorKeyframeTrack("mixamorigHips.position", [0, 1], [0, 0.95, 0, 0, 0.95, 0.2]),
    ]);
    const out = retargetAnimation(anim, src, dst, { dstUnit: 0.01 });
    const mixer = new THREE.AnimationMixer(dst);
    const action = mixer.clipAction(out);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    mixer.setTime(1);
    dst.updateMatrixWorld(true);
    const pos = (n: string) => dst.getObjectByName(n)!.getWorldPosition(new THREE.Vector3());
    const d = pos("mixamorigLeftForeArm").sub(pos("mixamorigLeftArm")).normalize();
    // the source arm turned 1 rad about +Z (down for a left arm); the target faces -Z, so in its
    // own frame the arm also points 1 rad below its left
    const facing = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI);
    d.applyQuaternion(facing);
    expect(d.x).toBeCloseTo(Math.cos(1), 6);
    expect(d.y).toBeCloseTo(-Math.sin(1), 6);
    // hips travel 0.2 m on a 0.95 m hip height comes out as 0.2 hip heights on the target
    const hips = pos("mixamorigHips");
    expect(Math.abs(hips.z) / (dst.getObjectByName("mixamorigHips")!.getWorldPosition(new THREE.Vector3()).y - 0.02 * 60)).toBeCloseTo(0.2 / (0.95 - 0.02), 6);
  });

  it("live retarget copies a driver pose every frame", () => {
    const src = mixamoBody(1, 0);
    const dst = mixamoBody(100, 0);
    const live = new LiveRetarget(src, dst, { dstUnit: 0.01 });
    src.getObjectByName("mixamorigRightArm")!.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.7);
    live.update();
    dst.updateMatrixWorld(true);
    const p = (r: THREE.Object3D, n: string) => r.getObjectByName(n)!.getWorldPosition(new THREE.Vector3());
    const a = p(src, "mixamorigRightForeArm").sub(p(src, "mixamorigRightArm")).normalize();
    const b = p(dst, "mixamorigRightForeArm").sub(p(dst, "mixamorigRightArm")).normalize();
    expect(a.distanceTo(b)).toBeLessThan(1e-6);
    live.dispose();
  });

  it("retargetClip on plain skeletons keeps reference poses", () => {
    const ref = referenceSkeleton();
    const { skeleton } = skeletonFromObject3D(mixamoBody(1, 0));
    const n = ref.names.length;
    const clip = { times: Float64Array.of(0), rotations: new Float64Array(n * 4), translations: Float64Array.from(ref.restT), moves: new Uint8Array(n) };
    for (let j = 0; j < n; j++) clip.rotations[j * 4 + 3] = 1;
    const out = retargetClip(ref, clip, skeleton);
    expect(Array.from(out.rotations.subarray(0, 4)).map((x) => Math.round(x * 1e9) / 1e9)).toEqual([0, 0, 0, 1]);
  });
});
