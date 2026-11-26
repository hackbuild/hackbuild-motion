# three

## Classes

### LiveRetarget

Copies a driver rig's pose onto a target rig every frame: play any clip
library on the driver with its own mixer, call `update()` after it.

#### Constructors

##### Constructor

```ts
new LiveRetarget(
   srcRoot, 
   dstRoot, 
   opts?
): LiveRetarget;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `srcRoot` | `Object3D` |
| `dstRoot` | `Object3D` |
| `opts?` | \{ `dstUnit?`: `number`; `srcUnit?`: `number`; \} |
| `opts.dstUnit?` | `number` |
| `opts.srcUnit?` | `number` |

###### Returns

[`LiveRetarget`](#liveretarget)

#### Methods

##### dispose()

```ts
dispose(): void;
```

###### Returns

`void`

##### update()

```ts
update(): void;
```

###### Returns

`void`

## Interfaces

### SceneSkeleton

A skeleton read from a three.js scene graph, with the scene nodes behind each joint.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-nodes"></a> `nodes` | `Object3D`\<`Object3DEventMap`\>[] | - |
| <a id="property-rootparents"></a> `rootParents` | `Map`\<`number`, `Matrix4`\> | For each root joint, its parent's transform in the space of the model root (an FBX armature node often carries a 0.01 scale). Root joint values in a Clip are in model root space. |
| <a id="property-scales"></a> `scales` | `Float64Array` | World scale of each joint's parent relative to the model root (uniform scale assumed). Clip translations are local offsets times this, so a 0.01 armature under a meter scene reads in one unit throughout. |
| <a id="property-skeleton"></a> `skeleton` | [`Skeleton`](index.md#skeleton) | - |

## Functions

### firstPlayable()

```ts
function firstPlayable<M, T>(
   variants, 
   load, 
   use
): Promise<{
  bound: T;
  motion: M;
  variant: number;
}>;
```

Loads the variants of one clip in order (a pack may ship a pose as vrma,
anim and vpd) and returns the first that loads and that `use` accepts;
`use` returns null when the motion moves none of the model's bones. Throws
the last failure when none plays.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-m"></a> `M` |
| <a id="type-parameter-t"></a> `T` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `variants` | `number` |
| `load` | (`variant`) => `Promise`\<`M`\> |
| `use` | (`motion`) => `T` \| `null` |

#### Returns

`Promise`\<\{
  `bound`: `T`;
  `motion`: `M`;
  `variant`: `number`;
\}\>

***

### pickTake()

```ts
function pickTake<T>(clips, take?): T;
```

The take to play from a file that holds several (FBX stacks, glTF
animations): the one named `take`, else the `mixamo.com` take, else the
longest.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-1"></a> `T` *extends* `object` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `clips` | readonly `T`[] |
| `take?` | `string` |

#### Returns

`T`

***

### readVrma()

```ts
function readVrma(data, fps?): Promise<{
  faces: FaceTrack[];
  motion: HumanoidMotion;
}>;
```

Reads a VRM animation (`.vrma`, glTF with `VRMC_vrm_animation`) as a
humanoid motion at `fps`, travel starting at the origin, and its
expression tracks (each expression node's X translation is its weight).
Bones come from the file's own humanoid table, so any node names work.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `data` | `ArrayBuffer` | `undefined` |
| `fps?` | `number` | `30` |

#### Returns

`Promise`\<\{
  `faces`: [`FaceTrack`](formats.md#facetrack)[];
  `motion`: [`HumanoidMotion`](index.md#humanoidmotion);
\}\>

***

### retargetAnimation()

```ts
function retargetAnimation(
   anim, 
   srcRoot, 
   dstRoot, 
   opts?
): AnimationClip;
```

Retargets an AnimationClip made for `srcRoot` onto `dstRoot`. Both models
must stand in their rest pose when this runs.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `anim` | `AnimationClip` |
| `srcRoot` | `Object3D` |
| `dstRoot` | `Object3D` |
| `opts?` | \{ `dstUnit?`: `number`; `fps?`: `number`; `name?`: `string`; `srcUnit?`: `number`; \} |
| `opts.dstUnit?` | `number` |
| `opts.fps?` | `number` |
| `opts.name?` | `string` |
| `opts.srcUnit?` | `number` |

#### Returns

`AnimationClip`

***

### sampleAnimationClip()

```ts
function sampleAnimationClip(
   anim, 
   root, 
   scene, 
   fps?
): Clip;
```

Samples a three.js AnimationClip on `root` at `fps` into a Clip over `nodes`.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `anim` | `AnimationClip` | `undefined` |
| `root` | `Object3D` | `undefined` |
| `scene` | [`SceneSkeleton`](#sceneskeleton) | `undefined` |
| `fps?` | `number` | `30` |

#### Returns

[`Clip`](index.md#clip)

***

### skeletonFromObject3D()

```ts
function skeletonFromObject3D(root): SceneSkeleton;
```

The bones under `root` as a skeleton, rest taken from their current local
transforms (put the model in its rest pose first). Only `Bone` objects are
used when the model has any.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `root` | `Object3D` |

#### Returns

[`SceneSkeleton`](#sceneskeleton)

***

### toAnimationClip()

```ts
function toAnimationClip(
   clip, 
   scene, 
   name?
): AnimationClip;
```

A Clip over a scene skeleton as a three.js AnimationClip, tracks bound by node name.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `clip` | [`Clip`](index.md#clip) | `undefined` |
| `scene` | [`SceneSkeleton`](#sceneskeleton) | `undefined` |
| `name?` | `string` | `"retargeted"` |

#### Returns

`AnimationClip`
