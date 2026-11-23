import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ClipPlayer, type GazeOutput } from "../src/index.js";
import { aimBone, applyGaze, applyPose, clipFromThree, reachArm } from "../src/three.js";

function arm() {
  const root = new THREE.Group();
  const upper = new THREE.Bone();
  upper.position.set(0.2, 1.4, 0);
  const lower = new THREE.Bone();
  lower.position.set(0.28, 0, 0);
  const hand = new THREE.Bone();
  hand.position.set(0.25, 0, 0);
  root.add(upper);
  upper.add(lower);
  lower.add(hand);
  root.updateMatrixWorld(true);
  return { root, upper, lower, hand };
}

describe("three adapter", () => {
  it("samples an AnimationClip and writes it back onto bones", () => {
    const q0 = new THREE.Quaternion();
    const q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1);
    const track = new THREE.QuaternionKeyframeTrack("hips.quaternion", [0, 1], [...q0.toArray(), ...q1.toArray()]);
    const pos = new THREE.VectorKeyframeTrack("hips.position", [0, 1], [0, 1, 0, 0, 1, 2]);
    const clip = clipFromThree(new THREE.AnimationClip("turn", 1, [track, pos]), ["hips", "spine"], { fps: 30, loop: false, rootBone: "hips" });
    expect(clip.frames).toBe(31);
    expect(clip.root?.[30 * 3 + 2]).toBeCloseTo(2);
    const player = new ClipPlayer({ idle: clip });
    player.update(0.5);
    const hips = new THREE.Bone();
    const spine = new THREE.Bone();
    applyPose(player.pose, [hips, spine], hips);
    const angle = 2 * Math.acos(Math.min(1, Math.abs(hips.quaternion.w)));
    expect(angle).toBeCloseTo(0.5, 3);
    expect(spine.quaternion.w).toBeCloseTo(1);
    expect(hips.position.z).toBeCloseTo(1, 3);
  });

  it("aims the arm at a target so the hand points there", () => {
    const { root, upper, lower, hand } = arm();
    const target = new THREE.Vector3(0.6, 1.9, 0.5);
    for (let k = 0; k < 4; k++) {
      aimBone(upper, hand, target, 1);
      aimBone(lower, hand, target, 1);
    }
    root.updateMatrixWorld(true);
    const s = upper.getWorldPosition(new THREE.Vector3());
    const h = hand.getWorldPosition(new THREE.Vector3());
    const err = h.clone().sub(s).normalize().angleTo(target.clone().sub(s).normalize());
    expect(err).toBeLessThan(0.02);
  });

  it("swings part way at partial weight", () => {
    const a = arm();
    const target = new THREE.Vector3(0.2, 2.2, 0);
    reachArm(a, target, 0);
    expect(a.upper.quaternion.w).toBeCloseTo(1);
    reachArm(a, target, 0.5);
    expect(a.upper.quaternion.w).toBeLessThan(0.999);
  });

  it("splits head yaw between neck and head and sets the eyes", () => {
    const neck = new THREE.Bone();
    const head = new THREE.Bone();
    const eye = new THREE.Bone();
    neck.add(head);
    head.add(eye);
    const g: GazeOutput = { headYaw: 0.6, headPitch: 0.2, eyeYaw: 0.1, eyePitch: -0.05, direction: [0, 0, 1], blink: 0, averted: false, bodyTurn: 0, targetYaw: 0.7 };
    applyGaze(g, { neck, head, leftEye: eye }, 0.35);
    neck.updateMatrixWorld(true);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
    expect(Math.atan2(fwd.x, fwd.z)).toBeCloseTo(0.6, 2);
    expect(Math.asin(fwd.y)).toBeCloseTo(0.2, 1);
    const e = new THREE.Vector3(0, 0, 1).applyQuaternion(eye.quaternion);
    expect(Math.atan2(e.x, e.z)).toBeCloseTo(0.1, 5);
    expect(Math.asin(e.y)).toBeCloseTo(-0.05, 5);
  });
});
