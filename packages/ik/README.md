# @hackbuild/ik

Inverse kinematics for characters on the web: two bone, FABRIK, CCD, clamped look at, finger curl and foot locking, with a Rust core in wasm.

[![npm](https://img.shields.io/npm/v/@hackbuild/ik)](https://www.npmjs.com/package/@hackbuild/ik) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 49.8 kB measured](https://img.shields.io/badge/gzip-49.8%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

## What it does

- Solves arms and legs analytically with `twoBone`, bending toward a pole direction, with an optional soft reach.
- Solves longer chains with `fabrik` (cone and hinge limits) or `ccd` (a step cap per joint), and turns a solved chain back into bone rotations with `segmentDeltas`.
- Aims a head over a spine, neck and head chain with yaw and pitch limits (`lookAngles`, `lookChain`), and hands what the neck cannot take to the body.
- Builds a palm frame and grip point and curls fingers and thumb (`handCurl`).
- Holds a foot where it landed while it bears weight and releases it smoothly (`ContactLock`), with the hip drop that keeps a locked foot in reach (`pelvisDrop`).

## Install

```sh
npm install @hackbuild/ik
```

three.js is an optional peer, needed only for the `/three` subpath.

| subpath | what | needs |
|---|---|---|
| `@hackbuild/ik` | solvers on plain arrays | nothing |
| `@hackbuild/ik/three` | `solveTwoBone`, `solveChain`, `lookAtChain`, `curlFingers`, `FootLock`, `rotateWorld` on three.js objects | `three` 0.186.1 or later (optional peer) |
| `@hackbuild/ik/wasm` | the wasm file, for `load(url)` | nothing |
| `@hackbuild/ik/inline` | the wasm as base64, what `load()` uses with no argument | nothing |
| `@hackbuild/ik/iife` | `dist/ik.iife.js`, a classic script setting `HackbuildIk` | `THREE` on the page for the adapter |

## Quick start

```ts
import { DEFAULT_LOOK_LIMITS, load, lookAngles, twoBone, type Vec3 } from "@hackbuild/ik";

// the wasm core is inlined; load() also takes a URL or bytes
await load();

// a left leg in meters, +Y up, +Z forward: hip, knee, ankle
const hip: Vec3 = [0.1, 0.9, 0];
const knee: Vec3 = [0.1, 0.5, 0];
const ankle: Vec3 = [0.1, 0.1, 0];
// put the foot on a step 20 cm up and 15 cm ahead, knee bending forward
const leg = twoBone(hip, knee, ankle, [0.1, 0.3, 0.15], [0, 0, 1]);
console.log("knee", leg.mid, "foot reached", leg.reached);

// head at 1.6 m facing +Z (identity frame) looking at a point up and to the left
const look = lookAngles([0, 0, 0, 1], [0, 1.6, 0], [1, 1.9, 1], DEFAULT_LOOK_LIMITS);
console.log(`yaw ${look.yaw.toFixed(2)} rad, pitch ${look.pitch.toFixed(2)} rad, clamped ${look.clamped}`);
```

## Live example

The demo page solves a two bone arm and leg, a FABRIK and CCD chain, a clamped head look at and a locked foot: [hackbuild-motion/ik](https://hackbuild.github.io/hackbuild-motion/ik/). The suite's motion tool runs the same solvers: [hackbuild-suite ik](https://hackbuild.github.io/hackbuild-suite/#/motion/ik).

## Concepts

### load the wasm first

`load()` instantiates the wasm once; later calls return the same promise. With no argument it decodes the inlined copy, which works from file://. Pass a URL, a Response, bytes or a compiled module to load from elsewhere, or call `loadSync(bytes)`. Every solver throws until it is loaded.

### positions in, rotation deltas out

The solvers work on joint positions in meters and return world space rotation deltas (`Quat`, `[x, y, z, w]`). The same code then drives a three.js skeleton, a raw bone array or a test. `fabrik` and `ccd` change the positions array in place; `segmentDeltas(old, next)` gives the rotation per segment, to apply parent first.

### the three.js adapter

`@hackbuild/ik/three` reads world positions from your bones, solves, and writes local rotations back, keeping each bone's parent:

```ts
import { FootLock, lookAtChain, solveTwoBone } from "@hackbuild/ik/three";

const lock = new FootLock(); // holds while contact is above 0.55
function frame(dt: number) {
  lock.update(dt, footTarget, contact);
  solveTwoBone(bones.leftUpperLeg, bones.leftLowerLeg, bones.leftFoot, footTarget, kneeForward);
  lookAtChain([bones.neck, bones.head], [0.4, 0.6], camera.position, body.quaternion);
}
```

### look limits and the seam behind the head

`lookAngles` clamps yaw and pitch to `LookLimits` (by default 1.25 rad of yaw either side, 0.8 rad down, 0.6 rad up). Past the yaw limit the result says `behind` and returns the rest as `bodyYaw`, for the body to turn. Pass last frame's `yaw + bodyYaw` as `prevYaw`: past 2.2 rad a sign flip keeps the previous side, so a target crossing behind does not whip the head across. `clampDirection` keeps the eyes within a cone of the head.

### foot locking

`ContactLock` (and `FootLock` in the adapter) holds a foot where it landed while contact is above the threshold, then releases it over a time constant (0.06 s by default) that reaches zero without a final step. A contact during a release is held where the foot is shown. `pelvisDrop` gives how far to lower the hips so a locked foot stays in reach.

## API overview

| export | what it does |
|---|---|
| [`load`](../../docs/api/ik/index.md#load) | instantiate the wasm, inlined by default |
| [`twoBone`](../../docs/api/ik/index.md#twobone) | analytic two bone solve with a pole |
| [`fabrik`](../../docs/api/ik/index.md#fabrik) | FABRIK on a chain, with cone and hinge limits |
| [`ccd`](../../docs/api/ik/index.md#ccd) | CCD on a chain, with a step cap per joint |
| [`segmentDeltas`](../../docs/api/ik/index.md#segmentdeltas) | rotation per segment between two chains |
| [`lookAngles`](../../docs/api/ik/index.md#lookangles) | clamped yaw and pitch toward a target |
| [`lookChain`](../../docs/api/ik/index.md#lookchain) | share yaw and pitch over a chain by weight |
| [`clampDirection`](../../docs/api/ik/index.md#clampdirection) | keep an eye direction within a cone of the head |
| [`handCurl`](../../docs/api/ik/index.md#handcurl) | palm frame, grip point and finger curl |
| [`ContactLock`](../../docs/api/ik/index.md#contactlock) | hold a foot while it bears weight |
| [`pelvisDrop`](../../docs/api/ik/index.md#pelvisdrop) | hip drop that keeps a foot in reach |
| [`solveTwoBone`](../../docs/api/ik/three.md#solvetwobone) | two bone solve on three.js bones |
| [`solveChain`](../../docs/api/ik/three.md#solvechain) | FABRIK or CCD on three.js bones |
| [`lookAtChain`](../../docs/api/ik/three.md#lookatchain) | look at over three.js bones |
| [`curlFingers`](../../docs/api/ik/three.md#curlfingers) | curl a three.js hand |
| [`FootLock`](../../docs/api/ik/three.md#footlock) | foot lock on a three.js `Vector3` |

The full reference is in [docs/api/ik](../../docs/api/ik/README.md).

## Browser support

| feature | needs | notes |
|---|---|---|
| wasm core | WebAssembly with SIMD128 | every current desktop and phone browser (inferred); no threads, so no cross origin isolation |
| `/three` adapter | three.js 0.186.1 or later | |
| file:// | `dist/ik.iife.js` | a classic script with the wasm inlined; reads `THREE` from the page |

Nothing falls back: a browser without wasm SIMD128 cannot load the core.

## Errors and troubleshooting

| message | cause | what to do |
|---|---|---|
| `@hackbuild/ik: wasm not loaded. call load() first.` | a solver ran before `load()` resolved | `await load()` once at start up |
| a `WebAssembly` compile or fetch error | `load(url)` pointed at a missing or wrong file | call `load()` with no argument to use the inlined copy, or check the URL serves `ik_bg.wasm` |

A target out of reach is not an error: `twoBone` returns `reached: false` with the chain stretched toward it, and `fabrik` and `ccd` return the remaining `error` in meters. A zero length bone or a non finite input leaves the chain as it was.

### mistakes to avoid

- Calling a solver before `await load()`.
- Mixing units: positions are meters in one space, +Y up and +Z forward; a rig in centimeters needs scaling first (see `@hackbuild/rig` `analyzeRest`).
- Applying the deltas child first; apply each world delta parent first, as `segmentDeltas` and `lookChain` order them.
- Passing `prevYaw` as 0 every frame; pass last frame's `yaw + bodyYaw`, or a target crossing behind the head flips sides.
- Forgetting `free()` on a `ContactLock` you no longer use (or `dispose()` on `FootLock`); it holds wasm memory.

## Works with

- [@hackbuild/rig](../rig/README.md) maps bone names and measures the rest pose, so you know which bones to solve.
- [@hackbuild/gait](../gait/README.md) produces foot targets and contacts for `FootLock`.
- [@hackbuild/presence](../presence/README.md) aims gaze and reaches with these solvers.
- [@hackbuild/organic](../organic/README.md) blends IK on and off with `PoseInertializer`.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)); this README is CC-BY-4.0 with its code samples also MIT. No weights or model files ship here.

## What is verified, and what is not

| check | result | label |
|---|---|---|
| `cargo test -p hackbuild-ik` | 16 unit tests pass, clippy clean natively and for wasm32 | counted |
| `npx vitest run packages/ik` | all pass, two are fast-check properties | counted |
| two bone reach | every target in the reach band met within 1e-8 m, bone lengths kept within 1e-9 m, on 2,000 seeded chains in Rust and 500 property cases in TypeScript | computed |
| FABRIK | 98 percent or more of 500 seeded reachable targets met within 1e-6 m in 64 iterations; a straight chain with the target on its axis bends off the line; 20,000 scanned seeds of 200 runs met 1e-4 m in 512 iterations | computed |
| look at seam | a target sweeping from 1 to 3.95 rad keeps the head on its starting side and reports `behind` past 1.25 rad | computed |
| foot lock | 0 mm drift on the solved foot over 241 locked frames in Chrome 150; release steps never grow; a re-contact during a release holds the shown foot | measured |
| golden trace | bit identical between the native and the wasm build | measured |

Not verified by anything:

- The finger and thumb curl directions on a real rig; the test checks only that fingertips move.
- Look at and IK in a real browser at real frame rate, watched by a person.
- Digitigrade three segment legs (hock joints); use `fabrik` with hinge limits, or `twoBone` on the first two segments.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 49,806 bytes | 52,296 bytes |
| `dist/wasm/ik_bg.wasm` | 32,703 bytes | 34,338 bytes |
| `dist/ik.iife.js` (single file build) | 51,424 bytes | 53,995 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.
