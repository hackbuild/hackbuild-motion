import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Predictor, goldenTrace, lcg, load, loadWeights, type Weights } from "../src/index.js";
import { VECTORS } from "./vectors.js";
import { WEIGHTS_BIN, WEIGHTS_MANIFEST, haveWeights } from "./env.js";

const here = import.meta.dirname;
const golden = JSON.parse(readFileSync(join(here, "../../../crates/motion-net/tests/golden.json"), "utf8")) as { seed: number; values: number[] };

beforeAll(async () => {
  await load();
});

describe("parity", () => {
  it("the wasm build (simd128) reproduces the native golden trace bit for bit", () => {
    const got = Array.from(goldenTrace(golden.seed));
    expect(got.length).toBe(golden.values.length);
    got.forEach((v, i) => expect(Object.is(v, golden.values[i]), `value ${i}`).toBe(true));
  });
  it("the generator matches the specification for seed 1", () => {
    const r = lcg(1);
    expect([r(), r(), r()]).toEqual([0.23645552527159452, 0.3692706737201661, 0.5042420323006809]);
  });
});

describe.skipIf(!haveWeights)("specification test vectors (needs the cc by-nc weights)", () => {
  let w: Weights;
  let pred: Predictor;
  beforeAll(async () => {
    const bin = readFileSync(WEIGHTS_BIN);
    w = await loadWeights({ manifest: readFileSync(WEIGHTS_MANIFEST), bin, onLicence: () => {} });
    pred = await Predictor.create(w, { worker: false });
  });

  const inputOf = (name: "A" | "B" | "C"): Float32Array => {
    const mu = w.inputMean;
    const sd = w.inputStd;
    if (name === "A") return Float32Array.from(mu);
    const r = lcg(name === "B" ? 1 : 2);
    const u = Float32Array.from(mu, (m, i) => Math.fround(m + sd[i]! * (2 * r() - 1)));
    if (name === "C") u.set(w.styles.Trot, 258);
    return u;
  };

  const worst = { value: 0, checksum: 0 };
  for (const v of VECTORS) {
    it(`test ${v.name}`, async () => {
      const u = inputOf(v.name);
      for (const [i, want] of Object.entries(v.spot)) expect(Math.abs(u[Number(i)]! - want)).toBeLessThan(6e-7);
      const out = await pred.predict(u);
      const tol = (a: number, b: number) => {
        const e = Math.abs(a - b) / Math.max(1, Math.abs(b));
        worst.value = Math.max(worst.value, e);
        return e;
      };
      v.p0.forEach((b, i) => expect(tol(out.code0[i]!, b), `p0[${i}]`).toBeLessThanOrEqual(1e-4));
      v.p.forEach((b, i) => expect(tol(out.code[i]!, b), `p[${i}]`).toBeLessThanOrEqual(1e-4));
      let moment = 0;
      out.code.forEach((x, i) => (moment += x * (i % 4)));
      expect(Math.abs(moment - v.moment) / v.moment).toBeLessThanOrEqual(1e-5);
      const am = Array.from({ length: 16 }, (_, g) => {
        const s = out.code.subarray(g * 4, g * 4 + 4);
        return s.indexOf(Math.max(...s));
      });
      expect(am).toEqual(v.argmax);
      for (const [k, entries] of Object.entries(v.frames))
        for (const [i, b] of Object.entries(entries)) expect(tol(out.frames[Number(k) * 412 + Number(i)]!, b), `y${k}[${i}]`).toBeLessThanOrEqual(1e-4);
      let sum = 0;
      let sq = 0;
      let wsum = 0;
      out.frames.forEach((y, j) => {
        sum += y;
        sq += y * y;
        wsum += (Math.floor(j / 412) + 1) * y;
      });
      for (const [got, want] of [
        [sum, v.sum],
        [sq, v.sumSq],
        [wsum, v.weighted],
      ] as const) {
        const e = Math.abs(got - want) / Math.abs(want);
        worst.checksum = Math.max(worst.checksum, e);
        expect(e).toBeLessThanOrEqual(1e-5);
      }
      console.info(`motion-net: test ${v.name} passed, worst listed value error so far ${worst.value.toExponential(2)}, worst checksum error ${worst.checksum.toExponential(2)} (measured); ${out.ms.toFixed(1)} ms per evaluation in the page`);
    });
  }
});
