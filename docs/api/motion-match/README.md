# @hackbuild/motion-match

## Classes

### ClipSet

Clips collected before a matcher builds its database from them.

#### Constructors

##### Constructor

```ts
new ClipSet(fps): ClipSet;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `fps` | `number` |

###### Returns

[`ClipSet`](#clipset)

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-core"></a> `core` | `readonly` | `ClipSet` |
| <a id="property-fps"></a> `fps` | `readonly` | `number` |

#### Accessors

##### count

###### Get Signature

```ts
get count(): number;
```

###### Returns

`number`

#### Methods

##### add()

```ts
add(c): number;
```

Adds a clip; returns its index. Throws when the arrays disagree.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `c` | [`ClipInput`](#clipinput) |

###### Returns

`number`

##### addSynthetic()

```ts
addSynthetic(g): number;
```

A synthetic two foot gait clip with planted feet (three bones: hips, left leg, right leg).

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `g` | [`SyntheticGait`](#syntheticgait) |

###### Returns

`number`

##### dispose()

```ts
dispose(): void;
```

###### Returns

`void`

##### frames()

```ts
frames(): number[];
```

###### Returns

`number`[]

***

### MotionMatcher

A motion matcher over a clip set, usable as a locomotion backend.

#### Implements

- [`LocomotionBackend`](#locomotionbackend)

#### Constructors

##### Constructor

```ts
new MotionMatcher(set, opts?): MotionMatcher;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `set` | [`ClipSet`](#clipset) |
| `opts?` | [`MatcherOptions`](#matcheroptions) |

###### Returns

[`MotionMatcher`](#motionmatcher)

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-capabilities"></a> `capabilities` | `readonly` | [`Capabilities`](#capabilities) |
| <a id="property-core-1"></a> `core` | `readonly` | `Matcher` |
| <a id="property-last"></a> `last` | `public` | [`MatchFrame`](#matchframe) |

#### Accessors

##### dims

###### Get Signature

```ts
get dims(): number;
```

###### Returns

`number`

##### frames

###### Get Signature

```ts
get frames(): number;
```

###### Returns

`number`

#### Methods

##### dispose()

```ts
dispose(): void;
```

###### Returns

`void`

##### featureRow()

```ts
featureRow(index): Float64Array;
```

Normalized feature row of a global frame.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `index` | `number` |

###### Returns

`Float64Array`

##### forceSearch()

```ts
forceSearch(): void;
```

Search on the next step whatever the interval says.

###### Returns

`void`

##### motorState()

```ts
motorState(): MotorState;
```

###### Returns

[`MotorState`](#motorstate-2)

###### Implementation of

[`LocomotionBackend`](#locomotionbackend).[`motorState`](#motorstate-1)

##### pose()

```ts
pose(): MatchPose;
```

###### Returns

[`MatchPose`](#matchpose)

##### search()

```ts
search(query, brute?): object;
```

Search a normalized query; `brute` walks every frame.

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `query` | `ArrayLike`\<`number`\> | `undefined` |
| `brute?` | `boolean` | `false` |

###### Returns

`object`

| Name | Type |
| ------ | ------ |
| `cost` | `number` |
| `index` | `number` |

##### step()

```ts
step(dt, trajectory): MatchFrame;
```

One frame toward a desired trajectory in the layout `trajectory()` returns.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `dt` | `number` |
| `trajectory` | `ArrayLike`\<`number`\> |

###### Returns

[`MatchFrame`](#matchframe)

##### trajectory()

```ts
trajectory(speed, turnRate): Float64Array;
```

The desired trajectory for a command, from the current root velocity (`x z` per time, then facing `dx dz` per time).

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `speed` | `number` |
| `turnRate` | `number` |

###### Returns

`Float64Array`

##### update()

```ts
update(dt, cmd): RootMotion;
```

The backend contract: a speed and turn rate command.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `dt` | `number` |
| `cmd` | [`GaitCommand`](#gaitcommand) |

###### Returns

[`RootMotion`](#rootmotion)

###### Implementation of

[`LocomotionBackend`](#locomotionbackend).[`update`](#update-1)

## Interfaces

### Capabilities

What a locomotion backend can do.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-headpitchbias"></a> `headPitchBias` | `number` | Head pitch the backend's own motion carries, radians. |
| <a id="property-minstopdistance"></a> `minStopDistance` | `number` | The closest this backend can stop to a goal, meters. |
| <a id="property-turninplace"></a> `turnInPlace` | `boolean` | - |

***

### ClipInput

One clip on a shared rig. `root` is `x z yaw` per frame on the ground
(yaw 0 faces +Z, unwrapped), `rotations` `x y z w` per bone per frame,
`hips` and `feet` `x y z` in the root's frame, `contacts` one flag per
foot per frame. Every clip in a set has the same bones and feet.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-contacts"></a> `contacts` | `ArrayLike`\<`number` \| `boolean`\> |
| <a id="property-feet"></a> `feet` | `ArrayLike`\<`number`\> |
| <a id="property-hips"></a> `hips` | `ArrayLike`\<`number`\> |
| <a id="property-looped"></a> `looped` | `boolean` |
| <a id="property-root"></a> `root` | `ArrayLike`\<`number`\> |
| <a id="property-rotations"></a> `rotations` | `ArrayLike`\<`number`\> |

***

### GaitCommand

A locomotion command: forward speed, turn rate and an optional posture blend.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-posture"></a> `posture?` | `object` | - |
| `posture.bow?` | `number` | - |
| `posture.down?` | `number` | - |
| `posture.reach?` | `number` | - |
| `posture.sit?` | `number` | - |
| <a id="property-speed"></a> `speed` | `number` | Forward speed, m/s. |
| <a id="property-turnrate"></a> `turnRate` | `number` | Turn rate, rad/s. |

***

### LocomotionBackend

The locomotion backend contract shared with @hackbuild/gait, so a matcher stands in for the procedural gait.

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-capabilities-1"></a> `capabilities` | `readonly` | [`Capabilities`](#capabilities) |

#### Methods

##### motorState()

```ts
motorState(): MotorState;
```

###### Returns

[`MotorState`](#motorstate-2)

##### update()

```ts
update(dt, cmd): RootMotion;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `dt` | `number` |
| `cmd` | [`GaitCommand`](#gaitcommand) |

###### Returns

[`RootMotion`](#rootmotion)

***

### MatchConfig

Feature layout and search settings of the matching database.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-boxlarge"></a> `boxLarge` | `number` | - |
| <a id="property-boxsmall"></a> `boxSmall` | `number` | - |
| <a id="property-ignorewindow"></a> `ignoreWindow` | `number` | Frames around the current one that a search skips. |
| <a id="property-trajtimes"></a> `trajTimes` | `number`[] | Future trajectory sample times, seconds. Default 1/3, 2/3, 1. |
| <a id="property-weights"></a> `weights` | `object` | - |
| `weights.footPosition` | `number` | - |
| `weights.footVelocity` | `number` | - |
| `weights.hipVelocity` | `number` | - |
| `weights.trajectoryDirection` | `number` | - |
| `weights.trajectoryPosition` | `number` | - |

***

### MatcherOptions

Options of a new matcher: config, params, start frame and capabilities.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-capabilities-2"></a> `capabilities?` | `Partial`\<[`Capabilities`](#capabilities)\> | What the clip set can do; a set without turn in place clips should say so. |
| <a id="property-config"></a> `config?` | `Partial`\<[`MatchConfig`](#matchconfig)\> | - |
| <a id="property-params"></a> `params?` | `Partial`\<[`MatcherParams`](#matcherparams)\> | - |
| <a id="property-start"></a> `start?` | `object` | - |
| `start.clip?` | `number` | - |
| `start.frame?` | `number` | - |
| `start.x?` | `number` | - |
| `start.yaw?` | `number` | - |
| `start.z?` | `number` | - |

***

### MatcherParams

Runtime settings of a matcher: search interval, transition halflife and jump threshold.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-halflife"></a> `halflife` | `number` | Inertialization halflife, seconds. |
| <a id="property-minimprovement"></a> `minImprovement` | `number` | A jump needs a cost this much below the current frame's. |
| <a id="property-searchinterval"></a> `searchInterval` | `number` | Seconds between searches. |
| <a id="property-trajectoryhalflife"></a> `trajectoryHalflife` | `number` | Halflife of the predicted trajectory's velocity, seconds. |

***

### MatchFrame

One matcher step: root motion plus the clip and frame playing and whether it jumped.

#### Extends

- [`RootMotion`](#rootmotion)

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-clip"></a> `clip` | `number` | - | - |
| <a id="property-cost"></a> `cost` | `number` | Cost of the last search's best frame. | - |
| <a id="property-frame"></a> `frame` | `number` | - | - |
| <a id="property-jumped"></a> `jumped` | `boolean` | A transition happened this frame. | - |
| <a id="property-speed-1"></a> `speed` | `number` | - | [`RootMotion`](#rootmotion).[`speed`](#property-speed-2) |
| <a id="property-transitions"></a> `transitions` | `number` | - | - |
| <a id="property-turnrate-1"></a> `turnRate` | `number` | - | [`RootMotion`](#rootmotion).[`turnRate`](#property-turnrate-2) |
| <a id="property-x"></a> `x` | `number` | - | [`RootMotion`](#rootmotion).[`x`](#property-x-1) |
| <a id="property-yaw"></a> `yaw` | `number` | - | [`RootMotion`](#rootmotion).[`yaw`](#property-yaw-1) |
| <a id="property-z"></a> `z` | `number` | - | [`RootMotion`](#rootmotion).[`z`](#property-z-1) |

***

### MatchPose

The blended pose of the current frame.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-feet-1"></a> `feet` | \[`number`, `number`, `number`\][] | Foot positions in the root's frame. |
| <a id="property-hips-1"></a> `hips` | \[`number`, `number`, `number`\] | Hip position in the root's frame. |
| <a id="property-rotations-1"></a> `rotations` | `Float64Array` | `x y z w` per bone, local rotations after inertialization. |

***

### MotorState

Stride phase, duty and foot contacts of a backend, for layers that follow the feet.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-contacts-1"></a> `contacts` | `boolean`[] | - |
| <a id="property-duty"></a> `duty` | `number` | - |
| <a id="property-phase"></a> `phase` | `number` | Stride phase of the reference foot (the first), 0 at its touchdown. |
| <a id="property-source"></a> `source` | [`MotorSource`](#motorsource) | - |
| <a id="property-stridefrequency"></a> `strideFrequency` | `number` | - |

***

### RootMotion

Root position, facing and velocity on the ground after one update: meters, radians, m/s and rad/s.

#### Extended by

- [`MatchFrame`](#matchframe)

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-speed-2"></a> `speed` | `number` |
| <a id="property-turnrate-2"></a> `turnRate` | `number` |
| <a id="property-x-1"></a> `x` | `number` |
| <a id="property-yaw-1"></a> `yaw` | `number` |
| <a id="property-z-1"></a> `z` | `number` |

***

### SyntheticGait

Settings of a synthetic two foot gait clip made in code.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-looped-1"></a> `looped?` | `boolean` | Defaults to true for a steady gait and false when `speedEnd` differs, since a start or stop cannot loop. |
| <a id="property-speed-3"></a> `speed` | `number` | Speed at the start, m/s. |
| <a id="property-speedend"></a> `speedEnd?` | `number` | Speed at the end; defaults to `speed`. |
| <a id="property-strides"></a> `strides?` | `number` | - |
| <a id="property-turnrate-3"></a> `turnRate?` | `number` | - |

## Type Aliases

### MotorSource

```ts
type MotorSource = "procedural" | "neural" | "motion-match" | "clip" | "other";
```

What drives a locomotion backend.

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

## Variables

### DEFAULT\_CONFIG

```ts
const DEFAULT_CONFIG: MatchConfig;
```

The default feature layout and search settings.

***

### DEFAULT\_PARAMS

```ts
const DEFAULT_PARAMS: MatcherParams;
```

The default runtime settings of a matcher.

## Functions

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
