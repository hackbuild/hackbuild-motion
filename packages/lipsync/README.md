# @hackbuild/lipsync

A viseme driver for talking characters. Timed speech events from a TTS
engine build a timeline that is sampled with coarticulation; when no
timings exist, the audio level moves the jaw. Output goes to the 15 Oculus
visemes, the five VRM vowels or ARKit blendshapes through the one
expression and viseme table in `@hackbuild/rig`.

- `SpeechEvent`: `word`, `phoneme`, `viseme` and `end` events on the
  caller's clock in seconds, the shape `@hackbuild/speak` style engines
  report. Phonemes may be ARPAbet (stress digits allowed), IPA or Oculus
  names. The IPA table covers every sound bellows-voice emits (the dark
  coda l `ɫ`, the flap `ɾ`, the glottal stop `ʔ` and its non General
  American vowels) and the common IPA consonant and vowel charts; stress,
  length, nasal, syllabic, aspiration and tie marks are stripped. Only
  bellows' pause `_` and unknown symbols give `sil`.
- Words without phonemes are spelled into visemes by English letter rules.
  A word with no end time gets a length from its letters at once, so the
  mouth moves in real time; when the next word arrives sooner, the word's
  visemes are squeezed to end there. `estimateWords(text, start, end)`
  spreads an utterance by syllables for engines that give only its bounds.
- Coarticulation: each viseme rises and falls over 70 ms (default) centred
  on its edges, and overlapping visemes share the mouth by dominance after
  the Cohen and Massaro model, so p, b and m still close the lips between
  two open vowels. Weights never sum past 1 (property tested).
- The mouth leads the sound by 40 ms by default (inferred).
- Audio fallback: `rms(samples)` and `bandsFromSpectrum(spectrum,
  sampleRate, fftSize)` read an AnalyserNode's arrays; `vowelFromBands`
  picks a rough shape from three formant bands in place of cycling vowels
  on a timer. A gate keeps breath noise closed.
- `LipSync.update(t, dt)` prefers timings while they cover `t`, falls back
  to the level, then goes quiet, and reports which (`source`). Output
  rises with a 20 ms and falls with a 60 ms half-life (defaults).
- `drive(sink, frame, "vrm" | "oculus" | "arkit")` writes to anything with
  `setValue(name, weight)`: an `@hackbuild/avatar` ExpressionRig or a
  three-vrm expression manager.

## Install

Not published yet. From a clone:

    npm ci && npm run build -w @hackbuild/lipsync

## Use

```ts
import { LipSync, drive, rms } from "@hackbuild/lipsync";

const lips = new LipSync();
tts.onEvent = (e) => lips.push(e); // { type: "word", time: ctx.currentTime, text }
const buf = new Uint8Array(analyser.fftSize);

function frame(dt: number) {
  analyser.getByteTimeDomainData(buf);
  lips.setLevel(rms(buf));
  drive(avatar.expressions, lips.update(ctx.currentTime, dt), "vrm");
}
```

### Bellows voice

`@hackbuild/lipsync/bellows` reads the plan bellows-voice (the owner's
articulatory voice for the bellowsjs engine, MIT) returns from `speak()`,
`sing()` and `beatbox()`. Its spans are the exact sounds the engine plays,
already on the AudioContext clock, so the mouth needs no estimate:

```ts
import { fromSungPlan } from "@hackbuild/lipsync/bellows";

const plan = alto.speak("Shall we meet at noon?");
lips.push(fromSungPlan(plan)); // offset 0: live plans are on the context clock
```

For an offline render that starts at 0, pass the play time as the offset.
Beatbox spans map to the viseme of each sound's place; bellows' pause `_`
makes no event. The span shape is copied structurally, so the subpath
imports nothing from bellows. `bellows-voice` is an optional peer pinned
to 0.8.0 on npm and `bellowsjs` to 0.5.0; the package runs without
either.

### Articulatory source

`@hackbuild/lipsync/articulatory` builds the mouth from vocal tract state
in place of a viseme lookup: jaw arc, lip aperture, protrusion and width,
the labiodental contact, tongue body and tip positions and the velum port,
in the units of bellows-voice's articulator frame (centimetres, cm^2 for
the velum). `ArticulatorFrame` is a plain structural interface, so any
source with those fields drives it.

