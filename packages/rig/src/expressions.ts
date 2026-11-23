// One expression and viseme table for the family: VRM 1.0 presets, ARKit 52
// blendshapes and the 15 Oculus visemes, with the morph name aliases that
// resolve them on VRChat, MMD, Ready Player Me style and plain models.
// avatar, lipsync and the action grammar read this table and no other.
// Plain data in TypeScript: every reader is TypeScript and should not wait
// for wasm to read a table.

export const VRM_EXPRESSIONS = [
  "happy", "angry", "sad", "relaxed", "surprised",
  "aa", "ih", "ou", "ee", "oh",
  "blink", "blinkLeft", "blinkRight",
  "lookUp", "lookDown", "lookLeft", "lookRight",
  "neutral",
] as const;
export type VrmExpression = (typeof VRM_EXPRESSIONS)[number];

export const VRM_VOWELS = ["aa", "ih", "ou", "ee", "oh"] as const;
export type VrmVowel = (typeof VRM_VOWELS)[number];

export const ARKIT_52 = [
  "eyeBlinkLeft", "eyeLookDownLeft", "eyeLookInLeft", "eyeLookOutLeft", "eyeLookUpLeft", "eyeSquintLeft", "eyeWideLeft",
  "eyeBlinkRight", "eyeLookDownRight", "eyeLookInRight", "eyeLookOutRight", "eyeLookUpRight", "eyeSquintRight", "eyeWideRight",
  "jawForward", "jawLeft", "jawRight", "jawOpen",
  "mouthClose", "mouthFunnel", "mouthPucker", "mouthLeft", "mouthRight",
  "mouthSmileLeft", "mouthSmileRight", "mouthFrownLeft", "mouthFrownRight", "mouthDimpleLeft", "mouthDimpleRight",
  "mouthStretchLeft", "mouthStretchRight", "mouthRollLower", "mouthRollUpper", "mouthShrugLower", "mouthShrugUpper",
  "mouthPressLeft", "mouthPressRight", "mouthLowerDownLeft", "mouthLowerDownRight", "mouthUpperUpLeft", "mouthUpperUpRight",
  "browDownLeft", "browDownRight", "browInnerUp", "browOuterUpLeft", "browOuterUpRight",
  "cheekPuff", "cheekSquintLeft", "cheekSquintRight", "noseSneerLeft", "noseSneerRight", "tongueOut",
] as const;
export type ArkitShape = (typeof ARKIT_52)[number];

export const OCULUS_VISEMES = ["sil", "PP", "FF", "TH", "DD", "kk", "CH", "SS", "nn", "RR", "aa", "E", "I", "O", "U"] as const;
export type OculusViseme = (typeof OCULUS_VISEMES)[number];

/** Morph name used for an Oculus viseme on Ready Player Me style models. */
export const oculusMorph = (v: OculusViseme): string => `viseme_${v}`;

export interface MorphWeight {
  morph: string;
  weight: number;
}

/**
 * Single morph names that stand for a preset, first match wins. Matching
 * ignores case and every character that is not a letter, digit or CJK.
 * "frown" belongs to sad only, so angry and sad never claim one morph.
 */
export const PRESET_ALIASES: Record<VrmExpression, readonly string[]> = {
  happy: ["happy", "joy", "fun", "smile", "vrc.smile", "笑い", "にっこり", "喜び"],
  angry: ["angry", "anger", "mad", "怒り"],
  sad: ["sad", "sorrow", "frown", "困る", "悲しい"],
  relaxed: ["relaxed", "relax", "calm", "なごみ"],
  surprised: ["surprised", "surprise", "shock", "びっくり", "驚き"],
  aa: ["aa", "a", "vrc.v_aa", "viseme_aa", "あ"],
  ih: ["ih", "i", "vrc.v_ih", "viseme_i", "い"],
  ou: ["ou", "u", "vrc.v_ou", "viseme_u", "う"],
  ee: ["ee", "e", "vrc.v_e", "viseme_e", "え"],
  oh: ["oh", "o", "vrc.v_oh", "viseme_o", "お"],
  blink: ["blink", "blinkboth", "vrc.blink", "eyesclosed", "まばたき"],
  blinkLeft: ["blinkleft", "blink_l", "vrc.blink_left", "winkleft", "ウィンク"],
  blinkRight: ["blinkright", "blink_r", "vrc.blink_right", "winkright", "ウィンク右"],
  lookUp: ["lookup"],
  lookDown: ["lookdown"],
  lookLeft: ["lookleft"],
  lookRight: ["lookright"],
  neutral: ["neutral"],
};

