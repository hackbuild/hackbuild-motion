# index

## Classes

### LipSync

The viseme driver: timed events first, the audio level when no timings cover the moment.

#### Constructors

##### Constructor

```ts
new LipSync(opts?): LipSync;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts?` | [`LipSyncOptions`](#lipsyncoptions) |

###### Returns

[`LipSync`](#lipsync)

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-opts"></a> `opts` | `readonly` | `Required`\<[`LipSyncOptions`](#lipsyncoptions)\> |
| <a id="property-timeline"></a> `timeline` | `readonly` | [`VisemeTimeline`](#visemetimeline) |

#### Methods

##### push()

```ts
push(events): void;
```

Adds speech events to the timeline.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `events` | [`SpeechEvent`](#speechevent) \| readonly [`SpeechEvent`](#speechevent)[] |

###### Returns

`void`

##### setLevel()

```ts
setLevel(level, bands?): void;
```

Audio level (RMS 0 to 1) and optional band energies for this frame.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `level` | `number` |
| `bands?` | [`Bands`](#bands) |

###### Returns

`void`

##### stop()

```ts
stop(): void;
```

Stops speech now: clears the timeline and the level.

###### Returns

`void`

##### update()

```ts
update(t, dt): LipFrame;
```

The mouth at time `t` on the event clock, smoothed over `dt`. Timed
events win while they cover `t`; the audio level fills gaps and runs
alone when no timings arrive.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `t` | `number` |
| `dt` | `number` |

###### Returns

[`LipFrame`](#lipframe)

***

### VisemeTimeline

Timed visemes built from speech events and sampled with coarticulation.

#### Constructors

##### Constructor

```ts
new VisemeTimeline(): VisemeTimeline;
```

###### Returns

[`VisemeTimeline`](#visemetimeline)

#### Properties

| Property | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-keys"></a> `keys` | [`VisemeKey`](#visemekey)[] | `[]` |

#### Accessors

##### until

###### Get Signature

```ts
get until(): number;
```

Last end time, or -Infinity.

###### Returns

`number`

#### Methods

##### clear()

```ts
clear(): void;
```

###### Returns

`void`

##### prune()

```ts
prune(t, keep?): void;
```

Drops keys that ended before `t`.

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `t` | `number` | `undefined` |
| `keep?` | `number` | `0.5` |

###### Returns

`void`

##### push()

```ts
push(events): void;
```

Adds events. A word without `end` gets its length from its letters at
once, so the mouth moves in real time; when the next event comes before
that estimate runs out, the word's visemes are squeezed to end there.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `events` | [`SpeechEvent`](#speechevent) \| readonly [`SpeechEvent`](#speechevent)[] |

###### Returns

`void`

##### sample()

```ts
sample(
   t, 
   out, 
   blend?
): number;
```

Viseme weights at `t` into `out` (indexed like OCULUS_VISEMES). Each
key rises and falls over `blend` seconds centred on its edges; weights
share by dominance and never sum past 1. Returns the coverage, the
largest envelope at `t` (0 between utterances).

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `t` | `number` | `undefined` |
| `out` | `Float32Array` | `undefined` |
| `blend?` | `number` | `0.07` |

###### Returns

`number`

## Interfaces

### Bands

Energy in three formant bands of an audio spectrum.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-high"></a> `high` | `number` | Front vowel and fricative region, 2200 to 4500 Hz. |
| <a id="property-low"></a> `low` | `number` | Energy near the first formant of open vowels, 250 to 900 Hz. |
| <a id="property-mid"></a> `mid` | `number` | Second formant region, 900 to 2200 Hz. |

***

### ExpressionSink

Anything with `setValue(name, weight)`: an avatar ExpressionRig or a three-vrm expression manager.

#### Methods

##### setValue()

```ts
setValue(name, weight): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |
| `weight` | `number` |

###### Returns

`void`

***

### LipFrame

The mouth for one frame: viseme weights, VRM vowels, jaw openness and its source.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-open"></a> `open` | `number` | Jaw openness, 0 to 1. |
| <a id="property-source"></a> `source` | [`LipSource`](#lipsource) | - |
| <a id="property-visemes"></a> `visemes` | `Float32Array` | Indexed like OCULUS_VISEMES. |
| <a id="property-vowels"></a> `vowels` | `Record`\<[`VrmVowel`](#vrmvowel), `number`\> | - |

***

### LipSyncOptions

Timing, smoothing and gain options of `LipSync`.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-blend"></a> `blend?` | `number` | Coarticulation overlap in seconds. Default 0.07. |
| <a id="property-fall"></a> `fall?` | `number` | - |
| <a id="property-gain"></a> `gain?` | `number` | Level to openness gain. Default 6. |
| <a id="property-gate"></a> `gate?` | `number` | Audio level below this is silence. Default 0.015. |
| <a id="property-lead"></a> `lead?` | `number` | Seconds the mouth leads the sound. Default 0.04 (inferred; visible speech leads audio). |
| <a id="property-rise"></a> `rise?` | `number` | Rise and fall half-lives of the output, seconds. Defaults 0.02 and 0.06. |
| <a id="property-strength"></a> `strength?` | `number` | Output scale, 0 to 1. Default 1. |

***

### VisemeKey

One viseme on the timeline, from `start` to `end` in seconds.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-end"></a> `end` | `number` |
| <a id="property-start"></a> `start` | `number` |
| <a id="property-viseme"></a> `viseme` | \| `"sil"` \| `"PP"` \| `"FF"` \| `"TH"` \| `"DD"` \| `"kk"` \| `"CH"` \| `"SS"` \| `"nn"` \| `"RR"` \| `"aa"` \| `"E"` \| `"I"` \| `"O"` \| `"U"` |

## Type Aliases

### LipSource

```ts
type LipSource = "timeline" | "energy" | "silent";
```

What moved the mouth this frame: timed events, the audio level, or nothing.

***

### MouthTarget

```ts
type MouthTarget = "vrm" | "oculus" | "arkit";
```

The expression set `drive` writes to: VRM vowels, Oculus visemes or ARKit blendshapes.

***

### OculusViseme

```ts
type OculusViseme = typeof OCULUS_VISEMES[number];
```

One Oculus viseme.

***

### SpeechEvent

```ts
type SpeechEvent = 
  | {
  end?: number;
  text: string;
  time: number;
  type: "word";
}
  | {
  end?: number;
  phoneme: string;
  time: number;
  type: "phoneme";
}
  | {
  end?: number;
  time: number;
  type: "viseme";
  viseme: OculusViseme;
}
  | {
  time: number;
  type: "end";
};
```

Speech events on the caller's clock in seconds (an AudioContext time,
or seconds since the utterance started). `end` is optional; a word
without one lasts until the next word or an estimate from its letters.

***

### VrmVowel

```ts
type VrmVowel = typeof VRM_VOWELS[number];
```

One VRM mouth vowel preset.

## Variables

### DOMINANCE

```ts
const DOMINANCE: Record<OculusViseme, number>;
```

Dominance per viseme: how strongly a segment holds the mouth against its
neighbours (after the Cohen and Massaro coarticulation model, values
chosen for this library by eye, inferred). Lip closures and lip to teeth
contacts dominate; tongue consonants yield to the vowels around them.

***

### OCULUS\_VISEMES

```ts
const OCULUS_VISEMES: readonly ["sil", "PP", "FF", "TH", "DD", "kk", "CH", "SS", "nn", "RR", "aa", "E", "I", "O", "U"];
```

The 15 Oculus visemes, silence first.

***

### VRM\_VOWELS

```ts
const VRM_VOWELS: readonly ["aa", "ih", "ou", "ee", "oh"];
```

The five VRM mouth vowel presets.

## Functions

### bandsFromSpectrum()

```ts
function bandsFromSpectrum(
   spectrum, 
   sampleRate, 
   fftSize
): Bands;
```

Band energies from an analyser spectrum: `getFloatFrequencyData` in dB
or `getByteFrequencyData` bytes, with the context sample rate and the
FFT size.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `spectrum` | `Float32Array`\<`ArrayBufferLike`\> \| `Uint8Array`\<`ArrayBufferLike`\> |
| `sampleRate` | `number` |
| `fftSize` | `number` |

#### Returns

[`Bands`](#bands)

***

### drive()

```ts
function drive(
   sink, 
   frame, 
   target?
): void;
```

Writes a frame to a face: VRM vowel presets, `viseme_*` morphs (Ready
Player Me style), or ARKit blendshapes built from the vowel composites
plus `mouthClose` for lip closures.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `sink` | [`ExpressionSink`](#expressionsink) | `undefined` |
| `frame` | [`LipFrame`](#lipframe) | `undefined` |
| `target?` | [`MouthTarget`](#mouthtarget) | `"vrm"` |

#### Returns

`void`

***

### estimateWords()

```ts
function estimateWords(
   text, 
   start, 
   end
): SpeechEvent[];
```

Word events spread over an utterance from `start` to `end` by syllable
count, for engines that report only the utterance bounds.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |
| `start` | `number` |
| `end` | `number` |

#### Returns

[`SpeechEvent`](#speechevent)[]

***

### follow()

```ts
function follow(
   cur, 
   goal, 
   dt, 
   rise, 
   fall
): number;
```

Exponential smoothing toward a goal with separate rise and fall half-lives.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `cur` | `number` |
| `goal` | `number` |
| `dt` | `number` |
| `rise` | `number` |
| `fall` | `number` |

#### Returns

`number`

***

### phonemeToViseme()

```ts
function phonemeToViseme(p): 
  | "sil"
  | "PP"
  | "FF"
  | "TH"
  | "DD"
  | "kk"
  | "CH"
  | "SS"
  | "nn"
  | "RR"
  | "aa"
  | "E"
  | "I"
  | "O"
  | "U";
```

ARPAbet (stress digits allowed), IPA, or an Oculus viseme name, to a
viseme. Upper case ARPAbet wins, then an exact IPA symbol (so IPA y is
the rounded vowel), then lower case ARPAbet, then the first IPA letter.
Unknown gives sil.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `p` | `string` |

#### Returns

  \| `"sil"`
  \| `"PP"`
  \| `"FF"`
  \| `"TH"`
  \| `"DD"`
  \| `"kk"`
  \| `"CH"`
  \| `"SS"`
  \| `"nn"`
  \| `"RR"`
  \| `"aa"`
  \| `"E"`
  \| `"I"`
  \| `"O"`
  \| `"U"`

***

### rms()

```ts
function rms(samples): number;
```

RMS of time domain samples, as floats in -1 to 1 or analyser bytes centred on 128.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `samples` | `Float32Array`\<`ArrayBufferLike`\> \| `Uint8Array`\<`ArrayBufferLike`\> |

#### Returns

`number`

***

### syllables()

```ts
function syllables(word): number;
```

Vowel groups in a word, at least 1; used to estimate durations.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `word` | `string` |

#### Returns

`number`

***

### visemesToVowels()

```ts
function visemesToVowels(v): Record<VrmVowel, number>;
```

Oculus viseme weights to the five VRM vowels through the rig table.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `v` | `Float32Array` |

#### Returns

`Record`\<[`VrmVowel`](#vrmvowel), `number`\>

***

### vowelFromBands()

```ts
function vowelFromBands(b): Record<VrmVowel, number>;
```

A rough vowel shape from band energies (inferred from formant ranges):
strong high band means a front vowel (ee, ih), a low band with little
mid means a rounded vowel (oh, ou), otherwise an open aa.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `b` | [`Bands`](#bands) |

#### Returns

`Record`\<[`VrmVowel`](#vrmvowel), `number`\>

***

### wordToVisemes()

```ts
function wordToVisemes(word): object[];
```

Letters to visemes with relative lengths, for engines that give word
timings only. English spelling rules, rough on purpose: digraphs first,
a silent final e dropped, doubled letters merged. Vowels weigh 2,
consonants 1.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `word` | `string` |

#### Returns

`object`[]
