# @hackbuild/gait

Procedural locomotion for legged rigs, written for this library from the
body of an earlier in-house dog simulator. The core is the Rust crate `crates/gait` compiled to
wasm32 with SIMD128; this package loads it and offers a three.js adapter
under `/three`.

- Footfall tables as validated data: walk, pace, trot, canter, gallop for
  four legs (LF RF LH RH, Hildebrand offsets), tripod, ripple and wave for
  six in the crate, with footfall diagrams.
- Gait choice from the Froude number with a 10 percent dead band and a per
  animal pace bias (thresholds 0.12, 0.42, 1.5 from an earlier dog simulator,
  vendor).
- `QuadrupedGait`: a phase oscillator per leg pulled toward its table
  offset, landing prediction, minimum jerk swings, step in place when
  standing, forced relift, and a stop that lets swinging feet land before
  the body stands. Foot heights come out above the ground; the caller's
  `ground(x, z)` adds the terrain, so no terrain callback crosses into wasm.
- `BodyDynamics`: posture springs (sit, down, bow, reach), terrain pitch
  and roll from the four foot spots, gait bob and rock, lean into turns,
  fore and hind load shift, breathing, standing sway.
- `TailWag` (a spring chain with eight wag modes, Ren 2022), `Ears`,
  `steer` (potential field around obstacles and a fence).
- One `MotorState` (source label, phase, duty, stride frequency,
  contacts) that every motor source fills: `motorStateOf(gaitState)` for
  the oscillator, `PhaseEstimator` for sources without one (a neural
  network, a clip, a motion matcher), which derives phase from touchdown to
  touchdown timing of a reference leg. Diagnostics read this state, never a
  particular source, and show the source label.
- `LocomotionBackend` with declared `capabilities` and `motorState()` (turn in place, minimum
  stop distance, head pitch bias) and `ProceduralBackend`, so a neural or
  motion matching backend can stand in and the caller asks it how close it
  can stop.
- `/three`: `measureQuadruped(root, names)` reads leg spots, toe heights,
  leg length and track width from the rest pose; `driveQuadruped` writes a
  frame of gait, body, tail and ear state onto the bones with two bone leg
  IK and returns the legs that were out of reach. Bone names can come from
  `@hackbuild/rig` `limbChains`.

Why the backend interface and command shapes are TypeScript only: they are
contracts for other TypeScript packages and carry no math.

## Install

Not published yet. From a clone:

    npm ci && npm run build -w @hackbuild/gait

## Use

```ts
import { load, QuadrupedGait, BodyDynamics, TailWag } from "@hackbuild/gait";
import { measureQuadruped, driveQuadruped } from "@hackbuild/gait/three";

await load();
const rig = measureQuadruped(dog, names); // dog at the origin, facing +Z
const gait = new QuadrupedGait(rig.specs, rig.legLength, { ground: heightAt, rng });
const body = new BodyDynamics(rig.geometry, rng);
const tail = new TailWag(3, 0.06, rng);

function frame(dt: number, pose: { x: number; z: number; yaw: number }, cmd = { speed: 1.2, turnRate: 0 }) {
  const s = gait.update(dt, pose, cmd);
  const ground = gait.nominal(pose.x, pose.z, pose.yaw).map(([x, z]) => heightAt(x, z));
  const b = body.update(dt, s, cmd, ground);
  gait.setOffsets(b.legOffsets);
  driveQuadruped(rig, pose, s, b, { tail: tail.update(dt, { modeWeights: [1, 2, 1, 1, 0, 0, 0, 1], arousal: 0.4 }) });
}
```

`dist/gait.iife.js` is the single file build (`HackbuildGait`, wasm
inlined, `THREE` read from the page).

## Develop

    npm run build -w @hackbuild/gait
    npx vitest run packages/gait
    cargo test -p hackbuild-gait

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `cargo test -p hackbuild-gait` passed 15 of 15 tests
  (counted), clippy clean natively and for wasm32.
- 2026-11-22: `npx vitest run packages/gait` passed 8 of 8 tests (counted),
  one a fast-check property over seed and speed.
- 2026-11-22: footfall tables validate; trot pairs diagonals and pace
  pairs sides at every sampled phase; the walk keeps two or more feet down;
  the tripod keeps three down (computed).
- 2026-11-22: stance feet do not slide (0 m between frames after the first
  second, computed over 1,200 frames at 2 m/s and by property over speeds
  0.2 to 5 m/s); the dominant gait follows the Froude bands (property); a
  stopped dog stands with every foot within the step threshold (computed).
- 2026-11-22: on a synthetic dog rig driven at 0.6 m/s while turning, toe
  tips landed within 1 mm of the gait's targets on every reached frame and
  planted toes moved less than 1 mm; 1 of 960 leg frames was out of reach
  (measured in the three.js adapter test).
- 2026-11-22: from contacts alone, `PhaseEstimator` tracked the
  oscillator's phase within 0.05 of a stride and its stride frequency
  within 3 percent at 1.6 m/s (computed over 720 frames at 120 Hz, Rust and
  TypeScript).
- 2026-11-22: the golden trace (gait, body, tail, ears, steering) is bit
  identical between the native and the wasm build (measured).

### Not verified by anything

- `@hackbuild/motion-net`'s `QuadrupedHost` fills `MotorState` with
  source `neural`; nothing here checks it against this package's gait.

- Motion on a Meshy dog or any real rig, in a real browser at real
  frame rate. Nobody has looked at it yet.
- Turn in place stepping beyond what the oscillator does when only the turn
  rate is non zero; a dedicated pattern is open.
- Digitigrade hind legs: the hock is treated as part of the paw.
- Hexapod gaits on a rig (the tables are tested as data only).

## Size budget

| file | raw | gzip |
|---|---|---|
| `gait_bg.wasm` | 87,466 bytes | 39,721 bytes |
| `gait.iife.js` (wasm inlined as base64) | 149,918 bytes | 62,063 bytes |

Measured 2026-11-22. Budget: wasm under 100 KB raw.

## Licence

Code MIT (`LICENSE` at the repository root). This README is CC-BY-4.0, its
code samples also MIT.
