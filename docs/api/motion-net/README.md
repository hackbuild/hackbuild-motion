# @hackbuild/motion-net

## Classes

### Predictor

Evaluates the network, in a worker or in the page.

#### Properties

| Property | Modifier | Type | Default value | Description |
| ------ | ------ | ------ | ------ | ------ |
| <a id="property-fallbackreason"></a> `fallbackReason` | `public` | `string` \| `null` | `null` | Why the worker was not used, when it was not. |
| <a id="property-inputlength"></a> `inputLength` | `public` | `number` | `0` | Raw input length the network takes; set by `create`. |
| <a id="property-mode"></a> `mode` | `readonly` | [`EngineMode`](#enginemode) | `undefined` | - |

#### Methods

##### dispose()

```ts
dispose(): void;
```

###### Returns

`void`

##### predict()

```ts
predict(input): Promise<RawPrediction>;
```

Runs one evaluation on a raw input of 339 values.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `input` | `Float32Array` |

###### Returns

`Promise`\<[`RawPrediction`](#rawprediction)\>

##### create()

```ts
static create(weights, opts?): Promise<Predictor>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `weights` | [`Weights`](#weights) |
| `opts?` | [`PredictorOptions`](#predictoroptions) |

###### Returns

`Promise`\<[`Predictor`](#predictor)\>

***

### QuadrupedHost

Drives the quadruped network and fills the gait motor state.

#### Implements

- [`LocomotionBackend`](#locomotionbackend)

#### Constructors

##### Constructor

```ts
new QuadrupedHost(
   predictor, 
   styles, 
   tuning?
): QuadrupedHost;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `predictor` | [`Predicts`](#predicts) |
| `styles` | `Record`\<[`StyleLabel`](#stylelabel), `ArrayLike`\<`number`\>\> |
| `tuning?` | `Partial`\<[`HostTuning`](#hosttuning)\> |

###### Returns

[`QuadrupedHost`](#quadrupedhost)

#### Properties

| Property | Modifier | Type | Default value | Description |
| ------ | ------ | ------ | ------ | ------ |
| <a id="property-capabilities"></a> `capabilities` | `readonly` | [`Capabilities`](#capabilities) | `...` | - |
| <a id="property-evalms"></a> `evalMs` | `public` | `number` | `0` | Evaluation time of the last prediction where it ran, ms (measured). |
| <a id="property-footslide"></a> `footSlide` | `public` | `number`[] | `...` | Horizontal travel of each stance paw this frame, m, after pinning and before. |
| <a id="property-lagms"></a> `lagMs` | `public` | `number` | `0` | Request to first use of the last prediction, ms on the host clock: what playback skips (measured). |
| <a id="property-latencyms"></a> `latencyMs` | `public` | `number` | `0` | Request to arrival of the last prediction, wall clock ms (measured). |
| <a id="property-paws"></a> `paws` | `readonly` | [`PawState`](#pawstate)[] | `...` | - |
| <a id="property-pingap"></a> `pinGap` | `public` | `number`[] | `...` | Distance from each pinned paw to where the network puts it, m; 0 when free. |
| <a id="property-positions"></a> `positions` | `readonly` | `Float32Array`\<`ArrayBuffer`\> | `...` | World bone positions, host frame, x y z per bone. |
| <a id="property-predictionage"></a> `predictionAge` | `public` | `number` | `0` | Seconds since the playing prediction was requested; past 0.5 the dog holds. |
| <a id="property-rawfootslide"></a> `rawFootSlide` | `public` | `number`[] | `...` | - |
| <a id="property-received"></a> `received` | `public` | `number` | `0` | Predictions received and requests sent. |
| <a id="property-requested"></a> `requested` | `public` | `number` | `0` | - |
| <a id="property-root"></a> `root` | `public` | `object` | `...` | Root in the host frame: position on the ground and yaw (positive left). |
| `root.x` | `public` | `number` | `0` | - |
| `root.yaw` | `public` | `number` | `0` | - |
| `root.z` | `public` | `number` | `0` | - |
| <a id="property-rootvelocity"></a> `rootVelocity` | `public` | `object` | `...` | Root velocity in the host frame, m/s, and turn rate, rad/s. |
| `rootVelocity.turnRate` | `public` | `number` | `0` | - |
| `rootVelocity.x` | `public` | `number` | `0` | - |
| `rootVelocity.z` | `public` | `number` | `0` | - |
| <a id="property-rotations"></a> `rotations` | `readonly` | `Float32Array`\<`ArrayBuffer`\> | `...` | World bone rotations, host frame, x y z w per bone. |
| <a id="property-style"></a> `style` | `public` | \| `"Canter"` \| `"Idle"` \| `"Jump"` \| `"Lie"` \| `"Pace"` \| `"Sit"` \| `"Stand"` \| `"Trot"` \| `"Walk"` | `"Idle"` | - |
| <a id="property-tuning"></a> `tuning` | `readonly` | [`HostTuning`](#hosttuning) | `undefined` | - |

#### Accessors

##### command

###### Get Signature

```ts
get command(): HostCommand;
```

The last command passed to update.

###### Returns

[`HostCommand`](#hostcommand)

#### Methods

##### motorState()

```ts
motorState(): MotorState;
```

###### Returns

[`MotorState`](#motorstate-2)

###### Implementation of

[`LocomotionBackend`](#locomotionbackend).[`motorState`](#motorstate-1)

##### reset()

```ts
reset(
   x, 
   z, 
   yaw
): void;
```

Places the dog, host frame, and forgets any motion.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `x` | `number` |
| `z` | `number` |
| `yaw` | `number` |

###### Returns

`void`

##### update()

```ts
update(dtIn, cmd): RootMotion;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `dtIn` | `number` |
| `cmd` | [`HostCommand`](#hostcommand) |

###### Returns

[`RootMotion`](#rootmotion)

###### Implementation of

[`LocomotionBackend`](#locomotionbackend).[`update`](#update-1)

## Interfaces

### Capabilities

What a locomotion backend can do.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-headpitchbias"></a> `headPitchBias` | `number` |
| <a id="property-minstopdistance"></a> `minStopDistance` | `number` |
| <a id="property-turninplace"></a> `turnInPlace` | `boolean` |

***

### Dims

The network dimensions read from the manifest.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-din"></a> `dIn` | `number` |
| <a id="property-dout"></a> `dOut` | `number` |
| <a id="property-frames"></a> `frames` | `number` |
| <a id="property-group"></a> `group` | `number` |
| <a id="property-hidden"></a> `hidden` | `number` |
| <a id="property-passes"></a> `passes` | `number` |

***

### GaitCommand

A locomotion command: forward speed, turn rate and an optional posture blend.

#### Extended by

- [`HostCommand`](#hostcommand)

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-posture"></a> `posture?` | `object` | - |
| `posture.bow?` | `number` | - |
| `posture.down?` | `number` | - |
| `posture.reach?` | `number` | - |
| `posture.sit?` | `number` | - |
| <a id="property-speed"></a> `speed` | `number` | Forward speed, m/s. |
| <a id="property-turnrate"></a> `turnRate` | `number` | Turn rate, rad/s, positive to the left. |

***

### HostCommand

A host command: a gait command plus an optional world velocity, facing and style.

#### Extends

- [`GaitCommand`](#gaitcommand)

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-facing"></a> `facing?` | `number` | World facing to turn toward, radians; overrides `turnRate`. | - |
| <a id="property-posture-1"></a> `posture?` | `object` | - | [`GaitCommand`](#gaitcommand).[`posture`](#property-posture) |
| `posture.bow?` | `number` | - | - |
| `posture.down?` | `number` | - | - |
| `posture.reach?` | `number` | - | - |
| `posture.sit?` | `number` | - | - |
| <a id="property-speed-1"></a> `speed` | `number` | Forward speed, m/s. | [`GaitCommand`](#gaitcommand).[`speed`](#property-speed) |
| <a id="property-style-1"></a> `style?` | \| `"Canter"` \| `"Idle"` \| `"Jump"` \| `"Lie"` \| `"Pace"` \| `"Sit"` \| `"Stand"` \| `"Trot"` \| `"Walk"` \| `"auto"` | A style label to hold, or "auto" (the default) to choose by speed. | - |
| <a id="property-turnrate-1"></a> `turnRate` | `number` | Turn rate, rad/s, positive to the left. | [`GaitCommand`](#gaitcommand).[`turnRate`](#property-turnrate) |
| <a id="property-velocity"></a> `velocity?` | `object` | World planar velocity, m/s; overrides `speed` and lets the dog move sideways. | - |
| `velocity.x` | `number` | - | - |
| `velocity.z` | `number` | - | - |

***

### HostTuning

Timing, smoothing, paw pinning and style thresholds of the host.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-canterat"></a> `canterAt` | `number` | - |
| <a id="property-commandhalflife"></a> `commandHalflife` | `number` | Half life of the command smoothing, s. |
| <a id="property-contactoff"></a> `contactOff` | `number` | - |
| <a id="property-contacton"></a> `contactOn` | `number` | Contact on and off thresholds. |
| <a id="property-followhalflife"></a> `followHalflife` | `number` | Half life of the low pass on the root's share of the paw drift, s. |
| <a id="property-interval"></a> `interval` | `number` | Seconds between prediction requests. |
| <a id="property-leanrange"></a> `leanRange` | `number` | Largest lean of the speed loop either way, m/s. |
| <a id="property-maxpin"></a> `maxPin` | `number` | Largest distance a pinned paw may sit from the network's paw, m. |
| <a id="property-plantfollow"></a> `plantFollow` | `number` | Share of the network's planted paw drift the root takes over, 0 to 1. |
| <a id="property-planthalflife"></a> `plantHalflife` | `number` | Half life of the slow pull of the root toward its pinned paws, s; 0 turns it off. |
| <a id="property-seamhalflife"></a> `seamHalflife` | `number` | Half life of the seam offset when a new prediction lands, s. |
| <a id="property-speedgain"></a> `speedGain` | `number` | Integral gain of the speed loop that leans the trajectory until the dog's speed meets the command, 1/s. |
| <a id="property-trajblend"></a> `trajBlend` | `number` | Time constant over which the root's own velocity gives way to the command along the trajectory, s. |
| <a id="property-trajstart"></a> `trajStart` | `number` | Time of trajectory sample k is start + k step, seconds. |
| <a id="property-trajstep"></a> `trajStep` | `number` | - |
| <a id="property-trotat"></a> `trotAt` | `number` | - |
| <a id="property-walkat"></a> `walkAt` | `number` | Speeds (m/s) where auto style moves up from Idle, Walk, Trot. |

***

### LoadOptions

Options of `loadWeights`: the two parts, an optional SHA-256 and progress and licence callbacks.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-bin"></a> `bin` | [`Source`](#source) | - |
| <a id="property-fetch"></a> `fetch?` | (`input`, `init?`) => `Promise`\<`Response`\> | - |
| <a id="property-manifest"></a> `manifest` | [`Manifest`](#manifest) \| [`Source`](#source) | - |
| <a id="property-onlicence"></a> `onLicence?` | (`text`) => `void` | Receives the licence line on the first load in this page; console.info otherwise. |
| <a id="property-onprogress"></a> `onProgress?` | (`loaded`, `total`) => `void` | Download progress for URL sources, bytes so far and total (0 when unknown). |
| <a id="property-sha256"></a> `sha256?` | `string` | Expected SHA-256 of the binary in hex; checked when given. |

***

### LocomotionBackend

The locomotion backend contract shared with @hackbuild/gait, so the host stands in for the procedural gait.

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

### Manifest

The JSON manifest that describes the network and every tensor in the binary.

#### Indexable

```ts
[k: string]: unknown
```

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-bin-1"></a> `bin` | `Record`\<`string`, [`TensorEntry`](#tensorentry)\> |
| <a id="property-guidances"></a> `guidances` | `string`[] |
| <a id="property-model"></a> `model` | `object` |
| `model.codebook_channels` | `number` |
| `model.codebook_dims` | `number` |
| `model.denoiser_iterations` | `number` |
| `model.input_dim` | `number` |
| `model.latent_dim` | `number` |
| `model.output_dim` | `number` |
| `model.sequence_length` | `number` |
| <a id="property-skeleton"></a> `skeleton` | `object` |
| `skeleton.bone_names` | `string`[] |
| `skeleton.parent_names` | (`string` \| `null`)[] |

***

### MotorState

Stride phase, duty and paw contacts of the host, in the shape @hackbuild/gait uses.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-contacts"></a> `contacts` | `boolean`[] |
| <a id="property-duty"></a> `duty` | `number` |
| <a id="property-phase"></a> `phase` | `number` |
| <a id="property-source"></a> `source` | [`MotorSource`](#motorsource) |
| <a id="property-stridefrequency"></a> `strideFrequency` | `number` |

***

### PawState

The state of one paw: contact, pin and phase.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-contact"></a> `contact` | `number` | Raw contact value of the network, sampled now. |
| <a id="property-phase-1"></a> `phase` | `number` | Phase since touchdown over the last stride period, 0 to 1. |
| <a id="property-pin"></a> `pin` | `V3` \| `null` | Pinned world position in the host frame while in stance. |
| <a id="property-stance"></a> `stance` | `boolean` | - |

***

### PredictorOptions

Options of `Predictor.create`: worker choice, wasm source and worker start timeout.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-wasm"></a> `wasm?` | `string` \| `URL` \| `ArrayBuffer` \| `ArrayBufferView`\<`ArrayBufferLike`\> | The wasm: a URL or bytes. Defaults to the base64 copy shipped in the package. |
| <a id="property-worker"></a> `worker?` | `boolean` \| `"auto"` | "auto" tries a worker and falls back to the page; true insists on a worker; false runs in the page. |
| <a id="property-workertimeoutms"></a> `workerTimeoutMs?` | `number` | How long a worker may take to report ready before the page fallback takes over, ms. |

***

### Predicts

Anything that evaluates the network, usually a `Predictor`; a stand in for tests.

#### Methods

##### predict()

```ts
predict(input): Promise<RawPrediction>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `input` | `Float32Array` |

###### Returns

`Promise`\<[`RawPrediction`](#rawprediction)\>

***

### RawPrediction

One evaluation of the network: 16 frames of output, the code and the time it took.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-code"></a> `code` | `Float32Array` | Refined code, 1024 values. |
| <a id="property-code0"></a> `code0` | `Float32Array` | Code estimate before refinement. |
| <a id="property-frames-1"></a> `frames` | `Float32Array` | 16 rows of 412 denormalized values. |
| <a id="property-ms"></a> `ms` | `number` | Milliseconds the evaluation took where it ran (measured). |

***

### RootMotion

Root position, facing and velocity on the ground after one update: meters, radians, m/s and rad/s.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-speed-2"></a> `speed` | `number` |
| <a id="property-turnrate-2"></a> `turnRate` | `number` |
| <a id="property-x"></a> `x` | `number` |
| <a id="property-yaw"></a> `yaw` | `number` |
| <a id="property-z"></a> `z` | `number` |

***

### TensorEntry

Where one tensor sits in the binary: byte offset, value count, shape and dtype.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-count"></a> `count` | `number` |
| <a id="property-dtype"></a> `dtype` | [`Dtype`](#dtype) |
| <a id="property-offset"></a> `offset` | `number` |
| <a id="property-shape"></a> `shape` | `number`[] |

***

### Weights

Checked weights, ready for `Predictor.create`.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-bin-2"></a> `bin` | `ArrayBuffer` | - |
| <a id="property-dims"></a> `dims` | [`Dims`](#dims) | - |
| <a id="property-inputmean"></a> `inputMean` | `Float32Array` | - |
| <a id="property-inputstd"></a> `inputStd` | `Float32Array` | - |
| <a id="property-licence"></a> `licence` | `string` | - |
| <a id="property-manifest-1"></a> `manifest` | [`Manifest`](#manifest) | - |
| <a id="property-sha256-1"></a> `sha256` | `string` \| `null` | - |
| <a id="property-styles"></a> `styles` | `Record`\<[`StyleLabel`](#stylelabel), `Float32Array`\> | Style poses, 81 values each, as stored. |
| <a id="property-tensors"></a> `tensors` | `object`[] | Tensors the network reads, in a fixed order. |

## Type Aliases

### BoneName

```ts
type BoneName = typeof BONES[number];
```

One bone name of `BONES`.

***

### Dtype

```ts
type Dtype = "f16" | "f32";
```

The storage type of one tensor in the binary.

***

### EngineMode

```ts
type EngineMode = "worker" | "page";
```

Where the network runs: a blob worker or the page.

***

### MotorSource

```ts
type MotorSource = "procedural" | "neural" | "motion-match" | "clip" | "other";
```

What drives a locomotion backend.

***

### Rng

```ts
type Rng = () => number;
```

Uniform numbers in [0, 1); the family contract.

#### Returns

`number`

***

### Source

```ts
type Source = URL | string | ArrayBuffer | ArrayBufferView | Blob;
```

Where a weight part comes from: a URL to fetch, bytes, or a File or Blob.

***

### StyleLabel

```ts
type StyleLabel = typeof STYLES[number];
```

One style label of `STYLES`.

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

### BONE\_COUNT

```ts
const BONE_COUNT: 27 = 27;
```

The number of bones in `BONES`.

***

### BONES

```ts
const BONES: readonly ["Hips", "Spine", "Spine1", "Neck", "Head", "HeadSite", "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand", "LeftHandSite", "RightShoulder", "RightArm", "RightForeArm", "RightHand", "RightHandSite", "LeftUpLeg", "LeftLeg", "LeftFoot", "LeftFootSite", "RightUpLeg", "RightLeg", "RightFoot", "RightFootSite", "Tail", "Tail1", "Tail1Site"];
```

The 27 bones of the network's dog skeleton, in the order of its input and output.

***

### DEFAULT\_TUNING

```ts
const DEFAULT_TUNING: HostTuning;
```

The default host tuning; each value has its reason beside it in the source.

***

### FRAME\_DT

```ts
const FRAME_DT: number;
```

Seconds between predicted frames and between trajectory samples.

***

### FRAMES

```ts
const FRAMES: 16 = 16;
```

Frames in one prediction.

***

### IN

```ts
const IN: object;
```

Input vector offsets.

#### Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-length"></a> `length` | `339` | `339` |
| <a id="property-positions-1"></a> `positions` | `0` | `0` |
| <a id="property-style-2"></a> `style` | `258` | `258` |
| <a id="property-trajdirections"></a> `trajDirections` | `194` | `194` |
| <a id="property-trajpositions"></a> `trajPositions` | `162` | `162` |
| <a id="property-trajvelocities"></a> `trajVelocities` | `226` | `226` |
| <a id="property-velocities"></a> `velocities` | `81` | `81` |

***

### OUT

```ts
const OUT: object;
```

Output vector offsets, per frame.

#### Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-axisy"></a> `axisY` | `165` | `165` |
| <a id="property-axisz"></a> `axisZ` | `84` | `84` |
| <a id="property-contacts-1"></a> `contacts` | `327` | `327` |
| <a id="property-dx"></a> `dx` | `0` | `0` |
| <a id="property-dyaw"></a> `dyaw` | `1` | `1` |
| <a id="property-dz"></a> `dz` | `2` | `2` |
| <a id="property-length-1"></a> `length` | `412` | `412` |
| <a id="property-positions-2"></a> `positions` | `3` | `3` |
| <a id="property-style-3"></a> `style` | `331` | `331` |
| <a id="property-velocities-1"></a> `velocities` | `246` | `246` |

***

### PARENTS

```ts
const PARENTS: readonly number[];
```

Parent index per bone, -1 for the root.

***

### PAW\_CHAINS

```ts
const PAW_CHAINS: readonly object[];
```

Per paw: the end site, the paw bone, the lower and upper limb bones.

***

### PAWS

```ts
const PAWS: readonly ["front left", "front right", "hind left", "hind right"];
```

Paws in contact order: front left, front right, hind left, hind right.

***

### STYLES

```ts
const STYLES: readonly ["Canter", "Idle", "Jump", "Lie", "Pace", "Sit", "Stand", "Trot", "Walk"];
```

The style labels the network was trained on.

***

### TRAJ\_SAMPLES

```ts
const TRAJ_SAMPLES: 16 = 16;
```

Trajectory samples in one network input.

***

### UPSTREAM

```ts
const UPSTREAM: object;
```

One public copy of the weights, pinned to a commit. Configuration only.

#### Type Declaration

| Name | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| <a id="property-bin-3"></a> `bin` | `"https://raw.githubusercontent.com/sweriko/ai4anim-webgpu/b539455f849f284a1e814eb11ab649eb594319dc/public/quadruped.bin"` | `"https://raw.githubusercontent.com/sweriko/ai4anim-webgpu/b539455f849f284a1e814eb11ab649eb594319dc/public/quadruped.bin"` | - |
| <a id="property-binbytes"></a> `binBytes` | `17704644` | `17_704_644` | Bytes of that binary (vendor). |
| <a id="property-binsha256"></a> `binSha256` | `"9568debf4a41da54f62d19bd7a29fbaf7dcc34c32d4ee472ab8560caefbcb372"` | `"9568debf4a41da54f62d19bd7a29fbaf7dcc34c32d4ee472ab8560caefbcb372"` | SHA-256 of that binary, computed from a downloaded copy. |
| <a id="property-manifest-2"></a> `manifest` | `"https://raw.githubusercontent.com/sweriko/ai4anim-webgpu/b539455f849f284a1e814eb11ab649eb594319dc/public/quadruped.json"` | `"https://raw.githubusercontent.com/sweriko/ai4anim-webgpu/b539455f849f284a1e814eb11ab649eb594319dc/public/quadruped.json"` | - |

***

### WEIGHT\_LICENCE

```ts
const WEIGHT_LICENCE: "motion-net weights: cc by-nc 4.0, paul starke and sebastian starke, meta, ai4animationpy. fetched at run time, never bundled, not for commercial use." = "motion-net weights: cc by-nc 4.0, paul starke and sebastian starke, meta, ai4animationpy. fetched at run time, never bundled, not for commercial use.";
```

The licence line of the network weights, stated on the first load in a page.

## Functions

### dimsOf()

```ts
function dimsOf(m): Dims;
```

Dimensions from the manifest `model` section, checked for consistency.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `m` | [`Manifest`](#manifest) |

#### Returns

[`Dims`](#dims)

***

### engineMain()

```ts
function engineMain(port): void;
```

The engine loop. Self contained: the worker source is this function's
text, so it must not touch anything outside its own body.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `port` | `Port` |

#### Returns

`void`

***

### goldenTrace()

```ts
function goldenTrace(seed): Float64Array;
```

The seeded random network trace that the native and wasm builds must agree on.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `seed` | `number` |

#### Returns

`Float64Array`

***

### lcg()

```ts
function lcg(seed): Rng;
```

The linear congruential generator of the specification's test vectors.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `seed` | `number` |

#### Returns

[`Rng`](#rng)

***

### load()

```ts
function load(source?): Promise<void>;
```

Loads the wasm for the page side helpers (golden trace). The predictor loads its own copy.

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

Loads the page side wasm synchronously from bytes or a compiled module.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `source` | `ArrayBuffer` \| `Module` \| `ArrayBufferView`\<`ArrayBufferLike`\> |

#### Returns

`void`

***

### loadWeights()

```ts
function loadWeights(opts): Promise<Weights>;
```

Fetches or reads both parts, checks them, and states the licence once per page.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts` | [`LoadOptions`](#loadoptions) |

#### Returns

`Promise`\<[`Weights`](#weights)\>

***

### requiredTensors()

```ts
function requiredTensors(d): object[];
```

The tensors the network reads and the dtype the format fixes for each.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `d` | [`Dims`](#dims) |

#### Returns

`object`[]

***

### sha256Hex()

```ts
function sha256Hex(buf): Promise<string>;
```

The SHA-256 of a buffer as lowercase hex.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `buf` | `ArrayBuffer` |

#### Returns

`Promise`\<`string`\>

***

### validate()

```ts
function validate(m, binBytes): string[];
```

Checks a manifest against a binary of `binBytes` bytes. Returns the problems, empty when fine.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `m` | [`Manifest`](#manifest) |
| `binBytes` | `number` |

#### Returns

`string`[]