const w = (morph: string, weight: number): MorphWeight => ({ morph, weight });

/** Presets built from ARKit blendshapes when no single morph matches. */
export const ARKIT_COMPOSITES: Record<VrmExpression, readonly MorphWeight[]> = {
  happy: [w("mouthSmileLeft", 0.8), w("mouthSmileRight", 0.8), w("cheekSquintLeft", 0.35), w("cheekSquintRight", 0.35), w("eyeSquintLeft", 0.2), w("eyeSquintRight", 0.2)],
  angry: [w("browDownLeft", 0.9), w("browDownRight", 0.9), w("noseSneerLeft", 0.4), w("noseSneerRight", 0.4), w("mouthPressLeft", 0.4), w("mouthPressRight", 0.4)],
  sad: [w("browInnerUp", 0.8), w("mouthFrownLeft", 0.7), w("mouthFrownRight", 0.7), w("mouthShrugLower", 0.3)],
  relaxed: [w("mouthSmileLeft", 0.35), w("mouthSmileRight", 0.35), w("eyeSquintLeft", 0.15), w("eyeSquintRight", 0.15)],
  surprised: [w("browInnerUp", 0.8), w("browOuterUpLeft", 0.8), w("browOuterUpRight", 0.8), w("eyeWideLeft", 0.7), w("eyeWideRight", 0.7), w("jawOpen", 0.3)],
  aa: [w("jawOpen", 0.7), w("mouthLowerDownLeft", 0.2), w("mouthLowerDownRight", 0.2)],
  ih: [w("jawOpen", 0.25), w("mouthSmileLeft", 0.25), w("mouthSmileRight", 0.25), w("mouthStretchLeft", 0.2), w("mouthStretchRight", 0.2)],
  ou: [w("mouthPucker", 0.85), w("jawOpen", 0.15)],
  ee: [w("mouthStretchLeft", 0.55), w("mouthStretchRight", 0.55), w("jawOpen", 0.2)],
  oh: [w("mouthFunnel", 0.7), w("jawOpen", 0.45)],
  blink: [w("eyeBlinkLeft", 1), w("eyeBlinkRight", 1)],
  blinkLeft: [w("eyeBlinkLeft", 1)],
  blinkRight: [w("eyeBlinkRight", 1)],
  lookUp: [w("eyeLookUpLeft", 1), w("eyeLookUpRight", 1)],
  lookDown: [w("eyeLookDownLeft", 1), w("eyeLookDownRight", 1)],
  lookLeft: [w("eyeLookOutLeft", 1), w("eyeLookInRight", 1)],
  lookRight: [w("eyeLookInLeft", 1), w("eyeLookOutRight", 1)],
  neutral: [],
};

/** Presets built from Oculus viseme morphs when nothing else matches. */
export const OCULUS_COMPOSITES: Partial<Record<VrmExpression, readonly MorphWeight[]>> = {
  aa: [w("viseme_aa", 1)],
  ih: [w("viseme_I", 1)],
  ou: [w("viseme_U", 1)],
  ee: [w("viseme_E", 1)],
  oh: [w("viseme_O", 1)],
};

/**
 * Oculus visemes as weights on the five VRM vowels, for driving a VRM from
 * a viseme stream. Consonants map to a partly open mouth shape; silence and
 * the closed lips of PP to nothing. Weights chosen for this library by eye,
 * not measured.
 */
