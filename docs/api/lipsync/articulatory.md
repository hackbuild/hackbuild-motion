# articulatory

## Interfaces

### ArticulatorFrame

Vocal tract state at one instant, in the units of bellows-voice's articulator probe.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-jaw"></a> `jaw` | `number` | Jaw opening, cm of arc at the incisors (about -0.1 closed to 2.6 wide). |
| <a id="property-labiodental"></a> `labiodental` | `number` | Lower lip against the upper teeth, 0 to 1. |
| <a id="property-lipaperture"></a> `lipAperture` | `number` | Lip opening, cm; under 0 is pressed shut. |
| <a id="property-lipprotrusion"></a> `lipProtrusion` | `number` | Lip rounding forward, cm (0 spread to about 1.4 for u). |
| <a id="property-lipwidth"></a> `lipWidth` | `number` | Lip corners, 0 rounded to 1 spread. |
| <a id="property-sounding"></a> `sounding?` | `number` \| `boolean` | True or 1 while the voice sounds, false or 0 when it holds its last state. Absent means sounding. |
| <a id="property-tonguebodyx"></a> `tongueBodyX` | `number` | Tongue body centre, cm. |
| <a id="property-tonguebodyy"></a> `tongueBodyY` | `number` | - |
| <a id="property-tonguetipx"></a> `tongueTipX` | `number` | Tongue tip, cm. |
| <a id="property-tonguetipy"></a> `tongueTipY` | `number` | - |
| <a id="property-velum"></a> `velum` | `number` | Velar port, cm^2; under 0 is closed. |

***

### ArticulatorProbeLike

The parts of a bellows-voice `ArticulatorProbe` this file reads.

#### Methods

##### heard()

```ts
heard(): ArticulatorFrame | null;
```

The frame playing out of the speakers now, null before the first.

###### Returns

