# three

## Classes

### FootLock

Foot lock for a three.js IK target.

#### Constructors

##### Constructor

```ts
new FootLock(threshold?, release?): FootLock;
```

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `threshold?` | `number` | `0.55` |
| `release?` | `number` | `0.06` |

###### Returns

[`FootLock`](#footlock)

#### Accessors

##### locked

###### Get Signature

```ts
get locked(): boolean;
```

###### Returns

`boolean`

#### Methods

##### dispose()

```ts
dispose(): void;
```

###### Returns

`void`

##### update()

```ts
update(
   dt, 
   target, 
   contact
): Vector3;
```

Writes the locked or releasing foot target into `target`.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `dt` | `number` |
| `target` | `Vector3` |
| `contact` | `number` |

###### Returns

`Vector3`

## Interfaces

### FingerBones

The finger and thumb bones of one hand that `curlFingers` rotates; missing bones are skipped.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-index"></a> `index?` | `Object3D`\<`Object3DEventMap`\>[] |
| <a id="property-little"></a> `little?` | `Object3D`\<`Object3DEventMap`\>[] |
| <a id="property-middle"></a> `middle?` | `Object3D`\<`Object3DEventMap`\>[] |
| <a id="property-ring"></a> `ring?` | `Object3D`\<`Object3DEventMap`\>[] |
| <a id="property-thumb"></a> `thumb?` | `Object3D`\<`Object3DEventMap`\>[] |

## Functions

### curlFingers()

```ts
function curlFingers(
   hand, 
   lowerArm, 
   fingers, 
   side, 
   amount
): Vec3;
```

Curls the fingers of one hand by `amount` (0 open, 1 a fist).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `hand` | `Object3D` |
| `lowerArm` | `Object3D` |
| `fingers` | [`FingerBones`](#fingerbones) |
| `side` | `"left"` \| `"right"` |
| `amount` | `number` |

#### Returns

[`Vec3`](index.md#vec3)

***

### lookAtChain()

```ts
function lookAtChain(
   bones, 
   weights, 
   target, 
   frame, 
   limits?, 
   amount?, 
   prevYaw?
): LookResult;
```

Turns a chain (for example neck then head) toward `target`, with yaw and
pitch clamped and shared by `weights`. `frame` is the body's world
rotation in the normalized space (+Z forward). Keep `yaw + bodyYaw` from
the result and pass it back as `prevYaw`; when `behind` is set, turn the
body by `bodyYaw`.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `bones` | `Object3D`\<`Object3DEventMap`\>[] | `undefined` |
| `weights` | `number`[] | `undefined` |
| `target` | `Vector3` | `undefined` |
| `frame` | `Quaternion` | `undefined` |
| `limits?` | [`LookLimits`](index.md#looklimits) | `DEFAULT_LOOK_LIMITS` |
| `amount?` | `number` | `1` |
| `prevYaw?` | `number` | `0` |

#### Returns

[`LookResult`](index.md#lookresult)

***

### rotateWorld()

```ts
function rotateWorld(
   o, 
   delta, 
   weight?
): void;
```

Premultiplies a world rotation delta onto an object, keeping its parent.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `o` | `Object3D` | `undefined` |
| `delta` | [`Quat`](index.md#quat) \| `Quaternion` | `undefined` |
| `weight?` | `number` | `1` |

#### Returns

`void`

***

### solveChain()

```ts
function solveChain(
   bones, 
   target, 
   opts?
): number;
```

FABRIK or CCD on a bone chain (root first, last bone is the end effector).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `bones` | `Object3D`\<`Object3DEventMap`\>[] |
| `target` | `Vector3` |
| `opts?` | \{ `iterations?`: `number`; `limits?`: [`JointLimit`](index.md#jointlimit)[]; `method?`: `"fabrik"` \| `"ccd"`; `tolerance?`: `number`; \} |
| `opts.iterations?` | `number` |
| `opts.limits?` | [`JointLimit`](index.md#jointlimit)[] |
| `opts.method?` | `"fabrik"` \| `"ccd"` |
| `opts.tolerance?` | `number` |

#### Returns

`number`

***

### solveTwoBone()

```ts
function solveTwoBone(
   upper, 
   lower, 
   end, 
   target, 
   pole, 
   opts?
): boolean;
```

Two bone IK on three bones toward a world `target`, bending toward the
world `pole` direction. A `weight` below 1 moves the target part of the
way from where the end joint is now.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `upper` | `Object3D` |
| `lower` | `Object3D` |
| `end` | `Object3D` |
| `target` | `Vector3` |
| `pole` | `Vector3` |
| `opts?` | \{ `soft?`: `number`; `weight?`: `number`; \} |
| `opts.soft?` | `number` |
| `opts.weight?` | `number` |

#### Returns

`boolean`
