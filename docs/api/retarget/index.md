# index

## Classes

### RetargetRig

A mapped and measured skeleton: facing, units, per bone rest alignment.

#### Constructors

##### Constructor

```ts
new RetargetRig(skeleton, opts?): RetargetRig;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `skeleton` | [`Skeleton`](#skeleton) |
| `opts?` | \{ `unit?`: `number`; \} |
| `opts.unit?` | `number` |

###### Returns

[`RetargetRig`](#retargetrig)

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-core"></a> `core` | `readonly` | `Rig` |
| <a id="property-skeleton"></a> `skeleton` | `readonly` | [`Skeleton`](#skeleton) |

#### Accessors

##### hipsHeight

###### Get Signature

```ts
get hipsHeight(): number;
```

###### Returns

`number`

##### unit

###### Get Signature

```ts
get unit(): number;
```

###### Returns

`number`

#### Methods

##### bind()

```ts
bind(motion): Clip;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `motion` | [`HumanoidMotion`](#humanoidmotion) |

###### Returns

[`Clip`](#clip)

##### bones()

```ts
bones(): (
  | "hips"
  | "spine"
  | "chest"
  | "upperChest"
  | "neck"
  | "head"
  | "leftEye"
  | "rightEye"
  | "jaw"
  | "leftUpperLeg"
  | "leftLowerLeg"
  | "leftFoot"
  | "leftToes"
  | "rightUpperLeg"
  | "rightLowerLeg"
  | "rightFoot"
  | "rightToes"
  | "leftShoulder"
  | "leftUpperArm"
  | "leftLowerArm"
  | "leftHand"
  | "rightShoulder"
  | "rightUpperArm"
  | "rightLowerArm"
  | "rightHand"
  | "leftThumbMetacarpal"
  | "leftThumbProximal"
  | "leftThumbDistal"
  | "leftIndexProximal"
  | "leftIndexIntermediate"
  | "leftIndexDistal"
  | "leftMiddleProximal"
  | "leftMiddleIntermediate"
  | "leftMiddleDistal"
  | "leftRingProximal"
  | "leftRingIntermediate"
  | "leftRingDistal"
  | "leftLittleProximal"
  | "leftLittleIntermediate"
  | "leftLittleDistal"
  | "rightThumbMetacarpal"
  | "rightThumbProximal"
  | "rightThumbDistal"
  | "rightIndexProximal"
  | "rightIndexIntermediate"
  | "rightIndexDistal"
  | "rightMiddleProximal"
  | "rightMiddleIntermediate"
  | "rightMiddleDistal"
  | "rightRingProximal"
  | "rightRingIntermediate"
  | "rightRingDistal"
  | "rightLittleProximal"
  | "rightLittleIntermediate"
  | "rightLittleDistal"
  | null)[];
```

Humanoid bone per joint, null when unmapped.

###### Returns

(
  \| `"hips"`
  \| `"spine"`
  \| `"chest"`
  \| `"upperChest"`
  \| `"neck"`
  \| `"head"`
  \| `"leftEye"`
  \| `"rightEye"`
  \| `"jaw"`
  \| `"leftUpperLeg"`
  \| `"leftLowerLeg"`
  \| `"leftFoot"`
  \| `"leftToes"`
  \| `"rightUpperLeg"`
  \| `"rightLowerLeg"`
  \| `"rightFoot"`
  \| `"rightToes"`
  \| `"leftShoulder"`
  \| `"leftUpperArm"`
  \| `"leftLowerArm"`
  \| `"leftHand"`
  \| `"rightShoulder"`
  \| `"rightUpperArm"`
  \| `"rightLowerArm"`
  \| `"rightHand"`
  \| `"leftThumbMetacarpal"`
  \| `"leftThumbProximal"`
  \| `"leftThumbDistal"`
  \| `"leftIndexProximal"`
  \| `"leftIndexIntermediate"`
  \| `"leftIndexDistal"`
  \| `"leftMiddleProximal"`
  \| `"leftMiddleIntermediate"`
  \| `"leftMiddleDistal"`
  \| `"leftRingProximal"`
  \| `"leftRingIntermediate"`
  \| `"leftRingDistal"`
  \| `"leftLittleProximal"`
  \| `"leftLittleIntermediate"`
  \| `"leftLittleDistal"`
  \| `"rightThumbMetacarpal"`
  \| `"rightThumbProximal"`
  \| `"rightThumbDistal"`
  \| `"rightIndexProximal"`
  \| `"rightIndexIntermediate"`
  \| `"rightIndexDistal"`
  \| `"rightMiddleProximal"`
  \| `"rightMiddleIntermediate"`
  \| `"rightMiddleDistal"`
  \| `"rightRingProximal"`
  \| `"rightRingIntermediate"`
  \| `"rightRingDistal"`
  \| `"rightLittleProximal"`
  \| `"rightLittleIntermediate"`
  \| `"rightLittleDistal"`
  \| `null`)[]

##### dispose()

```ts
dispose(): void;
```

###### Returns

`void`

##### retargetPose()

```ts
retargetPose(
   src, 
   worldR, 
   worldP
): object;
```

One pose from `src` (joint world rotations and positions) as this rig's locals.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `src` | [`RetargetRig`](#retargetrig) |
| `worldR` | `Float64Array` |
| `worldP` | `Float64Array` |

###### Returns

`object`

| Name | Type |
| ------ | ------ |
| `rotations` | `Float64Array` |
| `translations` | `Float64Array` |

##### toHumanoid()

```ts
toHumanoid(clip, opts?): HumanoidMotion;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `clip` | [`Clip`](#clip) |
| `opts?` | \{ `settle?`: `boolean`; `startAtOrigin?`: `boolean`; \} |
| `opts.settle?` | `boolean` |
| `opts.startAtOrigin?` | `boolean` |

###### Returns

[`HumanoidMotion`](#humanoidmotion)

## Interfaces

### Clip

Local rotations and translations per frame.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-moves"></a> `moves` | `Uint8Array` | 1 for joints whose translation is keyed. |
| <a id="property-rotations"></a> `rotations` | `Float64Array` | `frames x joints x 4`. |
| <a id="property-times"></a> `times` | `Float64Array` | - |
| <a id="property-translations"></a> `translations` | `Float64Array` | `frames x joints x 3`. |

***

### HumanoidMotion

The interchange format: per humanoid bone, local rotations in the
normalized space (identity rest, +Z forward, left on +X), and hip travel
in multiples of hip height.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-hips"></a> `hips?` | `Float64Array`\<`ArrayBufferLike`\> | Hips offset from rest, `frames x 3`, in hip heights. |
| <a id="property-rotations-1"></a> `rotations` | `Partial`\<`Record`\<[`HumanBone`](#humanbone), `Float64Array`\>\> | `frames x 4` per keyed bone. |
| <a id="property-times-1"></a> `times` | `Float64Array` | - |

***

### MotionFindings

What `analyzeMotion` finds in a motion: duration, loop, head pitch, energy and tags.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-duration"></a> `duration` | `number` | - |
| <a id="property-energy"></a> `energy` | `number` | Hand and hip travel per second, in hip heights. |
| <a id="property-headpitch"></a> `headPitch` | `number` | Mean head pitch relative to the hips, radians. |
| <a id="property-looping"></a> `looping` | `boolean` | - |
| <a id="property-pose"></a> `pose` | `boolean` | - |
| <a id="property-tags"></a> `tags` | `string`[] | - |

***

### Skeleton

Joints with rest transforms; parents come before children.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-names"></a> `names` | `string`[] | - |
| <a id="property-parents"></a> `parents` | `Int32Array` | Parent index per joint, -1 for a root. |
| <a id="property-restr"></a> `restR` | `Float64Array` | Rest rotation `x y z w` per joint. |
| <a id="property-restt"></a> `restT` | `Float64Array` | Rest translation `x y z` per joint. |

***

### VmdMotion

A parsed VMD file: its skeleton, its clip, the unit in meters and its morph keys.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-clip"></a> `clip` | [`Clip`](#clip) | - |
| <a id="property-morphs"></a> `morphs` | `object`[] | - |
| <a id="property-skeleton-1"></a> `skeleton` | [`Skeleton`](#skeleton) | - |
| <a id="property-unit"></a> `unit` | `number` | Meters per MMD unit; pass to `RetargetRig` as `unit`. |

## Type Aliases

### HumanBone

```ts
type HumanBone = typeof HUMAN_BONES[number];
```

One VRM 1.0 humanoid bone name.

***

### WasmSource

```ts
type WasmSource = 
  | URL
  | string
  | Response
  | ArrayBuffer
  | ArrayBufferView
  | WebAssembly.Module;
```

Where the wasm core comes from: a URL to fetch, a Response, bytes or a compiled module.

## Functions

### analyzeMotion()

```ts
function analyzeMotion(m): MotionFindings;
```

Tags a motion by what the body does: wave, squat, nod, spin, walk, dance, idle and more.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `m` | [`HumanoidMotion`](#humanoidmotion) |

#### Returns

[`MotionFindings`](#motionfindings)

***

### goldenTrace()

```ts
function goldenTrace(seed): Float64Array;
```

A deterministic trace of the core for one seed, compared between the native and wasm builds in tests.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `seed` | `number` |

#### Returns

`Float64Array`

***

### load()

```ts
function load(source?): Promise<void>;
```

Loads the wasm core once: from a URL, bytes or a compiled module, or from the inlined copy when you pass nothing. Call it before anything else.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `source?` | [`WasmSource`](#wasmsource) |

#### Returns

`Promise`\<`void`\>

***

### loadSync()

```ts
function loadSync(source): void;
```

Loads the wasm core synchronously from bytes or a compiled module.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `source` | `ArrayBuffer` \| `Module` \| `ArrayBufferView`\<`ArrayBufferLike`\> |

#### Returns

`void`

***

### packMotion()

```ts
function packMotion(m): Uint8Array;
```

The compact binary form (`HBM1`, f32, about 16 bytes per bone per frame).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `m` | [`HumanoidMotion`](#humanoidmotion) |

#### Returns

`Uint8Array`

***

### parseBvh()

```ts
function parseBvh(text): object;
```

Parses a BVH file.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |

#### Returns

`object`

| Name | Type |
| ------ | ------ |
| `clip` | [`Clip`](#clip) |
| `skeleton` | [`Skeleton`](#skeleton) |

***

### parseVmd()

```ts
function parseVmd(bytes, decode?): VmdMotion;
```

Parses a MikuMikuDance VMD file. Bone and morph names are Shift-JIS; the
default decoder is `TextDecoder("shift_jis")`, present in browsers and in
Node with full ICU.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `bytes` | `Uint8Array` |
| `decode?` | (`b`) => `string` |

#### Returns

[`VmdMotion`](#vmdmotion)

***

### referenceSkeleton()

```ts
function referenceSkeleton(): Skeleton;
```

The 1.70 m reference humanoid as a skeleton with VRM bone names.

#### Returns

[`Skeleton`](#skeleton)

***

### restFromFirstFrame()

```ts
function restFromFirstFrame(skeleton, clip): 
  | {
  clip: Clip;
  skeleton: Skeleton;
}
  | null;
```

When the first frame is the better T pose: that frame as the rest and the clip without it.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `skeleton` | [`Skeleton`](#skeleton) |
| `clip` | [`Clip`](#clip) |

#### Returns

  \| \{
  `clip`: [`Clip`](#clip);
  `skeleton`: [`Skeleton`](#skeleton);
\}
  \| `null`

***

### retargetClip()

```ts
function retargetClip(
   src, 
   clip, 
   dst, 
   opts?
): Clip;
```

Retargets `clip` from one skeleton onto another.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `src` | [`Skeleton`](#skeleton) |
| `clip` | [`Clip`](#clip) |
| `dst` | [`Skeleton`](#skeleton) |
| `opts?` | \{ `dstUnit?`: `number`; `srcUnit?`: `number`; \} |
| `opts.dstUnit?` | `number` |
| `opts.srcUnit?` | `number` |

#### Returns

[`Clip`](#clip)

***

### retargetLimb()

```ts
function retargetLimb(
   srcTop, 
   srcEnd, 
   srcLength, 
   dstTop, 
   dstLength
): [number, number, number];
```

End effector target for a limb of another length.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `srcTop` | \[`number`, `number`, `number`\] |
| `srcEnd` | \[`number`, `number`, `number`\] |
| `srcLength` | `number` |
| `dstTop` | \[`number`, `number`, `number`\] |
| `dstLength` | `number` |

#### Returns

\[`number`, `number`, `number`\]

***

### settleOnFloor()

```ts
function settleOnFloor(m): object;
```

Settles a motion on the floor; returns the shifted motion and the shift in meters.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `m` | [`HumanoidMotion`](#humanoidmotion) |

#### Returns

`object`

| Name | Type |
| ------ | ------ |
| `motion` | [`HumanoidMotion`](#humanoidmotion) |
| `shift` | `number` |

***

### unpackMotion()

```ts
function unpackMotion(bytes): HumanoidMotion | null;
```

Reads the compact binary form back into a motion; null when the bytes are not that form.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `bytes` | `Uint8Array` |

#### Returns

[`HumanoidMotion`](#humanoidmotion) \| `null`
