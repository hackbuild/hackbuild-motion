import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type ArticulatorFrame, arkitFromChannels, articulatoryFrame, fromProbe, fromTractModel, mouthChannels, vowelWeights } from "../src/articulatory.js";
import { OCULUS_VISEMES, type OculusViseme, VRM_VOWELS } from "../src/index.js";

// bellows-voice 0.7.3 TractModel postures, settled, for every sound it has.
const frames = (JSON.parse(readFileSync(new URL("./fixtures/bellows-frames.json", import.meta.url), "utf8")) as { frames: Record<string, ArticulatorFrame> }).frames;
const top = (v: Float32Array): OculusViseme => OCULUS_VISEMES[v.indexOf(Math.max(...v))]!;
const VOWEL_VISEMES = new Set<OculusViseme>(["aa", "E", "I", "O", "U"]);

// Consonants by place. l and the dark l read as DD: the frame carries no
// lateral channel. h, the glottal stop and j make no oral gesture over the
// schwa they were settled on, so they read as a vowel shape.
const CONSONANTS: Record<string, OculusViseme> = {
  p: "PP", b: "PP", m: "PP", f: "FF", v: "FF", "θ": "TH", "ð": "TH", t: "DD", d: "DD", "ɾ": "DD", l: "DD", "ɫ": "DD", n: "nn",
  s: "SS", z: "SS", "ʃ": "CH", "ʒ": "CH", "tʃ": "CH", "dʒ": "CH", "ɹ": "RR", "ɝ": "RR", k: "kk", g: "kk", "ŋ": "kk",
};
const ANCHOR_VOWELS: Record<string, OculusViseme> = { "ɑ": "aa", a: "aa", "æ": "aa", i: "I", "ɪ": "I", e: "E", "ɛ": "E", u: "U", "ʊ": "U", o: "O" };

describe("articulatory source", () => {
  it("reads every bellows consonant by its place and the anchor vowels by shape", () => {
    const miss: string[] = [];
    for (const [ipa, f] of Object.entries(frames)) {
      const got = top(articulatoryFrame(f).visemes);
      const want = CONSONANTS[ipa] ?? ANCHOR_VOWELS[ipa];
      if (want ? got !== want : !VOWEL_VISEMES.has(got)) miss.push(`${ipa}: ${got} want ${want ?? "a vowel"}`);
    }
    expect(miss).toEqual([]);
  });

  it("shuts the VRM vowels on a lip closure and keeps them in sum at most 1", () => {
    for (const [ipa, f] of Object.entries(frames)) {
      const o = articulatoryFrame(f);
      const sum = VRM_VOWELS.reduce((s, k) => s + o.vowels[k], 0);
      expect(sum, ipa).toBeLessThanOrEqual(1 + 1e-9);
      expect(o.visemes.reduce((a, b) => a + b, 0), ipa).toBeLessThanOrEqual(1 + 1e-6);
      if ("pbm".includes(ipa)) expect(sum, ipa).toBeLessThan(0.01);
    }
  });

  it("opens the jaw by the bellows jaw arc", () => {
    expect(mouthChannels(frames["ɔ"]!).open).toBeGreaterThan(0.95);
    expect(mouthChannels(frames["u"]!).open).toBeLessThan(0.01);
    expect(mouthChannels(frames["i"]!).open).toBeCloseTo((0.413 - 0.2) / 1.65, 3);
  });

  it("puts the five vowel presets on their own bellows vowels", () => {
    const pairs: [string, (typeof VRM_VOWELS)[number]][] = [["ɑ", "aa"], ["i", "ih"], ["u", "ou"], ["o", "oh"], ["e", "ee"]];
    for (const [ipa, vowel] of pairs) {
      const w = vowelWeights(mouthChannels(frames[ipa]!));
      expect(Math.max(...VRM_VOWELS.map((k) => w[k])), ipa).toBe(w[vowel]);
    }
  });

  it("writes ARKit shapes from the channels", () => {
    const m = arkitFromChannels(mouthChannels(frames.m!));
    expect(m.get("mouthClose")).toBe(1);
    expect(arkitFromChannels(mouthChannels(frames.u!)).get("mouthPucker")!).toBeGreaterThan(0.9);
    expect(arkitFromChannels(mouthChannels(frames.f!)).get("mouthRollLower")!).toBeCloseTo(0.7, 6);
    expect(arkitFromChannels(mouthChannels(frames["θ"]!)).get("tongueOut")!).toBeGreaterThan(0.4);
    expect(arkitFromChannels(mouthChannels(frames.i!)).get("mouthStretchLeft")!).toBeCloseTo(0.5, 6);
  });

  it("goes silent when the voice holds its last state", () => {
    const o = articulatoryFrame({ ...frames["ɑ"]!, sounding: 0 });
    expect(o.source).toBe("silent");
    expect(o.open).toBe(0);
    expect(o.visemes.every((x) => x === 0)).toBe(true);
  });

  it("reads a TractModel shaped object", () => {
    const a = frames.s!;
    const tract = {
      postureByName: () => ({ jaw: a.jaw, lipAp: a.lipAperture, lipProt: a.lipProtrusion, lipWidth: a.lipWidth, labiodental: a.labiodental, tbX: a.tongueBodyX, tbY: a.tongueBodyY, ttX: a.tongueTipX, ttY: a.tongueTipY, velum: a.velum }),
    };
    const { lipArea: _skip, ...want } = a as ArticulatorFrame & { lipArea?: number };
    expect(fromTractModel(tract)).toEqual(want);
  });
});

// A real engine track: bellows-voice 0.8.0 renderSpeech, "Shall we meet at noon?".
const real = JSON.parse(readFileSync(new URL("./fixtures/bellows-track.json", import.meta.url), "utf8")) as {
  spans: { ipa: string; start: number; end: number }[];
  track: (ArticulatorFrame & { time: number; phoneme: string })[];
};

describe("articulatory source on the engine's own track", () => {
  const during = (ipa: string) => {
    const s = real.spans.filter((x) => x.ipa === ipa);
    return real.track.filter((f) => s.some((x) => f.time >= x.start + 0.01 && f.time <= x.end));
  };

  it("closes the lips on m and opens the jaw on the vowels", () => {
    const m = during("m").map((f) => articulatoryFrame(f));
    expect(m.length).toBeGreaterThan(0);
    expect(Math.max(...m.map((o) => o.channels.closure))).toBeGreaterThan(0.9);
    const u = during("u").map((f) => articulatoryFrame(f));
    expect(Math.max(...u.map((o) => o.vowels.ou))).toBeGreaterThan(0.5);
    const i = during("i").map((f) => articulatoryFrame(f));
    expect(Math.max(...i.map((o) => o.vowels.ih))).toBeGreaterThan(0.5);
  });

  it("reads sh as CH and t as DD at their frames", () => {
    expect(during("ʃ").some((f) => top(articulatoryFrame(f).visemes) === "CH")).toBe(true);
    expect(during("t").some((f) => top(articulatoryFrame(f).visemes) === "DD")).toBe(true);
  });

  it("goes silent on frames that do not sound and through fromProbe before the first frame", () => {
    const quiet = real.track.filter((f) => f.sounding === false);
    for (const f of quiet) expect(articulatoryFrame(f).source).toBe("silent");
    expect(fromProbe({ heard: () => null }).source).toBe("silent");
    const f = real.track[30]!;
    expect(fromProbe({ heard: () => f }).visemes).toEqual(articulatoryFrame(f).visemes);
  });
});
