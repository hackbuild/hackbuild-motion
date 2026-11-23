// Articulatory source: a mouth from vocal tract state (jaw, lips, tongue,
// velum) in place of a viseme lookup. Written against a small structural
// frame, `ArticulatorFrame`, whose field names and units are those of the
// articulator probe frame in bellows-voice (the owner's articulatory voice,
// MIT): centimetres in the adult male head frame, x forward and y up from
// the glottis, the velum port in cm^2. A frame from the engine's
// `articulatorProbe` (bellows-voice 0.8.0 on npm) or from its
// offline `renderSpeech` track passes straight in; `fromProbe` reads a
// live probe at the heard time, and `fromTractModel` reads the main thread
// `TractModel`, which follows the plan rather than the audio.
//
// Channels and thresholds map each articulator to the mouth shape it
// makes (jaw to open, lip aperture to closure, and so on), tuned against bellows-voice's own targets for body 0 and a
// rendered engine track (the test fixtures). Every constant is inferred:
// nobody has tuned them by eye on a face yet.
import { OCULUS_VISEMES, type OculusViseme, VRM_VOWELS, type VrmVowel } from "@hackbuild/rig/expressions";
import type { LipFrame } from "./index.js";

/** Vocal tract state at one instant, in the units of bellows-voice's articulator probe. */
export interface ArticulatorFrame {
  /** Jaw opening, cm of arc at the incisors (about -0.1 closed to 2.6 wide). */
  jaw: number;
  /** Lip opening, cm; under 0 is pressed shut. */
  lipAperture: number;
  /** Lip rounding forward, cm (0 spread to about 1.4 for u). */
  lipProtrusion: number;
  /** Lip corners, 0 rounded to 1 spread. */
  lipWidth: number;
  /** Lower lip against the upper teeth, 0 to 1. */
  labiodental: number;
  /** Tongue body centre, cm. */
  tongueBodyX: number;
  tongueBodyY: number;
  /** Tongue tip, cm. */
  tongueTipX: number;
  tongueTipY: number;
  /** Velar port, cm^2; under 0 is closed. */
  velum: number;
  /** True or 1 while the voice sounds, false or 0 when it holds its last state. Absent means sounding. */
  sounding?: number | boolean;
}

/** The mouth channels the report maps from articulators, each 0 to 1. */
export interface MouthChannels {
  open: number;
  closure: number;
  round: number;
  spread: number;
  labiodental: number;
  dental: number;
  alveolar: number;
  postalveolar: number;
  sibilant: number;
  retroflex: number;
  velar: number;
  nasal: number;
}

const clamp01 = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x);
const bump = (x: number, c: number, w: number): number => clamp01(1 - Math.abs(x - c) / w);

/**
 * Channels from a frame. Constants from bellows-voice's body 0 targets and
 * a rendered engine track (inferred thresholds between them): jaw 0.2 at
 * u to 1.85 at the open o; lips shut at an aperture of -0.2 and open from
 * 0.1; the tip reaches the ridge at 9.55 cm in the engine (target 9.68),
 * forward of 5.9 for t, d, n and l, at 5.55 to 5.85 for sh and ch, back of
 * 5.95 and lower for r; s at 9.1 forward of 6; th forward of 6.55 at 8.2;
 * the dorsum seals the velum at 8.35.
 */
export function mouthChannels(f: ArticulatorFrame, out?: MouthChannels): MouthChannels {
  const c = out ?? ({} as MouthChannels);
  const ld = clamp01(f.labiodental);
  const x = f.tongueTipX;
  const y = f.tongueTipY;
  c.open = clamp01((f.jaw - 0.2) / 1.65);
  c.closure = clamp01((0.1 - f.lipAperture) / 0.3) * (1 - ld);
  c.round = clamp01(f.lipProtrusion / 1.4);
  c.spread = clamp01(f.lipWidth) * (1 - clamp01(f.lipProtrusion / 0.6));
  c.labiodental = ld;
  c.nasal = clamp01(f.velum / 0.3);
  const ridge = clamp01((y - 9.35) / 0.15);
  c.alveolar = ridge * clamp01((x - 5.9) / 0.1);
  c.postalveolar = ridge * clamp01((x - 5.45) / 0.1) * clamp01((5.95 - x) / 0.1);
  c.sibilant = bump(y, 9.1, 0.2) * clamp01((x - 6.0) / 0.15);
  c.dental = bump(y, 8.2, 0.5) * clamp01((x - 6.55) / 0.2);
  c.retroflex = clamp01((5.95 - x) / 0.2) * bump(y, 9.15, 0.5) * (1 - c.postalveolar);
  c.velar = clamp01((f.tongueBodyY - 7.95) / 0.35);
  return c;
}

/**
 * The five VRM vowel presets as points in (open, round, spread), taken
 * from bellows-voice's own targets: aa the open back vowel, ee the mean of
 * e and the open-mid front vowel, ih the close front vowel, oh o, ou u.
 */
export const VOWEL_POINTS: Record<VrmVowel, readonly [open: number, round: number, spread: number]> = {
  aa: [0.9, 0, 1],
  ee: [0.44, 0, 1],
  ih: [0.13, 0, 1],
  oh: [0.28, 0.43, 0],
  ou: [0, 1, 0],
};

