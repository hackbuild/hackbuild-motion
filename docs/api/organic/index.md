# index

## Classes

### BodyClock

Game time, circadian drive and sleep pressure (two process model).

#### Constructors

##### Constructor

```ts
new BodyClock(minutes, rate): BodyClock;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `minutes` | `number` |
| `rate` | `number` |

###### Returns

[`BodyClock`](#bodyclock)

#### Properties

| Property | Modifier | Type | Default value |
| ------ | ------ | ------ | ------ |
| <a id="property-asleep"></a> `asleep` | `public` | `boolean` | `false` |
| <a id="property-minutes"></a> `minutes` | `public` | `number` | `undefined` |
| <a id="property-pressure"></a> `pressure` | `public` | `number` | `0.3` |
| <a id="property-rate"></a> `rate` | `public` | `number` | `undefined` |

#### Methods

##### circadian()

```ts
circadian(): number;
```

###### Returns

`number`

##### day()

```ts
day(): number;
```

###### Returns

`number`

##### hour()

```ts
hour(): number;
```

###### Returns

`number`

##### sleepiness()

```ts
sleepiness(): number;
```

###### Returns

`number`

##### tick()

```ts
tick(dt): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `dt` | `number` |

###### Returns

`void`

***

### CascadeBank

Target approximation smoothing, many channels at a fixed step rate
(ported from bellows-voice, MIT).

#### Indexable

```ts
[key: number]: () => void
```

#### Constructors

##### Constructor

```ts
new CascadeBank(
   channels, 
   step_rate_hz, 
   order
): CascadeBank;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `channels` | `number` |
| `step_rate_hz` | `number` |
| `order` | `number` |

###### Returns

[`CascadeBank`](#cascadebank)

#### Methods

##### channels()

```ts
channels(): number;
```

###### Returns

`number`

##### free()

```ts
free(): void;
```

###### Returns

`void`

##### order()

```ts
order(): number;
```

###### Returns

`number`

##### place()

```ts
place(i, value): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `i` | `number` |
| `value` | `number` |

###### Returns

`void`

##### setRate()

```ts
setRate(i, per_second): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `i` | `number` |
| `per_second` | `number` |

###### Returns

`void`

##### setTarget()

```ts
setTarget(i, target): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `i` | `number` |
| `target` | `number` |

###### Returns

`void`

##### setTargets()

```ts
setTargets(targets): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `targets` | `Float64Array` |

###### Returns

`void`

##### setTime()

```ts
setTime(i, seconds): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `i` | `number` |
| `seconds` | `number` |

###### Returns

`void`

##### snap()

```ts
snap(i, value): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `i` | `number` |
| `value` | `number` |

###### Returns

`void`

##### step()

```ts
step(steps, out): void;
```

Steps `steps` times and writes the outputs into `out`.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `steps` | `number` |
| `out` | `Float64Array` |

###### Returns

`void`

##### value()

```ts
value(i): number;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `i` | `number` |

###### Returns

`number`

##### velocity()

```ts
velocity(i): number;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `i` | `number` |

###### Returns

`number`

***

### Inertializer

Offset inertialization over flat rotation and position arrays.

#### Indexable

```ts
[key: number]: () => void
```

#### Constructors

##### Constructor

```ts
new Inertializer(rotations, positions): Inertializer;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `rotations` | `number` |
| `positions` | `number` |

###### Returns

