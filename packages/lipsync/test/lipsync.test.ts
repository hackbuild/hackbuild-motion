import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  LipSync,
  OCULUS_VISEMES,
  type OculusViseme,
  VisemeTimeline,
  bandsFromSpectrum,
  drive,
  estimateWords,
  phonemeToViseme,
  rms,
  vowelFromBands,
  wordToVisemes,
} from "../src/index.js";

const at = (v: OculusViseme) => OCULUS_VISEMES.indexOf(v);

describe("phonemes and spelling", () => {
  it("maps ARPAbet, IPA and viseme names", () => {
    expect(phonemeToViseme("AA1")).toBe("aa");
    expect(phonemeToViseme("M")).toBe("PP");
    expect(phonemeToViseme("TH")).toBe("TH");
    expect(phonemeToViseme("ʃ")).toBe("CH");
    expect(phonemeToViseme("ˈiː")).toBe("I");
    expect(phonemeToViseme("dʒ")).toBe("CH");
    expect(phonemeToViseme("kk")).toBe("kk");
    expect(phonemeToViseme("?")).toBe("sil");
  });

  it("spells words into visemes", () => {
    expect(wordToVisemes("mama").map((x) => x.viseme)).toEqual(["PP", "aa", "PP", "aa"]);
    expect(wordToVisemes("the").map((x) => x.viseme)).toEqual(["TH", "E"]);
    expect(wordToVisemes("make").map((x) => x.viseme)).toEqual(["PP", "aa", "kk"]);
    expect(wordToVisemes("food").map((x) => x.viseme)).toEqual(["FF", "U", "DD"]);
    expect(wordToVisemes("123")).toEqual([]);
  });

  it("spreads words over an utterance by syllables", () => {
    const ev = estimateWords("hello there banana", 1, 3);
    expect(ev.length).toBe(3);
    expect(ev[0]!.time).toBe(1);
    const last = ev[2] as { end: number };
    expect(last.end).toBeLessThanOrEqual(3);
    const d = ev.map((e) => (e as { end: number }).end - e.time);
    expect(d[2]!).toBeGreaterThan(d[1]!);
  });
});

describe("timeline", () => {
  it("closes the lips between two vowels", () => {
    const tl = new VisemeTimeline();
    tl.push([
      { type: "viseme", viseme: "aa", time: 0, end: 0.2 },
      { type: "viseme", viseme: "PP", time: 0.2, end: 0.26 },
      { type: "viseme", viseme: "aa", time: 0.26, end: 0.5 },
    ]);
    const out = new Float32Array(OCULUS_VISEMES.length);
    tl.sample(0.23, out);
    expect(out[at("PP")]!).toBeGreaterThan(0.9);
    tl.sample(0.1, out);
    expect(out[at("aa")]!).toBeCloseTo(1, 6);
    expect(tl.sample(1, out)).toBe(0);
  });

  it("never sums past 1 and blends smoothly (property)", () => {
    const vis = fc.constantFrom(...OCULUS_VISEMES);
    fc.assert(
      fc.property(fc.array(fc.tuple(vis, fc.double({ min: 0.02, max: 0.3, noNaN: true })), { minLength: 1, maxLength: 12 }), fc.double({ min: 0, max: 2, noNaN: true }), (segs, t) => {
        const tl = new VisemeTimeline();
        let s = 0;
        tl.push(
          segs.map(([v, d]) => {
            const e = { type: "viseme" as const, viseme: v, time: s, end: s + d };
            s += d;
            return e;
          }),
        );
        const a = new Float32Array(15);
        const b = new Float32Array(15);
        tl.sample(t, a);
        tl.sample(t + 1e-4, b);
        const sum = a.reduce((x, y) => x + y, 0);
        let jump = 0;
        for (let i = 0; i < 15; i++) jump = Math.max(jump, Math.abs(a[i]! - b[i]!));
        return sum <= 1 + 1e-5 && a.every((x) => x >= 0) && jump < 0.05;
      }),
    );
  });

  it("squeezes an estimated word when the next word comes early", () => {
    const tl = new VisemeTimeline();
    tl.push({ type: "word", time: 0, text: "wonderful" });
    const estimated = tl.until;
    expect(estimated).toBeGreaterThan(0.4);
    tl.push({ type: "word", time: 0.3, text: "day" });
    const first = tl.keys.filter((k) => k.start < 0.3);
    expect(Math.max(...first.map((k) => k.end))).toBeCloseTo(0.3, 9);
    expect(first.length).toBe(wordToVisemes("wonderful").length);
  });

  it("cuts speech at an end event", () => {
    const tl = new VisemeTimeline();
    tl.push([{ type: "word", time: 0, end: 1, text: "hello" }, { type: "end", time: 0.5 }]);
    expect(tl.until).toBeCloseTo(0.5, 9);
  });
});

