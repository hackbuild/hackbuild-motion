# @hackbuild/motion-match

Classic motion matching over a clip database, written for this library
from the published descriptions (Clavet 2016, Holden's motion matching
notes, Bollo 2016 for inertialization). The core is the Rust crate
`crates/motion-match` compiled to wasm32 with SIMD128.

- Feature database: future trajectory positions and facing directions
  (1/3, 2/3 and 1 s by default), foot positions and velocities, hip
  velocity, all in the frame's root space. Each group is normalized by the
  mean of its per dimension standard deviations and scaled by its weight.
- Search: brute force, and a two level bounding box search (16 and 64
  frame boxes) that returns the same frame and cost. Frames near the
  current one in the same clip are skipped, and one shot clips are not
  searched in their last second, where the trajectory would run past the
  end.
- Controller: plays the current clip, moves the root by the clip's root
  delta (so the root never jumps), searches every 0.1 s, at once when a
  one shot clip ends, or on `forceSearch()`, and jumps only when the best
  frame beats the current one by `minImprovement`. Jumps are inertialized
  on every bone rotation, the hip and the feet with the `organic`
  inertializer.
- Loops continue: a looped clip keeps moving past its end with its last
  frame's step.
- The desired trajectory comes from a speed and turn rate through a
  velocity spring from the current root velocity, or the caller passes its
  own.
- `MotionMatcher` implements the locomotion backend contract of
  `@hackbuild/gait` (structurally, without depending on it) and fills the
  shared motor state with source `motion-match`, phase and stride
  frequency from touchdown timing of the first foot.
- `ClipSet.addSynthetic` makes two foot gait clips with planted feet
  (loops, arcs, turn in place, starts, stops), for tests and examples.

Clips are plain arrays on one rig (VRM bone order or any other); reading
glTF or UAL clips into them is the caller's job, with `@hackbuild/retarget`
for clips from another rig.

## Install

Not published yet. From a clone:

    npm ci && npm run build -w @hackbuild/motion-match

## Use

```ts
import { load, ClipSet, MotionMatcher } from "@hackbuild/motion-match";

await load();
const clips = new ClipSet(30);
for (const c of myClips) clips.add(c); // { looped, root, rotations, hips, feet, contacts }
const mm = new MotionMatcher(clips, { capabilities: { turnInPlace: true } });

function frame(dt: number, cmd = { speed: 1.2, turnRate: 0 }) {
  const root = mm.update(dt, cmd);          // x z yaw speed turnRate
  const pose = mm.pose();                   // rotations, hips, feet in the root frame
  const motor = mm.motorState();            // source "motion-match", phase, contacts
}
```

`dist/motion-match.iife.js` is the single file build
(`HackbuildMotionMatch`, wasm inlined).

## Develop

    npm run build -w @hackbuild/motion-match
    npx vitest run packages/motion-match
    cargo test -p hackbuild-motion-match

## What is verified, and what is not

### Verified on this machine

- 2026-11-23: `cargo test -p hackbuild-motion-match` passed 16 of 16
  tests (counted), clippy clean natively and for wasm32.
- 2026-11-23: `npx vitest run packages/motion-match` passed 7 of 7 tests
  (counted).
- 2026-11-23: the golden trace (root, clip, frame, costs, hip, feet, a
  bone rotation, motor state over 900 frames of random commands) is bit
  identical between the native and the wasm build (measured).
- 2026-11-23: every searchable frame finds itself at zero cost; the box
  search returns the same frame and cost as brute force on 300 noisy
  queries in Rust and 200 in TypeScript (computed).
- 2026-11-23: on the synthetic clip set, walk, run, arc, idle and turn in
  place commands settle on the matching clip; the root speed holds within
  0.05 m/s of a 3 m/s command (computed).
- 2026-11-23, after the inertializer velocity fix: on transition frames
  the largest per frame step of the hip and feet was 0.080 m against
  0.182 m on plain frames, and the largest change of step 0.056 m
  against 0.094 m, over 13 transitions in the Rust run (before the fix
  0.119 m and 0.060 m); 0.155 m against 0.182 m in the TypeScript run, a
  smaller clip set (before 0.245 m against 0.226 m). Computed at 60 Hz.
  The tests allow 1.05 and 1.2 times the plain frames' step.
- 2026-11-23: a switch to a source moving the same way leaves the output
  velocity unchanged to 1e-9 m/s (computed, organic test; before the fix
  it read 0.817 and 1.522 m/s on the frames after a 1 m/s switch).
- 2026-11-23: planted foot slide, 60 Hz over 14 s with 14 transitions:
  mean 1.5 mm per frame (before 1.9), 0.8 mm per frame once the
  transition offset has decayed, worst 39 mm (computed). Within 12
  frames of a transition the worst is 26 mm, elsewhere 39 mm: the
  synthetic clips slide on their own and nothing here locks feet. Foot
  locking from `@hackbuild/ik` is the fix and is not wired here.
- 2026-11-23: from contacts alone the motor state's stride frequency is
  within 5 percent of the clip cadence and its duty within 0.08 of 0.6
  (computed).

### Not verified by anything

- Real clips: nothing has run on UAL or any captured clip set. The
  weights and the 0.05 minimum improvement are starting values tuned on
  synthetic clips only (inferred).
- Motion in a real browser at real frame rate. Nobody has looked at it.
- Search time on a large database; brute force cost grows with frames
  times feature dimensions (25 here), unmeasured.
- Root adjustment toward a separate simulated root, mirroring, and a KD
  tree are open.

## Size budget

| file | raw | gzip |
|---|---|---|
| `motion_match_bg.wasm` | 96,147 bytes | 42,986 bytes |
| `motion-match.iife.js` (wasm inlined as base64) | 148,695 bytes | 63,234 bytes |

Measured 2026-11-23. Budget: wasm under 100 KB raw.

## Licence

Code MIT (`LICENSE` at the repository root). This README is CC-BY-4.0, its
code samples also MIT.
