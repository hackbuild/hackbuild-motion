import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import type { LocomotionBackend as GaitBackend } from "../../gait/src/index.js";
import { DEFAULT_TUNING, Predictor, QuadrupedHost, load, loadWeights, type HostCommand, type HostTuning, type Predicts, type StyleLabel } from "../src/index.js";
import { MockNet, boxStyles, type MockOptions } from "./synthetic.js";
import { WEIGHTS_BIN, WEIGHTS_MANIFEST, haveWeights } from "./env.js";

beforeAll(async () => {
  await load();
});

const DT = 1 / 60;
const tick = () => new Promise((r) => setTimeout(r, 0));

interface Run {
  speed: number;
  turn: number;
  travel: number;
  /** Displayed paw travel per frame while in stance, p95 and max, m. */
  slideP95: number;
  slideMax: number;
  rawSlideP95: number;
  /** Largest move of any bone in one frame relative to the root, m. */
  jump: number;
  host: QuadrupedHost;
}

const q = (a: number[], p: number) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(p * (s.length - 1))]! : 0;
};

/** Steps a host for `secs`, measuring after `settle` seconds. */
async function drive(host: QuadrupedHost, step: (t: number) => HostCommand, secs: number, settle: number, mock?: MockNet, dts?: (f: number) => number): Promise<Run> {
  let t = 0;
  let dist = 0;
  let yaw = 0;
  let n = 0;
  const slide: number[] = [];
  const raw: number[] = [];
  let jump = 0;
  let last = { ...host.root };
  let lastLocal: number[] | null = null;
  const frames = Math.round(secs / DT);
  for (let f = 0; f < frames; f++) {
    const dt = dts ? dts(f) : DT;
    if (Number.isFinite(dt) && dt > 0) t += Math.min(dt, 0.1);
    mock?.flush(t);
    await tick();
    const r = host.update(dt, step(t));
    await tick();
    const p = host.positions;
    const c = Math.cos(r.yaw);
    const s = Math.sin(r.yaw);
    const local = Array.from({ length: 27 }, (_, b) => {
      const dx = p[b * 3]! - r.x;
      const dz = p[b * 3 + 2]! - r.z;
      return [c * dx - s * dz, p[b * 3 + 1]!, s * dx + c * dz];
    }).flat();
    if (t > settle) {
      dist += Math.hypot(r.x - last.x, r.z - last.z);
      const dy = r.yaw - last.yaw;
      yaw += Math.atan2(Math.sin(dy), Math.cos(dy));
      n += dt > 0 ? Math.min(dt, 0.1) : 0;
      host.paws.forEach((paw, i) => {
        if (paw.stance && host.footSlide[i]! + host.rawFootSlide[i]! > 0) {
          slide.push(host.footSlide[i]!);
          raw.push(host.rawFootSlide[i]!);
        }
      });
      if (lastLocal) for (let b = 0; b < 27; b++) jump = Math.max(jump, Math.hypot(local[b * 3]! - lastLocal[b * 3]!, local[b * 3 + 1]! - lastLocal[b * 3 + 1]!, local[b * 3 + 2]! - lastLocal[b * 3 + 2]!));
    }
    lastLocal = local;
    last = { ...r };
  }
  return { speed: dist / Math.max(n, 1e-9), turn: yaw / Math.max(n, 1e-9), travel: dist, slideP95: q(slide, 0.95), slideMax: q(slide, 1), rawSlideP95: q(raw, 0.95), jump, host };
}

function mockHost(opts: MockOptions = {}, tuning: Partial<HostTuning> = {}) {
  const styles = boxStyles();
  const mock = new MockNet(styles, opts);
  return { mock, host: new QuadrupedHost(mock, styles, tuning) };
}

const finiteHost = (h: QuadrupedHost) =>
  [h.root.x, h.root.z, h.root.yaw, h.rootVelocity.x, h.rootVelocity.z, h.rootVelocity.turnRate, ...h.positions, ...h.rotations, ...h.paws.map((p) => p.contact), h.motorState().phase, h.motorState().strideFrequency].every(Number.isFinite);

