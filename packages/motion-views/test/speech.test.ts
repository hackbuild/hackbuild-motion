import { describe, expect, it } from "vitest";
import { estimateSeconds, speechEvents } from "../src/index.js";

// a stand-in for an AudioBuffer: speechEvents only asks whether audio is there
const audio = {} as AudioBuffer;

describe("speechEvents", () => {
  it("places engine word timings on the mouth clock and reads each word from the text", () => {
    const text = "hello there";
    const { events, source } = speechEvents({ text, audio, words: [{ t0: 0.1, t1: 0.5, start: 0, end: 5 }, { t0: 0.6, t1: 1.0, start: 6, end: 11 }] }, 10, 1.2);
    expect(source).toBe("words");
    expect(events).toEqual([
      { type: "word", time: 10.1, end: 10.5, text: "hello" },
      { type: "word", time: 10.6, end: 11, text: "there" },
      { type: "end", time: 11.2 },
    ]);
  });
  it("prefers phonemes over words, and events over both", () => {
    const words = [{ t0: 0, t1: 1, text: "ma" }];
    const phonemes = [{ t0: 0, t1: 0.2, phoneme: "M" }, { t0: 0.2, t1: 0.5, phoneme: "AA" }];
    expect(speechEvents({ audio, words, phonemes }, 2, 1).source).toBe("phonemes");
    expect(speechEvents({ audio, words, phonemes }, 2, 1).events[1]).toEqual({ type: "phoneme", time: 2.2, end: 2.5, phoneme: "AA" });
    const ev = speechEvents({ audio, words, phonemes, events: [{ type: "viseme", time: 0.1, end: 0.3, viseme: "aa" }] }, 2, 1);
    expect(ev.source).toBe("events");
    expect(ev.events[0]).toEqual({ type: "viseme", time: 2.1, end: 2.3, viseme: "aa" });
  });
  it("lets audio with no timings drive the mouth by its level alone, never by estimate", () => {
    const { events, source } = speechEvents({ text: "hello there", audio }, 0, 1.5);
    expect(source).toBe("audio level");
    expect(events).toEqual([{ type: "end", time: 1.5 }]);
  });
  it("falls back to estimated timings for text alone", () => {
    const { events, source } = speechEvents({ text: "hello there friend" }, 0, estimateSeconds("hello there friend"));
    expect(source).toBe("estimate");
    expect(events.filter((e) => e.type === "word").length).toBe(3);
    expect(estimateSeconds("hi")).toBe(0.8);
  });
});