/** Weights of the five vowels for a channel set: a softmax of negative squared distance, summing to 1. */
export function vowelWeights(c: MouthChannels, out?: Record<VrmVowel, number>, width = 0.22): Record<VrmVowel, number> {
  const o = out ?? { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
  let sum = 0;
  for (const k of VRM_VOWELS) {
    const p = VOWEL_POINTS[k];
    const d = (c.open - p[0]) ** 2 + 1.5 * (c.round - p[1]) ** 2 + 0.5 * (c.spread - p[2]) ** 2;
    o[k] = Math.exp(-d / (width * width));
    sum += o[k];
  }
  for (const k of VRM_VOWELS) o[k] /= sum;
  return o;
}

const at = (v: OculusViseme): number => OCULUS_VISEMES.indexOf(v);
const VOWEL_VISEME: Record<VrmVowel, OculusViseme> = { aa: "aa", ee: "E", ih: "I", oh: "O", ou: "U" };

/**
 * A LipFrame from articulator state, with `source` "timeline" while
 * sounding. Consonant visemes come from the channels and share the mouth
 * by sum, capped at 1; the vowels fill what is left. VRM vowels are the
 * vowel weights scaled by the lips' opening, so a closure shuts them.
 */
export function articulatoryFrame(f: ArticulatorFrame, out?: LipFrame & { channels: MouthChannels }): LipFrame & { channels: MouthChannels } {
  const o = out ?? { visemes: new Float32Array(OCULUS_VISEMES.length), vowels: { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 }, open: 0, source: "silent", channels: {} as MouthChannels };
  const c = mouthChannels(f, o.channels);
  o.visemes.fill(0);
  if (f.sounding === 0 || f.sounding === false) {
    for (const k of VRM_VOWELS) o.vowels[k] = 0;
    o.open = 0;
    o.source = "silent";
    return o;
  }
  const v = o.visemes;
  v[at("PP")] = c.closure;
  v[at("FF")] = c.labiodental;
  v[at("TH")] = c.dental;
  v[at("DD")] = c.alveolar * (1 - c.nasal);
  v[at("nn")] = c.alveolar * c.nasal;
  v[at("SS")] = c.sibilant;
  v[at("CH")] = c.postalveolar;
  v[at("RR")] = c.retroflex;
  v[at("kk")] = c.velar;
  let cons = 0;
  for (let i = 0; i < v.length; i++) cons += v[i]!;
  if (cons > 1) for (let i = 0; i < v.length; i++) v[i] = v[i]! / cons;
  const left = Math.max(0, 1 - cons);
  const w = vowelWeights(c, o.vowels);
  for (const k of VRM_VOWELS) v[at(VOWEL_VISEME[k])] = w[k] * left;
  const lips = 1 - Math.max(c.closure, 0.5 * c.labiodental);
  for (const k of VRM_VOWELS) o.vowels[k] = w[k] * lips;
  o.open = c.open;
  o.source = "timeline";
  return o;
}

/**
 * ARKit blendshape weights straight from the channels, per the report's
 * table: jawOpen from the jaw, mouthClose from the lip closure, pucker
 * when rounded with a small aperture and funnel when rounded and open,
 * stretch and a little smile when spread, mouthRollLower for f and v,
 * tongueOut for th.
 */
export function arkitFromChannels(c: MouthChannels, out: Map<string, number> = new Map()): Map<string, number> {
  out.clear();
  const funnel = c.round * c.open;
  out.set("jawOpen", c.open);
  out.set("mouthClose", c.closure);
  out.set("mouthPucker", clamp01(c.round - funnel));
  out.set("mouthFunnel", clamp01(funnel * 1.5));
  out.set("mouthStretchLeft", c.spread * 0.5);
  out.set("mouthStretchRight", c.spread * 0.5);
  out.set("mouthSmileLeft", c.spread * 0.2);
  out.set("mouthSmileRight", c.spread * 0.2);
  out.set("mouthRollLower", c.labiodental * 0.7);
  out.set("tongueOut", c.dental * 0.5);
  return out;
}

/** The bellows-voice `TractModel` method this file reads. */
export interface TractModelLike {
  postureByName(): Record<string, number>;
}

/** An ArticulatorFrame from a bellows-voice `TractModel`'s current posture, read as the probe reads the engine. */
export function fromTractModel(m: TractModelLike, out?: ArticulatorFrame): ArticulatorFrame {
  const a = m.postureByName();
  const o = out ?? ({} as ArticulatorFrame);
  o.jaw = a.jaw ?? 0;
  o.lipAperture = a.lipAp ?? 0;
  o.lipProtrusion = a.lipProt ?? 0;
  o.lipWidth = a.lipWidth ?? 0;
  o.labiodental = a.labiodental ?? 0;
  o.tongueBodyX = a.tbX ?? 0;
  o.tongueBodyY = a.tbY ?? 0;
  o.tongueTipX = a.ttX ?? 0;
  o.tongueTipY = a.ttY ?? 0;
  o.velum = a.velum ?? 0;
  return o;
}

/** The parts of a bellows-voice `ArticulatorProbe` this file reads. */
export interface ArticulatorProbeLike {
  /** The frame playing out of the speakers now, null before the first. */
  heard(): ArticulatorFrame | null;
}

/**
 * A LipFrame from a live bellows-voice articulator probe at the time being
 * heard; a silent frame before the probe has sent anything.
 */
export function fromProbe(probe: ArticulatorProbeLike, out?: LipFrame & { channels: MouthChannels }): LipFrame & { channels: MouthChannels } {
  const f = probe.heard();
  return articulatoryFrame(f ?? SILENT, out);
}

const SILENT: ArticulatorFrame = { jaw: 0, lipAperture: 0, lipProtrusion: 0, lipWidth: 0, labiodental: 0, tongueBodyX: 0, tongueBodyY: 0, tongueTipX: 0, tongueTipY: 0, velum: 0, sounding: 0 };