describe("host on a kinematic stand in (no weights)", () => {
  it("is a gait LocomotionBackend", () => {
    const { host } = mockHost();
    const b: GaitBackend = host;
    expect(b.capabilities.turnInPlace).toBe(true);
    expect(b.motorState().source).toBe("neural");
  });

  it("tracks the commanded speed although the stand in moves at 80 percent of its trajectory", async () => {
    for (const v of [0.6, 1.2, 2.5]) {
      const { mock, host } = mockHost();
      const r = await drive(host, () => ({ speed: v, turnRate: 0 }), 8, 4, mock);
      console.info(`motion-net host, stand in: commanded ${v} m/s, measured ${r.speed.toFixed(3)} m/s; stance paw slide p95 ${(r.slideP95 * 1000).toFixed(2)} mm per frame pinned, ${(r.rawSlideP95 * 1000).toFixed(2)} mm unpinned (measured)`);
      expect(Math.abs(r.speed - v) / v).toBeLessThan(0.05);
      expect(r.slideP95).toBeLessThan(0.001);
      expect(host.style).toBe(v < 1 ? "Walk" : v < 2.1 ? "Trot" : "Canter");
    }
  });

  it("turns at the commanded rate, left positive as in the gait package", async () => {
    const { mock, host } = mockHost({ speedScale: 1 });
    const r = await drive(host, () => ({ speed: 1, turnRate: 0.8 }), 8, 4, mock);
    expect(r.turn).toBeGreaterThan(0.72);
    expect(r.turn).toBeLessThan(0.88);
    // turning left from yaw 0 (+Z forward) moves toward +X
    expect(host.root.x).not.toBe(0);
  });

  it("stands at idle on a zero command", async () => {
    const { mock, host } = mockHost();
    const r = await drive(host, () => ({ speed: 0, turnRate: 0 }), 4, 1, mock);
    expect(r.travel).toBeLessThan(0.01);
    expect(host.style).toBe("Idle");
    expect(host.motorState().strideFrequency).toBe(0);
    expect(host.paws.every((p) => p.stance)).toBe(true);
  });

  it("walks toward a world velocity and facing", async () => {
    const { mock, host } = mockHost({ speedScale: 1 });
    await drive(host, () => ({ speed: 0, turnRate: 0, velocity: { x: 1, z: 0 }, facing: Math.PI / 2 }), 6, 3, mock);
    expect(Math.abs(host.root.yaw - Math.PI / 2)).toBeLessThan(0.1);
    expect(host.rootVelocity.x).toBeGreaterThan(0.8);
  });

  it("gives no NaN on zero, negative, NaN or infinite dt and bad commands", async () => {
    const { mock, host } = mockHost();
    const bad = [0, -0.016, Number.NaN, Infinity, -Infinity, 5, 1e-9];
    await drive(host, (t) => ({ speed: t > 1 ? Number.NaN : 1, turnRate: t > 2 ? Infinity : 0.5 }), 3, 0, mock, (f) => (f % 3 === 0 ? bad[f % bad.length]! : DT));
    expect(finiteHost(host)).toBe(true);
    const before = { ...host.root };
    host.update(0, { speed: 2, turnRate: 1 });
    host.update(-1, { speed: 2, turnRate: 1 });
    expect(host.root).toEqual(before);
    expect(finiteHost(host)).toBe(true);
  });

  it("holds through a late prediction and recovers without a jump", async () => {
    // the 20th prediction takes 1.5 s; the rest take one frame
    const { mock, host } = mockHost({ delay: (n) => (n === 20 ? 1.5 : 1 / 60) });
    let maxAge = 0;
    let stallSpeed = Infinity;
    const r = await drive(
      host,
      (t) => {
        maxAge = Math.max(maxAge, host.predictionAge);
        if (host.predictionAge > 1) stallSpeed = Math.min(stallSpeed, Math.hypot(host.rootVelocity.x, host.rootVelocity.z));
        return { speed: 1.2, turnRate: 0 };
      },
      7,
      1,
      mock,
    );
    expect(maxAge).toBeGreaterThan(1);
    // the root comes to rest rather than sliding a frozen pose
    expect(stallSpeed).toBeLessThan(0.05);
    expect(host.predictionAge).toBeLessThan(0.15);
    expect(r.jump).toBeLessThan(0.06);
    expect(finiteHost(host)).toBe(true);
    console.info(`motion-net host, stand in: late prediction held ${maxAge.toFixed(2)} s, largest bone move in one frame ${(r.jump * 1000).toFixed(1)} mm (measured)`);
  });

  it("drops a prediction that lands after a newer one", async () => {
    // prediction 3 is slow and lands after 4 and 5; it must not replace them
    const { mock, host } = mockHost({ delay: (n) => (n === 3 ? 0.3 : 1 / 60) });
    await drive(host, () => ({ speed: 1, turnRate: 0 }), 2, 0, mock);
    expect(host.predictionAge).toBeLessThan(0.15);
  });

  it("reports latency, phase and duty", async () => {
    const { mock, host } = mockHost({ delay: () => 0.05 });
    await drive(host, () => ({ speed: 1, turnRate: 0 }), 5, 0, mock);
    // 50 ms of delay, seen through 60 Hz frames: within two frames either way
    expect(host.lagMs).toBeGreaterThan(50 - 34);
    expect(host.lagMs).toBeLessThan(50 + 34);
    expect(host.latencyMs).toBeGreaterThanOrEqual(0);
    const m = host.motorState();
    // the stand in trots at 2 strides a second with paws down half the stride
    expect(Math.abs(m.strideFrequency - 2)).toBeLessThan(0.15);
    expect(Math.abs(m.duty - 0.5)).toBeLessThan(0.1);
    expect(m.phase).toBeGreaterThanOrEqual(0);
    expect(m.phase).toBeLessThan(1);
  });

  it("produces unit rotations", async () => {
    const { mock, host } = mockHost();
    await drive(host, () => ({ speed: 1, turnRate: 0.3 }), 2, 0, mock);
    for (let b = 0; b < 27; b++) {
      const o = b * 4;
      expect(Math.hypot(host.rotations[o]!, host.rotations[o + 1]!, host.rotations[o + 2]!, host.rotations[o + 3]!)).toBeCloseTo(1, 5);
    }
  });

  it("states its defaults", () => {
    expect(DEFAULT_TUNING.interval).toBeGreaterThan(0);
    expect(DEFAULT_TUNING.contactOn).toBeGreaterThan(DEFAULT_TUNING.contactOff);
  });
});

