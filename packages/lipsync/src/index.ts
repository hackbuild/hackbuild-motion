// @hackbuild/lipsync: a viseme driver. Timed speech events (words,
// phonemes or visemes, as a TTS engine reports them) build a timeline that
// is sampled with coarticulation: neighbouring visemes overlap through
// raised cosine edges and share the mouth by dominance, so closures like
// p, b, m still close the lips between two open vowels. Without timings,
// the audio level drives the jaw through a fast attack, slow release
// follower, and band energies pick a rough vowel shape. Output goes to the
// 15 Oculus visemes, the five VRM vowels or ARKit blendshapes through the
// one table in @hackbuild/rig. No three.js, no Web Audio dependency: the
// caller passes levels or analyser bytes.
import {
  ARKIT_COMPOSITES,
  OCULUS_VISEMES,
  type OculusViseme,
  VISEME_ARKIT,
  VISEME_TO_VOWELS,
  VOWEL_TO_VISEME,
  VRM_VOWELS,
  type VrmVowel,
  oculusMorph,
} from "@hackbuild/rig/expressions";

export { OCULUS_VISEMES, VRM_VOWELS };
export type { OculusViseme, VrmVowel };

// ---------------------------------------------------------------- events

/**
 * Speech events on the caller's clock in seconds (an AudioContext time,
 * or seconds since the utterance started). `end` is optional; a word
 * without one lasts until the next word or an estimate from its letters.
 */
export type SpeechEvent =
  | { type: "word"; time: number; end?: number; text: string }
  | { type: "phoneme"; time: number; end?: number; phoneme: string }
  | { type: "viseme"; time: number; end?: number; viseme: OculusViseme }
  | { type: "end"; time: number };

const ARPABET: Record<string, OculusViseme> = {
  AA: "aa", AE: "aa", AH: "aa", AO: "O", AW: "aa", AY: "aa", EH: "E", ER: "RR", EY: "E", IH: "I", IY: "I", OW: "O", OY: "O", UH: "U", UW: "U",
  B: "PP", P: "PP", M: "PP", F: "FF", V: "FF", TH: "TH", DH: "TH", T: "DD", D: "DD", K: "kk", G: "kk", NG: "kk", HH: "kk",
  CH: "CH", JH: "CH", SH: "CH", ZH: "CH", S: "SS", Z: "SS", N: "nn", L: "nn", R: "RR", W: "U", Y: "I",
};

/**
 * IPA symbols to visemes. Covers every sound bellows-voice emits (its
 * VOCAL_PHONEMES list and aliases, including the dark coda l, the flap and
 * the glottal stop) and the common IPA consonant and vowel charts, so no
 * sound inside a word falls through to sil. Choices by place of
 * articulation and lip shape (inferred): rounded vowels to O or U by
 * height, spread and central vowels to I, E or aa, laryngeal sounds to the
 * neutral kk that yields to the vowels around it.
 */
