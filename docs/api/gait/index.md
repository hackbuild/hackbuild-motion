# index

## Classes

### BodyDynamics

Posture springs, terrain pitch and roll, gait bob, lean and load shift.

#### Constructors

##### Constructor

```ts
new BodyDynamics(geometry, rng): BodyDynamics;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `geometry` | [`BodyGeometry`](#bodygeometry) |
| `rng` | [`Rng`](#rng) |

###### Returns

[`BodyDynamics`](#bodydynamics)

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
   gait, 
   cmd, 
   ground, 
   breath?
): BodyPose;
```

`ground` holds the ground height under each nominal foot spot.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `dt` | `number` |
| `gait` | [`GaitState`](#gaitstate) |
| `cmd` | [`GaitCommand`](#gaitcommand) |
| `ground` | readonly `number`[] |
| `breath?` | \{ `depth`: `number`; `rate`: `number`; \} |
| `breath.depth` | `number` |
| `breath.rate` | `number` |

###### Returns

[`BodyPose`](#bodypose)

***

### Ears

Two ear springs. Returns [left, right] in radians.

#### Constructors

##### Constructor

```ts
new Ears(halflife?): Ears;
```

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `halflife?` | `number` | `0.07` |

###### Returns

[`Ears`](#ears)

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
   perk, 
   negative, 
   headYawRate, 
   flap?, 
   bounce?
): [number, number];
```

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `dt` | `number` | `undefined` |
| `perk` | `number` | `undefined` |
| `negative` | `number` | `undefined` |
| `headYawRate` | `number` | `undefined` |
| `flap?` | `number` | `0` |
| `bounce?` | `number` | `0` |

###### Returns

\[`number`, `number`\]

***

### PhaseEstimator

Phase, duty and stride frequency from foot contacts alone, by touchdown
to touchdown timing of a reference leg; for sources without an
oscillator (a neural network, a clip, a motion matcher).

#### Constructors

##### Constructor

```ts
new PhaseEstimator(
   legs, 
   source, 
   reference?
): PhaseEstimator;
```

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `legs` | `number` | `undefined` |
| `source` | [`MotorSource`](#motorsource) | `undefined` |
| `reference?` | `number` | `0` |

###### Returns

[`PhaseEstimator`](#phaseestimator)

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-source"></a> `source` | `readonly` | [`MotorSource`](#motorsource) |

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
   contacts, 
   threshold?
): MotorState;
```

`contacts` per leg: booleans, or contact values above `threshold`.

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `dt` | `number` | `undefined` |
| `contacts` | readonly (`number` \| `boolean`)[] | `undefined` |
| `threshold?` | `number` | `0.55` |

###### Returns

[`MotorState`](#motorstate-2)

***

### ProceduralBackend

The procedural gait as a backend: integrates the command into root motion and steps the legs.

#### Implements

- [`LocomotionBackend`](#locomotionbackend)

#### Constructors

##### Constructor

```ts
new ProceduralBackend(gait): ProceduralBackend;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `gait` | [`QuadrupedGait`](#quadrupedgait) |

###### Returns

[`ProceduralBackend`](#proceduralbackend)

#### Properties

| Property | Modifier | Type | Default value |
| ------ | ------ | ------ | ------ |
| <a id="property-capabilities"></a> `capabilities` | `readonly` | [`Capabilities`](#capabilities) | `...` |
| <a id="property-gait"></a> `gait` | `readonly` | [`QuadrupedGait`](#quadrupedgait) | `undefined` |
| <a id="property-root"></a> `root` | `public` | [`RootMotion`](#rootmotion) | `...` |
| <a id="property-state"></a> `state` | `public` | [`GaitState`](#gaitstate) \| `null` | `null` |

#### Methods

##### motorState()

```ts
motorState(): MotorState;
```

The common motor state after the last update.

###### Returns

[`MotorState`](#motorstate-2)

###### Implementation of

[`LocomotionBackend`](#locomotionbackend).[`motorState`](#motorstate-1)

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

###### Implementation of

[`LocomotionBackend`](#locomotionbackend).[`update`](#update-6)

***

### QuadrupedGait

The leg oscillator for a quadruped (LF RF LH RH).

#### Constructors

##### Constructor

```ts
new QuadrupedGait(
   legs, 
   legLength, 
   opts
): QuadrupedGait;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `legs` | readonly [`LegSpec`](#legspec)[] |
| `legLength` | `number` |
| `opts` | \{ `ground?`: [`Ground`](#ground); `paceBias?`: `number`; `rng`: [`Rng`](#rng); \} |
| `opts.ground?` | [`Ground`](#ground) |
| `opts.paceBias?` | `number` |
| `opts.rng` | [`Rng`](#rng) |

###### Returns

[`QuadrupedGait`](#quadrupedgait)

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-leglength"></a> `legLength` | `readonly` | `number` |
| <a id="property-legs"></a> `legs` | `readonly` | readonly [`LegSpec`](#legspec)[] |

#### Methods

##### dispose()

```ts
dispose(): void;
```

###### Returns

`void`

##### nominal()

```ts
nominal(
   x, 
   z, 
   yaw
): [number, number][];
```

World nominal foot spots for a body pose.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `x` | `number` |
| `z` | `number` |
| `yaw` | `number` |

###### Returns

\[`number`, `number`\][]

##### reset()

```ts
reset(
   x, 
   z, 
   yaw
): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `x` | `number` |
| `z` | `number` |
| `yaw` | `number` |

###### Returns

`void`

##### setOffsets()

```ts
setOffsets(offsets): void;
```

Posture foot offsets in the body frame, from `BodyDynamics`.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `offsets` | readonly \[`number`, `number`\][] |

###### Returns

`void`

##### update()

```ts
update(
   dt, 
   pose, 
   cmd
): GaitState;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `dt` | `number` |
| `pose` | \{ `x`: `number`; `yaw`: `number`; `z`: `number`; \} |
| `pose.x` | `number` |
| `pose.yaw` | `number` |
| `pose.z` | `number` |
| `cmd` | [`GaitCommand`](#gaitcommand) |

###### Returns

[`GaitState`](#gaitstate)

***

### TailWag

Tail wag through a spring chain, with eight wag modes.

#### Constructors

##### Constructor

```ts
new TailWag(
   links, 
   halflife, 
   rng
): TailWag;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `links` | `number` |
| `halflife` | `number` |
| `rng` | [`Rng`](#rng) |

###### Returns

[`TailWag`](#tailwag)

#### Methods

##### dispose()

```ts
dispose(): void;
```

###### Returns

`void`

##### update()

```ts
update(dt, inp): object;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `dt` | `number` |
| `inp` | [`WagInput`](#waginput) |

###### Returns

`object`

| Name | Type |
| ------ | ------ |
| `lift` | `number` |
| `mode` | \| `"still"` \| `"slow wide"` \| `"fast small"` \| `"loose broad"` \| `"helicopter"` \| `"high stiff"` \| `"tucked"` \| `"tip flick"` |
| `yaw` | `number`[] |

## Interfaces

### BodyGeometry

Where the shoulders and hips sit along the body, the track half width, and the size against the tuned default dog.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-frontz"></a> `frontZ` | `number` | - |
| <a id="property-halfwidth"></a> `halfWidth` | `number` | - |
| <a id="property-rearz"></a> `rearZ` | `number` | - |
| <a id="property-size"></a> `size` | `number` | Length scale against the 0.78 m dog the defaults were tuned on. |

***

### BodyPose

One frame of body state from `BodyDynamics`: root height, drop, pitch, roll, spine bend, posture weights and per leg offsets.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-bend"></a> `bend` | `number` |
| <a id="property-breathe"></a> `breathe` | `number` |
| <a id="property-drop"></a> `drop` | `number` |
| <a id="property-dz"></a> `dz` | `number` |
| <a id="property-flex"></a> `flex` | `number` |
| <a id="property-legoffsets"></a> `legOffsets` | \[`number`, `number`\][] |
| <a id="property-pitch"></a> `pitch` | `number` |
| <a id="property-posture"></a> `posture` | `object` |
| `posture.bow` | `number` |
| `posture.down` | `number` |
| `posture.reach` | `number` |
| `posture.sit` | `number` |
| <a id="property-roll"></a> `roll` | `number` |
| <a id="property-rooty"></a> `rootY` | `number` |
| <a id="property-tilt"></a> `tilt` | `number`[] |

***

### Capabilities

What a locomotion backend can do: turn in place, how close it stops, and the head pitch its motion carries.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-headpitchbias"></a> `headPitchBias` | `number` | Head pitch the backend's own motion carries, radians. |
| <a id="property-minstopdistance"></a> `minStopDistance` | `number` | The closest this backend can stop to a goal, meters. |
| <a id="property-turninplace"></a> `turnInPlace` | `boolean` | - |

***

### FootfallTable

One gait's footfall pattern: stance start per leg, duty factor, swing clearance and the stride frequency terms.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-clearance"></a> `clearance` | `number` | - |
| <a id="property-duty"></a> `duty` | `number` | - |
| <a id="property-freq0"></a> `freq0` | `number` | - |
| <a id="property-freqv"></a> `freqV` | `number` | - |
| <a id="property-freqw"></a> `freqW` | `number` | - |
| <a id="property-name"></a> `name` | [`GaitName`](#gaitname) | - |
| <a id="property-offsets"></a> `offsets` | \[`number`, `number`, `number`, `number`\] | Stance start phase per leg, LF RF LH RH. |

***

### FootState

One foot's world position this frame, whether it is in stance, and its swing progress.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-stance"></a> `stance` | `boolean` | - |
| <a id="property-swing"></a> `swing` | `number` | - |
| <a id="property-x"></a> `x` | `number` | - |
| <a id="property-y"></a> `y` | `number` | World height: ground plus the swing height. |
| <a id="property-z"></a> `z` | `number` | - |

***

### GaitCommand

What the caller asks of the gait each frame: forward speed, turn rate and optional posture weights.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-posture-1"></a> `posture?` | `object` | Posture weights, 0 to 1. |
| `posture.bow?` | `number` | - |
| `posture.down?` | `number` | - |
| `posture.reach?` | `number` | - |
| `posture.sit?` | `number` | - |
| <a id="property-speed"></a> `speed` | `number` | Forward speed, m/s. |
| <a id="property-turnrate"></a> `turnRate` | `number` | Turn rate, rad/s. |

***

### GaitState

One frame of the gait: blended gait weights, phase, feet, stride frequency and duty, Froude number and touchdowns.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-duty-1"></a> `duty` | `number` | - |
| <a id="property-feet"></a> `feet` | [`FootState`](#footstate)[] | - |
| <a id="property-frequency"></a> `frequency` | `number` | - |
| <a id="property-froude"></a> `froude` | `number` | - |
| <a id="property-legphases"></a> `legPhases` | `number`[] | Phase per leg, 0 at touchdown. |
| <a id="property-phase"></a> `phase` | `number` | - |
| <a id="property-standing"></a> `standing` | `boolean` | - |
| <a id="property-touchdowns"></a> `touchdowns` | `number`[] | Legs that touched down this frame. |
| <a id="property-weights"></a> `weights` | `Record`\<[`GaitName`](#gaitname), `number`\> | - |

***

### LegSpec

A leg's rest geometry in the body frame: x to the body's left, z forward.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-front"></a> `front` | `boolean` | - |
| <a id="property-toe"></a> `toe` | `number` | Toe height above the ground at rest. |
| <a id="property-x-1"></a> `x` | `number` | - |
| <a id="property-z-1"></a> `z` | `number` | - |

***

### LocomotionBackend

A locomotion backend (procedural gait, neural network, motion matcher)
declares what it can do, so a caller asks it for its stop distance
instead of assuming one.

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-capabilities-1"></a> `capabilities` | `readonly` | [`Capabilities`](#capabilities) |

#### Methods

##### motorState()

```ts
motorState(): MotorState;
```

The common motor state after the last update.

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

### MotorState

The one motor state every source fills. Diagnostics, ear bounce,
footprints and sounds read this, never a particular source, so they
follow whatever actually moves the body.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-contacts"></a> `contacts` | `boolean`[] | - |
| <a id="property-duty-2"></a> `duty` | `number` | - |
| <a id="property-phase-1"></a> `phase` | `number` | Stride phase of the reference leg (LF), 0 at its touchdown. |
| <a id="property-source-1"></a> `source` | [`MotorSource`](#motorsource) | - |
| <a id="property-stridefrequency"></a> `strideFrequency` | `number` | - |

***

### Obstacle

A circular obstacle on the ground plane: centre `x`, `z` and radius `r` in meters.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-r"></a> `r` | `number` |
| <a id="property-x-2"></a> `x` | `number` |
| <a id="property-z-2"></a> `z` | `number` |

***

### RootMotion

The body root after a frame: position, yaw, speed and turn rate.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-speed-1"></a> `speed` | `number` |
| <a id="property-turnrate-1"></a> `turnRate` | `number` |
| <a id="property-x-3"></a> `x` | `number` |
| <a id="property-yaw"></a> `yaw` | `number` |
| <a id="property-z-3"></a> `z` | `number` |

***

### SteerParams

Steering settings: cruise speed, stop distance, obstacle clearance and influence, turn rates, and an optional fence.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-clearance-1"></a> `clearance` | `number` | - |
| <a id="property-fence"></a> `fence` | `number` | Fence radius around the origin, 0 for none. |
| <a id="property-influence"></a> `influence` | `number` | - |
| <a id="property-speed-2"></a> `speed` | `number` | - |
| <a id="property-stopdistance"></a> `stopDistance` | `number` | - |
| <a id="property-turnfast"></a> `turnFast` | `number` | - |
| <a id="property-turnslow"></a> `turnSlow` | `number` | - |

***

### WagInput

What drives the tail each frame: a weight per wag mode, arousal, and optional lift, bias, turn and scale terms.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-ampscale"></a> `ampScale?` | `number` |
| <a id="property-arousal"></a> `arousal` | `number` |
| <a id="property-bias"></a> `bias?` | `number` |
| <a id="property-hzscale"></a> `hzScale?` | `number` |
| <a id="property-lift"></a> `lift?` | `number` |
| <a id="property-modeweights"></a> `modeWeights` | readonly `number`[] |
| <a id="property-turnrate-2"></a> `turnRate?` | `number` |

## Type Aliases

### GaitName

```ts
type GaitName = "walk" | "pace" | "trot" | "canter" | "gallop";
```

A quadruped gait, from slowest to fastest.

***

### Ground

```ts
type Ground = (x, z) => number;
```

Ground height in meters at a world `x`, `z`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `x` | `number` |
| `z` | `number` |

#### Returns

`number`

***

### MotorSource

```ts
type MotorSource = "procedural" | "neural" | "motion-match" | "clip" | "other";
```

Which source drives the body: show it wherever motion is diagnosed.

***

### Rng

```ts
type Rng = () => number;
```

Uniform numbers in [0, 1); the family contract. Used here only to seed the wasm streams.

#### Returns

`number`

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

### DEFAULT\_STEER

```ts
const DEFAULT_STEER: SteerParams;
```

Default steering settings, tuned on a 0.78 m dog.

***

### GAIT\_NAMES

```ts
const GAIT_NAMES: readonly GaitName[];
```

The gait names in the order the footfall tables use.

***

### WAG\_MODES

```ts
const WAG_MODES: readonly ["still", "slow wide", "fast small", "loose broad", "helicopter", "high stiff", "tucked", "tip flick"];
```

The eight tail wag modes, in the order `WagInput.modeWeights` uses.

## Functions

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

### motorStateOf()

```ts
function motorStateOf(s): MotorState;
```

The motor state of a procedural gait frame.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `s` | [`GaitState`](#gaitstate) |

#### Returns

[`MotorState`](#motorstate-2)

***

### quadrupedTables()

```ts
function quadrupedTables(): FootfallTable[];
```

The footfall tables of the five quadruped gaits, read from the wasm core.

#### Returns

[`FootfallTable`](#footfalltable)[]

***

### solveLeg()

```ts
function solveLeg(
   a, 
   b, 
   c, 
   target, 
   pole
): object;
```

Two bone leg solve; same layout as `@hackbuild/ik` twoBone.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `a` | \[`number`, `number`, `number`\] |
| `b` | \[`number`, `number`, `number`\] |
| `c` | \[`number`, `number`, `number`\] |
| `target` | \[`number`, `number`, `number`\] |
| `pole` | \[`number`, `number`, `number`\] |

#### Returns

`object`

| Name | Type |
| ------ | ------ |
| `lower` | \[`number`, `number`, `number`, `number`\] |
| `reached` | `boolean` |
| `upper` | \[`number`, `number`, `number`, `number`\] |

***

### steer()

```ts
function steer(
   pose, 
   goal, 
   obstacles?, 
   params?
): object;
```

Potential field steering toward a goal; a pure function.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `pose` | \{ `v`: `number`; `x`: `number`; `yaw`: `number`; `z`: `number`; \} | `undefined` |
| `pose.v` | `number` | `undefined` |
| `pose.x` | `number` | `undefined` |
| `pose.yaw` | `number` | `undefined` |
| `pose.z` | `number` | `undefined` |
| `goal` | \{ `x`: `number`; `z`: `number`; \} | `undefined` |
| `goal.x` | `number` | `undefined` |
| `goal.z` | `number` | `undefined` |
| `obstacles?` | readonly [`Obstacle`](#obstacle)[] | `[]` |
| `params?` | `Partial`\<[`SteerParams`](#steerparams)\> | `{}` |

#### Returns

`object`

| Name | Type |
| ------ | ------ |
| `arrived` | `boolean` |
| `speed` | `number` |
| `turnRate` | `number` |
