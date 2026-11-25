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
  a cone of the head. Past 2.2 rad a yaw sign flip keeps the previous side
  (pass last frame's `yaw + bodyYaw` as `prevYaw`), so a target crossing
  behind does not whip the head across the atan2 seam; past the yaw limit
  the result says `behind` and hands the rest to body turning as
  `bodyYaw`.
- `handCurl`: palm frame and grip point from the index and little finger
  knuckles (3.5 cm off the palm), with finger and thumb curl axes and
  angles.
- `ContactLock` and `pelvisDrop`: feet held where they landed while contact
  is high, released by an exponential (0.06 s) that reaches zero without a
  final step, a contact during a release held where the foot is, and the
  hip drop that keeps a locked foot in reach.
- `/three`: `solveTwoBone`, `solveChain`, `lookAtChain`, `curlFingers`,
  `FootLock`, `rotateWorld`.

Written for this library from the leg solver and foot lock of an earlier
in-house dog simulator and an earlier arm solver with its hand frame and
finger curl.

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

- 2026-11-22: `cargo test -p hackbuild-ik` passed 13 of 13 tests
  (counted), clippy clean natively and for wasm32.
- 2026-11-22: `npx vitest run packages/ik` passed 11 of 11 tests (counted),
  two of them fast-check properties.
- 2026-11-22: two bone reach: on 2,000 seeded chains in Rust and 500
  property cases in TypeScript, every target inside the reach band was met
  within 1e-8 m with both bone lengths kept within 1e-9 m (computed).
- 2026-11-22: FABRIK met 98 percent or more of 500 seeded reachable
  targets within 1e-6 m in 64 iterations, and every property case within
  1e-4 m in 128 iterations, with root and lengths kept (computed).
- 2026-11-22: a target sweeping from 1 rad to 3.95 rad around the body
  keeps the head yaw on the side it started (60 steps) and reports
  `behind` with positive `bodyYaw` past the 1.25 rad limit (computed, Rust
  and TypeScript).
- 2026-11-22: the golden trace over every solver is bit identical between
  the native and the wasm build (measured).

- 2026-11-23: a re-contact during a release holds the shown foot (it
  jumped 172 mm to the free target before), a negative or NaN dt does not
  move the foot past its target, every release step is no larger than the
  one before (the last 2 percent was dropped in one frame), and
  `twoBone` with a zero length bone or a non finite input leaves the chain
  as it is (it panicked in `clamp`). The browser check and a new
  TypeScript test measure drift on the solved foot: 0 mm over 241 locked
  frames in Chrome 150 (measured), 0 mm to 1e-6 in the test (computed).
  `cargo test -p hackbuild-ik` passes 16 unit tests; the golden trace was
  regenerated for the new release curve.

- 2026-11-23: a straight chain with the target on its own axis was a
  FABRIK fixed point (a T pose arm stuck 0.1 m from a target at 0.4 m);
  the solver now bends such a chain off the line when the error stops
  falling, and a Rust test covers it. The TypeScript property runs on 16
  fixed seeds instead of a random one. It skips a segment folded back
  within 8 degrees of the one before it (a degenerate joint) and allows
  512 iterations: near a folded solution 128 left up to 2 mm. Over 20,000
  scanned seeds of 200 runs each, every case met 1e-4 m (computed).

### Not verified by anything

- The finger and thumb curl directions on a real rig: the axes follow the
  earlier arm solver's hand frame and the test checks only that fingertips move.
- Look at and IK in a real browser at real frame rate.
- Digitigrade three segment legs (hock joints); use `fabrik` with hinge
  limits or `twoBone` on the first two segments until a dedicated solver
  lands.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 49,806 bytes | 52,296 bytes |
| `dist/wasm/ik_bg.wasm` | 32,703 bytes | 34,338 bytes |
| `dist/ik.iife.js` (single file build) | 51,424 bytes | 53,995 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

## Licence

Code MIT (`LICENSE` at the repository root). This README is CC-BY-4.0, its
code samples also MIT.
