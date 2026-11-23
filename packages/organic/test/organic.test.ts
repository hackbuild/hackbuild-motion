import { readFileSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import {
  BodyClock,
  Inertializer,
  NoiseBank,
  OU,
  Pink,
  SeededRng,
  CascadeBank,
  SpringBank,
  decay,
  fastNegexp,
  goldenTrace,
  hashSeed,
  keyed,
  load,
  minimumJerk,
  sample,
  seededRng,
  spring,
  springDamper,
  springState,
  velocitySpring,
} from "../src/index.js";
import { PoseInertializer } from "../src/three.js";

const here = import.meta.dirname;
const golden = JSON.parse(readFileSync(join(here, "../../../crates/organic/tests/golden.json"), "utf8")) as { seed: number; values: number[] };

beforeAll(async () => {
  await load();
});

describe("wasm and native agree", () => {
  it("golden trace is bit identical to the native build", () => {
    const got = Array.from(goldenTrace(golden.seed));
    expect(got.length).toBe(golden.values.length);
    got.forEach((v, i) => expect(Object.is(v, golden.values[i]), `value ${i}: ${v} vs ${golden.values[i]}`).toBe(true));
  });

  it("loads from bytes as well as the inline copy", async () => {
    const bytes = readFileSync(join(here, "../src/wasm/organic_bg.wasm"));
    await expect(load(bytes)).resolves.toBeUndefined();
  });
});

describe("seeded stream", () => {
  it("TypeScript seededRng equals the wasm SeededRng bit for bit", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), (seed) => {
        const a = seededRng(seed);
        const b = new SeededRng(seed);
        for (let i = 0; i < 16; i++) if (!Object.is(a(), b.next())) return false;
        b.free();
        return true;
      }),
      { numRuns: 200 },
    );
  });

  it("string seeds hash the same way on both sides", () => {
    for (const s of ["rex", "dog-7", "", "seed with spaces"]) {
      const a = seededRng(s);
      const b = new SeededRng(hashSeed(s));
      expect(a()).toBe(b.next());
    }
  });
});

describe("springs", () => {
  it("fast spring in TypeScript equals the wasm bank bit for bit", () => {
    const bank = new SpringBank(1);
    bank.setPositions(new Float64Array([1]));
    const s = springState(1);
    const out = new Float64Array(1);
    for (let i = 0; i < 30; i++) {
      bank.step(new Float64Array([-0.5]), 0.15, 1 / 60, true, out);
      spring(s, -0.5, 0.15, 1 / 60, false);
      expect(Object.is(out[0], s.x)).toBe(true);
    }
  });

  it("fast exp stays within 0.2 percent of exp on 0 to 1 (property)", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (x) => Math.abs(fastNegexp(x) - Math.exp(-x)) / Math.exp(-x) < 0.002),
    );
  });

  it("critically damped spring never overshoots a still goal from rest (property)", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -10, max: 10, noNaN: true }),
        fc.double({ min: -10, max: 10, noNaN: true }),
        fc.double({ min: 0.01, max: 2, noNaN: true }),
        fc.double({ min: 1 / 240, max: 1 / 10, noNaN: true }),
        (x0, goal, hl, dt) => {
          const s = springState(x0);
          const sign = Math.sign(x0 - goal);
          for (let i = 0; i < 200; i++) {
            spring(s, goal, hl, dt);
            if (Math.sign(s.x - goal) * sign < -1e-9) return false;
          }
          return Math.abs(s.x - goal) <= Math.abs(x0 - goal) + 1e-9;
        },
      ),
    );
  });

  it("exact spring gives the same state for any split of the same time (property)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), fc.double({ min: 0.05, max: 1, noNaN: true }), (n, hl) => {
        const a = springState(3);
        const b = springState(3);
        spring(a, 1, hl, 0.2);
        for (let i = 0; i < n; i++) spring(b, 1, hl, 0.2 / n);
        return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.v - b.v) < 1e-9;
      }),
    );
  });

  it("decay, velocity spring and damper settle", () => {
    const d = springState(1);
    const v = springState(0);
    const k = springState(0);
    for (let i = 0; i < 600; i++) {
      decay(d, 0.1, 1 / 60);
      velocitySpring(v, 2, 0.2, 1 / 60);
      springDamper(k, 1, 0, 0.4, 0.2, 1 / 60);
    }
    expect(Math.abs(d.x)).toBeLessThan(1e-6);
    expect(v.v).toBeCloseTo(2, 6);
    expect(k.x).toBeCloseTo(1, 4);
  });
});

