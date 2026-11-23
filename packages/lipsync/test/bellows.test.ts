import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BEAT_VISEMES, type BellowsPlan, fromSpans, fromSungPlan } from "../src/bellows.js";
import { LipSync, OCULUS_VISEMES, VisemeTimeline } from "../src/index.js";

const plan = JSON.parse(readFileSync(new URL("./fixtures/bellows-plan.json", import.meta.url), "utf8")) as BellowsPlan & { text: string };
const spans = plan.phrases.flatMap((p) => p.spans);

describe("bellows adapter", () => {
  it("turns every sounding span of a real plan into one event at its times", () => {
    const ev = fromSungPlan(plan, 2);
    const sounding = spans.filter((s) => s.ipa !== "_");
    expect(ev.length).toBe(sounding.length);
    ev.forEach((e, i) => {
      expect(e.time).toBeCloseTo(sounding[i]!.start + 2, 9);
      expect((e as { end: number }).end).toBeCloseTo(sounding[i]!.end + 2, 9);
    });
    expect(ev.some((e) => e.type === "phoneme" && e.phoneme === "ɫ")).toBe(true);
    expect(ev.some((e) => e.type === "phoneme" && e.phoneme === "ɾ")).toBe(true);
  });

  it("keeps the mouth off sil through every word of the plan", () => {
    const tl = new VisemeTimeline();
    tl.push(fromSungPlan(plan));
    const out = new Float32Array(OCULUS_VISEMES.length);
    const sil = OCULUS_VISEMES.indexOf("sil");
    for (const s of spans) {
      if (s.ipa === "_" || s.ipa.startsWith("beat:")) continue;
      const mid = (s.start + s.end) / 2;
      tl.sample(mid, out);
      expect(out[sil], `${s.ipa} at ${mid}`).toBe(0);
      expect(out.reduce((a, b) => a + b, 0), `${s.ipa} at ${mid}`).toBeGreaterThan(0.5);
    }
  });

  it("closes the lips on m and b and drives a LipSync frame", () => {
    const ls = new LipSync({ lead: 0 });
    ls.push(fromSungPlan(plan));
    const m = spans.find((s) => s.ipa === "m" && s.end - s.start > 0.05)!;
    let f = ls.update(m.start - 0.1, 1 / 120);
    for (let t = m.start - 0.1; t < (m.start + m.end) / 2; t += 1 / 120) f = ls.update(t, 1 / 120);
    expect(f.source).toBe("timeline");
    const pp = f.visemes[OCULUS_VISEMES.indexOf("PP")]!;
    expect(pp).toBeGreaterThan(0.5);
    const raw = new Float32Array(OCULUS_VISEMES.length);
    ls.timeline.sample((m.start + m.end) / 2, raw);
    expect(raw[OCULUS_VISEMES.indexOf("PP")]!).toBeGreaterThan(0.9);
  });

  it("maps beats by their id and skips rests and pauses", () => {
    const ev = fromSpans([
      { ipa: "beat:B", start: 0, end: 0.1 },
      { ipa: "beat:t>", start: 0.1, end: 0.2 },
      { ipa: "beat:.", start: 0.2, end: 0.3 },
      { ipa: "_", start: 0.3, end: 0.4 },
      { ipa: "beat:zz", start: 0.4, end: 0.5 },
      { ipa: "a", start: 0.5, end: 0.5 },
    ]);
    expect(ev).toEqual([
      { type: "viseme", time: 0, end: 0.1, viseme: "PP" },
      { type: "viseme", time: 0.1, end: 0.2, viseme: "DD" },
    ]);
    expect(Object.keys(BEAT_VISEMES).length).toBe(14);
  });
});
