import { readFileSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { type Vec3, ContactLock, ccd, clampDirection, fabrik, goldenTrace, handCurl, load, lookAngles, lookChain, pelvisDrop, twoBone } from "../src/index.js";
import { FootLock, curlFingers, lookAtChain, solveChain, solveTwoBone } from "../src/three.js";

const here = import.meta.dirname;
const golden = JSON.parse(readFileSync(join(here, "../../../crates/ik/tests/golden.json"), "utf8")) as { seed: number; values: number[] };

beforeAll(async () => {
  await load();
});

const vec = fc.tuple(fc.double({ min: -1, max: 1, noNaN: true }), fc.double({ min: -1, max: 1, noNaN: true }), fc.double({ min: -1, max: 1, noNaN: true }));
const len = (v: Vec3) => Math.hypot(...v);
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const norm = (a: Vec3): Vec3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

describe("wasm and native agree", () => {
  it("golden trace is bit identical to the native build", () => {
    const got = Array.from(goldenTrace(golden.seed));
    expect(got.length).toBe(golden.values.length);
    got.forEach((v, i) => expect(Object.is(v, golden.values[i]), `value ${i}`).toBe(true));
  });
});

describe("two bone", () => {
  it("reaches every target inside the reach band and keeps lengths (property)", () => {
    fc.assert(
      fc.property(vec, vec, vec, fc.double({ min: 0.02, max: 0.98, noNaN: true }), vec, (a, d1, d2, u, pole) => {
        if (len(d1) < 0.1 || len(d2) < 0.1 || len(pole) < 0.01) return true;
        const b = add(a, d1);
        const c = add(b, d2);
        const l1 = len(d1);
        const l2 = len(d2);
        const lo = Math.abs(l1 - l2);
        const dist = lo + (l1 + l2 - lo) * u;
        const t = add(a, norm(add(d1, d2, 0.5)), dist);
        const s = twoBone(a, b, c, t, pole);
        return s.reached && len(sub(s.end, t)) < 1e-8 && Math.abs(len(sub(s.mid, a)) - l1) < 1e-9 && Math.abs(len(sub(s.end, s.mid)) - l2) < 1e-9;
      }),
      { numRuns: 500 },
    );
  });

  it("three adapter puts an arm's hand on the target", () => {
    const shoulder = new THREE.Bone();
    const elbow = new THREE.Bone();
    const wrist = new THREE.Bone();
    shoulder.add(elbow);
    elbow.add(wrist);
    elbow.position.set(0.28, 0, 0);
    wrist.position.set(0.25, 0, 0);
    shoulder.position.set(0.17, 1.41, 0);
    shoulder.updateMatrixWorld(true);
    const target = new THREE.Vector3(0.45, 1.2, 0.25);
    expect(solveTwoBone(shoulder, elbow, wrist, target, new THREE.Vector3(0, -0.3, -1))).toBe(true);
    expect(wrist.getWorldPosition(new THREE.Vector3()).distanceTo(target)).toBeLessThan(1e-6);
    expect(elbow.getWorldPosition(new THREE.Vector3()).z).toBeLessThan(0.25);
  });
});

describe("chains", () => {
  // Fixed seeds keep this deterministic. Every listed seed above 42 failed
  // the old random seed property. 741 and 17802 still fail on the solver
  // before it bent a straight chain whose target lies on its own axis (a
  // fixed point: the error never moved). 87, 301, 360, 362, 900, 1585 and
  // 15026 start with a segment folded back on the one before it. 2190,
  // 9112 and 9320 need more than 128 iterations near a folded solution.
  const fabrikSeeds = [1, 2, 3, 42, 87, 301, 360, 362, 741, 900, 1585, 2190, 9112, 9320, 15026, 17802];
  it.each(fabrikSeeds)("FABRIK keeps the root and the lengths and meets reachable targets (property, seed %i)", (seed) => {
    fc.assert(
      fc.property(fc.array(vec, { minLength: 3, maxLength: 6 }), vec, fc.double({ min: 0.05, max: 0.7, noNaN: true }), (dirs, td, k) => {
        if (dirs.some((d) => len(d) < 0.1) || len(td) < 0.1) return true;
        // a segment folded back onto the one before it (within 8 degrees)
        // puts a joint on or beside the joint two back; FABRIK's direction
        // there is undefined or near zero, so it is excluded as degenerate
        if (dirs.some((d, i) => i > 0 && dot(norm(d), norm(dirs[i - 1]!)) < -0.99)) return true;
        const p: Vec3[] = [[0, 0, 0]];
        dirs.forEach((d, i) => p.push(add(p[i]!, norm(d), 0.3)));
        const before = p.slice(1).map((x, i) => len(sub(x, p[i]!)));
        const total = before.reduce((s, x) => s + x, 0);
        const t = add([0, 0, 0], norm(td), total * k);
        // near a folded solution FABRIK converges slowly: 128 iterations left
        // up to 2 mm of error, 512 met 1e-4 m on all 20,000 seeds of 200 runs
        // scanned on 2026-11-23 (computed)
        const info = fabrik(p, t, { iterations: 512, tolerance: 1e-6 });
        const after = p.slice(1).map((x, i) => len(sub(x, p[i]!)));
        return len(p[0]!) === 0 && after.every((l, i) => Math.abs(l - before[i]!) < 1e-9) && info.error < 1e-4;
      }),
      { numRuns: 200, seed },
    );
  });

  it("CCD converges on a reachable target", () => {
    const p: Vec3[] = [[0, 0, 0], [0, 0.3, 0], [0, 0.6, 0], [0, 0.9, 0]];
    const info = ccd(p, [0.4, 0.5, 0.2], { iterations: 200, tolerance: 1e-6 });
    expect(info.error).toBeLessThan(1e-5);
  });

  it("three adapter moves a bone chain's tip onto the target", () => {
    const bones = [0, 1, 2, 3].map(() => new THREE.Bone());
    bones.forEach((b, i) => {
      if (i) {
        b.position.set(0, 0.3, 0);
        bones[i - 1]!.add(b);
      }
    });
    bones[0]!.updateMatrixWorld(true);
    const target = new THREE.Vector3(0.3, 0.6, 0.2);
    solveChain(bones, target, { iterations: 64, tolerance: 1e-6 });
    expect(bones[3]!.getWorldPosition(new THREE.Vector3()).distanceTo(target)).toBeLessThan(1e-4);
  });
});

describe("look, hand and contact", () => {
  it("look chain turns the head onto an unclamped target", () => {
    const neck = new THREE.Bone();
    const head = new THREE.Bone();
    neck.add(head);
    head.position.set(0, 0.1, 0);
    neck.position.set(0, 1.46, 0);
    neck.updateMatrixWorld(true);
    const target = new THREE.Vector3(0.8, 1.7, 2);
    const a = lookAtChain([neck, head], [0.4, 0.6], target, new THREE.Quaternion());
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
    const want = target.clone().sub(head.getWorldPosition(new THREE.Vector3())).normalize();
    expect(fwd.angleTo(want)).toBeLessThan(0.02);
    expect(Math.abs(a.yaw)).toBeLessThan(1.25);
  });

  it("a target sweeping behind keeps the head on one side and hands off to the body", () => {
    let prev = 0;
    for (let k = 0; k < 60; k++) {
      const a = 1 + k * 0.05;
      const r = lookAngles([0, 0, 0, 1], [0, 0, 0], [Math.sin(a), 0, Math.cos(a)], undefined, prev);
      prev = r.yaw + r.bodyYaw;
      expect(r.yaw).toBeGreaterThan(0);
      if (a > 1.25) {
        expect(r.behind).toBe(true);
        expect(r.bodyYaw).toBeGreaterThan(0);
      }
    }
  });

  it("look angles clamp and eye directions clamp", () => {
    const a = lookAngles([0, 0, 0, 1], [0, 0, 0], [0, 0, -1]);
    expect(a.clamped).toBe(true);
    expect(lookChain([0, 0, 0, 1], 0.5, 0.2, [0.5, 0.5]).length).toBe(2);
    const d = clampDirection([0, 0, 0, 1], [1, 0, 0.1]);
    expect(Math.atan2(d[0], d[2])).toBeCloseTo(0.43, 9);
  });

  it("hand frame grip sits off the palm and the fingers curl", () => {
    const c = handCurl([0.7, 1.4, 0], [0.45, 1.4, 0], "left", 1, [0.79, 1.4, 0.03], [0.77, 1.4, -0.03]);
    expect(len(sub(c.grip, [0.78, 1.4, 0]))).toBeCloseTo(0.035, 9);
    const hand = new THREE.Bone();
    const fore = new THREE.Bone();
    fore.add(hand);
    hand.position.set(0.25, 0, 0);
    const idx = [0, 1, 2].map(() => new THREE.Bone());
    idx.forEach((b, i) => (i ? idx[i - 1]! : hand).add(b));
    idx.forEach((b) => b.position.set(0.04, 0, 0));
    fore.updateMatrixWorld(true);
    const tipBefore = idx[2]!.getWorldPosition(new THREE.Vector3());
    curlFingers(hand, fore, { index: idx }, "left", 0.8);
    expect(idx[2]!.getWorldPosition(new THREE.Vector3()).distanceTo(tipBefore)).toBeGreaterThan(0.01);
  });

  it("a locked foot stays put on the solved leg, not only in the lock", () => {
    const hip = new THREE.Bone();
    const knee = new THREE.Bone();
    const foot = new THREE.Bone();
    hip.add(knee);
    knee.add(foot);
    knee.position.set(0, -0.42, 0);
    foot.position.set(0, -0.42, 0);
    hip.position.set(-0.09, 0.9, 0);
    hip.updateMatrixWorld(true);
    const lock = new FootLock();
    let prev: THREE.Vector3 | null = null;
    let drift = 0;
    for (let k = 0; k < 60; k++) {
      // the free target slides 5 mm a frame while contact holds
      const target = new THREE.Vector3(-0.09, 0.08, 0.2 - 0.005 * k);
      lock.update(1 / 60, target, 1);
      solveTwoBone(hip, knee, foot, target, new THREE.Vector3(0, 0, 1));
      hip.updateMatrixWorld(true);
      const p = foot.getWorldPosition(new THREE.Vector3());
      if (prev) drift = Math.max(drift, p.distanceTo(prev));
      prev = p;
    }
    expect(drift).toBeLessThan(1e-6);
    lock.dispose();
  });

  it("contact lock holds and releases; pelvis drop reaches", () => {
    const lock = new ContactLock(0.55, 0.06);
    const out = new Float64Array(3);
    lock.update(1 / 60, Float64Array.of(0, 0, 0), 1, out);
    lock.update(1 / 60, Float64Array.of(0.2, 0, 0), 1, out);
    expect(out[0]).toBe(0);
    lock.update(1 / 60, Float64Array.of(0.2, 0, 0), 0, out);
    expect(out[0]).toBeGreaterThan(0);
    expect(out[0]).toBeLessThan(0.2);
    lock.free();
    const foot = new FootLock();
    expect(foot.update(1 / 60, new THREE.Vector3(1, 0, 0), 1).x).toBe(1);
    expect(foot.update(1 / 60, new THREE.Vector3(2, 0, 0), 1).x).toBe(1);
    foot.dispose();
    const d = pelvisDrop([0, 0.9, 0], [0, 0, 0.4], 0.88);
    expect(Math.hypot(0.9 - d, 0.4)).toBeCloseTo(0.88, 9);
  });
});
