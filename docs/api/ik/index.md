# index

## Classes

### ContactLock

Holds a foot where it landed while contact is high and releases it smoothly when contact drops. `new ContactLock(threshold, release)`, then `update(dt, target, contact, out)` per frame writes the shown foot position into `out`; call `free()` when done.

#### Indexable

```ts
[key: number]: () => void
```

#### Constructors

##### Constructor

```ts
new ContactLock(threshold, release): ContactLock;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `threshold` | `number` |
| `release` | `number` |

###### Returns

[`ContactLock`](#contactlock)

#### Methods

##### free()

```ts
free(): void;
```

###### Returns

`void`

##### locked()

```ts
locked(): boolean;
```

###### Returns

`boolean`

##### update()

```ts
update(
   dt, 
   target, 
   contact, 
   out
): void;
```

Writes the foot position for this frame into `out`.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `dt` | `number` |
| `target` | `Float64Array` |
| `contact` | `number` |
| `out` | `Float64Array` |

###### Returns

`void`

## Interfaces

### ChainOptions

Iteration cap and goal tolerance in meters for `fabrik` and `ccd`.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-iterations"></a> `iterations?` | `number` |
| <a id="property-tolerance"></a> `tolerance?` | `number` |

***

### HandCurl

A palm frame, the grip point, and the curl axes and angles for the fingers and thumb.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-across"></a> `across` | [`Vec3`](#vec3) | - |
| <a id="property-fingerangles"></a> `fingerAngles` | \[`number`, `number`, `number`\] | Proximal, intermediate, distal. |
| <a id="property-fingeraxis"></a> `fingerAxis` | [`Vec3`](#vec3) | - |
| <a id="property-forward"></a> `forward` | [`Vec3`](#vec3) | - |
| <a id="property-grip"></a> `grip` | [`Vec3`](#vec3) | Where a held object sits. |
| <a id="property-normal"></a> `normal` | [`Vec3`](#vec3) | - |
| <a id="property-thumbangle"></a> `thumbAngle` | `number` | - |
| <a id="property-thumbaxis"></a> `thumbAxis` | [`Vec3`](#vec3) | - |

***

### LookLimits

Yaw and pitch limits in radians for a look at, measured from the frame's forward.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-pitchmax"></a> `pitchMax` | `number` |
| <a id="property-pitchmin"></a> `pitchMin` | `number` |
| <a id="property-yawmax"></a> `yawMax` | `number` |
| <a id="property-yawmin"></a> `yawMin` | `number` |

***

### LookResult

The clamped yaw and pitch of a look at, and what is left over for the body to turn.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-behind"></a> `behind` | `boolean` | The target lies past the yaw limit: turn the body. |
| <a id="property-bodyyaw"></a> `bodyYaw` | `number` | Yaw the chain cannot take, for body turning. |
| <a id="property-clamped"></a> `clamped` | `boolean` | - |
| <a id="property-pitch"></a> `pitch` | `number` | - |
| <a id="property-yaw"></a> `yaw` | `number` | - |

***

### SolveInfo

How a chain solve ended: the iterations used and the remaining distance to the target in meters.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-error"></a> `error` | `number` |
| <a id="property-iterations-1"></a> `iterations` | `number` |

***

### TwoBoneResult

The solved middle and end joints of a two bone chain and the world rotation deltas that put the bones there.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-end"></a> `end` | [`Vec3`](#vec3) | - |
| <a id="property-lower"></a> `lower` | [`Quat`](#quat) | World delta for the lower bone after the upper one moved it. |
| <a id="property-mid"></a> `mid` | [`Vec3`](#vec3) | - |
| <a id="property-reached"></a> `reached` | `boolean` | - |
| <a id="property-upper"></a> `upper` | [`Quat`](#quat) | World delta for the upper bone. |

## Type Aliases

### JointLimit

```ts
type JointLimit = 
  | {
  kind: "none";
}
  | {
  kind: "cone";
  max: number;
}
  | {
  axis: Vec3;
  kind: "hinge";
};
```

A joint limit for `fabrik`: none, a cone of `max` radians around the parent segment, or a hinge around `axis`.

***

### Quat

```ts
type Quat = [number, number, number, number];
```

A rotation as a unit quaternion `[x, y, z, w]`.

***

### Vec3

```ts
type Vec3 = [number, number, number];
```

A point or direction as `[x, y, z]` in meters, +Y up.

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

## Variables

### DEFAULT\_LOOK\_LIMITS

```ts
const DEFAULT_LOOK_LIMITS: LookLimits;
```

Head limits: yaw within 1.25 rad either side, pitch from 0.8 rad down to 0.6 rad up.

## Functions

### ccd()

```ts
function ccd(
   positions, 
   target, 
   opts?
): SolveInfo;
```

CCD in place on `positions`; `maxStep` caps radians per joint per pass.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `positions` | [`Vec3`](#vec3)[] |
| `target` | [`Vec3`](#vec3) |
| `opts?` | [`ChainOptions`](#chainoptions) & `object` |

#### Returns

[`SolveInfo`](#solveinfo)

***

### clampDirection()

```ts
function clampDirection(
   head, 
   dir, 
   maxYaw?, 
   maxPitch?
): Vec3;
```

A direction limited to within the given yaw and pitch of the head's forward.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `head` | [`Quat`](#quat) | `undefined` |
| `dir` | [`Vec3`](#vec3) | `undefined` |
| `maxYaw?` | `number` | `0.43` |
| `maxPitch?` | `number` | `0.17` |

#### Returns

[`Vec3`](#vec3)

***

### fabrik()

```ts
function fabrik(
   positions, 
   target, 
   opts?
): SolveInfo;
```

FABRIK in place on `positions` (root first); lengths and root are kept.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `positions` | [`Vec3`](#vec3)[] |
| `target` | [`Vec3`](#vec3) |
| `opts?` | [`ChainOptions`](#chainoptions) & `object` |

#### Returns

[`SolveInfo`](#solveinfo)

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

### handCurl()

```ts
function handCurl(
   hand, 
   lowerArm, 
   side, 
   amount, 
   index1?, 
   little1?
): HandCurl;
```

Palm frame from the knuckles (or the forearm), and a curl of `amount` (0 to 1).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `hand` | [`Vec3`](#vec3) |
| `lowerArm` | [`Vec3`](#vec3) |
| `side` | `"left"` \| `"right"` |
| `amount` | `number` |
| `index1?` | [`Vec3`](#vec3) |
| `little1?` | [`Vec3`](#vec3) |

#### Returns

[`HandCurl`](#handcurl)

***

### load()

```ts
function load(source?): Promise<void>;
```

Loads the wasm. With no argument the inlined copy is used, which works from file://.

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

### lookAngles()

```ts
function lookAngles(
   frame, 
   origin, 
   target, 
   limits?, 
   prevYaw?
): LookResult;
```

Clamped yaw and pitch of `target` from `origin` in `frame` (+Z forward,
+X left). Pass last frame's `yaw + bodyYaw` as `prevYaw`: past 2.2 rad a
sign flip keeps the previous side, so a target crossing behind does not
whip the head across.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `frame` | [`Quat`](#quat) | `undefined` |
| `origin` | [`Vec3`](#vec3) | `undefined` |
| `target` | [`Vec3`](#vec3) | `undefined` |
| `limits?` | [`LookLimits`](#looklimits) | `DEFAULT_LOOK_LIMITS` |
| `prevYaw?` | `number` | `0` |

#### Returns

[`LookResult`](#lookresult)

***

### lookChain()

```ts
function lookChain(
   frame, 
   yaw, 
   pitch, 
   weights
): Quat[];
```

World deltas that share yaw and pitch over a chain by weight; apply parent first.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `frame` | [`Quat`](#quat) |
| `yaw` | `number` |
| `pitch` | `number` |
| `weights` | readonly `number`[] |

#### Returns

[`Quat`](#quat)[]

***

### pelvisDrop()

```ts
function pelvisDrop(
   hip, 
   foot, 
   reach, 
   up?
): number;
```

Drop along -up the hip needs so `foot` is within `reach`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `hip` | [`Vec3`](#vec3) |
| `foot` | [`Vec3`](#vec3) |
| `reach` | `number` |
| `up?` | [`Vec3`](#vec3) |

#### Returns

`number`

***

### segmentDeltas()

```ts
function segmentDeltas(old, next): Quat[];
```

World delta per segment that turns chain `old` into chain `next`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `old` | readonly [`Vec3`](#vec3)[] |
| `next` | readonly [`Vec3`](#vec3)[] |

#### Returns

[`Quat`](#quat)[]

***

### twoBone()

```ts
function twoBone(
   a, 
   b, 
   c, 
   target, 
   pole, 
   soft?
): TwoBoneResult;
```

Two bone solve of root `a`, middle `b`, end `c` toward `target`, bending toward the `pole` direction.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `a` | [`Vec3`](#vec3) | `undefined` |
| `b` | [`Vec3`](#vec3) | `undefined` |
| `c` | [`Vec3`](#vec3) | `undefined` |
| `target` | [`Vec3`](#vec3) | `undefined` |
| `pole` | [`Vec3`](#vec3) | `undefined` |
| `soft?` | `number` | `0` |

#### Returns

[`TwoBoneResult`](#twoboneresult)
