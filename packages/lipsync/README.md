# @hackbuild/lipsync

Move a character's mouth from speech timings or the audio level, out to Oculus visemes, VRM vowels or ARKit blendshapes.

[![npm](https://img.shields.io/npm/v/@hackbuild/lipsync)](https://www.npmjs.com/package/@hackbuild/lipsync) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 6.0 kB measured](https://img.shields.io/badge/gzip-6.0%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

## What it does

- Turns word, phoneme and viseme events from a TTS engine into a viseme timeline, with ARPAbet, IPA or Oculus phoneme names.
- Blends neighbouring visemes by dominance, so p, b and m still close the lips between two open vowels.
- Spells words with no phonemes into visemes by English letter rules, in real time as words arrive.
- Falls back to the audio level when no timings cover the moment, with a rough vowel shape from three formant bands.
- Reads the bellows voice's phoneme spans or its vocal tract state through two subpaths, with no import of bellows.

## Install

```sh
npm install @hackbuild/lipsync
```

It depends on `@hackbuild/rig` for the one expression and viseme table. It needs no three.js and no Web Audio: you pass levels or analyser arrays.

| subpath | drives it | pin |
|---|---|---|
| `@hackbuild/lipsync` | speech events, audio level | none |
| `@hackbuild/lipsync/bellows` | `bellows-voice` plans (optional peer, structural types only) | 0.8.0, `bellowsjs` 0.5.0 |
| `@hackbuild/lipsync/articulatory` | `bellows-voice` articulator frames, probe or `TractModel` (optional peer, structural types only) | 0.8.0 |

## Quick start

```ts
import { LipSync, OCULUS_VISEMES, drive, type ExpressionSink } from "@hackbuild/lipsync";

const lips = new LipSync();
// word timings as a TTS engine reports them, in seconds on your clock
lips.push([
  { type: "word", time: 0.0, end: 0.35, text: "hello" },
  { type: "word", time: 0.4, end: 0.8, text: "mama" },
]);

// any object with setValue: an avatar ExpressionRig or a three-vrm expression manager
const face = new Map<string, number>();
const sink: ExpressionSink = { setValue: (name, weight) => face.set(name, weight) };

for (let t = 0; t <= 1; t += 1 / 30) {
  const frame = lips.update(t, 1 / 30);
  const top = frame.visemes.indexOf(Math.max(...frame.visemes));
  console.log(t.toFixed(2), frame.source, OCULUS_VISEMES[top], frame.open.toFixed(2));
  drive(sink, frame, "vrm"); // face now holds aa, ih, ou, ee, oh
}
```

## Live example

The demo page drives a 2D face from the system voice, timed text, the bellows voice and audio level: [hackbuild-motion/lipsync](https://hackbuild.github.io/hackbuild-motion/lipsync/). The suite's lip sync screen: [hackbuild-suite lipsync](https://hackbuild.github.io/hackbuild-suite/#/motion/lipsync).

## Concepts

### events on your clock

A `SpeechEvent` is a `word`, `phoneme`, `viseme` or `end` event with `time` in seconds on your clock, usually an AudioContext time. `end` is optional: a word with no end gets a length from its letters at once, and when the next word arrives sooner the word's visemes are squeezed to end there. `estimateWords(text, start, end)` spreads an utterance by syllables for engines that give only its bounds.

### coarticulation

Each viseme rises and falls over 70 ms by default, centred on its edges, and overlapping visemes share the mouth by dominance after the Cohen and Massaro model. Lip closures and lip to teeth contacts dominate; tongue consonants yield to the vowels around them. Weights never sum past 1.

### timings first, then the level

`LipSync.update(t, dt)` uses the timeline while it covers `t`, falls back to the audio level you set with `setLevel(rms, bands)`, then goes quiet, and reports which in `frame.source`. The mouth leads the sound by 40 ms by default, and the output rises with a 20 ms and falls with a 60 ms half-life:

```ts
const buf = new Uint8Array(analyser.fftSize);
analyser.getByteTimeDomainData(buf);
lips.setLevel(rms(buf));
drive(avatar.expressions, lips.update(ctx.currentTime, dt), "vrm");
```

### one output, three targets

`drive(sink, frame, target)` writes to anything with `setValue(name, weight)`: an `@hackbuild/avatar` ExpressionRig or a three-vrm expression manager. `"vrm"` writes the five vowels, `"oculus"` the 15 visemes, `"arkit"` jaw, closure, pucker, funnel and smile shapes through the rig table.

### the bellows voice

`@hackbuild/lipsync/bellows` reads the plan bellows-voice returns from `speak()`, `sing()` and `beatbox()`. Its spans are the exact sounds the engine plays, already on the AudioContext clock, so the mouth needs no estimate. `@hackbuild/lipsync/articulatory` builds the mouth from vocal tract state (jaw, lips, tongue, velum) in place of a viseme lookup; `fromProbe` follows the audio as it plays, look ahead included.

```ts
const plan = alto.speak("Shall we meet at noon?");
lips.push(fromSungPlan(plan)); // live plans are on the context clock, offset 0
```

## API overview

| export | what it does |
|---|---|
| [`LipSync`](../../docs/api/lipsync/index.md#lipsync) | the driver: push events, set the level, update per frame |
| [`VisemeTimeline`](../../docs/api/lipsync/index.md#visemetimeline) | timed visemes sampled with coarticulation |
| [`drive`](../../docs/api/lipsync/index.md#drive) | write a frame to VRM vowels, Oculus visemes or ARKit shapes |
| [`SpeechEvent`](../../docs/api/lipsync/index.md#speechevent) | the word, phoneme, viseme and end events |
| [`phonemeToViseme`](../../docs/api/lipsync/index.md#phonemetoviseme) | ARPAbet, IPA or Oculus name to a viseme |
| [`wordToVisemes`](../../docs/api/lipsync/index.md#wordtovisemes) | English letter rules for a word with no phonemes |
| [`estimateWords`](../../docs/api/lipsync/index.md#estimatewords) | spread an utterance over its bounds by syllables |
| [`rms`](../../docs/api/lipsync/index.md#rms) | the level of an analyser's time domain bytes |
| [`bandsFromSpectrum`](../../docs/api/lipsync/index.md#bandsfromspectrum) | three formant band energies from a spectrum |
| [`fromSungPlan`](../../docs/api/lipsync/bellows.md#fromsungplan) | speech events from a bellows voice plan |
| [`fromProbe`](../../docs/api/lipsync/articulatory.md#fromprobe) | a frame from the bellows articulator probe |
| [`articulatoryFrame`](../../docs/api/lipsync/articulatory.md#articulatoryframe) | a frame from vocal tract state |
| [`mouthChannels`](../../docs/api/lipsync/articulatory.md#mouthchannels) | open, closure, round and place channels from tract state |

The full reference is in [docs/api/lipsync](../../docs/api/lipsync/README.md).

## Browser support

| feature | needs | notes |
|---|---|---|
| timeline and driver | any JavaScript runtime | no DOM, no Web Audio, runs in Node |
| audio level | an `AnalyserNode` you make | pass its arrays to `rms` and `bandsFromSpectrum` |
| system voice timings | `speechSynthesis` word boundary events | Chrome gave 17 word events for one line (measured); other browsers unknown |
| bellows voice | Web Audio, bellows-voice 0.8.0 | runs on the demo page from the npm CDN |
| single file build | `dist/lipsync.iife.js` | `HackbuildLipsync` global, no wasm, runs from file:// |

## Errors and troubleshooting

Nothing in this package throws: unknown phonemes give `sil`, and an empty timeline hands over to the audio level.

| message | cause | what to do |
|---|---|---|
| none; `frame.source` stays `"silent"` | no event covers `t` and the level is under the gate | check `t` and the event times are on the same clock; raise the level or lower `gate` |
| none; the mouth trails the sound | events pushed on a different clock, or `lead` too small | pass `ctx.currentTime` based times; raise `lead` from 0.04 s |
| none; the mouth flutters on breath | the level gate is too low | raise `gate` from 0.015 |

## Works with

- [@hackbuild/rig](../rig/README.md) holds the expression and viseme table this package writes through.
- [@hackbuild/avatar](../avatar/README.md) gives the ExpressionRig `drive` writes to.
- [@hackbuild/presence](../presence/README.md) runs blink, gaze and breath alongside the mouth.
- [@hackbuild/motion-views](../motion-views/README.md) speaks real audio on the character stage with this package.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)); this README is CC-BY-4.0 with its code samples also MIT. bellows-voice and bellowsjs are MIT, installed by you as optional peers.

## What is verified, and what is not

### Verified on this machine

| check | result |
|---|---|
| `npx vitest run packages/lipsync` | 32 of 32 tests pass, one a fast-check property (counted) |
| viseme weights stay non negative, sum to 1 or less, and change by less than 0.05 over 0.1 ms over random segment lists | property holds (computed) |
| a 60 ms PP between two aa vowels | above 0.9 at its middle (computed) |
| synthetic spectra pick ee for 2.5 to 4 kHz, oh and ou for 300 to 500 Hz, aa for 0.5 to 1.5 kHz | pass (computed) |
| bellows-voice phoneme list, aliases and 97 IPA symbols map to a viseme other than sil | 53 sounds, 5 aliases, 97 symbols (counted) |
| a real bellows-voice plan: one event per sounding span, no sil mid span, an m between vowels closes the lips | 0.9 on the timeline, 0.55 after the output follower (computed) |
| bellows-voice `TractModel` postures for all 53 sounds: strongest viseme matches the place, VRM vowels shut under p, b and m | pass (computed) |
| a real engine track, frames reading the viseme of the labelled phoneme | 48 of 90 sounding frames (measured) |
| a 2D face from Chrome system voice word events in headless Chrome | mouth open on 200 frames (measured) |
| the bellows articulator probe in Chrome | open on 293 of 371 frames, lips shut on 30 (measured) |

### Not verified by anything

- No real speech audio from a microphone has gone through it; the band thresholds come from formant ranges, not fitted.
- Nobody has watched a face driven by it or listened for sync; the browser checks count open and shut frames only.
- Dominance values and viseme to vowel weights were chosen by eye; the articulatory thresholds have not been tuned on a face.
- The letter rules are English only.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 6,021 bytes | 6,322 bytes |
| `dist/lipsync.iife.js` (single file build) | 9,774 bytes | 10,262 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.
