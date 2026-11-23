import { LipSync, type LipFrame, bandsFromSpectrum, estimateWords, rms } from "@hackbuild/lipsync";
import { type ArticulatorFrame, type ArticulatorProbeLike, articulatoryFrame, fromProbe, fromTractModel, type TractModelLike } from "@hackbuild/lipsync/articulatory";
import { type BellowsPlan, fromSungPlan } from "@hackbuild/lipsync/bellows";
import { $, FrameTimer, auto, check, finish, onDrop, readout, result, sleep, status } from "../shared/ui.js";

const r = result("lipsync");
$("#controls").innerHTML = `
<label class="hb-ctl is-wide">text <input class="hb-input" id="text" type="text" autocomplete="off" value="the quick brown fox jumps over the lazy dog, then naps in the warm sun."></label>
<button class="hb-btn" id="say">speak with the system voice</button>
<button class="hb-btn hb-btn-2" id="timed">play as timed text (silent)</button>
<button class="hb-btn hb-btn-2" id="bellows">speak with the bellows voice</button>
<label class="hb-ctl">bellows mouth <select class="hb-select" id="bmode"><option value="spans">from its phoneme spans</option><option value="tract">from its tract model</option><option value="probe">from its articulator probe, as heard</option></select></label>
<button class="hb-btn hb-btn-2" id="mic">use the microphone</button>
<div class="hb-dropzone" id="drop"><span>or drop an audio file to drive the mouth from its level, or tap to pick one</span> <input id="file" type="file" accept="audio/*" aria-label="pick an audio file"></div>`;
const text = $("#text") as HTMLInputElement;
const canvas = document.createElement("canvas");
$("#stage").append(canvas);
const g = canvas.getContext("2d")!;
const lips = new LipSync();
const now = () => performance.now() / 1000;
let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let timeBuf = new Uint8Array(0);
let freqBuf = new Uint8Array(0);
const timer = new FrameTimer();
let lastFrame: LipFrame | null = null;
let words = 0;
let openDuringSpeech = 0;
let speaking = false;
const bellowsSamples: { t: number; open: number; pp: number }[] = [];

function useAnalyser(node: AudioNode, c: AudioContext) {
  analyser = c.createAnalyser();
  analyser.fftSize = 1024;
  node.connect(analyser);
  timeBuf = new Uint8Array(analyser.fftSize);
  freqBuf = new Uint8Array(analyser.frequencyBinCount);
}

$("#say").addEventListener("click", () => say());
function say(): Promise<number> {
  if (!("speechSynthesis" in window)) {
    status("this browser has no speech synthesis. use timed text.", "warn");
    return Promise.resolve(0);
  }
  return new Promise((res) => {
    const u = new SpeechSynthesisUtterance(text.value);
    let n = 0;
    u.onstart = () => {
      speaking = true;
      status("speaking. word boundaries from the voice drive the visemes.", "ok");
    };
    u.onboundary = (e) => {
      if (e.name !== "word") return;
      const w = text.value.slice(e.charIndex, e.charIndex + (e.charLength || text.value.slice(e.charIndex).search(/\W|$/)));
      lips.push({ type: "word", time: now(), text: w });
      n++;
      words++;
    };
    u.onend = () => {
      speaking = false;
      lips.push({ type: "end", time: now() });
      if (!n) status("the voice gave no word boundaries. this voice cannot drive the mouth; use timed text.", "warn");
      res(n);
    };
    u.onerror = (e) => {
      speaking = false;
      status(`speech failed: ${e.error}.`, "bad");
      res(-1);
    };
    speechSynthesis.speak(u);
  });
}
$("#timed").addEventListener("click", () => {
  const t = now() + 0.1;
  const dur = text.value.split(/\s+/).length * 0.32;
  lips.push(estimateWords(text.value, t, t + dur));
  lips.push({ type: "end", time: t + dur });
  status(`timed text over ${dur.toFixed(1)} s (inferred from the word count).`, "ok");
});
$("#mic").addEventListener("click", async () => {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true } });
    ctx ??= new AudioContext();
    useAnalyser(ctx.createMediaStreamSource(s), ctx);
    status("microphone on. the mouth follows your level.", "ok");
  } catch (e) {
    status(`no microphone: ${(e as Error).message}.`, "bad");
  }
});
onDrop($("#drop"), async ([f]) => {
  if (!f) return;
  ctx ??= new AudioContext();
  const buf = await ctx.decodeAudioData(await f.arrayBuffer());
  const src = ctx.createBufferSource();
  src.buffer = buf;
  useAnalyser(src, ctx);
  analyser!.connect(ctx.destination);
  src.start();
  status(`${f.name}: ${buf.duration.toFixed(1)} s. the mouth follows its level.`, "ok");
}, $("#file") as HTMLInputElement);

