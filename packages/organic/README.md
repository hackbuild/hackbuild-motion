# @hackbuild/organic

Critically damped springs, inertialization, seeded noise and samplers for procedural animation, with a Rust core in wasm.

[![npm](https://img.shields.io/npm/v/@hackbuild/organic)](https://www.npmjs.com/package/@hackbuild/organic) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 46.4 kB measured](https://img.shields.io/badge/gzip-46.4%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

## What it does

- Moves a value toward a goal with springs set by half life: `spring`, `decay`, `velocitySpring`, `springDamper`, and `SpringBank` for many springs per frame in wasm.
- Blends from one pose to the next with offset inertialization: `Inertializer` on flat arrays, `PoseInertializer` on three.js bones.
- Draws seeded noise (`OU`, `Pink`, `NoiseBank`) and samples (`sample.gauss`, `exGaussian`, `vonMises`, `poissonGap`, `eventInStep` and more), all from one injected random source.
- Smooths targets through a cascade of first order lags (`CascadeBank`), exact at any step rate, for jaw and lip motion.
- Keeps a body clock with a daily drive and sleep pressure (`BodyClock`).

## Install

```sh
npm install @hackbuild/organic
```

three.js is an optional peer, needed only for the `/three` subpath.

| subpath | what | needs |
|---|---|---|
| `@hackbuild/organic` | springs, samplers, noise, inertializer, cascade, body clock | nothing |
| `@hackbuild/organic/three` | `PoseInertializer` over three.js bones | `three` 0.186.1 or later (optional peer) |
| `@hackbuild/organic/wasm` | the wasm file, for `load(url)` | nothing |
| `@hackbuild/organic/inline` | the wasm as base64, what `load()` uses with no argument | nothing |
| `@hackbuild/organic/iife` | `dist/organic.iife.js`, a classic script setting `HackbuildOrganic` | `THREE` on the page for the adapter |

## Quick start

```ts
import { load, sample, seededRng, spring, springState } from "@hackbuild/organic";

// the wasm core is inlined; load() also takes a URL or bytes
await load();

// one seed gives the same motion in Node, in tests and in the browser
const rng = seededRng("rex");
const head = springState(0);
let goal = 0.6;

// 2 seconds at 60 frames per second
for (let frame = 0; frame < 120; frame++) {
  const dt = 1 / 60;
  // about one glance a second, to a random new angle
  if (sample.eventInStep(1, dt, rng)) goal = sample.gauss(rng) * 0.5;
  // critically damped: half way to the goal in 0.12 s, no overshoot
  const yaw = spring(head, goal, 0.12, dt);
  if (frame % 30 === 0) console.log(`frame ${frame}: head yaw ${yaw.toFixed(3)} rad`);
}
```

## Live example

The package page, with how it works and the code it runs: [hackbuild-motion/organic](https://hackbuild.github.io/hackbuild-motion/organic/). Every other demo page of the site moves its characters with these springs.

## Concepts

### load the wasm first

`load()` instantiates the wasm once; later calls return the same promise. With no argument it decodes the inlined copy, which works from file://. Pass a URL, a Response, bytes or a compiled module to load it from elsewhere, or call `loadSync(bytes)` when you already hold the bytes. The wasm classes (`SpringBank`, `Inertializer`, `NoiseBank`, `SeededRng`, `CascadeBank`) and `PoseInertializer` throw until it is loaded. The scalar functions in TypeScript (`spring`, `sample`, `seededRng` and the rest) need no wasm.

### half life, not stiffness

Every spring takes a half life in seconds: the time to cover half the distance to the goal. A head turn might use 0.12 s, a slow body lean 0.4 s. `halflifeToDamping` converts it when you need the damping constant. Each spring call takes `exact`; false uses `fastNegexp`, a rational approximation of `exp(-x)`.

### a spring is plain state

`springState(x)` gives `{ x, v, a }`. The spring calls change it in place and return the new position, so you keep one state per value and step it each frame.

### inertialization

When the source of a pose changes (a new clip, a new gait, IK switched on), call `capture()` on the frame of the switch, write the new pose, then `apply(dt, halflife)`. The offset between the old and the new pose decays to zero, carrying the old velocity, so nothing pops.

```ts
const inert = new PoseInertializer([hips, spine, neck], { positions: [hips] });
// each frame, after you wrote the new pose:
if (switched) inert.capture();
inert.apply(dt, 0.15);
```

### randomness is injected

Every sampler and noise process takes an `Rng = () => number`. `seededRng(seed)` (Mulberry32, seed a number or a string) gives the same stream in the TypeScript kernel and in the wasm `SeededRng`, so a seed replays the same motion.

### why part of it is TypeScript

A scalar spring step or one random draw costs less than a call into wasm, so the scalar kernel is TypeScript written in the crate's operation order. `seededRng` and the fast spring match the wasm build bit for bit; functions using `exp`, `log` or `cos` may differ in the last bit, since the crate uses `libm`.

## API overview

| export | what it does |
|---|---|
| [`load`](../../docs/api/organic/index.md#load) | instantiate the wasm, inlined by default |
| [`spring`](../../docs/api/organic/index.md#spring) | critically damped spring toward a goal |
| [`decay`](../../docs/api/organic/index.md#decay) | decay an offset toward zero |
| [`velocitySpring`](../../docs/api/organic/index.md#velocityspring) | ease velocity toward a goal, integrate position |
| [`springDamper`](../../docs/api/organic/index.md#springdamper) | spring with an explicit damping ratio |
| [`springState`](../../docs/api/organic/index.md#springstate) | a spring state at rest |
| [`seededRng`](../../docs/api/organic/index.md#seededrng) | a seeded random source from a number or string |
| [`sample`](../../docs/api/organic/index.md#sample) | stateless samplers: gauss, ex gaussian, von Mises, Poisson gaps and more |
| [`OU`](../../docs/api/organic/index.md#ou) and [`Pink`](../../docs/api/organic/index.md#pink) | Ornstein Uhlenbeck and pink noise |
| [`SpringBank`](../../docs/api/organic/index.md#springbank) | many springs stepped in wasm |
| [`Inertializer`](../../docs/api/organic/index.md#inertializer) | offset inertialization on flat arrays |
| [`CascadeBank`](../../docs/api/organic/index.md#cascadebank) | target smoothing through a cascade of lags |
| [`BodyClock`](../../docs/api/organic/index.md#bodyclock) | daily drive and sleep pressure |
| [`PoseInertializer`](../../docs/api/organic/three.md#poseinertializer) | inertialization over three.js bones and positions |

The full reference is in [docs/api/organic](../../docs/api/organic/README.md).

## Browser support

| feature | needs | notes |
|---|---|---|
| wasm core | WebAssembly with SIMD128 | every current desktop and phone browser (inferred); no threads, so no cross origin isolation |
| scalar kernel | nothing | plain TypeScript, also runs in Node |
| `/three` adapter | three.js 0.186.1 or later | |
| file:// | `dist/organic.iife.js` | a classic script with the wasm inlined; reads `THREE` from the page |

Nothing falls back: a browser without wasm SIMD128 cannot load the core, while the scalar functions still run.

## Errors and troubleshooting

| message | cause | what to do |
|---|---|---|
| `@hackbuild/organic: wasm not loaded. call load() first.` | a wasm class or `PoseInertializer` was made before `load()` resolved | `await load()` once at start up |
| a `WebAssembly` compile or fetch error | `load(url)` pointed at a missing or wrong file | call `load()` with no argument to use the inlined copy, or check the URL serves `organic_bg.wasm` |

## Works with

- [@hackbuild/presence](../presence/README.md) builds gaze, blink and breath on these springs and samplers.
- [@hackbuild/gait](../gait/README.md) and [@hackbuild/ik](../ik/README.md) produce poses you can blend with `PoseInertializer`.
- [@hackbuild/lipsync](../lipsync/README.md) smooths viseme weights.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)); this README is CC-BY-4.0 with its code samples also MIT. No weights or model files ship here. The spring and inertialization formulas follow Daniel Holden's published articles "Spring-It-On" and "Dead Blending" (theorangeduck.com). The cascade implements the target approximation model of Birkholz, Kroger and Neuschaefer-Rube (2011) and Birkholz and Hoole (2012), ported from bellows-voice (MIT, same author).

## What is verified, and what is not

| check | result | label |
|---|---|---|
| `cargo test -p hackbuild-organic` | 32 unit tests pass, clippy clean natively and for wasm32, builds as `no_std` | counted |
| `npx vitest run packages/organic` | 18 of 18 pass, three are fast-check properties | counted |
| golden trace, seed 20261122 | 157 values over every sampler, spring, noise process, the inertializer, the clock and a two channel cascade are bit identical between native and wasm | measured |
| fast exp | within 0.2 percent of `exp(-x)` on 0 to 1, over 1001 points and by property | measured |
| cascade | 98 percent constant 12.03 at order 6 and 5.83 at order 2; the same curve at 100 and 1000 Hz within 1e-12; velocity peak at 0.42 of the 98 percent time | computed |
| inertializer | a switch to a source moving the same way keeps the output velocity at 1 m/s within 1e-9 | computed |
| IIFE bundle in Node | loads with three from the global scope and reproduces the first golden value | measured |

Not verified by anything:

- Motion in a real browser at real frame rate; nobody has looked at it yet.
- The IIFE bundle on a page opened from file:// in a browser.
- Dead blending, the published alternative to offset inertialization, is not written.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 46,415 bytes | 48,735 bytes |
| `dist/wasm/organic_bg.wasm` | 27,822 bytes | 29,213 bytes |
| `dist/organic.iife.js` (single file build) | 46,978 bytes | 49,326 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.
