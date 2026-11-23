// Bellows adapter: timed phoneme spans from bellows-voice (the owner's
// articulatory voice for the bellowsjs engine, MIT) into lipsync events.
// `singer.speak()`, `sing()` and `beatbox()` return a plan whose spans are
// the exact sounds the engine plays, on the AudioContext clock; an offline
// render returns the same spans from 0. The span shape is copied here
// structurally, so this file imports nothing from bellows and the package
// runs without it installed. The span shape was read from bellows-voice
// 0.7.3 and is unchanged in 0.8.0, the npm release the optional peer
// dependency pins, on bellowsjs 0.5.0.
import type { OculusViseme } from "@hackbuild/rig/expressions";
import type { SpeechEvent } from "./index.js";

/** The bellows-voice npm release the optional peer pins; the commit is its gitHead. */
export const BELLOWS_VOICE_VERSION = "0.8.0";
export const BELLOWS_VOICE_COMMIT = "ac30dc229f492ecb6bd80b2ea0f71c6a370b368c";
/** The bellowsjs version bellows-voice 0.8.0 runs on. */
export const BELLOWSJS_VERSION = "0.5.0";

/** One timed sound, as bellows-voice's `SungSpan`: a single IPA phoneme or a `beat:` id, seconds. */
export interface BellowsSpan {
  ipa: string;
  start: number;
  end: number;
  kind?: string;
}

/** A breath group, as bellows-voice's `SungPhrase` (only the spans are read). */
export interface BellowsPhrase {
  spans: readonly BellowsSpan[];
}

/** A plan, as bellows-voice's `SungPlan` or `SingResult`. */
export interface BellowsPlan {
  phrases: readonly BellowsPhrase[];
}

/** The prefix bellows-voice puts on a beatbox span's id. */
export const BEAT_PREFIX = "beat:";

/**
 * Beatbox sounds (bellows-voice `VOCAL_BEATS` ids) to the viseme their
 * mouth makes, chosen from each sound's place (inferred). `>` marks an
 * accented beat and is ignored.
 */
export const BEAT_VISEMES: Record<string, OculusViseme> = {
  ".": "sil",
  B: "PP",
  t: "DD",
  tss: "SS",
  Pf: "FF",
  K: "kk",
  "^K": "kk",
  "!": "DD",
  "P!": "PP",
  kch: "kk",
  m: "PP",
  ch: "CH",
  Psh: "PP",
  in: "kk",
};

/**
 * Spans to lipsync events, shifted by `offset` seconds (0 for a live
 * plan already on the AudioContext clock, the play time for an offline
 * render). Bellows' pause `_` makes no event, so the mouth rests in the
 * gap; a beat span becomes the viseme of its sound.
 */
export function fromSpans(spans: readonly BellowsSpan[], offset = 0): SpeechEvent[] {
  const out: SpeechEvent[] = [];
  for (const s of spans) {
    if (!(s.end > s.start) || s.ipa === "_") continue;
    const time = s.start + offset;
    const end = s.end + offset;
    if (s.ipa.startsWith(BEAT_PREFIX)) {
      const id = s.ipa.slice(BEAT_PREFIX.length).replace(/>$/, "");
      const viseme = BEAT_VISEMES[id] ?? BEAT_VISEMES[id.toLowerCase()];
      if (viseme && viseme !== "sil") out.push({ type: "viseme", time, end, viseme });
      continue;
    }
    out.push({ type: "phoneme", time, end, phoneme: s.ipa });
  }
  return out;
}

/** Every span of every phrase of a plan, as `fromSpans`. */
export function fromSungPlan(plan: BellowsPlan, offset = 0): SpeechEvent[] {
  return plan.phrases.flatMap((p) => fromSpans(p.spans, offset));
}