// bellows: bellowsjs 0.5.0 and bellows-voice 0.8.0 (the owner's articulatory voice, MIT, no weights)
// from the npm CDN, loaded on first use. Its plan's spans are the sounds the engine plays, on its
// AudioContext clock; the page's clock is performance.now(), so the spans are shifted by the
// difference, plus the output latency.
const CDN = "https://cdn.jsdelivr.net/npm/";
type Singer = { speak(text: string): BellowsPlan & { phrases: { spans: { ipa: string; start: number; end: number }[] }[] } };
type BellowsMods = {
  b: { ctx: AudioContext };
  singer: Singer;
  tract: TractModelLike & { target(ipa: string): boolean; step(dt: number): void };
  probe: ArticulatorProbeLike;
};
let bellows: Promise<BellowsMods> | null = null;
// the page's seeded rng (mulberry32); one draw seeds the voice, so a reload sounds the same
let seed = 20261123;
const rng = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
function loadBellows(): Promise<BellowsMods> {
  bellows ??= (async () => {
    status("loading bellowsjs 0.5.0 and bellows-voice 0.8.0 (code mit, no weights).");
    const [core, voice, view] = await Promise.all([
      import(/* @vite-ignore */ `${CDN}bellowsjs@0.5.0/+esm`),
      import(/* @vite-ignore */ `${CDN}bellows-voice@0.8.0/+esm`),
      import(/* @vite-ignore */ `${CDN}bellows-voice@0.8.0/dist/view.js/+esm`),
    ]);
    const b = await core.Bellows.boot({ plugins: [voice.voice], seed: String((rng() * 2 ** 32) >>> 0) });
    const singer = voice.singer(b, "narrator-female");
    return { b, singer, tract: new view.TractModel(1), probe: voice.articulatorProbe(b, singer, { rate: 60 }) };
  })();
  return bellows;
}
let tractSpans: { ipa: string; start: number; end: number }[] = [];
let tractAcc = 0;
let tractOn = "";
let bellowsUntil = 0;
const tractFrame = { visemes: new Float32Array(15), vowels: { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 }, open: 0, source: "silent" as LipFrame["source"], channels: {} as never };
let bellowsMs = 0;
$("#bellows").addEventListener("click", () => void sayBellows().catch((e) => status(`bellows failed: ${(e as Error).message}.`, "bad")));
async function sayBellows(): Promise<{ spans: number; ms: number }> {
  const m = await loadBellows();
  await m.b.ctx.resume();
  const t = performance.now();
  const plan = m.singer.speak(text.value);
  bellowsMs = performance.now() - t;
  const ctxNow = m.b.ctx.currentTime;
  const offset = now() - ctxNow + (m.b.ctx.outputLatency || m.b.ctx.baseLatency || 0);
  const spans = plan.phrases.flatMap((p) => p.spans).map((x) => ({ ipa: x.ipa, start: x.start + offset, end: x.end + offset }));
  bellowsUntil = Math.max(...spans.map((x) => x.end));
  const mode = ($("#bmode") as HTMLSelectElement).value;
  if (mode === "tract") {
    tractSpans = spans;
    tractOn = "";
  } else if (mode === "spans") lips.push(fromSungPlan(plan, offset));
  status(`bellows voice: ${spans.length} spans over ${(bellowsUntil - spans[0]!.start).toFixed(1)} s, planned in ${bellowsMs.toFixed(0)} ms (measured).`, "ok");
  return { spans: spans.length, ms: bellowsMs };
}
// the tract model follows the spans: it targets the sound under the clock and steps at a fixed 1/120 s
function tractUpdate(n: number, dt: number, m: BellowsMods): LipFrame | null {
  if (!tractSpans.length || n > bellowsUntil + 0.3) return null;
  const cur = tractSpans.find((x) => n >= x.start && n < x.end);
  const ipa = cur ? cur.ipa : "_";
  if (ipa !== tractOn) {
    tractOn = ipa;
    if (!ipa.startsWith("beat:")) m.tract.target(ipa === "_" ? "_" : ipa);
  }
  tractAcc += Math.min(dt, 0.1);
  while (tractAcc >= 1 / 120) {
    m.tract.step(1 / 120);
    tractAcc -= 1 / 120;
  }
  const a: ArticulatorFrame = fromTractModel(m.tract);
  return articulatoryFrame(a, tractFrame);
}
let tractMods: BellowsMods | null = null;
let probeMods: BellowsMods | null = null;
$("#bmode").addEventListener("change", async () => {
  const mode = ($("#bmode") as HTMLSelectElement).value;
  tractMods = mode === "tract" ? await loadBellows() : null;
  probeMods = mode === "probe" ? await loadBellows() : null;
});