- `mouthChannels(frame)`: open, closure, round, spread, labiodental,
  dental, alveolar, postalveolar, sibilant, retroflex, velar and nasal,
  each 0 to 1, each from the articulators that make that shape
  (thresholds inferred from bellows-voice's body 0 targets and a rendered engine track).
- `articulatoryFrame(frame)`: a `LipFrame` for `drive()`. Consonant
  visemes come from the channels, the rest of the mouth goes to the vowel
  visemes; the five VRM vowels are a softmax over their distance to points
  taken from bellows' own vowels (aa, ee, ih, oh, ou), shut by the lip
  closure. `sounding: 0` gives a silent frame.
- `arkitFromChannels(channels)`: jawOpen, mouthClose, pucker and funnel,
  stretch and smile, mouthRollLower and tongueOut straight from the
  channels.
- `fromProbe(probe)`: a frame from bellows-voice 0.8.0's
  `articulatorProbe(b, singer)` at the time being heard, the engine's own
  state as the audio plays, look ahead included. A frame from
  `probe.at(t)` or from the `track` of the offline `renderSpeech` passes
  straight to `articulatoryFrame`.
- `fromTractModel(model)`: a frame from bellows-voice's main thread
  `TractModel` (`postureByName()`), which follows the plan rather than the
  audio and has no gesture look ahead; call its `step()` at a fixed step.

```ts
import { articulatorProbe, singer } from "bellows-voice";
import { fromProbe } from "@hackbuild/lipsync/articulatory";

const probe = articulatorProbe(b, alto, { rate: 60 });
alto.speak("Shall we meet at noon?");
function frame() {
  drive(avatar.expressions, fromProbe(probe), "vrm");
  requestAnimationFrame(frame);
}
```

`dist/lipsync.iife.js` is the single file build (`HackbuildLipsync`). It
uses only the rig's plain data tables, so it carries no wasm.

## Develop

    npm run build -w @hackbuild/lipsync
    npx vitest run packages/lipsync

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `npx vitest run packages/lipsync` passed 11 of 11 tests
  (counted), one a fast-check property: viseme weights stay non negative,
  sum to 1 or less, and change by less than 0.05 over 0.1 ms at any time
  over random segment lists (computed).
- 2026-11-22: a 60 ms PP between two aa vowels reaches above 0.9 at its
  middle; an ARKit target gets `mouthClose` above 0.9 for an M phoneme
  (computed).
- 2026-11-22: synthetic spectra with energy at 2.5 to 4 kHz pick ee over
  aa, at 300 to 500 Hz pick oh and ou over aa, at 0.5 to 1.5 kHz pick aa
  above 0.9 (computed).

- 2026-11-23: `packages/lipsync/test/ipa.test.ts` maps the 53 sounds on
  bellows-voice 0.7.3's phoneme list besides its pause, its 5 aliases and 97 IPA
  symbols, to a viseme other than sil (counted); a "little bottle" span
  list with flaps and dark l keeps sil at 0 from its first to its last
  span (computed).

- 2026-11-23: `test/bellows.test.ts` runs a real plan made by
  bellows-voice 0.7.3 (`test/fixtures/bellows-plan.json`, two sentences,
  flaps, dark l and an in breath): one event per sounding span at its
  times, no sil at the middle of any span, a 60 ms m between vowels
  reaches 0.9 or more on the timeline and 0.55 after the default output
  follower (computed).

- 2026-11-23: `test/articulatory.test.ts` reads settled bellows-voice
  0.8.0 `TractModel` postures for all 53 of its sounds
  (`test/fixtures/bellows-frames.json`): every consonant's strongest
  viseme matches its place (l reads DD, the frame has no lateral channel),
  ten anchor vowels match their viseme and the rest read as a vowel shape,
  the five VRM presets each win on their own bellows vowel, and the VRM
  vowels shut under p, b and m (computed).
- 2026-11-23: on a real engine track (`test/fixtures/bellows-track.json`,
  `renderSpeech("Shall we meet at noon?")` at 60 frames per second, 96
  frames) the lips close past 0.9 during m, ou and ih pass 0.5 during u
  and i, sh reads CH and t reads DD, and frames that do not sound give a
  silent frame (computed). 48 of 90 sounding frames read the viseme of the
  phoneme the engine labels them with (measured); the rest are mostly the
  engine's look ahead (the lips close for m while i still sounds) and the
  rest posture after the line.

### Not verified by anything

- No real TTS engine's events or real speech audio have gone through it;
  the band thresholds are inferred from formant ranges, not fitted.
- Nobody has watched a face driven by it in a browser or listened to it;
  the automated pass in `docs/browser-checks.md` drove the 2D face on the
  lipsync page from the bellows voice's spans, tract model and live
  articulator probe (bellows-voice 0.8.0 from the npm CDN) and counted
  open and shut frames only.
- Dominance values and viseme to vowel weights were chosen by eye.
- The articulatory thresholds have not been tuned by eye on a face, and
  the articulatory source has not been compared in time against the
  dominance timeline. The live probe ran once in Chrome (open on 293 of
  371 frames, lips shut on 30, measured); nobody has judged its timing.
- The letter rules are English only.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 6,021 bytes | 6,322 bytes |
| `dist/lipsync.iife.js` (single file build) | 9,774 bytes | 10,262 bytes |

Measured 2026-11-24 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

## Licence

Code MIT (`LICENSE` at the repository root). This README is CC-BY-4.0, its
code samples also MIT.