[`Inertializer`](#inertializer)

#### Methods

##### active()

```ts
active(): boolean;
```

###### Returns

`boolean`

##### apply()

```ts
apply(
   rot, 
   pos, 
   dt, 
   halflife
): void;
```

`rot` holds `x y z w` per rotation, `pos` `x y z` per position; both
are read and written in place.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `rot` | `Float64Array` |
| `pos` | `Float64Array` |
| `dt` | `number` |
| `halflife` | `number` |

###### Returns

`void`

##### capture()

```ts
capture(): void;
```

###### Returns

`void`

##### free()

```ts
free(): void;
```

###### Returns

`void`

##### setFast()

```ts
setFast(fast): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `fast` | `boolean` |

###### Returns

`void`

***

### NoiseBank

A bank of OU and pink channels sharing one seeded stream.

#### Indexable

```ts
[key: number]: () => void
```

#### Constructors

##### Constructor

```ts
new NoiseBank(seed): NoiseBank;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `seed` | `number` |

###### Returns

[`NoiseBank`](#noisebank)

#### Methods

##### addOu()

```ts
addOu(
   tau, 
   sigma, 
   mu
): number;
```

Adds an OU channel; returns its index among OU channels.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `tau` | `number` |
| `sigma` | `number` |
| `mu` | `number` |

###### Returns

`number`

##### addPink()

```ts
addPink(tau0, octaves): number;
```

Adds a pink channel; returns its index among pink channels.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `tau0` | `number` |
| `octaves` | `number` |

###### Returns

`number`

##### free()

```ts
free(): void;
```

###### Returns

`void`

##### step()

```ts
step(dt, out): void;
```

Steps every channel: OU channels first, then pink, into `out`.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `dt` | `number` |
| `out` | `Float64Array` |

###### Returns

`void`

##### uniform()

```ts
uniform(): number;
```

###### Returns

`number`

***

### OU

Ornstein Uhlenbeck noise with the exact discrete update.

#### Constructors

##### Constructor

```ts
new OU(
   tau, 
   sigma, 
   mu, 
   rng
): OU;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `tau` | `number` |
| `sigma` | `number` |
| `mu` | `number` |
| `rng` | [`Rng`](#rng) |

###### Returns

[`OU`](#ou)

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-mu"></a> `mu` | `public` | `number` |
| <a id="property-sigma"></a> `sigma` | `public` | `number` |
| <a id="property-tau"></a> `tau` | `public` | `number` |
| <a id="property-x"></a> `x` | `public` | `number` |

#### Methods

##### step()

```ts
step(dt): number;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `dt` | `number` |

###### Returns

`number`

***

### Pink

Summed OU octaves: an approximately 1/f drift with unit variance.

#### Constructors

##### Constructor

```ts
new Pink(
   tau0, 
   octaves, 
   rng
): Pink;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `tau0` | `number` |
| `octaves` | `number` |
| `rng` | [`Rng`](#rng) |

###### Returns

[`Pink`](#pink)

#### Properties

| Property | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-x-1"></a> `x` | `number` | `0` |

#### Methods

##### step()

```ts
step(dt): number;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `dt` | `number` |

###### Returns

`number`

***

### SeededRng

Seeded Mulberry32 stream with the samplers on it.

#### Indexable

```ts
[key: number]: () => void
```

#### Constructors

##### Constructor

```ts
new SeededRng(seed): SeededRng;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `seed` | `number` |

###### Returns

[`SeededRng`](#seededrng)

#### Methods

##### exGaussian()

```ts
exGaussian(
   mu, 
   sigma, 
   tau
): number;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `mu` | `number` |
| `sigma` | `number` |
| `tau` | `number` |

###### Returns

`number`

##### fill()

```ts
fill(out): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `out` | `Float64Array` |

###### Returns

`void`

##### free()

```ts
free(): void;
```

###### Returns

`void`

##### gamma()

```ts
gamma(k, theta): number;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `k` | `number` |
| `theta` | `number` |

###### Returns

`number`

##### gauss()

```ts
gauss(): number;
```

###### Returns

`number`

##### logNormal()

```ts
logNormal(median, sigma): number;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `median` | `number` |
| `sigma` | `number` |

###### Returns

`number`

##### next()

```ts
next(): number;
```

###### Returns

`number`

##### poissonGap()

```ts
poissonGap(rate): number;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `rate` | `number` |

###### Returns

`number`

##### truncatedPowerLaw()

```ts
truncatedPowerLaw(
   min, 
   mu, 
   max
): number;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `min` | `number` |
| `mu` | `number` |
| `max` | `number` |

###### Returns

`number`

##### vonMises()

```ts
vonMises(kappa): number;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `kappa` | `number` |

###### Returns

`number`

***

### SpringBank

Many scalar springs stepped in one call.

#### Indexable

```ts
[key: number]: () => void
```

#### Constructors

##### Constructor

```ts
new SpringBank(n): SpringBank;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `n` | `number` |

###### Returns

[`SpringBank`](#springbank)

#### Methods

##### free()

```ts
free(): void;
```

###### Returns

`void`

##### isEmpty()

```ts
isEmpty(): boolean;
```

###### Returns

`boolean`

##### len()

```ts
len(): number;
```

###### Returns

`number`

##### positions()

```ts
positions(): Float64Array;
```

###### Returns

`Float64Array`

##### setPositions()

```ts
setPositions(x): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `x` | `Float64Array` |

###### Returns

`void`

##### step()

```ts
step(
   goals, 
   halflife, 
   dt, 
   fast, 
   out
): void;
```

Steps every spring toward `goals` and writes the positions into `out`.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `goals` | `Float64Array` |
| `halflife` | `number` |
| `dt` | `number` |
| `fast` | `boolean` |
| `out` | `Float64Array` |

###### Returns

`void`

##### stepEach()

```ts
stepEach(
   goals, 
   halflives, 
   dt, 
   fast, 
   out
): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `goals` | `Float64Array` |
| `halflives` | `Float64Array` |
| `dt` | `number` |
| `fast` | `boolean` |
| `out` | `Float64Array` |

###### Returns

`void`

##### velocities()

```ts
velocities(): Float64Array;
```

###### Returns

`Float64Array`

## Interfaces

### SpringState

Position `x`, velocity `v` and acceleration `a` of one scalar spring, changed in place by the spring calls.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-a"></a> `a` | `number` |
| <a id="property-v"></a> `v` | `number` |
| <a id="property-x-2"></a> `x` | `number` |

## Type Aliases

### Rng

```ts
type Rng = () => number;
```

Uniform numbers in [0, 1). The family contract: injected, never Math.random.

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

### sample

```ts
const sample: object;
```

Samplers. Each takes the random source last and keeps no state.

#### Type Declaration

| Name | Type | Description |
| ------ | ------ | ------ |
| <a id="property-eventinstep"></a> `eventInStep()` | (`rate`, `dt`, `rng`) => `boolean` | Whether a Poisson event lands in a step of dt seconds; exact for any dt. |
| <a id="property-exgaussian"></a> `exGaussian()` | (`mu`, `sigma`, `tau`, `rng`) => `number` | Normal(mu, sigma) plus Exponential(tau): reaction times. Mean mu + tau. |
| <a id="property-gamma"></a> `gamma()` | (`k`, `theta`, `rng`) => `number` | - |
| <a id="property-gauss"></a> `gauss()` | (`rng`) => `number` | - |
| <a id="property-lognormal"></a> `logNormal()` | (`median`, `sigma`, `rng`) => `number` | - |
| <a id="property-poissongap"></a> `poissonGap()` | (`rate`, `rng`) => `number` | Seconds to the next event of a Poisson process. |
| <a id="property-truncatedpowerlaw"></a> `truncatedPowerLaw()` | (`min`, `mu`, `max`, `rng`) => `number` | Power law step length with exponent mu in (1, 3], clipped to max. |
| <a id="property-vonmises"></a> `vonMises()` | (`kappa`, `rng`) => `number` | Von Mises angle around zero (Best and Fisher 1979). |
| <a id="property-weightedindex"></a> `weightedIndex()` | (`weights`, `rng`) => `number` | Index drawn with probability proportional to its weight. |

## Functions

### decay()

```ts
function decay(
   s, 
   halflife, 
   dt, 
   exact?
): number;
```

Decays an offset toward zero, the inertialization core.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `s` | [`SpringState`](#springstate) | `undefined` |
| `halflife` | `number` | `undefined` |
| `dt` | `number` | `undefined` |
| `exact?` | `boolean` | `true` |

#### Returns

`number`

***

### fastNegexp()

```ts
function fastNegexp(x): number;
```

A rational approximation of `exp(-x)` for x of 0 or more, used when `exact` is false.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `x` | `number` |

#### Returns

`number`

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

### halflifeToDamping()

```ts
function halflifeToDamping(halflife): number;
```

The damping constant for a half life in seconds, the time the spring takes to cover half the distance to its goal.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `halflife` | `number` |

#### Returns

`number`

***

### hashSeed()

```ts
function hashSeed(s): number;
```

FNV-1a over UTF-16 code units, equal to the Rust `hash_seed`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `s` | `string` |

#### Returns

`number`

***

### keyed()

```ts
function keyed(t, keys): number;
```

Piecewise minimum jerk through [time, value] keys sorted by time.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `t` | `number` |
| `keys` | readonly (readonly \[`number`, `number`\])[] |

#### Returns

`number`

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

### minimumJerk()

```ts
function minimumJerk(t): number;
```

Minimum jerk profile on t in 0 to 1.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `t` | `number` |

#### Returns

`number`

***

### seededRng()

```ts
function seededRng(seed): Rng;
```

Mulberry32, the same stream as the Rust `Mulberry32` and the wasm `SeededRng`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `seed` | `string` \| `number` |

#### Returns

[`Rng`](#rng)

***

### spring()

```ts
function spring(
   s, 
   goal, 
   halflife, 
   dt, 
   exact?
): number;
```

Critically damped spring toward `goal`. `exact` false uses the fast exp.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `s` | [`SpringState`](#springstate) | `undefined` |
| `goal` | `number` | `undefined` |
| `halflife` | `number` | `undefined` |
| `dt` | `number` | `undefined` |
| `exact?` | `boolean` | `true` |

#### Returns

`number`

***

### springDamper()

```ts
function springDamper(
   s, 
   goal, 
   vGoal, 
   ratio, 
   halflife, 
   dt
): number;
```

Spring damper with a damping ratio (1 critical, below 1 overshoots).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `s` | [`SpringState`](#springstate) |
| `goal` | `number` |
| `vGoal` | `number` |
| `ratio` | `number` |
| `halflife` | `number` |
| `dt` | `number` |

#### Returns

`number`

***

### springState()

```ts
function springState(x?): SpringState;
```

A spring state at rest at `x` (default 0).

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `x?` | `number` | `0` |

#### Returns

[`SpringState`](#springstate)

***

### velocitySpring()

```ts
function velocitySpring(
   s, 
   vGoal, 
   halflife, 
   dt, 
   exact?
): number;
```

Velocity eases toward `vGoal`; position integrates it exactly. Returns x.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `s` | [`SpringState`](#springstate) | `undefined` |
| `vGoal` | `number` | `undefined` |
| `halflife` | `number` | `undefined` |
| `dt` | `number` | `undefined` |
| `exact?` | `boolean` | `true` |

#### Returns

`number`