describe("samplers and noise", () => {
  it("means match their parameters", () => {
    const rng = seededRng(42);
    const n = 20000;
    let eg = 0;
    let pg = 0;
    let gm = 0;
    for (let i = 0; i < n; i++) {
      eg += sample.exGaussian(0.3, 0.05, 0.2, rng);
      pg += sample.poissonGap(4, rng);
      gm += sample.gamma(2, 1.5, rng);
    }
    expect(eg / n).toBeCloseTo(0.5, 1);
    expect(pg / n).toBeCloseTo(0.25, 1);
    expect(Math.abs(gm / n - 3)).toBeLessThan(0.1);
  });

  it("power law stays in range and von Mises in minus pi to pi", () => {
    const rng = seededRng(1);
    for (let i = 0; i < 2000; i++) {
      const x = sample.truncatedPowerLaw(0.2, 2, 5, rng);
      expect(x).toBeGreaterThanOrEqual(0.2);
      expect(x).toBeLessThanOrEqual(5);
      expect(Math.abs(sample.vonMises(3, rng))).toBeLessThanOrEqual(Math.PI);
    }
  });

  it("OU, Pink and the wasm NoiseBank produce finite drift", () => {
    const rng = seededRng(5);
    const ou = new OU(0.5, 1, 0, rng);
    const pink = new Pink(0.2, 5, rng);
    const bank = new NoiseBank(5);
    bank.addOu(0.5, 1, 0);
    bank.addPink(0.2, 5);
    const out = new Float64Array(2);
    for (let i = 0; i < 100; i++) {
      expect(Number.isFinite(ou.step(1 / 60) + pink.step(1 / 60))).toBe(true);
      bank.step(1 / 60, out);
      expect(Number.isFinite(out[0]! + out[1]!)).toBe(true);
    }
  });

  it("samplers on the wasm stream run", () => {
    const r = new SeededRng(3);
    expect(Number.isFinite(r.gauss() + r.exGaussian(0.3, 0.1, 0.2) + r.gamma(0.5, 1) + r.vonMises(1) + r.logNormal(1, 0.3))).toBe(true);
  });
});

describe("curves and clock", () => {
  it("minimum jerk and keyed hit their ends", () => {
    expect(minimumJerk(0)).toBe(0);
    expect(minimumJerk(1)).toBe(1);
    expect(keyed(0.5, [[0, 0], [0.5, 2], [1, 0]])).toBeCloseTo(2, 12);
  });

  it("clock pressure rises awake and falls asleep", () => {
    const c = new BodyClock(480, 60);
    const p0 = c.pressure;
    for (let i = 0; i < 600; i++) c.tick(1);
    expect(c.pressure).toBeGreaterThan(p0);
    c.asleep = true;
    const p1 = c.pressure;
    for (let i = 0; i < 300; i++) c.tick(1);
    expect(c.pressure).toBeLessThan(p1);
  });
});

describe("inertialization", () => {
  it("flat array inertializer removes the pop and settles", () => {
    const inert = new Inertializer(1, 0);
    const empty = new Float64Array(0);
    const a = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1);
    for (let i = 0; i < 3; i++) inert.apply(new Float64Array(a.toArray()), empty, 1 / 60, 0.1);
    inert.capture();
    const rot = new Float64Array([0, 0, 0, 1]);
    inert.apply(rot, empty, 1 / 60, 0.1);
    const q = new THREE.Quaternion(rot[0], rot[1], rot[2], rot[3]);
    expect(q.angleTo(a)).toBeLessThan(0.1);
  });

  it("three adapter drives bones and positions", () => {
    const hips = new THREE.Bone();
    const spine = new THREE.Bone();
    hips.add(spine);
    const inert = new PoseInertializer([hips, spine], { positions: [hips] });
    hips.position.set(0, 1, 0);
    spine.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.8);
    for (let i = 0; i < 3; i++) inert.apply(1 / 60, 0.1);
    inert.capture();
    spine.quaternion.identity();
    hips.position.set(0, 0.5, 0);
    inert.apply(1 / 60, 0.1);
    expect(spine.quaternion.angleTo(new THREE.Quaternion())).toBeGreaterThan(0.7);
    expect(hips.position.y).toBeGreaterThan(0.95);
    for (let i = 0; i < 240; i++) {
      spine.quaternion.identity();
      hips.position.set(0, 0.5, 0);
      inert.apply(1 / 60, 0.1);
    }
    expect(spine.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-3);
    expect(hips.position.y).toBeCloseTo(0.5, 3);
    expect(inert.active).toBe(false);
    inert.dispose();
  });
});

describe("cascade", () => {
  it("reaches 98 percent at the set time with a bell shaped move", () => {
    const b = new CascadeBank(1, 1000, 6);
    b.setTime(0, 0.2);
    b.setTarget(0, 1);
    const out = new Float64Array(1);
    b.step(100, out);
    const half = out[0]!;
    b.step(100, out);
    expect(Math.abs(out[0]! - 0.98)).toBeLessThan(2e-3);
    expect(half).toBeGreaterThan(0.3);
    expect(half).toBeLessThan(0.6);
    b.free();
  });
});
