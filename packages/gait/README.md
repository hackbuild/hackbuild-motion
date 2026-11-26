# @hackbuild/gait

Procedural locomotion for legged rigs: Froude gait choice, leg oscillators, footfall tables, posture springs, tail and ears, with a Rust core in wasm.

[![npm](https://img.shields.io/npm/v/@hackbuild/gait)](https://www.npmjs.com/package/@hackbuild/gait) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 59.5 kB measured](https://img.shields.io/badge/gzip-59.5%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

## What it does

- Picks walk, pace, trot, canter or gallop from the Froude number, with a dead band and a per animal pace bias, from validated footfall tables.
- Steps four legs with `QuadrupedGait`: a phase oscillator per leg, landing prediction, minimum jerk swings, stepping in place, and a stop that lets swinging feet land first.
- Moves the body with `BodyDynamics`: sit, down, bow and reach postures, terrain pitch and roll, gait bob, lean into turns, load shift and breathing.
- Adds a tail (`TailWag`, eight wag modes), ears (`Ears`) and obstacle steering (`steer`).
- Drives a three.js quadruped under `/three`: `measureQuadruped` reads the rig, `driveQuadruped` writes each frame with two bone leg IK.

## Install

```sh
npm install @hackbuild/gait
```

three.js is an optional peer, needed only for the `/three` subpath.

| subpath | what | needs |
|---|---|---|
| `@hackbuild/gait` | gait, body, tail, ears, steering, the backend interface | nothing |
| `@hackbuild/gait/three` | `measureQuadruped`, `driveQuadruped` | `three` 0.186.1 or later (optional peer) |
| `@hackbuild/gait/wasm` | the wasm file, for `load(url)` | nothing |
| `@hackbuild/gait/inline` | the wasm as base64, what `load()` uses with no argument | nothing |
| `@hackbuild/gait/iife` | `dist/gait.iife.js`, a classic script setting `HackbuildGait` | `THREE` on the page for the adapter |

## Quick start

```ts
import { load, QuadrupedGait, type LegSpec } from "@hackbuild/gait";

await load(); // the wasm core is inlined; load() also takes a URL or bytes

// four legs (LF RF LH RH) in the body frame, meters: x to the left, z forward
const legs: LegSpec[] = [
  { x: 0.09, z: 0.22, toe: 0.02, front: true },
  { x: -0.09, z: 0.22, toe: 0.02, front: true },
  { x: 0.09, z: -0.2, toe: 0.02, front: false },
  { x: -0.09, z: -0.2, toe: 0.02, front: false },
];
let seed = 1;
const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647; // any seeded () => number
const gait = new QuadrupedGait(legs, 0.42, { rng });

// walk forward at 1.2 m/s for 2 seconds at 60 frames per second
const pose = { x: 0, z: 0, yaw: 0 };
for (let frame = 0; frame < 120; frame++) {
  pose.z += 1.2 / 60;
  const s = gait.update(1 / 60, pose, { speed: 1.2, turnRate: 0 });
  const main = Object.entries(s.weights).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (frame % 30 === 29) console.log(`${main}, froude ${s.froude.toFixed(2)}, feet down ${s.feet.filter((f) => f.stance).length}`);
}
```

## Live example

The demo page drives a dog of simple shapes with gait choice, leg oscillators, posture springs, tail and ears: [hackbuild-motion/gait](https://hackbuild.github.io/hackbuild-motion/gait/). In the suite: [hackbuild-suite gait](https://hackbuild.github.io/hackbuild-suite/#/motion/gait).

## Concepts

### load the wasm first

`load()` instantiates the wasm once; with no argument it decodes the inlined copy, which works from file://. Pass a URL, a Response, bytes or a compiled module to load from elsewhere. Every class here throws until it is loaded.

### body frame and units

Legs are given in the body frame in meters: x to the body's left, z forward, toe height above the ground at rest. Speed is m/s, turn rate rad/s. Foot heights come out above the ground; your `ground(x, z)` adds the terrain on the TypeScript side, so no callback crosses into wasm.

### a frame of motion

Each frame you step the gait, then the body, then feed the body's posture offsets back to the gait, then write the rig:

```ts
import { BodyDynamics, QuadrupedGait, TailWag } from "@hackbuild/gait";
import { driveQuadruped, measureQuadruped } from "@hackbuild/gait/three";

const rig = measureQuadruped(dog, names); // dog at the origin, facing +Z, in its rest pose
const gait = new QuadrupedGait(rig.specs, rig.legLength, { ground: heightAt, rng });
const body = new BodyDynamics(rig.geometry, rng);
const tail = new TailWag(3, 0.06, rng);
function frame(dt: number, pose: { x: number; z: number; yaw: number }, cmd = { speed: 1.2, turnRate: 0 }) {
  const s = gait.update(dt, pose, cmd);
  const b = body.update(dt, s, cmd, gait.nominal(pose.x, pose.z, pose.yaw).map(([x, z]) => heightAt(x, z)));
  gait.setOffsets(b.legOffsets);
  driveQuadruped(rig, pose, s, b, { tail: tail.update(dt, { modeWeights: [1, 2, 1, 1, 0, 0, 0, 1], arousal: 0.4 }) });
}
```

### randomness is injected

Every class takes an `Rng = () => number`; it seeds the wasm streams, so the same seed gives the same motion in Node, tests and the browser.

### one motor state for every source

`MotorState` (source label, phase, duty, stride frequency, contacts) is filled by whatever moves the body: `motorStateOf(gaitState)` for this oscillator, `PhaseEstimator` for a neural network, clip or motion matcher, which derives phase from touchdown timing. Diagnostics read this state and show the source label.

### backends

`LocomotionBackend` declares `capabilities` (turn in place, minimum stop distance, head pitch bias). `ProceduralBackend` wraps this gait, so a neural or motion matching backend can stand in and the caller asks it how close it can stop instead of assuming.

## API overview

| export | what it does |
|---|---|
| [`load`](../../docs/api/gait/index.md#load) | instantiate the wasm, inlined by default |
| [`QuadrupedGait`](../../docs/api/gait/index.md#quadrupedgait) | the leg oscillator for four legs |
| [`BodyDynamics`](../../docs/api/gait/index.md#bodydynamics) | posture springs, terrain pitch and roll, bob, lean and breath |
| [`TailWag`](../../docs/api/gait/index.md#tailwag) | tail spring chain with eight wag modes |
| [`Ears`](../../docs/api/gait/index.md#ears) | two ear springs |
| [`steer`](../../docs/api/gait/index.md#steer) | potential field steering toward a goal |
| [`quadrupedTables`](../../docs/api/gait/index.md#quadrupedtables) | the footfall tables of the five gaits |
| [`PhaseEstimator`](../../docs/api/gait/index.md#phaseestimator) | gait phase from contacts alone |
| [`motorStateOf`](../../docs/api/gait/index.md#motorstateof) | the motor state of a gait frame |
| [`ProceduralBackend`](../../docs/api/gait/index.md#proceduralbackend) | this gait as a locomotion backend |
| [`measureQuadruped`](../../docs/api/gait/three.md#measurequadruped) | read leg spots, toe heights and leg length from a three.js rig |
| [`driveQuadruped`](../../docs/api/gait/three.md#drivequadruped) | write a frame onto a three.js rig with leg IK |

The full reference is in [docs/api/gait](../../docs/api/gait/README.md).

## Browser support

| feature | needs | notes |
|---|---|---|
| wasm core | WebAssembly with SIMD128 | every current desktop and phone browser (inferred); no threads, so no cross origin isolation |
| `/three` adapter | three.js 0.186.1 or later | |
| file:// | `dist/gait.iife.js` | a classic script with the wasm inlined; reads `THREE` from the page |

## Errors and troubleshooting

| message | cause | what to do |
|---|---|---|
| `@hackbuild/gait: wasm not loaded. call load() first.` | a class was made before `load()` resolved | `await load()` once at start up |
| `gait: no bone named <name>` | `measureQuadruped` found no object with a name you passed | check the names against the model; `limbChains` from `@hackbuild/rig` lists them |
| a `WebAssembly` compile or fetch error | `load(url)` pointed at a missing or wrong file | call `load()` with no argument, or check the URL serves `gait_bg.wasm` |

`driveQuadruped` returns the legs whose target was out of reach; a long list means the leg specs or the leg length do not match the rig.

## Works with

- [@hackbuild/rig](../rig/README.md) finds the leg, tail and ear chains to name.
- [@hackbuild/ik](../ik/README.md) locks planted feet with `FootLock`.
- [@hackbuild/organic](../organic/README.md) gives `seededRng` and springs for the rest of the body.
- [@hackbuild/motion-net](../motion-net/README.md) and [@hackbuild/motion-match](../motion-match/README.md) can stand in as locomotion backends.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)); this README is CC-BY-4.0 with its code samples also MIT. No weights or model files ship here. The tail model follows Ren (2022); the quadruped footfall offsets follow Hildebrand.

## What is verified, and what is not

| check | result | label |
|---|---|---|
| `cargo test -p hackbuild-gait` | 15 of 15 pass, clippy clean natively and for wasm32 | counted |
| `npx vitest run packages/gait` | 8 of 8 pass, one a fast-check property over seed and speed | counted |
| footfall tables | trot pairs diagonals and pace pairs sides at every sampled phase; the walk keeps two or more feet down; the tripod keeps three | computed |
| stance feet | 0 m slide between frames after the first second, over 1,200 frames at 2 m/s and by property over 0.2 to 5 m/s; a stopped dog stands with every foot within the step threshold | computed |
| three.js adapter | on a synthetic dog at 0.6 m/s while turning, toe tips within 1 mm of targets on every reached frame, planted toes moved under 1 mm, 1 of 960 leg frames out of reach | measured |
| `PhaseEstimator` | phase within 0.05 of a stride and frequency within 3 percent at 1.6 m/s, over 720 frames at 120 Hz | computed |
| Froude thresholds | 0.12, 0.42 and 1.5 | vendor |
| golden trace | gait, body, tail, ears and steering bit identical between native and wasm | measured |

Not verified by anything:

- `QuadrupedHost` in `@hackbuild/motion-net` fills `MotorState` with source `neural`; nothing here checks it against this gait.
- Motion on a real dog rig, in a real browser at real frame rate, watched by a person.
- Turn in place beyond what the oscillator does when only the turn rate is non zero.
- Digitigrade hind legs: the hock is treated as part of the paw.
- Hexapod gaits on a rig; the tripod, ripple and wave tables in the crate are tested as data only.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 59,539 bytes | 62,515 bytes |
| `dist/wasm/gait_bg.wasm` | 39,043 bytes | 40,995 bytes |
| `dist/gait.iife.js` (single file build) | 61,421 bytes | 64,492 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.
