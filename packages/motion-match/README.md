# @hackbuild/motion-match

Motion matching over a clip database, with inertialized transitions, on a Rust core compiled to wasm.

[![npm](https://img.shields.io/npm/v/@hackbuild/motion-match)](https://www.npmjs.com/package/@hackbuild/motion-match) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 64.7 kB measured](https://img.shields.io/badge/gzip-64.7%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

## What it does

- Builds a feature database from your clips: future trajectory positions and facing, foot positions and velocities, and hip velocity, each in the frame's root space.
- Searches it by brute force or with a two level bounding box search that returns the same frame and cost, every 0.1 s by default.
- Plays the matched clip, moves the root by the clip's own root step, and blends every jump with inertialization on bone rotations, hips and feet.
- Turns a speed and turn rate into a desired trajectory, or takes a trajectory you build.
- Stands in for the procedural gait: `MotionMatcher` implements the same locomotion backend contract as `@hackbuild/gait`.

## Install

```sh
npm install @hackbuild/motion-match
```

No dependencies and no peers. The wasm core loads from the package's own file, a URL or bytes you pass, or an inlined copy.

| subpath | what |
|---|---|
| `@hackbuild/motion-match` | the matcher, clip set and backend contract |
| `@hackbuild/motion-match/wasm` | the wasm file, to pass to `load()` as a URL |
| `@hackbuild/motion-match/inline` | the wasm as base64, for builds with no fetch |
| `@hackbuild/motion-match/iife` | the single file build, global `HackbuildMotionMatch`, wasm inlined |

## Quick start

```ts
import { ClipSet, load, MotionMatcher } from "@hackbuild/motion-match";

await load();
// a clip database made in code: three steady gaits, a start and a stop
const clips = new ClipSet(30);
for (const speed of [0.6, 1.2, 2]) clips.addSynthetic({ speed });
clips.addSynthetic({ speed: 0, speedEnd: 1.2 });
clips.addSynthetic({ speed: 1.2, speedEnd: 0 });
const matcher = new MotionMatcher(clips);

// one second at 60 frames a second, asking for a gentle left turn
for (let i = 0; i < 60; i++) {
  const root = matcher.update(1 / 60, { speed: 1.2, turnRate: 0.4 });
  const pose = matcher.pose(); // local rotations, hips and feet in the root frame
  if (i % 20 === 0) console.log(root.x.toFixed(2), root.z.toFixed(2), matcher.last.clip, pose.feet.length);
}
console.log(matcher.last.transitions, "transitions,", matcher.motorState().contacts);
matcher.dispose();
clips.dispose();
```

## Live example

The demo page follows your speed and turn over a synthetic gait database and shows each transition: [hackbuild-motion/motion-match](https://hackbuild.github.io/hackbuild-motion/motion-match/). The suite runs it too: [hackbuild-suite motion match](https://hackbuild.github.io/hackbuild-suite/#/motion/motion-match).

## Concepts

### clips on one rig

A clip is plain arrays: `root` as `x z yaw` per frame on the ground (yaw 0 faces +Z, unwrapped), `rotations` as `x y z w` per bone per frame, `hips` and `feet` as `x y z` in the root's frame, and one contact flag per foot per frame. Every clip in a set has the same bones and feet, in any bone order you choose. Reading glTF or captured clips into these arrays is your job; `@hackbuild/retarget` brings clips from another rig into the normalized humanoid first. `ClipSet.addSynthetic` makes two foot gait clips with planted feet (loops, arcs, turn in place, starts and stops) for tests and examples.

### features and search

Each feature group is normalized by the mean of its per dimension standard deviations and scaled by its weight in `MatchConfig.weights`. Frames near the current one in the same clip are skipped (`ignoreWindow`), and one shot clips are not searched in their last second, where the trajectory would run past the end. `search(query, true)` walks every frame; the default box search gives the same answer faster.

### the controller

The matcher searches every `searchInterval` seconds, at once when a one shot clip ends, or on `forceSearch()`, and jumps only when the best frame beats the current one by `minImprovement`. A looped clip keeps moving past its end with its last frame's step. `halflife` sets how fast a jump's offset decays.

### the backend contract

`update(dt, { speed, turnRate })` returns root motion and `motorState()` returns source `motion-match`, stride phase and frequency from the touchdown timing of the first foot, duty and contacts. The contract matches `@hackbuild/gait` by shape, so a host can swap the procedural gait for the matcher without this package depending on that one. Pass `capabilities: { turnInPlace: true }` when your clip set has turn in place clips.

```ts
const matcher = new MotionMatcher(clips, { capabilities: { turnInPlace: true }, params: { searchInterval: 0.05 } });
const frame = matcher.step(1 / 60, matcher.trajectory(1.5, 0));
if (frame.jumped) console.log("now clip", frame.clip, "frame", frame.frame);
```

## API overview

| export | what it does |
|---|---|
| [`load`](../../docs/api/motion-match/README.md#load) | load the wasm core once; call before anything else |
| [`ClipSet`](../../docs/api/motion-match/README.md#clipset) | collect clips, or make synthetic gait clips |
| [`MotionMatcher`](../../docs/api/motion-match/README.md#motionmatcher) | search, play and blend; a locomotion backend |
| [`MatchConfig`](../../docs/api/motion-match/README.md#matchconfig) | feature layout and search settings |
| [`MatcherParams`](../../docs/api/motion-match/README.md#matcherparams) | search interval, halflife and jump threshold |
| [`MatchFrame`](../../docs/api/motion-match/README.md#matchframe) | one step: root motion, clip, frame, jump and cost |
| [`LocomotionBackend`](../../docs/api/motion-match/README.md#locomotionbackend) | the contract shared with `@hackbuild/gait` |
| [`DEFAULT_CONFIG`](../../docs/api/motion-match/README.md#default_config) | the default feature layout |

The full reference is in [docs/api/motion-match](../../docs/api/motion-match/README.md).

## Browser support

| needs | Chrome | Safari | Firefox | phone |
|---|---|---|---|---|
| WebAssembly with SIMD128 | yes (measured, Chrome 150) | 16.4 and later (vendor) | yes (vendor) | unknown |

No WebGPU, no workers and no wasm threads, so no cross origin isolation. From file:// use the single file build `dist/motion-match.iife.js`, which carries the wasm inlined, or call `load()` with no argument to decode the inlined copy.

## Errors and troubleshooting

| message | cause | what to do |
|---|---|---|
| `@hackbuild/motion-match: wasm not loaded. call load() first.` | a `ClipSet`, `MotionMatcher` or `goldenTrace` call before `load()` resolved | `await load()` once before building anything |
| an error from `ClipSet.add` | the arrays of a clip disagree on frame, bone or foot counts | give every array the same frame count and every clip the same bones and feet |

### mistakes to avoid

- Calling `new ClipSet()` before `await load()`: every class needs the wasm core.
- Mixing rigs in one `ClipSet`: all clips must share bones and feet; retarget them first.
- Expecting locked feet: the matcher does not pin planted feet, so add `FootLock` from `@hackbuild/ik` on top.
- Forgetting `dispose()` on the matcher and the set: they hold wasm memory.

## Works with

- [@hackbuild/gait](../gait/README.md) defines the same backend contract; the matcher can replace the procedural gait.
- [@hackbuild/retarget](../retarget/README.md) brings clips from other rigs into one humanoid space before they go in a set.
- [@hackbuild/ik](../ik/README.md) locks planted feet on top of the matched pose.
- [@hackbuild/organic](../organic/README.md) holds the inertialization math the core uses.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)); this README is CC-BY-4.0 with its code samples also MIT. No clips or weights ship here; clips you load keep their own licences.

## What is verified, and what is not

### Verified on this machine

| check | result | label |
|---|---|---|
| `cargo test -p hackbuild-motion-match` | 16 of 16 pass, clippy clean natively and for wasm32 | counted |
| `npx vitest run packages/motion-match` | 7 of 7 pass | counted |
| golden trace over 900 frames of random commands (root, clip, frame, costs, hip, feet, a bone rotation, motor state) | bit identical between the native and the wasm build | measured |
| box search against brute force, 300 noisy queries in Rust and 200 in TypeScript | same frame and cost; every searchable frame finds itself at zero cost | computed |
| walk, run, arc, idle and turn in place commands on the synthetic set | settle on the matching clip; root speed within 0.05 m/s of a 3 m/s command | computed |
| hip and foot step on transition frames at 60 Hz, 13 transitions in Rust | largest 0.080 m against 0.182 m on plain frames; largest change of step 0.056 m against 0.094 m | computed |
| same check in TypeScript on a smaller set | 0.155 m against 0.182 m; the tests allow 1.05 and 1.2 times the plain step | computed |
| a switch to a source moving the same way | output velocity unchanged to 1e-9 m/s | computed |
| planted foot slide at 60 Hz over 14 s with 14 transitions | mean 1.5 mm per frame, 0.8 mm once the transition offset decays, worst 39 mm (the synthetic clips slide on their own) | computed |
| motor state from contacts alone | stride frequency within 5 percent of the clip cadence, duty within 0.08 of 0.6 | computed |

### Not verified by anything

- Real clips: nothing has run on a captured clip set. The feature weights and the 0.05 minimum improvement are starting values tuned on synthetic clips.
- Motion in a real browser at real frame rate, judged by a person.
- Search time on a large database; brute force cost grows with frames times feature dimensions (25 here), unmeasured.
- Root adjustment toward a separate simulated root, mirroring and a KD tree are not built.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 64,669 bytes | 67,902 bytes |
| `dist/wasm/motion_match_bg.wasm` | 44,165 bytes | 46,373 bytes |
| `dist/motion-match.iife.js` (single file build) | 64,724 bytes | 67,960 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.
