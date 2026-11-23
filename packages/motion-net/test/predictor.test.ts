import { beforeAll, describe, expect, it } from "vitest";
import { Predictor, load, loadWeights } from "../src/index.js";
import { SMALL, smallWeights } from "./synthetic.js";

beforeAll(async () => {
  await load();
});

describe("predictor input and lifetime", () => {
  it("rejects an input of the wrong length and keeps working", async () => {
    const { manifest, bin } = smallWeights(3);
    const w = await loadWeights({ manifest, bin, onLicence: () => {} });
    const p = await Predictor.create(w, { worker: false });
    await expect(p.predict(new Float32Array(2))).rejects.toThrow(/23 values/);
    await expect(p.predict(new Float32Array(SMALL.dIn + 1))).rejects.toThrow(/23 values/);
    const ok = await p.predict(new Float32Array(SMALL.dIn));
    expect(ok.frames.length).toBe(SMALL.frames * SMALL.dOut);
    p.dispose();
  });

  it("settles a run asked for after dispose", async () => {
    const { manifest, bin } = smallWeights(4);
    const w = await loadWeights({ manifest, bin, onLicence: () => {} });
    const p = await Predictor.create(w, { worker: false });
    p.dispose();
    await expect(p.predict(new Float32Array(SMALL.dIn))).rejects.toThrow(/disposed/);
  });
});