describe("audio level", () => {
  it("measures rms and bands", () => {
    expect(rms(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5, 9);
    expect(rms(new Uint8Array([128, 128]))).toBe(0);
    const n = 1024;
    const spec = new Float32Array(n).fill(-120);
    const hz = 48000 / (2 * n);
    for (let i = Math.floor(2500 / hz); i < 4000 / hz; i++) spec[i] = -10;
    const front = vowelFromBands(bandsFromSpectrum(spec, 48000, 2 * n));
    expect(front.ee).toBeGreaterThan(front.aa);
    spec.fill(-120);
    for (let i = Math.floor(300 / hz); i < 500 / hz; i++) spec[i] = -10;
    const round = vowelFromBands(bandsFromSpectrum(spec, 48000, 2 * n));
    expect(round.oh + round.ou).toBeGreaterThan(round.aa);
    spec.fill(-120);
    for (let i = Math.floor(500 / hz); i < 1500 / hz; i++) spec[i] = -10;
    const open = vowelFromBands(bandsFromSpectrum(spec, 48000, 2 * n));
    expect(open.aa).toBeGreaterThan(0.9);
  });
});

describe("driver", () => {
  it("prefers timings, falls back to the level, then goes quiet", () => {
    const ls = new LipSync({ lead: 0 });
    ls.push({ type: "viseme", viseme: "aa", time: 0, end: 0.5 });
    ls.setLevel(0.2);
    let f = ls.update(0, 1 / 60);
    for (let k = 1; k <= 15; k++) f = ls.update(k / 60, 1 / 60);
    expect(f.source).toBe("timeline");
    expect(f.vowels.aa).toBeGreaterThan(0.95);
    expect(f.open).toBeGreaterThan(0.9);
    for (let k = 0; k < 30; k++) f = ls.update(0.6 + k / 60, 1 / 60);
    expect(f.source).toBe("energy");
    expect(f.vowels.aa).toBeGreaterThan(0.5);
    ls.setLevel(0.001);
    for (let k = 0; k < 60; k++) f = ls.update(1.2 + k / 60, 1 / 60);
    expect(f.source).toBe("silent");
    expect(f.open).toBeLessThan(0.01);
  });

  it("rises faster than it falls", () => {
    const ls = new LipSync({ lead: 0 });
    ls.setLevel(0.3);
    const up = ls.update(0, 0.02).vowels.aa;
    ls.setLevel(1);
    for (let k = 0; k < 30; k++) ls.update(k * 0.02, 0.02);
    const top = ls.update(1, 0.02).vowels.aa;
    ls.setLevel(0);
    const down = top - ls.update(1.02, 0.02).vowels.aa;
    expect(up / top).toBeGreaterThan(down / top);
  });

  it("writes VRM vowels, Oculus morphs and ARKit shapes", () => {
    const ls = new LipSync({ lead: 0 });
    ls.push({ type: "phoneme", phoneme: "M", time: 0, end: 0.4 });
    let f = ls.update(0, 0.05);
    for (let k = 1; k < 8; k++) f = ls.update(k * 0.05, 0.05);
    const vrm = new Map<string, number>();
    drive({ setValue: (n, w) => vrm.set(n, w) }, f, "vrm");
    expect([...vrm.keys()].sort()).toEqual(["aa", "ee", "ih", "oh", "ou"]);
    expect(vrm.get("aa")).toBeLessThan(0.01);
    const ocu = new Map<string, number>();
    drive({ setValue: (n, w) => ocu.set(n, w) }, f, "oculus");
    expect(ocu.size).toBe(15);
    expect(ocu.get("viseme_PP")!).toBeGreaterThan(0.9);
    const ark = new Map<string, number>();
    drive({ setValue: (n, w) => ark.set(n, w) }, f, "arkit");
    expect(ark.get("mouthClose")!).toBeGreaterThan(0.9);
    expect(ark.has("jawOpen")).toBe(true);
  });
});