const IPA: Record<string, OculusViseme> = {
  // vowels
  "ɑ": "aa", a: "aa", "æ": "aa", "ʌ": "aa", "ə": "aa", "ɐ": "aa", "ɶ": "aa", "ä": "aa",
  "ɛ": "E", e: "E", "ɜ": "E", "ɘ": "E", "ɤ": "E", "ɞ": "O",
  "ɝ": "RR", "ɚ": "RR",
  i: "I", "ɪ": "I", "ɨ": "I", "ɯ": "I",
  o: "O", "ɔ": "O", "ɒ": "O", "ɵ": "O", "ø": "O", "œ": "O",
  u: "U", "ʊ": "U", y: "U", "ʏ": "U", "ʉ": "U",
  // lips
  p: "PP", b: "PP", m: "PP", "ɸ": "PP", "β": "PP", "ʙ": "PP",
  f: "FF", v: "FF", "ʋ": "FF", "ɱ": "FF",
  // teeth and ridge
  "θ": "TH", "ð": "TH",
  t: "DD", d: "DD", "ɾ": "DD", "ʈ": "DD", "ɖ": "DD", "ɽ": "DD", "ɗ": "DD",
  n: "nn", l: "nn", "ɫ": "nn", "ɬ": "nn", "ɮ": "nn", "ɭ": "nn", "ɳ": "nn", "ɲ": "nn", "ʎ": "nn", "ɺ": "nn",
  s: "SS", z: "SS", ts: "SS", dz: "SS", "ʦ": "SS", "ʣ": "SS",
  "ʃ": "CH", "ʒ": "CH", "tʃ": "CH", "dʒ": "CH", "ʧ": "CH", "ʤ": "CH", "ʂ": "CH", "ʐ": "CH", "ɕ": "CH", "ʑ": "CH", "tɕ": "CH", "dʑ": "CH",
  "ɹ": "RR", r: "RR", "ɻ": "RR", "ʀ": "RR",
  // back of the mouth and throat
  k: "kk", g: "kk", "ɡ": "kk", "ŋ": "kk", c: "kk", "ɟ": "kk", q: "kk", "ɢ": "kk", "ɴ": "kk", x: "kk", "ɣ": "kk", "χ": "kk", "ʁ": "kk", "ç": "kk", "ʝ": "kk", "ɰ": "kk",
  h: "kk", "ɦ": "kk", "ʔ": "kk", "ħ": "kk", "ʕ": "kk", "ʜ": "kk", "ʢ": "kk", "ʡ": "kk",
  // glides
  w: "U", "ʍ": "U", "ɥ": "U", j: "I",
};

/** Marks that change nothing visible: stress, length, nasal, syllabic, aspiration, release and tie bars. */
const IPA_MARKS = /[ˈˌːˑ\u0303\u0329\u032F\u0325\u032C\u032A\u031A\u0361\u035Cʰʷʲˠˤʼˀ.\u0334]/gu;

/**
 * ARPAbet (stress digits allowed), IPA, or an Oculus viseme name, to a
 * viseme. Upper case ARPAbet wins, then an exact IPA symbol (so IPA y is
 * the rounded vowel), then lower case ARPAbet, then the first IPA letter.
 * Unknown gives sil.
 */
export function phonemeToViseme(p: string): OculusViseme {
  const s = p.trim();
  if ((OCULUS_VISEMES as readonly string[]).includes(s)) return s as OculusViseme;
  const bare = s.replace(/\d$/, "");
  if (bare === bare.toUpperCase() && ARPABET[bare]) return ARPABET[bare];
  const ipa = s.normalize("NFD").replace(IPA_MARKS, "").normalize("NFC");
  return IPA[ipa] ?? ARPABET[bare.toUpperCase()] ?? IPA[[...ipa][0] ?? ""] ?? "sil";
}

const VOWEL_V = new Set<OculusViseme>(["aa", "E", "I", "O", "U"]);

/**
 * Letters to visemes with relative lengths, for engines that give word
 * timings only. English spelling rules, rough on purpose: digraphs first,
 * a silent final e dropped, doubled letters merged. Vowels weigh 2,
 * consonants 1.
 */
