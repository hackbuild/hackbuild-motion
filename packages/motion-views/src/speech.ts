// What a stage is told to say, and the mouth events it becomes. Real speech
// arrives as audio (an AudioBuffer or an audio element) with the timings a
// speech engine reports: words and phonemes as @hackbuild/speak's Timed
// (t0 and t1 in seconds from the start of the audio, start and end as
// character offsets in the text), or lipsync events as the bellows adapter
// makes them. The audio level drives the mouth between timings; text alone
// falls back to estimated word timings.
import { type SpeechEvent, estimateWords } from "@hackbuild/lipsync";

/** A word or phoneme with its time from the start of the audio, as @hackbuild/speak reports it. */
export interface SpeechTiming {
  t0: number;
  t1: number;
  /** Character offsets in `text`, for a word. */
  start?: number;
  end?: number;
  /** The word, when the offsets are not given. */
  text?: string;
  /** A phoneme symbol (ARPAbet), for a phoneme timing. */
  phoneme?: string;
}

/** Something to say. Give audio for real speech; text alone is spoken on estimated timings with no sound. */
export interface Speech {
  text?: string;
  audio?: AudioBuffer | HTMLMediaElement;
  words?: readonly SpeechTiming[];
  phonemes?: readonly SpeechTiming[];
  /** Lipsync events timed from the start of the audio, as `fromSpans` of the bellows adapter makes them. */
  events?: readonly SpeechEvent[];
}

/** Where the mouth timings come from, for the readout and the tests. */
export type SpeechSource = "events" | "phonemes" | "words" | "estimate" | "audio level";

/** Seconds text takes on estimated timings: about 0.34 s a word (inferred), at least 0.8 s. */
export function estimateSeconds(text: string): number {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return Math.max(0.8, words * 0.34);
}

/**
 * The mouth events for a speech starting at `t0` on the mouth clock and
 * lasting `seconds`, closed by an end event, and where they came from.
 * Timings win in the order events, phonemes, words; text alone is
 * estimated only when there is no audio, since audio drives the mouth by
 * its level when no timings come with it.
 */
export function speechEvents(s: Speech, t0: number, seconds: number): { events: SpeechEvent[]; source: SpeechSource } {
  const end: SpeechEvent = { type: "end", time: t0 + seconds };
  const shift = (e: SpeechEvent): SpeechEvent => ({ ...e, time: e.time + t0, ...("end" in e && e.end !== undefined ? { end: e.end + t0 } : {}) }) as SpeechEvent;
  if (s.events?.length) return { events: [...s.events.map(shift), end], source: "events" };
  if (s.phonemes?.some((p) => p.phoneme)) {
    const events = s.phonemes.filter((p) => p.phoneme).map((p): SpeechEvent => ({ type: "phoneme", time: t0 + p.t0, end: t0 + p.t1, phoneme: p.phoneme! }));
    return { events: [...events, end], source: "phonemes" };
  }
  if (s.words?.length) {
    const text = s.text ?? "";
    const events = s.words.map((w): SpeechEvent => ({ type: "word", time: t0 + w.t0, end: t0 + w.t1, text: w.text ?? (w.start !== undefined && w.end !== undefined ? text.slice(w.start, w.end) : "") }));
    return { events: [...events, end], source: "words" };
  }
  if (s.text?.trim() && !s.audio) return { events: [...estimateWords(s.text, t0, t0 + seconds), end], source: "estimate" };
  return { events: [end], source: "audio level" };
}
