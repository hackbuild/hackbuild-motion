# index

## Interfaces

### LimbChain

A named chain of nodes from root to tip, with the direction its middle joint bends.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-bones"></a> `bones` | `number`[] | Node indices from root to tip. |
| <a id="property-name"></a> `name` | `string` | LF, RF, LH, RH, tail, earL, earR, spine, neck, head. |
| <a id="property-pole"></a> `pole` | [`Vec3`](#vec3) | Unit direction the middle joint bends toward. |
| <a id="property-region"></a> `region` | `"Front"` \| `"Hind"` \| `"Tail"` \| `"Ear"` \| `"Spine"` \| `"Neck"` \| `"Head"` | - |
| <a id="property-side"></a> `side` | `"left"` \| `"right"` \| `null` | - |

***

### RestReport

What `analyzeRest` found about a rest pose: the turn, scale and floor that bring it into the normalized space, and the arm and leg fixes toward a T pose.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-apose"></a> `aPose` | `boolean` | - |
| <a id="property-armdown"></a> `armDown` | \[`number`, `number`\] | Upper arm angle below horizontal, degrees, left and right. |
| <a id="property-armfix"></a> `armFix` | \[[`Quat`](#quat), [`Quat`](#quat)\] | World rotations (fixed frame) that lift each upper arm into the T pose. |
| <a id="property-fix"></a> `fix` | [`Quat`](#quat) | Rotation that turns the rig to face +Z with +Y up and its left on +X. |
| <a id="property-floor"></a> `floor` | `number` | Lowest foot joint after fix and scale, meters; subtract to stand on y = 0. |
| <a id="property-height"></a> `height` | `number` | Head joint height above the lowest foot joint, source units. |
| <a id="property-hipsheight"></a> `hipsHeight` | `number` | - |
| <a id="property-legfix"></a> `legFix` | \[[`Quat`](#quat), [`Quat`](#quat)\] | - |
| <a id="property-legsplay"></a> `legSplay` | \[`number`, `number`\] | - |
| <a id="property-scale"></a> `scale` | `number` | Source units to meters. |
| <a id="property-units"></a> `units` | [`Units`](#units) | - |

***

### RigMapReport

The result of `mapRig`: the humanoid bone of each source node, what is missing or unmapped, the dialect, and the share of required bones found.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-ambiguous"></a> `ambiguous` | `object`[] | Candidates that lost a bone to a better one. |
| <a id="property-bones-1"></a> `bones` | ( \| `"hips"` \| `"spine"` \| `"chest"` \| `"upperChest"` \| `"neck"` \| `"head"` \| `"leftEye"` \| `"rightEye"` \| `"jaw"` \| `"leftUpperLeg"` \| `"leftLowerLeg"` \| `"leftFoot"` \| `"leftToes"` \| `"rightUpperLeg"` \| `"rightLowerLeg"` \| `"rightFoot"` \| `"rightToes"` \| `"leftShoulder"` \| `"leftUpperArm"` \| `"leftLowerArm"` \| `"leftHand"` \| `"rightShoulder"` \| `"rightUpperArm"` \| `"rightLowerArm"` \| `"rightHand"` \| `"leftThumbMetacarpal"` \| `"leftThumbProximal"` \| `"leftThumbDistal"` \| `"leftIndexProximal"` \| `"leftIndexIntermediate"` \| `"leftIndexDistal"` \| `"leftMiddleProximal"` \| `"leftMiddleIntermediate"` \| `"leftMiddleDistal"` \| `"leftRingProximal"` \| `"leftRingIntermediate"` \| `"leftRingDistal"` \| `"leftLittleProximal"` \| `"leftLittleIntermediate"` \| `"leftLittleDistal"` \| `"rightThumbMetacarpal"` \| `"rightThumbProximal"` \| `"rightThumbDistal"` \| `"rightIndexProximal"` \| `"rightIndexIntermediate"` \| `"rightIndexDistal"` \| `"rightMiddleProximal"` \| `"rightMiddleIntermediate"` \| `"rightMiddleDistal"` \| `"rightRingProximal"` \| `"rightRingIntermediate"` \| `"rightRingDistal"` \| `"rightLittleProximal"` \| `"rightLittleIntermediate"` \| `"rightLittleDistal"` \| `null`)[] | Humanoid bone per source node index, null when unmapped. |
| <a id="property-bybone"></a> `byBone` | `Partial`\<`Record`\<[`HumanBone`](bones.md#humanbone), `number`\>\> | Humanoid bone to source node index. |
| <a id="property-coverage"></a> `coverage` | `number` | Share of the 15 required bones that mapped. |
| <a id="property-deform"></a> `deform` | `object`[] | MMD D deform bones and the bone each deforms. |
| <a id="property-dialect"></a> `dialect` | [`Dialect`](#dialect) | - |
| <a id="property-helpers"></a> `helpers` | `number`[] | - |
| <a id="property-missingrequired"></a> `missingRequired` | ( \| `"hips"` \| `"spine"` \| `"chest"` \| `"upperChest"` \| `"neck"` \| `"head"` \| `"leftEye"` \| `"rightEye"` \| `"jaw"` \| `"leftUpperLeg"` \| `"leftLowerLeg"` \| `"leftFoot"` \| `"leftToes"` \| `"rightUpperLeg"` \| `"rightLowerLeg"` \| `"rightFoot"` \| `"rightToes"` \| `"leftShoulder"` \| `"leftUpperArm"` \| `"leftLowerArm"` \| `"leftHand"` \| `"rightShoulder"` \| `"rightUpperArm"` \| `"rightLowerArm"` \| `"rightHand"` \| `"leftThumbMetacarpal"` \| `"leftThumbProximal"` \| `"leftThumbDistal"` \| `"leftIndexProximal"` \| `"leftIndexIntermediate"` \| `"leftIndexDistal"` \| `"leftMiddleProximal"` \| `"leftMiddleIntermediate"` \| `"leftMiddleDistal"` \| `"leftRingProximal"` \| `"leftRingIntermediate"` \| `"leftRingDistal"` \| `"leftLittleProximal"` \| `"leftLittleIntermediate"` \| `"leftLittleDistal"` \| `"rightThumbMetacarpal"` \| `"rightThumbProximal"` \| `"rightThumbDistal"` \| `"rightIndexProximal"` \| `"rightIndexIntermediate"` \| `"rightIndexDistal"` \| `"rightMiddleProximal"` \| `"rightMiddleIntermediate"` \| `"rightMiddleDistal"` \| `"rightRingProximal"` \| `"rightRingIntermediate"` \| `"rightRingDistal"` \| `"rightLittleProximal"` \| `"rightLittleIntermediate"` \| `"rightLittleDistal"`)[] | - |
| <a id="property-unmapped"></a> `unmapped` | `number`[] | - |

***

### RigNodeInput

A bone of the source skeleton: its name and its parent's index or name.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-name-1"></a> `name` | `string` |
| <a id="property-parent"></a> `parent` | `string` \| `number` \| `null` |

## Type Aliases

### Dialect

```ts
type Dialect = 
  | "mixamo"
  | "mixamo-like"
  | "vroid"
  | "biped"
  | "unreal"
  | "blender"
  | "character-creator"
  | "smpl"
  | "mmd"
  | "generic";
```

The naming family a rig was recognised as, from its bone names.

***

### Quat

```ts
type Quat = [number, number, number, number];
```

A rotation as a unit quaternion `[x, y, z, w]`.

***

### Units

```ts
type Units = 
  | "meters"
  | "centimeters"
  | "millimeters"
  | "unknown"
  | "decimeters"
  | "inches";
```

The length unit a rig was authored in, guessed from its height.

***

### Vec3

```ts
type Vec3 = [number, number, number];
```

A point or direction as `[x, y, z]`, +Y up.

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

Where the wasm comes from: a URL or path to fetch, a Response, the bytes, or a compiled module.

## Functions

### analyzeRest()

```ts
function analyzeRest(positions): RestReport | null;
```

Rest analysis from world positions of mapped bones. Null without hips, head and arms.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `positions` | `Partial`\<`Record`\<[`HumanBone`](bones.md#humanbone), [`Vec3`](#vec3)\>\> |

#### Returns

[`RestReport`](#restreport) \| `null`

***

### goldenTrace()

```ts
function goldenTrace(seed): Float64Array;
```

The golden scenario run in wasm, for the native and wasm agreement test.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `seed` | `number` |

#### Returns

`Float64Array`

***

### limbChains()

```ts
function limbChains(nodes, rest?): LimbChain[];
```

Limb chains by name for quadrupeds and other rigs; `rest` gives measured poles.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `nodes` | readonly [`RigNodeInput`](#rignodeinput)[] |
| `rest?` | readonly [`Vec3`](#vec3)[] |

#### Returns

[`LimbChain`](#limbchain)[]

***

### load()

```ts
function load(source?): Promise<void>;
```

Loads the wasm. With no argument the inlined copy is used (works from file://).

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

Loads the wasm synchronously from bytes or a compiled module.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `source` | `ArrayBuffer` \| `Module` \| `ArrayBufferView`\<`ArrayBufferLike`\> |

#### Returns

`void`

***

### mapRig()

```ts
function mapRig(nodes): RigMapReport;
```

Maps source bone names to VRM 1.0 humanoid bones, with no per rig table.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `nodes` | readonly [`RigNodeInput`](#rignodeinput)[] |

#### Returns

[`RigMapReport`](#rigmapreport)

***

### referenceRest()

```ts
function referenceRest(): Record<HumanBone, Vec3>;
```

Reference humanoid joint positions in the normalized space (1.70 m, T pose).

#### Returns

`Record`\<[`HumanBone`](bones.md#humanbone), [`Vec3`](#vec3)\>

***

### wasmBoneNames()

```ts
function wasmBoneNames(): string[];
```

Bone names as the wasm build orders them.

#### Returns

`string`[]

## References

### ARKIT\_52

Re-exports [ARKIT_52](expressions.md#arkit_52)

***

### ARKIT\_COMPOSITES

Re-exports [ARKIT_COMPOSITES](expressions.md#arkit_composites)

***

### ArkitShape

Re-exports [ArkitShape](expressions.md#arkitshape)

***

### boneIndex

Re-exports [boneIndex](bones.md#boneindex)

***

### HUMAN\_BONES

Re-exports [HUMAN_BONES](bones.md#human_bones)

***

### HumanBone

Re-exports [HumanBone](bones.md#humanbone)

***

### isHumanBone

Re-exports [isHumanBone](bones.md#ishumanbone)

***

### MorphWeight

Re-exports [MorphWeight](expressions.md#morphweight)

***

### OCULUS\_COMPOSITES

Re-exports [OCULUS_COMPOSITES](expressions.md#oculus_composites)

***

### OCULUS\_VISEMES

Re-exports [OCULUS_VISEMES](expressions.md#oculus_visemes)

***

### oculusMorph

Re-exports [oculusMorph](expressions.md#oculusmorph)

***

### OculusViseme

Re-exports [OculusViseme](expressions.md#oculusviseme)

***

### OVERRIDE\_BLINK

Re-exports [OVERRIDE_BLINK](expressions.md#override_blink)

***

### PRESET\_ALIASES

Re-exports [PRESET_ALIASES](expressions.md#preset_aliases)

***

### REQUIRED\_BONES

Re-exports [REQUIRED_BONES](bones.md#required_bones)

***

### ResolvedExpression

Re-exports [ResolvedExpression](expressions.md#resolvedexpression)

***

### resolveExpressions

Re-exports [resolveExpressions](expressions.md#resolveexpressions)

***

### VISEME\_ARKIT

Re-exports [VISEME_ARKIT](expressions.md#viseme_arkit)

***

### VISEME\_TO\_VOWELS

Re-exports [VISEME_TO_VOWELS](expressions.md#viseme_to_vowels)

***

### VOWEL\_TO\_VISEME

Re-exports [VOWEL_TO_VISEME](expressions.md#vowel_to_viseme)

***

### VRM\_EXPRESSIONS

Re-exports [VRM_EXPRESSIONS](expressions.md#vrm_expressions)

***

### VRM\_VOWELS

Re-exports [VRM_VOWELS](expressions.md#vrm_vowels)

***

### VrmExpression

Re-exports [VrmExpression](expressions.md#vrmexpression)

***

### VrmVowel

Re-exports [VrmVowel](expressions.md#vrmvowel)