describe.skipIf(!haveWeights)("host on the published network (needs the cc by-nc weights)", () => {
  let pred: Predictor;
  let styles: Record<StyleLabel, Float32Array>;
  beforeAll(async () => {
    const w = await loadWeights({ manifest: readFileSync(WEIGHTS_MANIFEST), bin: readFileSync(WEIGHTS_BIN), onLicence: () => {} });
    pred = await Predictor.create(w, { worker: false });
    styles = w.styles;
  });
  const real = (p: Predicts) => new QuadrupedHost(p, styles);

  it("tracks speed and keeps planted paws still", async () => {
    for (const v of [0.6, 1, 1.6, 2.4, 3.5]) {
      const r = await drive(real(pred), () => ({ speed: v, turnRate: 0 }), 16, 8);
      console.info(`motion-net host, published network: commanded ${v} m/s, measured ${r.speed.toFixed(3)} m/s, style ${r.host.style}; stance paw slide p95 ${(r.slideP95 * 1000).toFixed(1)} mm per frame pinned, ${(r.rawSlideP95 * 1000).toFixed(1)} mm unpinned (measured, 60 Hz)`);
      expect(Math.abs(r.speed - v) / v).toBeLessThan(0.08);
      // a gallop stretches the limbs past where they can reach the pin (measured 10 mm p95 at 3.5 m/s)
      expect(r.slideP95).toBeLessThan(v > 3 ? 0.012 : 0.008);
    }
  }, 120000);

  it("turns and idles", async () => {
    const turn = await drive(real(pred), () => ({ speed: 1, turnRate: 1 }), 10, 5);
    console.info(`motion-net host, published network: commanded 1 rad/s at 1 m/s, measured ${turn.turn.toFixed(3)} rad/s (measured)`);
    expect(Math.abs(turn.turn - 1)).toBeLessThan(0.1);
    const idle = await drive(real(pred), () => ({ speed: 0, turnRate: 0 }), 5, 2);
    expect(idle.travel).toBeLessThan(0.05);
    expect(idle.host.style).toBe("Idle");
  }, 120000);

  it("recovers from a late prediction on the real network", async () => {
    let n = 0;
    const slow: Predicts = {
      predict: async (u) => {
        const r = await pred.predict(u);
        if (n++ === 30) await new Promise((res) => setTimeout(res, 400));
        return r;
      },
    };
    const r = await drive(real(slow), () => ({ speed: 1.2, turnRate: 0 }), 8, 1);
    expect(finiteHost(r.host)).toBe(true);
    expect(r.host.predictionAge).toBeLessThan(0.2);
  }, 120000);
});
