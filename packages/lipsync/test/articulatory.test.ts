import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type ArticulatorFrame, arkitFromChannels, articulatoryFrame, fromTractModel, mouthChannels, vowelWeights } from "../src/articulatory.js";
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
      postureByName: () => ({ jaw: a.jaw, lipAp: a.lipAperture, lipProt: a.lipProtrusion, lipWidth: a.lipWidth, labiodental: a.labiodental, tbX: a.tongueBodyX, tbY: a.tongueBodyY, velum: a.velum }),
      drawingNow: () => ({ tipX: a.tongueTipX, tipY: a.tongueTipY }),
    };
    const { lipArea: _skip, ...want } = a as ArticulatorFrame & { lipArea?: number };
    expect(fromTractModel(tract)).toEqual(want);
  });
});
