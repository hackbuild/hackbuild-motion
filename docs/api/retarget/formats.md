# formats

## Interfaces

### FaceTrack

One expression's weight per frame, 0 to 1.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-name"></a> `name` | \| `"happy"` \| `"angry"` \| `"sad"` \| `"relaxed"` \| `"surprised"` \| `"aa"` \| `"ih"` \| `"ou"` \| `"ee"` \| `"oh"` \| `"blink"` \| `"blinkLeft"` \| `"blinkRight"` \| `"lookUp"` \| `"lookDown"` \| `"lookLeft"` \| `"lookRight"` \| `"neutral"` |
| <a id="property-weights"></a> `weights` | `Float32Array` |

***

### MotionWithFace

A humanoid motion with the expression tracks over the same frames.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-faces"></a> `faces` | [`FaceTrack`](#facetrack)[] | Expression tracks over the same frames as `motion`. |
| <a id="property-motion"></a> `motion` | [`HumanoidMotion`](index.md#humanoidmotion) | - |

***

### UnityClip

The curves of a text serialized Unity AnimationClip.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-euler"></a> `euler` | `Map`\<`string`, [`UnityKey`](#unitykey)[]\> | Transform path to `x y z` keys in degrees. |
| <a id="property-float"></a> `float` | `Map`\<`string`, [`UnityKey`](#unitykey)[]\> | Attribute, or `path/attribute` when the path is set, to one value keys. |
| <a id="property-name-1"></a> `name` | `string` | - |
| <a id="property-position"></a> `position` | `Map`\<`string`, [`UnityKey`](#unitykey)[]\> | Transform path to `x y z` keys. |
| <a id="property-rotation"></a> `rotation` | `Map`\<`string`, [`UnityKey`](#unitykey)[]\> | Transform path to `x y z w` keys. |
| <a id="property-samplerate"></a> `sampleRate` | `number` | - |

***

### UnityKey

One key of a Unity curve: time in seconds and its values.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-time"></a> `time` | `number` |
| <a id="property-value"></a> `value` | `number`[] |

## Functions

### convertUnityGeneric()

```ts
function convertUnityGeneric(c): HumanoidMotion;
```

A Unity clip of transform curves (a generic rig) as a humanoid motion.
Paths map to bones through the rig mapper by name and hierarchy. Rotations
pass through unchanged apart from the handedness flip, so the source rig
must rest in a T pose with identity bone rotations (VRoid and most rigs
exported from a VRM do). Hip travel comes from the hips position curve, in
multiples of its first frame height. Humanoid muscle clips are refused:
how a muscle turns a bone depends on per avatar constants Unity does not
publish.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `c` | [`UnityClip`](#unityclip) |

#### Returns

[`HumanoidMotion`](index.md#humanoidmotion)

***

### faceTracks()

```ts
function faceTracks(morphs, frames): FaceTrack[];
```

VMD morph keys as expression tracks at 30 fps over `frames` frames. Morph
names map to presets through the `@hackbuild/rig` alias table; when several
morphs feed one preset, the one with the most keys plays. Weights are
linear between keys and held past the ends; a track that stays at 0 is
left out.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `morphs` | `object`[] |
| `frames` | `number` |

#### Returns

[`FaceTrack`](#facetrack)[]

***

### isHumanoidClip()

```ts
function isHumanoidClip(c): boolean;
```

True when the clip drives a humanoid avatar through muscle curves.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `c` | [`UnityClip`](#unityclip) |

#### Returns

`boolean`

***

### isPosingDesktop()

```ts
function isPosingDesktop(text): boolean;
```

True for a `.vpd` written by a posing tool as JSON (a Unity humanoid pose)
rather than MikuMikuDance's text pose. The two share the extension.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |

#### Returns

`boolean`

***

### parseUnityAnim()

```ts
function parseUnityAnim(text): UnityClip;
```

Reads a Unity `.anim` saved as text (Force Text serialization). Keys keep
their values; tangents are dropped and the curves sample linearly.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |

#### Returns

[`UnityClip`](#unityclip)

***

### parseVpd()

```ts
function parseVpd(bytes, decode?): HumanoidMotion;
```

A MikuMikuDance pose (`.vpd`, Shift-JIS text) as a one frame motion. Foot
IK bones in the pose are solved as in a VMD.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `bytes` | `Uint8Array` | `undefined` |
| `decode?` | (`b`) => `string` | `sjis` |

#### Returns

[`HumanoidMotion`](index.md#humanoidmotion)

***

### readVmd()

```ts
function readVmd(bytes, decode?): MotionWithFace;
```

A VMD as a humanoid motion and its face. Legs keyed only by foot IK bones
are solved; a face only file gives a still body as long as its face.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `bytes` | `Uint8Array` | `undefined` |
| `decode?` | (`b`) => `string` | `sjis` |

#### Returns

[`MotionWithFace`](#motionwithface)
