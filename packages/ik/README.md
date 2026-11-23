# @hackbuild/ik

Inverse kinematics for characters on the web. The core is the Rust crate
`crates/ik` compiled to wasm32 with SIMD128; this package loads it and
offers a three.js adapter under `/three`. Solvers work on joint positions
and return world space rotation deltas, so the same code drives a three.js
skeleton, a raw bone array or a test.

- `twoBone`: analytic two bone solve (law of cosines) with a pole
  direction and optional soft reach, for arms and legs.
- `fabrik` with cone and hinge limits, `ccd` with a per joint step cap, and
  `segmentDeltas` to carry a solved position chain back onto bones.
- `lookAngles` and `lookChain`: look at with yaw and pitch clamps shared
  over a spine, neck and head chain; `clampDirection` keeps eye aim within
  a cone of the head.
- `handCurl`: palm frame and grip point from the index and little finger
  knuckles (3.5 cm off the palm), with finger and thumb curl axes and
  angles.
- `ContactLock` and `pelvisDrop`: feet held where they landed while contact
  is high, released by an exponential (0.06 s), and the hip drop that keeps
  a locked foot in reach.
- `/three`: `solveTwoBone`, `solveChain`, `lookAtChain`, `curlFingers`,
  `FootLock`, `rotateWorld`.

Written for this library from the HACKLE leg solver and foot lock and the
ARBOR arm solver, hand frame and finger curl.

## Install

Not published yet. From a clone:

    npm ci && npm run build -w @hackbuild/ik

## Use

```ts
import { load } from "@hackbuild/ik";
import { solveTwoBone, lookAtChain, FootLock } from "@hackbuild/ik/three";

await load();
const lock = new FootLock();
function frame(dt: number) {
  lock.update(dt, footTarget, contact); // holds the foot while contact > 0.55
  solveTwoBone(bones.leftUpperLeg, bones.leftLowerLeg, bones.leftFoot, footTarget, kneeForward);
  lookAtChain([bones.neck, bones.head], [0.4, 0.6], camera.position, body.quaternion);
}
```

`dist/ik.iife.js` is the single file build (`HackbuildIk`, wasm inlined,
`THREE` read from the page).

## Develop

    npm run build -w @hackbuild/ik
    npx vitest run packages/ik
    cargo test -p hackbuild-ik

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `cargo test -p hackbuild-ik` passed 12 of 12 tests
  (counted), clippy clean natively and for wasm32.
- 2026-11-22: `npx vitest run packages/ik` passed 10 of 10 tests (counted),
  two of them fast-check properties.
- 2026-11-22: two bone reach: on 2,000 seeded chains in Rust and 500
  property cases in TypeScript, every target inside the reach band was met
  within 1e-8 m with both bone lengths kept within 1e-9 m (computed).
- 2026-11-22: FABRIK met 98 percent or more of 500 seeded reachable
  targets within 1e-6 m in 64 iterations, and every property case within
  1e-4 m in 128 iterations, with root and lengths kept (computed).
- 2026-11-22: the golden trace over every solver is bit identical between
  the native and the wasm build (measured).

### Not verified by anything

- The finger and thumb curl directions on a real rig: the axes follow the
  ARBOR hand frame and the test checks only that fingertips move.
- Look at and IK in a real browser at real frame rate.
- Digitigrade three segment legs (hock joints); use `fabrik` with hinge
  limits or `twoBone` on the first two segments until a dedicated solver
  lands.

## Size budget

| file | raw | gzip |
|---|---|---|
| `ik_bg.wasm` | 72,397 bytes | 32,454 bytes |
| `ik.iife.js` (wasm inlined as base64) | 120,258 bytes | 50,465 bytes |

Measured 2026-11-22. Budget: wasm under 90 KB raw.

## Licence

Code MIT (`LICENSE` at the repository root). This README is CC-BY-4.0, its
code samples also MIT.