function face(f: LipFrame) {
  // at most 2 device pixels per css pixel, sized to the viewport every frame
  const dpr = Math.min(devicePixelRatio, 2);
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  // paper behind the face, as hackbuild-ui asks of a scene; no dark branch
  g.fillStyle = "#f5f0e6";
  g.fillRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2;
  // a narrow (square) viewport frames the face closer, so the mouth reads on a phone
  const s = Math.min(w, h) / (canvas.clientWidth < 641 ? 2.3 : 2.6);
  g.fillStyle = "#e0b48a";
  g.beginPath();
  g.ellipse(cx, cy, s * 0.8, s, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#2b2b2b";
  for (const x of [-0.3, 0.3]) {
    g.beginPath();
    g.ellipse(cx + x * s, cy - 0.25 * s, 0.07 * s, 0.09 * s, 0, 0, Math.PI * 2);
    g.fill();
  }
  const v = f.vowels;
  const open = Math.min(1, f.open);
  const width = 0.32 + 0.18 * (v.ee + v.ih) - 0.14 * (v.ou + v.oh);
  const height = 0.03 + 0.32 * open * (0.5 + v.aa + 0.6 * v.oh + 0.4 * v.ou);
  g.fillStyle = "#6b1f2a";
  g.beginPath();
  g.ellipse(cx, cy + 0.42 * s, width * s, Math.max(0.015, height) * s, 0, 0, Math.PI * 2);
  g.fill();
}

let prev = now();
function frame(t: number) {
  timer.tick(t);
  const n = now();
  const dt = Math.max(0, n - prev);
  prev = n;
  const f = timer.time(() => {
    if (analyser) {
      analyser.getByteTimeDomainData(timeBuf);
      analyser.getByteFrequencyData(freqBuf);
      lips.setLevel(rms(timeBuf), bandsFromSpectrum(freqBuf, analyser.context.sampleRate, analyser.fftSize));
    }
    const viaTract = tractMods ? tractUpdate(n, dt, tractMods) : null;
    const viaProbe = probeMods && n < bellowsUntil + 0.3 ? fromProbe(probeMods.probe) : null;
    return viaTract ?? viaProbe ?? lips.update(n, dt);
  });
  lastFrame = f;
  if (speaking && f.open > 0.2) openDuringSpeech++;
  if (n < bellowsUntil) bellowsSamples.push({ t: n, open: f.open, pp: f.visemes[1] ?? 0 });
  face(f);
  if (Math.floor(t / 250) !== Math.floor((t - 17) / 250)) {
    const s = timer.stats();
    readout({
      source: f.source,
      "open (computed)": f.open,
      vowels: Object.entries(f.vowels).map(([k, x]) => `${k} ${x.toFixed(2)}`).join(" "),
      "word events (measured)": words,
      "fps p50 (measured)": s.fpsP50,
      "lipsync work ms p95 (measured)": s.workMsP95,
    });
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
status("speak, play timed text, use the microphone or drop audio.");

if (auto) {
  // timed text: the timeline path with no audio
  $("#timed").click();
  let opened = 0;
  for (let k = 0; k < 60; k++) {
    await sleep(50);
    if (((lastFrame as LipFrame | null)?.open ?? 0) > 0.2) opened++;
  }
  r.numbers["timed text frames open in 3 s, sampled every 50 ms (measured)"] = opened;
  check(r, "lipsync: timed text drives the visemes", opened > 5 ? "pass" : "fail", `${opened} of 60 samples open`);
  const voices = speechSynthesis.getVoices().length;
  const t0 = performance.now();
  const n = await Promise.race([say(), sleep(15000).then(() => -2)]);
  r.numbers["system voices (measured)"] = voices;
  r.numbers["tts word boundary events (measured)"] = n;
  r.numbers["frames open while speaking (measured)"] = openDuringSpeech;
  r.numbers["speech ms (measured)"] = Math.round(performance.now() - t0);
  check(
    r,
    "lipsync: a face driven from real TTS events",
    n > 0 && openDuringSpeech > 5 ? "pass" : n === -2 ? "fail" : "fail",
    n > 0 ? `${n} word events from the system voice, mouth open on ${openDuringSpeech} frames (a 2d face; a real avatar face needs a person looking)` : n === -2 ? "no end event in 15 s" : "no word boundaries",
  );
  // bellows: the same line through its phoneme spans, its tract model, then its articulator probe
  const label = { spans: "phoneme spans", tract: "tract model", probe: "articulator probe as the audio plays" } as const;
  for (const mode of ["spans", "tract", "probe"] as const) {
    try {
      ($("#bmode") as HTMLSelectElement).value = mode;
      const m = await loadBellows();
      tractMods = mode === "tract" ? m : null;
      probeMods = mode === "probe" ? m : null;
      bellowsSamples.length = 0;
      const x = await sayBellows();
      await sleep(Math.max(0, (bellowsUntil - now()) * 1000) + 300);
      const open = bellowsSamples.filter((q) => q.open > 0.2).length;
      const closed = bellowsSamples.filter((q) => q.pp > 0.5).length;
      r.numbers[`bellows ${mode}: spans (measured)`] = x.spans;
      r.numbers[`bellows ${mode}: speak() plan ms (measured)`] = Math.round(x.ms);
      r.numbers[`bellows ${mode}: frames while it speaks, open, lips shut (measured)`] = `${bellowsSamples.length}, ${open}, ${closed}`;
      const ok = open > 10 && closed > 0;
      check(r, `lipsync: the bellows voice drives the face from its ${label[mode]}`, ok ? "pass" : "fail", ok ? `${open} of ${bellowsSamples.length} frames open, lips shut on ${closed} (a 2d face; sync not judged by a person)` : `${open} open and ${closed} shut of ${bellowsSamples.length} frames`);
    } catch (e) {
      check(r, `lipsync: the bellows voice drives the face from its ${label[mode]}`, "fail", (e as Error).message.slice(0, 200));
    }
  }
  tractMods = null;
  probeMods = null;
  check(r, "lipsync: a face driven from real microphone audio", "not run", "needs a microphone and a person speaking");
  timer.reset();
  await sleep(2000);
  Object.assign(r.numbers, timer.numbers());
  finish(r, Object.values(r.checks).some((c) => c.status === "fail") ? "fail" : "pass");
}