export function wordToVisemes(word: string): { viseme: OculusViseme; weight: number }[] {
  let w = word.toLowerCase().replace(/[^a-z']/g, "").replace(/'/g, "");
  if (w.length > 2 && w.endsWith("e") && !/[aeiouy]e$/.test(w) && /[aeiouy]/.test(w.slice(0, -1))) w = w.slice(0, -1);
  const out: { viseme: OculusViseme; weight: number }[] = [];
  const push = (v: OculusViseme) => {
    const last = out[out.length - 1];
    if (last && last.viseme === v) return;
    out.push({ viseme: v, weight: VOWEL_V.has(v) ? 2 : 1 });
  };
  const DI: Record<string, OculusViseme> = { th: "TH", ch: "CH", sh: "CH", ph: "FF", ng: "kk", ck: "kk", qu: "kk", oo: "U", ee: "I", ea: "I", ou: "U", ow: "O", oa: "O", ai: "E", ay: "E", wh: "U" };
  const ONE: Record<string, OculusViseme> = {
    a: "aa", e: "E", i: "I", o: "O", u: "U", y: "I", w: "U",
    p: "PP", b: "PP", m: "PP", f: "FF", v: "FF", t: "DD", d: "DD", k: "kk", g: "kk", c: "kk", q: "kk", x: "kk", h: "kk",
    j: "CH", s: "SS", z: "SS", n: "nn", l: "nn", r: "RR",
  };
  for (let i = 0; i < w.length; ) {
    const two = DI[w.slice(i, i + 2)];
    if (two) {
      push(two);
      i += 2;
      continue;
    }
    const one = ONE[w[i]!];
    if (one) push(one);
    i++;
  }
  return out;
}

/** Vowel groups in a word, at least 1; used to estimate durations. */
export const syllables = (word: string): number => Math.max(1, (word.toLowerCase().replace(/e$/, "").match(/[aeiouy]+/g) ?? []).length);

/**
 * Word events spread over an utterance from `start` to `end` by syllable
 * count, for engines that report only the utterance bounds.
 */
export function estimateWords(text: string, start: number, end: number): SpeechEvent[] {
  const words = text.split(/\s+/).filter((x) => /[a-z]/i.test(x));
  const total = words.reduce((s, x) => s + syllables(x) + 0.5, 0);
  let t = start;
  return words.map((text) => {
    const d = ((syllables(text) + 0.5) / total) * (end - start);
    const e: SpeechEvent = { type: "word", time: t, end: t + d * 0.9, text };
    t += d;
    return e;
  });
}

// ---------------------------------------------------------------- timeline

export interface VisemeKey {
  viseme: OculusViseme;
  start: number;
  end: number;
}

/**
 * Dominance per viseme: how strongly a segment holds the mouth against its
 * neighbours (after the Cohen and Massaro coarticulation model, values
 * chosen for this library by eye, inferred). Lip closures and lip to teeth
 * contacts dominate; tongue consonants yield to the vowels around them.
 */
export const DOMINANCE: Record<OculusViseme, number> = {
  sil: 0.6, PP: 3, FF: 2.2, TH: 1, DD: 0.6, kk: 0.5, CH: 1.4, SS: 0.9, nn: 0.6, RR: 1, aa: 1, E: 1, I: 1, O: 1.3, U: 1.5,
};

const SECONDS_PER_WEIGHT = 0.065;

function raised(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return 0.5 - 0.5 * Math.cos(Math.PI * x);
}

export class VisemeTimeline {
  keys: VisemeKey[] = [];
  /** Keys of the last word that came without an end, open to rescaling. */
  private open: { start: number; keys: VisemeKey[] } | null = null;

  /**
   * Adds events. A word without `end` gets its length from its letters at
   * once, so the mouth moves in real time; when the next event comes before
   * that estimate runs out, the word's visemes are squeezed to end there.
   */
  push(events: SpeechEvent | readonly SpeechEvent[]): void {
    const list = Array.isArray(events) ? events : [events as SpeechEvent];
    for (const e of [...list].sort((a, b) => a.time - b.time)) {
      if (this.open) {
        const w = this.open;
        const end = w.keys[w.keys.length - 1]?.end ?? w.start;
        if (e.time < end && e.time > w.start) {
          const k = (e.time - w.start) / (end - w.start);
          for (const key of w.keys) {
            key.start = w.start + (key.start - w.start) * k;
            key.end = w.start + (key.end - w.start) * k;
          }
        }
        this.open = null;
      }
      if (e.type === "word") {
        if (e.end !== undefined) this.addWord(e.text, e.time, e.end);
        else {
          const guess = wordToVisemes(e.text).reduce((s, x) => s + x.weight, 0) * SECONDS_PER_WEIGHT;
          this.open = { start: e.time, keys: this.addWord(e.text, e.time, e.time + Math.max(0.08, guess)) };
        }
      } else if (e.type === "phoneme") {
        this.add(phonemeToViseme(e.phoneme), e.time, e.end ?? e.time + 0.08);
      } else if (e.type === "viseme") {
        this.add(e.viseme, e.time, e.end ?? e.time + 0.08);
      } else if (e.type === "end") {
        for (const k of this.keys) {
          if (k.start >= e.time) k.end = k.start;
          else if (k.end > e.time) k.end = e.time;
        }
        this.keys = this.keys.filter((k) => k.end > k.start);
      }
    }
    this.keys.sort((a, b) => a.start - b.start);
  }

  private add(viseme: OculusViseme, start: number, end: number): VisemeKey | null {
    if (!(end > start)) return null;
    const k = { viseme, start, end };
    this.keys.push(k);
    return k;
  }

  private addWord(text: string, start: number, end: number): VisemeKey[] {
    const vs = wordToVisemes(text);
    const total = vs.reduce((s, x) => s + x.weight, 0);
    const out: VisemeKey[] = [];
    if (!total) return out;
    let t = start;
    for (const v of vs) {
      const d = ((end - start) * v.weight) / total;
      const k = this.add(v.viseme, t, t + d);
      if (k) out.push(k);
      t += d;
    }
    return out;
  }

  /** Drops keys that ended before `t`. */
  prune(t: number, keep = 0.5): void {
    let k = 0;
    while (k < this.keys.length && this.keys[k]!.end < t - keep) k++;
    if (k) this.keys.splice(0, k);
  }

  clear(): void {
    this.keys = [];
    this.open = null;
  }

  /** Last end time, or -Infinity. */
  get until(): number {
    return this.keys.reduce((m, k) => Math.max(m, k.end), -Infinity);
  }

  /**
   * Viseme weights at `t` into `out` (indexed like OCULUS_VISEMES). Each
   * key rises and falls over `blend` seconds centred on its edges; weights
   * share by dominance and never sum past 1. Returns the coverage, the
   * largest envelope at `t` (0 between utterances).
   */
  sample(t: number, out: Float32Array, blend = 0.07): number {
    out.fill(0);
    const h = blend / 2;
    let dom = 0;
    let cover = 0;
    for (const k of this.keys) {
      if (k.start - h > t) break;
      if (k.end + h < t) continue;
      const len = k.end - k.start;
      const edge = Math.min(h, len / 2 + 1e-6);
      const env = Math.min(raised((t - (k.start - edge)) / (2 * edge)), raised((k.end + edge - t) / (2 * edge)));
      if (env <= 0) continue;
      const d = env * DOMINANCE[k.viseme];
      out[OCULUS_VISEMES.indexOf(k.viseme)]! += d;
      dom += d;
      cover = Math.max(cover, env);
    }
    if (dom > 0) for (let i = 0; i < out.length; i++) out[i] = (out[i]! / dom) * Math.min(1, cover);
    return cover;
  }
}

// ---------------------------------------------------------------- audio level

/** RMS of time domain samples, as floats in -1 to 1 or analyser bytes centred on 128. */
export function rms(samples: Float32Array | Uint8Array): number {
  if (!samples.length) return 0;
  let s = 0;
  if (samples instanceof Uint8Array) for (const v of samples) s += ((v - 128) / 128) ** 2;
  else for (const v of samples) s += v * v;
  return Math.sqrt(s / samples.length);
}

export interface Bands {
  /** Energy near the first formant of open vowels, 250 to 900 Hz. */
  low: number;
  /** Second formant region, 900 to 2200 Hz. */
  mid: number;
  /** Front vowel and fricative region, 2200 to 4500 Hz. */
  high: number;
}

/**
 * Band energies from an analyser spectrum: `getFloatFrequencyData` in dB
 * or `getByteFrequencyData` bytes, with the context sample rate and the
 * FFT size.
 */
export function bandsFromSpectrum(spectrum: Float32Array | Uint8Array, sampleRate: number, fftSize: number): Bands {
  const hz = sampleRate / fftSize;
  const lin = (i: number) => (spectrum instanceof Uint8Array ? spectrum[i]! / 255 : 10 ** (spectrum[i]! / 20));
  const band = (a: number, b: number) => {
    let s = 0;
    const i0 = Math.max(0, Math.floor(a / hz));
    const i1 = Math.min(spectrum.length - 1, Math.ceil(b / hz));
    for (let i = i0; i <= i1; i++) s += lin(i) ** 2;
    return s / Math.max(1, i1 - i0 + 1);
  };
  return { low: band(250, 900), mid: band(900, 2200), high: band(2200, 4500) };
}

/**
 * A rough vowel shape from band energies (inferred from formant ranges):
 * strong high band means a front vowel (ee, ih), a low band with little
 * mid means a rounded vowel (oh, ou), otherwise an open aa.
 */
export function vowelFromBands(b: Bands): Record<VrmVowel, number> {
  const total = b.low + b.mid + b.high + 1e-12;
  const lo = b.low / total;
  const mi = b.mid / total;
  const hi = b.high / total;
  const out: Record<VrmVowel, number> = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
  const front = Math.max(0, hi - 0.2) / 0.8;
  const round = Math.max(0, lo - 0.55) / 0.45 * Math.max(0, 1 - mi * 2);
  out.ee = front * 0.7;
  out.ih = front * 0.3;
  out.oh = round * 0.6;
  out.ou = round * 0.4;
  out.aa = Math.max(0, 1 - front - round);
  return out;
}

/** Exponential smoothing toward a goal with separate rise and fall half-lives. */
export function follow(cur: number, goal: number, dt: number, rise: number, fall: number): number {
  const hl = goal > cur ? rise : fall;
  return goal + (cur - goal) * 2 ** (-dt / Math.max(1e-6, hl));
}

// ---------------------------------------------------------------- driver

export interface LipSyncOptions {
  /** Seconds the mouth leads the sound. Default 0.04 (inferred; visible speech leads audio). */
  lead?: number;
  /** Coarticulation overlap in seconds. Default 0.07. */
  blend?: number;
  /** Rise and fall half-lives of the output, seconds. Defaults 0.02 and 0.06. */
  rise?: number;
  fall?: number;
  /** Audio level below this is silence. Default 0.015. */
  gate?: number;
  /** Level to openness gain. Default 6. */
  gain?: number;
  /** Output scale, 0 to 1. Default 1. */
  strength?: number;
}

export type LipSource = "timeline" | "energy" | "silent";

export interface LipFrame {
  /** Indexed like OCULUS_VISEMES. */
  visemes: Float32Array;
  vowels: Record<VrmVowel, number>;
  /** Jaw openness, 0 to 1. */
  open: number;
  source: LipSource;
}

/** Oculus viseme weights to the five VRM vowels through the rig table. */
export function visemesToVowels(v: Float32Array): Record<VrmVowel, number> {
  const out: Record<VrmVowel, number> = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
  OCULUS_VISEMES.forEach((name, i) => {
    const w = v[i]!;
    if (!w) return;
    for (const [vowel, k] of Object.entries(VISEME_TO_VOWELS[name]) as [VrmVowel, number][]) out[vowel] += w * k;
  });
  for (const k of VRM_VOWELS) out[k] = Math.min(1, out[k]);
  return out;
}

const JAW: Record<VrmVowel, number> = { aa: 1, oh: 0.7, ee: 0.35, ih: 0.3, ou: 0.25 };

export class LipSync {
  readonly timeline = new VisemeTimeline();
  readonly opts: Required<LipSyncOptions>;
  private level = 0;
  private bands: Bands | null = null;
  private env = 0;
  private readonly raw = new Float32Array(OCULUS_VISEMES.length);
  private readonly frame: LipFrame = { visemes: new Float32Array(OCULUS_VISEMES.length), vowels: { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 }, open: 0, source: "silent" };

  constructor(opts: LipSyncOptions = {}) {
    this.opts = { lead: 0.04, blend: 0.07, rise: 0.02, fall: 0.06, gate: 0.015, gain: 6, strength: 1, ...opts };
  }

  push(events: SpeechEvent | readonly SpeechEvent[]): void {
    this.timeline.push(events);
  }

  /** Audio level (RMS 0 to 1) and optional band energies for this frame. */
  setLevel(level: number, bands?: Bands): void {
    this.level = Math.max(0, level);
    this.bands = bands ?? null;
  }

  /** Stops speech now: clears the timeline and the level. */
  stop(): void {
    this.timeline.clear();
    this.level = 0;
    this.bands = null;
  }

  /**
   * The mouth at time `t` on the event clock, smoothed over `dt`. Timed
   * events win while they cover `t`; the audio level fills gaps and runs
   * alone when no timings arrive.
   */
  update(t: number, dt: number): LipFrame {
    const o = this.opts;
    const cover = this.timeline.sample(t + o.lead, this.raw, o.blend);
    const f = this.frame;
    let goalV: Record<VrmVowel, number>;
    if (cover > 0.01) {
      f.source = "timeline";
      goalV = visemesToVowels(this.raw);
    } else if (this.level > o.gate) {
      f.source = "energy";
      this.raw.fill(0);
      const shape = this.bands ? vowelFromBands(this.bands) : { aa: 0.8, ih: 0, ou: 0, ee: 0, oh: 0.2 };
      const open = Math.min(1, (this.level - o.gate) * o.gain);
      goalV = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
      for (const k of VRM_VOWELS) goalV[k] = shape[k] * open;
      // the matching visemes, so Oculus targets move with the audio too
      for (const k of VRM_VOWELS) this.raw[OCULUS_VISEMES.indexOf(VOWEL_TO_VISEME[k])] = goalV[k];
    } else {
      f.source = "silent";
      this.raw.fill(0);
      goalV = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
    }
    const s = o.strength;
    for (let i = 0; i < this.raw.length; i++) f.visemes[i] = follow(f.visemes[i]!, this.raw[i]! * s, dt, o.rise, o.fall);
    let jaw = 0;
    for (const k of VRM_VOWELS) {
      f.vowels[k] = follow(f.vowels[k], goalV[k] * s, dt, o.rise, o.fall);
      jaw = Math.max(jaw, f.vowels[k] * JAW[k]);
    }
    this.env = follow(this.env, jaw, dt, o.rise, o.fall);
    f.open = Math.min(1, this.env);
    this.timeline.prune(t);
    return f;
  }
}

// ---------------------------------------------------------------- output

/** Anything with `setValue(name, weight)`: an avatar ExpressionRig or a three-vrm expression manager. */
export interface ExpressionSink {
  setValue(name: string, weight: number): void;
}

export type MouthTarget = "vrm" | "oculus" | "arkit";

/**
 * Writes a frame to a face: VRM vowel presets, `viseme_*` morphs (Ready
 * Player Me style), or ARKit blendshapes built from the vowel composites
 * plus `mouthClose` for lip closures.
 */
export function drive(sink: ExpressionSink, frame: LipFrame, target: MouthTarget = "vrm"): void {
  if (target === "vrm") {
    for (const k of VRM_VOWELS) sink.setValue(k, frame.vowels[k]);
  } else if (target === "oculus") {
    OCULUS_VISEMES.forEach((v, i) => sink.setValue(oculusMorph(v), frame.visemes[i]!));
  } else {
    const sum = new Map<string, number>();
    for (const k of VRM_VOWELS) for (const b of ARKIT_COMPOSITES[k]) sum.set(b.morph, (sum.get(b.morph) ?? 0) + b.weight * frame.vowels[k]);
    for (const [v, shapes] of Object.entries(VISEME_ARKIT) as [OculusViseme, readonly { shape: string; weight: number }[]][]) {
      const x = frame.visemes[OCULUS_VISEMES.indexOf(v)]!;
      for (const s of shapes) sum.set(s.shape, Math.max(sum.get(s.shape) ?? 0, x * s.weight));
    }
    for (const [m, w] of sum) sink.setValue(m, Math.min(1, w));
  }
}