[`ArticulatorFrame`](#articulatorframe) \| `null`

***

### MouthChannels

The mouth channels the report maps from articulators, each 0 to 1.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-alveolar"></a> `alveolar` | `number` |
| <a id="property-closure"></a> `closure` | `number` |
| <a id="property-dental"></a> `dental` | `number` |
| <a id="property-labiodental-1"></a> `labiodental` | `number` |
| <a id="property-nasal"></a> `nasal` | `number` |
| <a id="property-open"></a> `open` | `number` |
| <a id="property-postalveolar"></a> `postalveolar` | `number` |
| <a id="property-retroflex"></a> `retroflex` | `number` |
| <a id="property-round"></a> `round` | `number` |
| <a id="property-sibilant"></a> `sibilant` | `number` |
| <a id="property-spread"></a> `spread` | `number` |
| <a id="property-velar"></a> `velar` | `number` |

***

### TractModelLike

The bellows-voice `TractModel` method this file reads.

#### Methods

##### postureByName()

```ts
postureByName(): Record<string, number>;
```

###### Returns

`Record`\<`string`, `number`\>

## Variables

### VOWEL\_POINTS

```ts
const VOWEL_POINTS: Record<VrmVowel, readonly [open: number, round: number, spread: number]>;
```

The five VRM vowel presets as points in (open, round, spread), taken
from bellows-voice's own targets: aa the open back vowel, ee the mean of
e and the open-mid front vowel, ih the close front vowel, oh o, ou u.

## Functions

### arkitFromChannels()

```ts
function arkitFromChannels(c, out?): Map<
  | "eyeBlinkLeft"
  | "eyeLookDownLeft"
  | "eyeLookInLeft"
  | "eyeLookOutLeft"
  | "eyeLookUpLeft"
  | "eyeSquintLeft"
  | "eyeWideLeft"
  | "eyeBlinkRight"
  | "eyeLookDownRight"
  | "eyeLookInRight"
  | "eyeLookOutRight"
  | "eyeLookUpRight"
  | "eyeSquintRight"
  | "eyeWideRight"
  | "jawForward"
  | "jawLeft"
  | "jawRight"
  | "jawOpen"
  | "mouthClose"
  | "mouthFunnel"
  | "mouthPucker"
  | "mouthLeft"
  | "mouthRight"
  | "mouthSmileLeft"
  | "mouthSmileRight"
  | "mouthFrownLeft"
  | "mouthFrownRight"
  | "mouthDimpleLeft"
  | "mouthDimpleRight"
  | "mouthStretchLeft"
  | "mouthStretchRight"
  | "mouthRollLower"
  | "mouthRollUpper"
  | "mouthShrugLower"
  | "mouthShrugUpper"
  | "mouthPressLeft"
  | "mouthPressRight"
  | "mouthLowerDownLeft"
  | "mouthLowerDownRight"
  | "mouthUpperUpLeft"
  | "mouthUpperUpRight"
  | "browDownLeft"
  | "browDownRight"
  | "browInnerUp"
  | "browOuterUpLeft"
  | "browOuterUpRight"
  | "cheekPuff"
  | "cheekSquintLeft"
  | "cheekSquintRight"
  | "noseSneerLeft"
  | "noseSneerRight"
| "tongueOut", number>;
```

ARKit blendshape weights straight from the channels: jawOpen from the jaw, mouthClose from the lip closure, pucker
when rounded with a small aperture and funnel when rounded and open,
stretch and a little smile when spread, mouthRollLower for f and v,
tongueOut for th.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `c` | [`MouthChannels`](#mouthchannels) |
| `out?` | `Map`\< \| `"eyeBlinkLeft"` \| `"eyeLookDownLeft"` \| `"eyeLookInLeft"` \| `"eyeLookOutLeft"` \| `"eyeLookUpLeft"` \| `"eyeSquintLeft"` \| `"eyeWideLeft"` \| `"eyeBlinkRight"` \| `"eyeLookDownRight"` \| `"eyeLookInRight"` \| `"eyeLookOutRight"` \| `"eyeLookUpRight"` \| `"eyeSquintRight"` \| `"eyeWideRight"` \| `"jawForward"` \| `"jawLeft"` \| `"jawRight"` \| `"jawOpen"` \| `"mouthClose"` \| `"mouthFunnel"` \| `"mouthPucker"` \| `"mouthLeft"` \| `"mouthRight"` \| `"mouthSmileLeft"` \| `"mouthSmileRight"` \| `"mouthFrownLeft"` \| `"mouthFrownRight"` \| `"mouthDimpleLeft"` \| `"mouthDimpleRight"` \| `"mouthStretchLeft"` \| `"mouthStretchRight"` \| `"mouthRollLower"` \| `"mouthRollUpper"` \| `"mouthShrugLower"` \| `"mouthShrugUpper"` \| `"mouthPressLeft"` \| `"mouthPressRight"` \| `"mouthLowerDownLeft"` \| `"mouthLowerDownRight"` \| `"mouthUpperUpLeft"` \| `"mouthUpperUpRight"` \| `"browDownLeft"` \| `"browDownRight"` \| `"browInnerUp"` \| `"browOuterUpLeft"` \| `"browOuterUpRight"` \| `"cheekPuff"` \| `"cheekSquintLeft"` \| `"cheekSquintRight"` \| `"noseSneerLeft"` \| `"noseSneerRight"` \| `"tongueOut"`, `number`\> |

#### Returns

`Map`\<
  \| `"eyeBlinkLeft"`
  \| `"eyeLookDownLeft"`
  \| `"eyeLookInLeft"`
  \| `"eyeLookOutLeft"`
  \| `"eyeLookUpLeft"`
  \| `"eyeSquintLeft"`
  \| `"eyeWideLeft"`
  \| `"eyeBlinkRight"`
  \| `"eyeLookDownRight"`
  \| `"eyeLookInRight"`
  \| `"eyeLookOutRight"`
  \| `"eyeLookUpRight"`
  \| `"eyeSquintRight"`
  \| `"eyeWideRight"`
  \| `"jawForward"`
  \| `"jawLeft"`
  \| `"jawRight"`
  \| `"jawOpen"`
  \| `"mouthClose"`
  \| `"mouthFunnel"`
  \| `"mouthPucker"`
  \| `"mouthLeft"`
  \| `"mouthRight"`
  \| `"mouthSmileLeft"`
  \| `"mouthSmileRight"`
  \| `"mouthFrownLeft"`
  \| `"mouthFrownRight"`
  \| `"mouthDimpleLeft"`
  \| `"mouthDimpleRight"`
  \| `"mouthStretchLeft"`
  \| `"mouthStretchRight"`
  \| `"mouthRollLower"`
  \| `"mouthRollUpper"`
  \| `"mouthShrugLower"`
  \| `"mouthShrugUpper"`
  \| `"mouthPressLeft"`
  \| `"mouthPressRight"`
  \| `"mouthLowerDownLeft"`
  \| `"mouthLowerDownRight"`
  \| `"mouthUpperUpLeft"`
  \| `"mouthUpperUpRight"`
  \| `"browDownLeft"`
  \| `"browDownRight"`
  \| `"browInnerUp"`
  \| `"browOuterUpLeft"`
  \| `"browOuterUpRight"`
  \| `"cheekPuff"`
  \| `"cheekSquintLeft"`
  \| `"cheekSquintRight"`
  \| `"noseSneerLeft"`
  \| `"noseSneerRight"`
  \| `"tongueOut"`, `number`\>

***

### articulatoryFrame()

```ts
function articulatoryFrame(f, out?): LipFrame & object;
```

A LipFrame from articulator state, with `source` "timeline" while
sounding. Consonant visemes come from the channels and share the mouth
by sum, capped at 1; the vowels fill what is left. VRM vowels are the
vowel weights scaled by the lips' opening, so a closure shuts them.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `f` | [`ArticulatorFrame`](#articulatorframe) |
| `out?` | [`LipFrame`](index.md#lipframe) & `object` |

#### Returns

[`LipFrame`](index.md#lipframe) & `object`

***

### fromProbe()

```ts
function fromProbe(probe, out?): LipFrame & object;
```

A LipFrame from a live bellows-voice articulator probe at the time being
heard; a silent frame before the probe has sent anything.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `probe` | [`ArticulatorProbeLike`](#articulatorprobelike) |
| `out?` | [`LipFrame`](index.md#lipframe) & `object` |

#### Returns

[`LipFrame`](index.md#lipframe) & `object`

***

### fromTractModel()

```ts
function fromTractModel(m, out?): ArticulatorFrame;
```

An ArticulatorFrame from a bellows-voice `TractModel`'s current posture, read as the probe reads the engine.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `m` | [`TractModelLike`](#tractmodellike) |
| `out?` | [`ArticulatorFrame`](#articulatorframe) |

#### Returns

[`ArticulatorFrame`](#articulatorframe)

***

### mouthChannels()

```ts
function mouthChannels(f, out?): MouthChannels;
```

Channels from a frame. Constants from bellows-voice's body 0 targets and
a rendered engine track (inferred thresholds between them): jaw 0.2 at
u to 1.85 at the open o; lips shut at an aperture of -0.2 and open from
0.1; the tip reaches the ridge at 9.55 cm in the engine (target 9.68),
forward of 5.9 for t, d, n and l, at 5.55 to 5.85 for sh and ch, back of
5.95 and lower for r; s at 9.1 forward of 6; th forward of 6.55 at 8.2;
the dorsum seals the velum at 8.35.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `f` | [`ArticulatorFrame`](#articulatorframe) |
| `out?` | [`MouthChannels`](#mouthchannels) |

#### Returns

[`MouthChannels`](#mouthchannels)

***

### vowelWeights()

```ts
function vowelWeights(
   c, 
   out?, 
   width?
): Record<VrmVowel, number>;
```

Weights of the five vowels for a channel set: a softmax of negative squared distance, summing to 1.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `c` | [`MouthChannels`](#mouthchannels) | `undefined` |
| `out?` | `Record`\<`"aa"` \| `"ih"` \| `"ou"` \| `"ee"` \| `"oh"`, `number`\> | `undefined` |
| `width?` | `number` | `0.22` |

#### Returns

`Record`\<[`VrmVowel`](index.md#vrmvowel), `number`\>
