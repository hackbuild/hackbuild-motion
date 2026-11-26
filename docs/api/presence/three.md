# three

## Interfaces

### ArmChain

The upper arm, forearm and hand bones that `reachArm` swings toward a target.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-hand"></a> `hand` | `Object3D` |
| <a id="property-lower"></a> `lower` | `Object3D` |
| <a id="property-upper"></a> `upper` | `Object3D` |

***

### ClipFromThreeOptions

Frame rate, loop flag, root bone and rest rotations for `clipFromThree`.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-fps"></a> `fps?` | `number` | - |
| <a id="property-loop"></a> `loop?` | `boolean` | - |
| <a id="property-rest"></a> `rest?` | readonly (`Object3D`\<`Object3DEventMap`\> \| `null`)[] | Rest rotations for bones the clip has no track for. |
| <a id="property-rootbone"></a> `rootBone?` | `string` | Bone whose position track becomes the clip root. |

***

### GazeRig

The neck, head and eye bones that `applyGaze` writes to, and the eye bone limits.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-eyelimitdeg"></a> `eyeLimitDeg?` | readonly \[`number`, `number`\] | Eye bone limits, degrees: sideways, then up and down. Default 12 and 8 (vendor): eye bones of non VRM rigs are not authored for wider turns, which show the socket. |
| <a id="property-head"></a> `head` | `Object3D` | - |
| <a id="property-lefteye"></a> `leftEye?` | `Object3D`\<`Object3DEventMap`\> \| `null` | - |
| <a id="property-neck"></a> `neck?` | `Object3D`\<`Object3DEventMap`\> \| `null` | - |
| <a id="property-righteye"></a> `rightEye?` | `Object3D`\<`Object3DEventMap`\> \| `null` | - |

## Variables

### EYE\_BONE\_LIMIT\_DEG

```ts
const EYE_BONE_LIMIT_DEG: readonly [12, 8];
```

Default eye bone limits of `applyGaze`, degrees (vendor).

## Functions

### aimBone()

```ts
function aimBone(
   bone, 
   child, 
   target, 
   weight
): void;
```

Turns `bone` in world space so the direction to `child` swings toward
`target` by `weight` (0 to 1). The bone keeps its twist.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `bone` | `Object3D` |
| `child` | `Object3D` |
| `target` | `Vector3` |
| `weight` | `number` |

#### Returns

`void`

***

### applyGaze()

```ts
function applyGaze(
   g, 
   rig, 
   neckShare?
): void;
```

Adds a gaze frame onto the rig after the pose is written: head angles are
split between neck and head (`neckShare` to the neck), eye angles set the
eye bones inside `rig.eyeLimitDeg`. Call after `applyPose` each frame.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `g` | [`GazeOutput`](index.md#gazeoutput) | `undefined` |
| `rig` | [`GazeRig`](#gazerig) | `undefined` |
| `neckShare?` | `number` | `0.35` |

#### Returns

`void`

***

### applyPose()

```ts
function applyPose(
   pose, 
   bones, 
   root?
): void;
```

Writes a pose onto bones (same order as the clip). `root` gets the root position when given.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `pose` | [`Pose`](index.md#pose) |
| `bones` | readonly (`Object3D`\<`Object3DEventMap`\> \| `null`)[] |
| `root?` | `Object3D`\<`Object3DEventMap`\> \| `null` |

#### Returns

`void`

***

### clipFromThree()

```ts
function clipFromThree(
   clip, 
   bones, 
   opts?
): Clip;
```

Samples a three.js AnimationClip into a flat Clip over the given bone names.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `clip` | `AnimationClip` |
| `bones` | readonly `string`[] |
| `opts?` | [`ClipFromThreeOptions`](#clipfromthreeoptions) |

#### Returns

[`Clip`](index.md#clip)

***

### reachArm()

```ts
function reachArm(
   arm, 
   target, 
   weight
): void;
```

Point or reach: the upper arm, then the forearm, swing toward the target.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `arm` | [`ArmChain`](#armchain) |
| `target` | `Vector3` |
| `weight` | `number` |

#### Returns

`void`

***

### restStanceFromThree()

```ts
function restStanceFromThree(
   bones, 
   names, 
   root?
): Clip;
```

The rest stance over posed bones (same order as `names`) from their
current rotations: each arm turn is applied about the body's forward
axis in world space, then expressed in the bone's local frame, so rigs
whose bones rest in other frames still lower their arms. `root` is the
body's root; its world rotation sets the forward axis.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `bones` | readonly `Object3D`\<`Object3DEventMap`\>[] |
| `names` | readonly `string`[] |
| `root?` | `Object3D`\<`Object3DEventMap`\> \| `null` |

#### Returns

[`Clip`](index.md#clip)