export const VISEME_TO_VOWELS: Record<OculusViseme, Partial<Record<VrmVowel, number>>> = {
  sil: {},
  PP: {},
  FF: { ih: 0.2 },
  TH: { ih: 0.3, aa: 0.1 },
  DD: { ih: 0.35, aa: 0.15 },
  kk: { aa: 0.4, ih: 0.1 },
  CH: { ih: 0.45, ou: 0.2 },
  SS: { ih: 0.5 },
  nn: { ih: 0.25, aa: 0.1 },
  RR: { ou: 0.4, oh: 0.1 },
  aa: { aa: 1 },
  E: { ee: 1 },
  I: { ih: 1 },
  O: { oh: 1 },
  U: { ou: 1 },
};

/** The Oculus viseme that stands for each VRM vowel. */
export const VOWEL_TO_VISEME: Record<VrmVowel, OculusViseme> = { aa: "aa", ih: "I", ou: "U", ee: "E", oh: "O" };

/**
 * ARKit shapes a lip consonant drives on top of the vowel composites, as
 * a share of its viseme weight: closed lips for PP, the lower lip rolled
 * in under the teeth for FF. Chosen by eye, not measured.
 */
export const VISEME_ARKIT: Partial<Record<OculusViseme, readonly { shape: ArkitShape; weight: number }[]>> = {
  PP: [{ shape: "mouthClose", weight: 1 }],
  FF: [{ shape: "mouthRollLower", weight: 0.6 }],
};

/** Presets whose source smile already closes the eyes, so blink should blend down. */
export const OVERRIDE_BLINK: readonly VrmExpression[] = ["happy", "relaxed"];

const norm = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

export interface ResolvedExpression {
  /** Morphs and weights that make the preset, by morph name as found. */
  binds: MorphWeight[];
  /** Where the binding came from. */
  source: "preset" | "alias" | "arkit" | "oculus";
}

/**
 * Resolves every VRM preset against a model's morph names. A morph name
 * found on several meshes binds on all of them; the caller applies each
 * bind to every mesh that carries that name.
 */
export function resolveExpressions(morphNames: Iterable<string>): Partial<Record<VrmExpression, ResolvedExpression>> {
  const byNorm = new Map<string, string>();
  const exact = new Set<string>();
  for (const m of morphNames) {
    exact.add(m);
    const k = norm(m);
    if (!byNorm.has(k)) byNorm.set(k, m);
  }
  const out: Partial<Record<VrmExpression, ResolvedExpression>> = {};
  const claimed = new Set<string>();
  for (const preset of VRM_EXPRESSIONS) {
    const direct = byNorm.get(norm(preset));
    if (direct && !claimed.has(direct)) {
      out[preset] = { binds: [{ morph: direct, weight: 1 }], source: "preset" };
      claimed.add(direct);
      continue;
    }
    const alias = PRESET_ALIASES[preset].map((a) => byNorm.get(norm(a))).find((m) => m && !claimed.has(m));
    if (alias) {
      out[preset] = { binds: [{ morph: alias, weight: 1 }], source: "alias" };
      claimed.add(alias);
      continue;
    }
    const ark = ARKIT_COMPOSITES[preset];
    if (ark.length && ark.every((b) => exact.has(b.morph) || byNorm.has(norm(b.morph)))) {
      out[preset] = { binds: ark.map((b) => ({ morph: exact.has(b.morph) ? b.morph : byNorm.get(norm(b.morph))!, weight: b.weight })), source: "arkit" };
      continue;
    }
    const ocu = OCULUS_COMPOSITES[preset];
    if (ocu && ocu.every((b) => byNorm.has(norm(b.morph)))) {
      out[preset] = { binds: ocu.map((b) => ({ morph: byNorm.get(norm(b.morph))!, weight: b.weight })), source: "oculus" };
    }
  }
  return out;
}
