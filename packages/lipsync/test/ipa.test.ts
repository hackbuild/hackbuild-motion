import { describe, expect, it } from "vitest";
import { OCULUS_VISEMES, type OculusViseme, VisemeTimeline, phonemeToViseme } from "../src/index.js";

// Every sound on bellows-voice 0.7.3's `phoneme` parameter (VOCAL_PHONEMES in
// src/engines/vocal-phonemes.ts, in order) and the spellings it aliases.
const BELLOWS = [
  "_",
  "ɑ", "æ", "ʌ", "ɔ", "ɛ", "ɝ", "ɪ", "i", "ʊ", "u", "e", "o", "a", "ə",
  "p", "b", "t", "d", "k", "g",
  "f", "v", "θ", "ð", "s", "z", "ʃ", "ʒ", "h",
  "tʃ", "dʒ",
  "m", "n", "ŋ",
  "l", "ɹ", "w", "j",
  "ɾ", "ʔ",
  "ɫ",
  "ɒ", "ɐ", "ɜ", "ʉ", "ɨ", "ɘ", "ɵ", "y", "ø", "œ", "ɯ", "ɤ",
];
const BELLOWS_ALIASES = ["ɚ", "ɡ", "r", "ʧ", "ʤ"];

// The pulmonic consonant chart, the vowel chart and the usual co-articulated
// and affricate symbols.
const COMMON = [
  "p", "b", "t", "d", "ʈ", "ɖ", "c", "ɟ", "k", "g", "q", "ɢ", "ʔ",
  "m", "ɱ", "n", "ɳ", "ɲ", "ŋ", "ɴ", "ʙ", "r", "ʀ", "ɾ", "ɽ",
  "ɸ", "β", "f", "v", "θ", "ð", "s", "z", "ʃ", "ʒ", "ʂ", "ʐ", "ç", "ʝ", "x", "ɣ", "χ", "ʁ", "ħ", "ʕ", "h", "ɦ",
  "ɬ", "ɮ", "ʋ", "ɹ", "ɻ", "j", "ɰ", "l", "ɭ", "ʎ", "ʍ", "w", "ɥ", "ɕ", "ʑ", "ɺ",
  "ts", "dz", "tʃ", "dʒ", "tɕ", "dʑ",
  "i", "y", "ɨ", "ʉ", "ɯ", "u", "ɪ", "ʏ", "ʊ", "e", "ø", "ɘ", "ɵ", "ɤ", "o", "ə", "ɛ", "œ", "ɜ", "ɞ", "ʌ", "ɔ", "æ", "ɐ", "a", "ɶ", "ɑ", "ɒ",
];

const VOWELS = new Set<OculusViseme>(["aa", "E", "I", "O", "U", "RR"]);

describe("ipa table", () => {
  it("gives every sound bellows emits a viseme other than sil, except its pause", () => {
    for (const p of [...BELLOWS, ...BELLOWS_ALIASES]) {
      const v = phonemeToViseme(p);
      if (p === "_") expect(v).toBe("sil");
      else expect(v, p).not.toBe("sil");
    }
  });

  it("gives every common ipa symbol a viseme other than sil", () => {
    for (const p of COMMON) expect(phonemeToViseme(p), p).not.toBe("sil");
  });

  it("maps the bellows additions by place and lip shape", () => {
    const want: Record<string, OculusViseme> = {
      "ɫ": "nn", "ɾ": "DD", "ʔ": "kk", "ɜ": "E", "ʉ": "U", "ɨ": "I", "ɘ": "E", "ɵ": "O", y: "U", "ø": "O", "œ": "O", "ɯ": "I", "ɤ": "E", "ɒ": "O", "ɐ": "aa",
    };
    for (const [p, v] of Object.entries(want)) expect(phonemeToViseme(p), p).toBe(v);
  });

  it("maps every bellows vowel to a vowel shape", () => {
    for (const p of BELLOWS.slice(1, 15).concat(BELLOWS.slice(42))) expect(VOWELS.has(phonemeToViseme(p)), p).toBe(true);
  });

  it("strips stress, length, nasal, syllabic, aspiration and tie marks", () => {
    expect(phonemeToViseme("ˈɑː")).toBe("aa");
    expect(phonemeToViseme("ɛ̃")).toBe("E");
    expect(phonemeToViseme("n̩")).toBe("nn");
    expect(phonemeToViseme("tʰ")).toBe("DD");
    expect(phonemeToViseme("t͡ʃ")).toBe("CH");
    expect(phonemeToViseme("kʷ")).toBe("kk");
    expect(phonemeToViseme("aɪ")).toBe("aa");
  });

  it("keeps upper case ARPAbet and reads lower case y as the ipa vowel", () => {
    expect(phonemeToViseme("Y")).toBe("I");
    expect(phonemeToViseme("y")).toBe("U");
    expect(phonemeToViseme("th")).toBe("TH");
    expect(phonemeToViseme("ER0")).toBe("RR");
  });

  it("never closes the mouth inside a word of a bellows style span list", () => {
    // "little bottle" in General American, as bellows plans it: flaps and dark coda l.
    const spans = [
      ["l", 0, 0.06], ["ɪ", 0.06, 0.13], ["ɾ", 0.13, 0.16], ["ə", 0.16, 0.2], ["ɫ", 0.2, 0.3],
      ["b", 0.3, 0.36], ["ɑ", 0.36, 0.48], ["ɾ", 0.48, 0.51], ["ə", 0.51, 0.55], ["ɫ", 0.55, 0.68],
    ] as const;
    const tl = new VisemeTimeline();
    tl.push(spans.map(([phoneme, time, end]) => ({ type: "phoneme" as const, phoneme, time, end })));
    const out = new Float32Array(OCULUS_VISEMES.length);
    const sil = OCULUS_VISEMES.indexOf("sil");
    for (let t = 0.04; t < 0.64; t += 0.005) {
      const cover = tl.sample(t, out);
      expect(cover, `t ${t}`).toBeGreaterThanOrEqual(0.49);
      expect(out[sil], `t ${t}`).toBe(0);
    }
  });
});
