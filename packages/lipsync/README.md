# @hackbuild/lipsync

A viseme driver for talking characters. Timed speech events from a TTS
engine build a timeline that is sampled with coarticulation; when no
timings exist, the audio level moves the jaw. Output goes to the 15 Oculus
visemes, the five VRM vowels or ARKit blendshapes through the one
expression and viseme table in `@hackbuild/rig`.

- `SpeechEvent`: `word`, `phoneme`, `viseme` and `end` events on the
  caller's clock in seconds, the shape `@hackbuild/speak` style engines
  report. Phonemes may be ARPAbet (stress digits allowed), IPA or Oculus
  names.
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

### Not verified by anything

- No real TTS engine's events or real speech audio have gone through it;
  the band thresholds are inferred from formant ranges, not fitted.
- Nobody has watched a face driven by it in a browser; listed in
  `docs/browser-checks.md`.
- Dominance values and viseme to vowel weights were chosen by eye.
- The letter rules are English only.

## Size budget

| file | raw | gzip |
|---|---|---|
| `lipsync.iife.js` | 17,284 bytes | 6,274 bytes |

Measured 2026-11-22. Budget: under 32 KB raw.

## Licence

Code MIT (`LICENSE` at the repository root). This README is CC-BY-4.0, its
code samples also MIT.
