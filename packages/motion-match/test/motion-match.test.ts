import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { LocomotionBackend as GaitBackend } from "../../gait/src/index.js";
import { ClipSet, MotionMatcher, goldenTrace, load } from "../src/index.js";

const here = import.meta.dirname;
const golden = JSON.parse(readFileSync(join(here, "../../../crates/motion-match/tests/golden.json"), "utf8")) as { seed: number; values: number[] };

// a small fixed stream for tests; library code takes it injected
const lcg = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

beforeAll(async () => {
  await load();
});

function set(): ClipSet {
  const s = new ClipSet(30);
  s.addSynthetic({ speed: 0, strides: 2 });
  s.addSynthetic({ speed: 1.2 });
  s.addSynthetic({ speed: 3, strides: 4 });
  s.addSynthetic({ speed: 1.2, turnRate: 0.8, strides: 4, looped: false });
  s.addSynthetic({ speed: 0, speedEnd: 1.2, looped: false });
  s.addSynthetic({ speed: 1.2, speedEnd: 0, looped: false });
  s.addSynthetic({ speed: 0, speedEnd: 3, strides: 4, looped: false });
  s.addSynthetic({ speed: 3, speedEnd: 1.2, strides: 4, looped: false });
  return s;
}

describe("parity", () => {
  it("golden trace is bit identical to the native build", () => {
    const got = Array.from(goldenTrace(golden.seed));
    expect(got.length).toBe(golden.values.length);
    got.forEach((v, i) => expect(Object.is(v, golden.values[i]), `value ${i}`).toBe(true));
  });
});

describe("search", () => {
  it("a frame's own features find it at zero cost", () => {
    const s = set();
    const m = new MotionMatcher(s);
    // the first three clips loop, so every frame of theirs is searchable
    const looped = s.frames().slice(0, 3).reduce((a, b) => a + b, 0);
    for (let i = 0; i < looped; i += 5) {
      const row = m.featureRow(i);
      const h = m.search(row);
      expect(h.cost).toBeLessThan(1e-20);
      expect(Array.from(m.featureRow(h.index))).toEqual(Array.from(row));
    }
    m.dispose();
  });

  it("box search agrees with brute force on noisy queries", () => {
    const m = new MotionMatcher(set());
    const r = lcg(3);
    for (let k = 0; k < 200; k++) {
      const q = Array.from(m.featureRow(Math.floor(r() * m.frames)), (x) => x + (r() - 0.5) * (k % 2 ? 4 : 0.5));
      expect(m.search(q, false)).toEqual(m.search(q, true));
    }
    m.dispose();
  });
});

describe("matcher", () => {
  it("follows a run command and fills the motor state", () => {
    const m = new MotionMatcher(set());
    for (let i = 0; i < 300; i++) m.update(1 / 60, { speed: 3, turnRate: 0 });
    expect(m.last.speed).toBeGreaterThan(2.9);
    expect(m.last.speed).toBeLessThan(3.1);
    const s = m.motorState();
    expect(s.source).toBe("motion-match");
    expect(s.contacts.length).toBe(2);
    expect(s.strideFrequency).toBeGreaterThan(1.5);
    m.dispose();
  });

  it("transitions keep the hip and feet continuous", () => {
    const m = new MotionMatcher(set());
    let prev: number[] | null = null;
    let worstJump = 0;
    let worstPlain = 0;
    let since = 99;
    for (const [speed, turnRate] of [[0, 0], [1.2, 0], [3, 0], [1.2, 0.8], [0, 0]] as const) {
      m.forceSearch();
      for (let i = 0; i < 120; i++) {
        const f = m.step(1 / 60, m.trajectory(speed, turnRate));
        since = f.jumped ? 0 : since + 1;
        const p = m.pose();
        const now = [...p.hips, ...p.feet.flat()];
        if (prev) {
          let step = 0;
          for (let k = 0; k < now.length; k += 3) step = Math.max(step, Math.hypot(now[k]! - prev[k]!, now[k + 1]! - prev[k + 1]!, now[k + 2]! - prev[k + 2]!));
          if (since < 2) worstJump = Math.max(worstJump, step);
          else worstPlain = Math.max(worstPlain, step);
        }
        prev = now;
      }
    }
    expect(m.last.transitions).toBeGreaterThan(3);
    // measured 2026-11-23: 0.155 m on transition frames against 0.182 m on plain frames
    expect(worstJump).toBeLessThanOrEqual(worstPlain * 1.2);
    m.dispose();
  });

  it("start and stop clips do not loop by default, so planted feet do not jump", () => {
    // the example page's clip set and wander cycle; a start or stop clip
    // marked looped wrapped from its end to its start with no transition,
    // 162.5 mm in one frame in the browser check
    const s = new ClipSet(30);
    for (const g of [
      { speed: 0, strides: 4 }, { speed: 0.6, strides: 4 }, { speed: 1.3, strides: 4 }, { speed: 2.4, strides: 4 }, { speed: 3.4, strides: 4 },
      { speed: 1.2, turnRate: 0.9, strides: 4 }, { speed: 1.2, turnRate: -0.9, strides: 4 }, { speed: 0, turnRate: 1.2, strides: 3 }, { speed: 0, turnRate: -1.2, strides: 3 },
      { speed: 0, speedEnd: 1.3, strides: 3 }, { speed: 1.3, speedEnd: 0, strides: 3 }, { speed: 1.3, speedEnd: 3.4, strides: 4 }, { speed: 3.4, speedEnd: 1.3, strides: 4 },
    ])
      s.addSynthetic(g);
    const m = new MotionMatcher(s, { capabilities: { turnInPlace: true } });
    let prev: number[][] | null = null;
    let prevContacts: boolean[] = [];
    let worst = 0;
    for (let i = 0; i < 60 * 24; i++) {
      const k = Math.floor(i / 120) % 6;
      const root = m.update(1 / 60, { speed: [1.2, 3.2, 0.6, 0, 1.4, 0][k]!, turnRate: [0, 0.3, -0.9, 1.2, 0.8, 0][k]! });
      const c = m.motorState().contacts;
      const [sn, cs] = [Math.sin(root.yaw), Math.cos(root.yaw)];
      const w = m.pose().feet.map((p) => [root.x + cs * p[0]! + sn * p[2]!, root.z - sn * p[0]! + cs * p[2]!]);
      if (prev) w.forEach((p, f) => {
        if (c[f] && prevContacts[f]) worst = Math.max(worst, Math.hypot(p[0]! - prev![f]![0]!, p[1]! - prev![f]![1]!));
      });
      prev = w;
      prevContacts = [...c];
    }
    // computed 2026-11-23: 39.2 mm after the fix, 173.6 mm before; the bound is the Rust test's 50 mm
    expect(worst).toBeLessThan(0.05);
    m.dispose();
  });

  it("rejects clips whose arrays disagree", () => {
    const s = new ClipSet(30);
    expect(() => s.add({ looped: true, root: [0, 0, 0, 0, 0.1, 0], rotations: [0, 0, 0, 1], hips: [0, 1, 0, 0, 1, 0], feet: [0, 0, 0, 0, 0, 0], contacts: [1, 1] })).toThrow(/frame count/);
    s.dispose();
  });

  it("satisfies the gait backend contract", () => {
    const m: GaitBackend = new MotionMatcher(set());
    expect(m.update(1 / 60, { speed: 1, turnRate: 0 }).speed).toBeGreaterThanOrEqual(0);
    expect(m.motorState().source).toBe("motion-match");
  });
});
