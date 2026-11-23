import { readFileSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { BodyDynamics, Ears, PhaseEstimator, ProceduralBackend, QuadrupedGait, TailWag, goldenTrace, load, motorStateOf, quadrupedTables, steer } from "../src/index.js";
import { driveQuadruped, measureQuadruped } from "../src/three.js";

const here = import.meta.dirname;
const golden = JSON.parse(readFileSync(join(here, "../../../crates/gait/tests/golden.json"), "utf8")) as { seed: number; values: number[] };

// a small fixed stream for tests; library code takes it injected
const lcg = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

beforeAll(async () => {
  await load();
});

const DOG_LEGS = [
  { x: 0.09, z: 0.22, toe: 0.02, front: true },
  { x: -0.09, z: 0.22, toe: 0.02, front: true },
  { x: 0.09, z: -0.2, toe: 0.02, front: false },
  { x: -0.09, z: -0.2, toe: 0.02, front: false },
];

function dogRig(): THREE.Group {
  const root = new THREE.Group();
  const bone = (name: string, parent: THREE.Object3D, p: [number, number, number]) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(...p);
    parent.add(b);
    return b;
  };
  const hips = bone("hips", root, [0, 0.38, 0]);
  const spine = bone("spine2", hips, [0, 0, 0.1]);
  const chest = bone("chest", spine, [0, 0, 0.12]);
  const neck = bone("neck1", chest, [0, 0.08, 0.05]);
  bone("head", neck, [0, 0.08, 0.06]);
  for (const [s, x] of [["L", 0.09], ["R", -0.09]] as const) {
    const fu = bone(`frontUpr.${s}`, chest, [x, 0, 0]);
    const fm = bone(`frontLeg.${s}_03`, fu, [0, -0.18, -0.08]);
    const fe = bone(`frontHorselink.${s}`, fm, [0, -0.16, 0.08]);
    bone(`frontToe.${s}`, fe, [0, -0.02, 0.03]);
    const ru = bone(`rearUpr.${s}`, hips, [x, 0, -0.2]);
    const rm = bone(`rearLwr.${s}`, ru, [0, -0.17, 0.07]);
    const re = bone(`rearHorselink.${s}`, rm, [0, -0.15, -0.08]);
    const rf = bone(`rearFoot.${s}`, re, [0, -0.02, 0.01]);
    bone(`rearToe.${s}`, rf, [0, -0.02, 0.03]);
  }
  const t1 = bone("tail1", hips, [0, 0.02, -0.25]);
  const t2 = bone("tail3", t1, [0, 0, -0.08]);
  bone("tail_03", t2, [0, 0, -0.08]);
  return root;
}

const NAMES = {
  hips: "hips",
  spine: ["spine2", "chest"],
  tail: ["tail1", "tail3", "tail_03"],
  legs: {
    LF: { up: "frontUpr.L", mid: "frontLeg.L_03", end: "frontHorselink.L", toes: ["frontToe.L"] },
    RF: { up: "frontUpr.R", mid: "frontLeg.R_03", end: "frontHorselink.R", toes: ["frontToe.R"] },
    LH: { up: "rearUpr.L", mid: "rearLwr.L", end: "rearHorselink.L", toes: ["rearFoot.L", "rearToe.L"] },
    RH: { up: "rearUpr.R", mid: "rearLwr.R", end: "rearHorselink.R", toes: ["rearFoot.R", "rearToe.R"] },
  },
};

describe("wasm and native agree", () => {
  it("golden trace is bit identical to the native build", () => {
    const got = Array.from(goldenTrace(golden.seed));
    expect(got.length).toBe(golden.values.length);
    got.forEach((v, i) => expect(Object.is(v, golden.values[i]), `value ${i}`).toBe(true));
  });
});

describe("footfall tables", () => {
  it("trot pairs diagonals and pace pairs sides", () => {
    const t = quadrupedTables();
    const trot = t.find((x) => x.name === "trot")!;
    expect(trot.offsets[0]).toBe(trot.offsets[3]);
    expect(trot.offsets[1]).toBe(trot.offsets[2]);
    const pace = t.find((x) => x.name === "pace")!;
    expect(pace.offsets[0]).toBe(pace.offsets[2]);
  });
});

