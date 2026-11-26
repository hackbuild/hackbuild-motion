# bellows

## Interfaces

### BellowsPhrase

A breath group, as bellows-voice's `SungPhrase` (only the spans are read).

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-spans"></a> `spans` | readonly [`BellowsSpan`](#bellowsspan)[] |

***

### BellowsPlan

A plan, as bellows-voice's `SungPlan` or `SingResult`.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-phrases"></a> `phrases` | readonly [`BellowsPhrase`](#bellowsphrase)[] |

***

### BellowsSpan

One timed sound, as bellows-voice's `SungSpan`: a single IPA phoneme or a `beat:` id, seconds.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-end"></a> `end` | `number` |
| <a id="property-ipa"></a> `ipa` | `string` |
| <a id="property-kind"></a> `kind?` | `string` |
| <a id="property-start"></a> `start` | `number` |

## Variables

### BEAT\_PREFIX

```ts
const BEAT_PREFIX: "beat:" = "beat:";
```

The prefix bellows-voice puts on a beatbox span's id.

***

### BEAT\_VISEMES

```ts
const BEAT_VISEMES: Record<string, OculusViseme>;
```

Beatbox sounds (bellows-voice `VOCAL_BEATS` ids) to the viseme their
mouth makes, chosen from each sound's place (inferred). `>` marks an
accented beat and is ignored.

***

### BELLOWS\_VOICE\_COMMIT

```ts
const BELLOWS_VOICE_COMMIT: "ac30dc229f492ecb6bd80b2ea0f71c6a370b368c" = "ac30dc229f492ecb6bd80b2ea0f71c6a370b368c";
```

The git commit of the pinned bellows-voice release.

***

### BELLOWS\_VOICE\_VERSION

```ts
const BELLOWS_VOICE_VERSION: "0.8.0" = "0.8.0";
```

The bellows-voice npm release the optional peer pins; the commit is its gitHead.

***

### BELLOWSJS\_VERSION

```ts
const BELLOWSJS_VERSION: "0.5.0" = "0.5.0";
```

The bellowsjs version bellows-voice 0.8.0 runs on.

## Functions

### fromSpans()

```ts
function fromSpans(spans, offset?): SpeechEvent[];
```

Spans to lipsync events, shifted by `offset` seconds (0 for a live
plan already on the AudioContext clock, the play time for an offline
render). Bellows' pause `_` makes no event, so the mouth rests in the
gap; a beat span becomes the viseme of its sound.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `spans` | readonly [`BellowsSpan`](#bellowsspan)[] | `undefined` |
| `offset?` | `number` | `0` |

#### Returns

[`SpeechEvent`](index.md#speechevent)[]

***

### fromSungPlan()

```ts
function fromSungPlan(plan, offset?): SpeechEvent[];
```

Every span of every phrase of a plan, as `fromSpans`.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `plan` | [`BellowsPlan`](#bellowsplan) | `undefined` |
| `offset?` | `number` | `0` |

#### Returns

[`SpeechEvent`](index.md#speechevent)[]
