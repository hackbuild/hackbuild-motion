# expressions

## Interfaces

### MorphWeight

A morph target name and the weight it gets in an expression.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-morph"></a> `morph` | `string` |
| <a id="property-weight"></a> `weight` | `number` |

***

### ResolvedExpression

How one expression preset binds to a model's morphs, and where that binding came from.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-binds"></a> `binds` | [`MorphWeight`](#morphweight)[] | Morphs and weights that make the preset, by morph name as found. |
| <a id="property-source"></a> `source` | `"preset"` \| `"alias"` \| `"arkit"` \| `"oculus"` | Where the binding came from. |

## Type Aliases

### ArkitShape

```ts
type ArkitShape = typeof ARKIT_52[number];
```

One ARKit face blendshape name.

***

### OculusViseme

```ts
type OculusViseme = typeof OCULUS_VISEMES[number];
```

One Oculus viseme.

***

### VrmExpression

```ts
type VrmExpression = typeof VRM_EXPRESSIONS[number];
```

One VRM 1.0 expression preset.

***

### VrmVowel

```ts
type VrmVowel = typeof VRM_VOWELS[number];
```

One VRM mouth vowel preset.

## Variables

### ARKIT\_52

```ts
const ARKIT_52: readonly ["eyeBlinkLeft", "eyeLookDownLeft", "eyeLookInLeft", "eyeLookOutLeft", "eyeLookUpLeft", "eyeSquintLeft", "eyeWideLeft", "eyeBlinkRight", "eyeLookDownRight", "eyeLookInRight", "eyeLookOutRight", "eyeLookUpRight", "eyeSquintRight", "eyeWideRight", "jawForward", "jawLeft", "jawRight", "jawOpen", "mouthClose", "mouthFunnel", "mouthPucker", "mouthLeft", "mouthRight", "mouthSmileLeft", "mouthSmileRight", "mouthFrownLeft", "mouthFrownRight", "mouthDimpleLeft", "mouthDimpleRight", "mouthStretchLeft", "mouthStretchRight", "mouthRollLower", "mouthRollUpper", "mouthShrugLower", "mouthShrugUpper", "mouthPressLeft", "mouthPressRight", "mouthLowerDownLeft", "mouthLowerDownRight", "mouthUpperUpLeft", "mouthUpperUpRight", "browDownLeft", "browDownRight", "browInnerUp", "browOuterUpLeft", "browOuterUpRight", "cheekPuff", "cheekSquintLeft", "cheekSquintRight", "noseSneerLeft", "noseSneerRight", "tongueOut"];
```

The 52 ARKit face blendshape names.

***

### ARKIT\_COMPOSITES

```ts
const ARKIT_COMPOSITES: Record<VrmExpression, readonly MorphWeight[]>;
```

Presets built from ARKit blendshapes when no single morph matches.

***

### OCULUS\_COMPOSITES

```ts
const OCULUS_COMPOSITES: Partial<Record<VrmExpression, readonly MorphWeight[]>>;
```

Presets built from Oculus viseme morphs when nothing else matches.

***

### OCULUS\_VISEMES

```ts
const OCULUS_VISEMES: readonly ["sil", "PP", "FF", "TH", "DD", "kk", "CH", "SS", "nn", "RR", "aa", "E", "I", "O", "U"];
```

The 15 Oculus visemes, silence first.

***

### OVERRIDE\_BLINK

```ts
const OVERRIDE_BLINK: readonly VrmExpression[];
```

Presets whose source smile already closes the eyes, so blink should blend down.

***

### PRESET\_ALIASES

```ts
const PRESET_ALIASES: Record<VrmExpression, readonly string[]>;
```

Single morph names that stand for a preset, first match wins. Matching
ignores case and every character that is not a letter, digit or CJK.
"frown" belongs to sad only, so angry and sad never claim one morph.

***

### VISEME\_ARKIT

```ts
const VISEME_ARKIT: Partial<Record<OculusViseme, readonly object[]>>;
```

ARKit shapes a lip consonant drives on top of the vowel composites, as
a share of its viseme weight: closed lips for PP, the lower lip rolled
in under the teeth for FF. Chosen by eye, not measured.

***

### VISEME\_TO\_VOWELS

```ts
const VISEME_TO_VOWELS: Record<OculusViseme, Partial<Record<VrmVowel, number>>>;
```

Oculus visemes as weights on the five VRM vowels, for driving a VRM from
a viseme stream. Consonants map to a partly open mouth shape; silence and
the closed lips of PP to nothing. Weights chosen for this library by eye,
not measured.

***

### VOWEL\_TO\_VISEME

```ts
const VOWEL_TO_VISEME: Record<VrmVowel, OculusViseme>;
```

The Oculus viseme that stands for each VRM vowel.

***

### VRM\_EXPRESSIONS

```ts
const VRM_EXPRESSIONS: readonly ["happy", "angry", "sad", "relaxed", "surprised", "aa", "ih", "ou", "ee", "oh", "blink", "blinkLeft", "blinkRight", "lookUp", "lookDown", "lookLeft", "lookRight", "neutral"];
```

The VRM 1.0 expression presets.

***

### VRM\_VOWELS

```ts
const VRM_VOWELS: readonly ["aa", "ih", "ou", "ee", "oh"];
```

The five VRM mouth vowel presets.

## Functions

### oculusMorph()

```ts
function oculusMorph(v): string;
```

Morph name used for an Oculus viseme on Ready Player Me style models.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `v` | \| `"aa"` \| `"sil"` \| `"PP"` \| `"FF"` \| `"TH"` \| `"DD"` \| `"kk"` \| `"CH"` \| `"SS"` \| `"nn"` \| `"RR"` \| `"E"` \| `"I"` \| `"O"` \| `"U"` |

#### Returns

`string`

***

### resolveExpressions()

```ts
function resolveExpressions(morphNames): Partial<Record<VrmExpression, ResolvedExpression>>;
```

Resolves every VRM preset against a model's morph names. A morph name
found on several meshes binds on all of them; the caller applies each
bind to every mesh that carries that name.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `morphNames` | `Iterable`\<`string`\> |

#### Returns

`Partial`\<`Record`\<[`VrmExpression`](#vrmexpression), [`ResolvedExpression`](#resolvedexpression)\>\>