describe("oscillator", () => {
  it("gait shifts from walk to trot to gallop with speed and stance feet never slide (property)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1e9 }), fc.double({ min: 0.2, max: 5, noNaN: true }), (seed, speed) => {
        const g = new QuadrupedGait(DOG_LEGS, 0.42, { rng: lcg(seed) });
        g.reset(0, 0, 0);
        const pose = { x: 0, z: 0, yaw: 0 };
        let prev = g.update(1 / 60, pose, { speed: 0, turnRate: 0 });
        let ok = true;
        for (let k = 0; k < 400; k++) {
          pose.z += speed / 60;
          const s = g.update(1 / 60, pose, { speed, turnRate: 0 });
          s.feet.forEach((f, i) => {
            const p = prev.feet[i]!;
            if (k > 60 && p.stance && f.stance && Math.hypot(f.x - p.x, f.z - p.z) > 1e-12) ok = false;
          });
          prev = s;
        }
        const dom = Object.entries(prev.weights).sort((a, b) => b[1] - a[1])[0]![0];
        const fr = (speed * speed) / (9.81 * 0.42);
        const want = fr < 0.12 * 0.9 ? ["walk"] : fr < 0.42 * 0.9 ? ["walk", "pace", "trot"] : fr < 1.5 * 0.85 ? ["trot", "pace"] : ["canter", "gallop", "trot"];
        g.dispose();
        return ok && want.includes(dom);
      }),
      { numRuns: 40 },
    );
  });

  it("contacts alone give the same motor state as the oscillator, labelled by source", () => {
    const g = new QuadrupedGait(DOG_LEGS, 0.42, { rng: lcg(3) });
    const est = new PhaseEstimator(4, "neural");
    const pose = { x: 0, z: 0, yaw: 0 };
    let worst = 0;
    let m = null;
    let truth = null;
    for (let k = 0; k < 1200; k++) {
      pose.z += 1.6 / 120;
      const s = g.update(1 / 120, pose, { speed: 1.6, turnRate: 0 });
      truth = motorStateOf(s);
      m = est.update(1 / 120, s.feet.map((f) => f.stance));
      if (k > 480) {
        const d = Math.abs(((m.phase - truth.phase + 1.5) % 1) - 0.5);
        worst = Math.max(worst, d);
      }
    }
    expect(m!.source).toBe("neural");
    expect(truth!.source).toBe("procedural");
    expect(worst).toBeLessThan(0.05);
    expect(Math.abs(m!.strideFrequency - truth!.strideFrequency) / truth!.strideFrequency).toBeLessThan(0.03);
    expect(m!.contacts).toEqual(truth!.contacts);
  });

  it("procedural backend declares its capabilities and moves", () => {
    const b = new ProceduralBackend(new QuadrupedGait(DOG_LEGS, 0.42, { rng: lcg(1) }));
    expect(b.capabilities.turnInPlace).toBe(true);
    for (let i = 0; i < 60; i++) b.update(1 / 60, { speed: 1, turnRate: 0 });
    expect(b.root.z).toBeCloseTo(1, 6);
    expect(b.state!.feet.length).toBe(4);
    expect(b.motorState().source).toBe("procedural");
    expect(b.motorState().strideFrequency).toBeGreaterThan(0);
  });

  it("steer heads for the goal", () => {
    const s = steer({ x: 0, z: 0, yaw: 0, v: 0 }, { x: 3, z: 0 });
    expect(s.turnRate).toBeGreaterThan(0);
    expect(steer({ x: 0, z: 0, yaw: 0, v: 0 }, { x: 0.1, z: 0 }).arrived).toBe(true);
  });

  it("tail and ears stay bounded", () => {
    const tail = new TailWag(3, 0.06, lcg(2));
    const ears = new Ears();
    for (let i = 0; i < 600; i++) {
      const t = tail.update(1 / 60, { modeWeights: [1, 1, 1, 1, 1, 1, 1, 1], arousal: 0.7 });
      expect(t.yaw.every((a) => Math.abs(a) < 1.2)).toBe(true);
      const e = ears.update(1 / 60, 0.5, 0, Math.sin(i / 10));
      expect(Math.abs(e[0])).toBeLessThan(1);
    }
  });
});

describe("three adapter", () => {
  it("toes land on the gait's foot targets and planted toes stay put", () => {
    const root = dogRig();
    const rig = measureQuadruped(root, NAMES);
    expect(rig.legLength).toBeCloseTo(0.38, 9);
    expect(rig.specs[0]!.toe).toBeCloseTo(0.02, 9);
    expect(rig.specs[0]!.z).toBeCloseTo(0.25, 9);
    const rng = lcg(7);
    const g = new QuadrupedGait(rig.specs, rig.legLength, { rng });
    const body = new BodyDynamics(rig.geometry, rng);
    const tail = new TailWag(3, 0.06, rng);
    const pose = { x: 0, z: 0, yaw: 0 };
    g.reset(0, 0, 0);
    const toes = ["frontToe.L", "frontToe.R", "rearToe.L", "rearToe.R"].map((n) => root.getObjectByName(n)!);
    let worst = 0;
    let slide = 0;
    let unreached = 0;
    let prev: THREE.Vector3[] | null = null;
    let prevStance: boolean[] = [];
    for (let k = 0; k < 240; k++) {
      const cmd = { speed: 0.6, turnRate: 0.3 };
      pose.yaw += cmd.turnRate / 60;
      pose.x += (Math.sin(pose.yaw) * cmd.speed) / 60;
      pose.z += (Math.cos(pose.yaw) * cmd.speed) / 60;
      const s = g.update(1 / 60, pose, cmd);
      const b = body.update(1 / 60, s, cmd, [0, 0, 0, 0]);
      const missed = driveQuadruped(rig, pose, s, b, { tail: tail.update(1 / 60, { modeWeights: [0, 1], arousal: 0.5 }) });
      unreached += missed.length;
      const now = toes.map((t) => t.getWorldPosition(new THREE.Vector3()));
      now.forEach((p, i) => {
        const f = s.feet[i]!;
        if (!missed.includes(i)) worst = Math.max(worst, p.distanceTo(new THREE.Vector3(f.x, f.y, f.z)));
        if (prev && prevStance[i] && f.stance) slide = Math.max(slide, p.distanceTo(prev[i]!));
      });
      prev = now;
      prevStance = s.feet.map((f) => f.stance);
    }
    // measured: 1 of 960 leg frames out of reach on this short legged test rig
    expect(unreached).toBeLessThan(10);
    expect(worst).toBeLessThan(1e-3);
    expect(slide).toBeLessThan(1e-3);
  });
});
