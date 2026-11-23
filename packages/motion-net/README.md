# @hackbuild/motion-net

A runtime and a quadruped gait host for the published categorical codebook
matching network (Starke et al., "Categorical Codebook Matching for
Embodied Character Controllers", SIGGRAPH 2024).

Licences:

- This code is MIT. It was written from a functional specification of the
  network (weight format, equations, input and output layout, test
  vectors) and the published paper, by a team that did not read the
  earlier implementation in this repository or the upstream code.
- The weights are CC BY-NC 4.0 (Paul Starke and Sebastian Starke, Meta,
  AI4AnimationPy). They are loaded at run time from a URL, an ArrayBuffer
  or a File, and are not included in this package, its builds or the
  example site. The licence line is stated on the first load in a page.

## What it does

- `loadWeights({ manifest, bin, sha256? })`: reads the JSON manifest and
  the flat binary from a URL, bytes or a File, checks the SHA-256 when one
  is given, and checks every tensor's dtype, shape, count, alignment and
  range against the dimensions in the manifest before anything runs. A
  failure throws a message that names the tensor. `UPSTREAM` holds one
  public copy pinned to a commit and its SHA-256 (computed from a
  download).
- The forward pass in Rust (`crates/motion-net`): binary16 weights decoded
  exactly to f32, code estimate, three refinement passes, and the time
  conditioned decoder for 16 frames. The first decoder layer is affine in
  time, so it runs as two matrix products instead of sixteen; layers 2 and
  3 run batched over the frames. The dot product keeps 16 running sums in
  a fixed order: four f32x4 registers on wasm32 SIMD128, an array natively,
  so both builds give the same bits.
- `Predictor.create(weights, { worker })`: runs the network in a worker
  made from a blob, which also starts from file://. The worker drives the
  wasm through a plain C ABI, with no generated glue to import. When a
  worker is refused or does not start in 10 s, the same code runs in the
  page (`mode` and `fallbackReason` say which).
- `QuadrupedHost`: implements the `LocomotionBackend` contract of
  `@hackbuild/gait` (structurally, without depending on it) and fills its
  `MotorState` with source `neural`. Per frame it
  - smooths the command (speed and turn rate, or a world velocity and
    facing) and picks a style label by speed (Idle, Walk, Trot, Canter;
    any of the nine labels can be held);
  - builds the input from the dog's own current pose and velocities, a 16
    sample trajectory, and the style pose, and asks for a new prediction
    every 0.1 s with one in flight;
  - plays each prediction from the time it was requested, so latency is
    skipped rather than replayed, and hides the seam to the previous one
    with a decaying offset;
  - integrates the network's root motion, lets the root take over the
    drift of the network's planted paws, and leans the trajectory with an
    integral loop on speed and turn rate until the dog meets the command;
  - pins each paw while its contact value says stance, bends the limb with
    a two bone solve to reach the pin, and blends a released paw back;
  - holds the last pose and brings the root to rest when a prediction is
    late, and drops one that lands after a newer one.
  It exposes the root transform and velocity, 27 bone positions and
  rotations (right handed, +Z forward, +X to the dog's left, as in the
  gait package), contact values, per paw phase, the style, wall clock
  latency and evaluation time, and per frame foot slide. Every constant in
  `DEFAULT_TUNING` carries the reason for its value beside it.

## Install

```sh
npm install @hackbuild/motion-net three
```

```ts
import { Predictor, QuadrupedHost, UPSTREAM, loadWeights } from "@hackbuild/motion-net";

const weights = await loadWeights({ manifest: UPSTREAM.manifest, bin: UPSTREAM.bin, sha256: UPSTREAM.binSha256 });
const predictor = await Predictor.create(weights);
const dog = new QuadrupedHost(predictor, weights.styles);
// each frame
const root = dog.update(dt, { speed: 1.2, turnRate: 0.3 });
dog.positions; // 27 x 3, world, meters
dog.rotations; // 27 x 4 quaternions
```

## What is verified, and what is not

### Verified on this machine

- 2026-11-23: `cargo test -p hackbuild-motion-net` passed 8 of 8 tests
  (counted), clippy clean natively and for wasm32 with SIMD128. A plain
  double precision evaluation of the equations matches the crate's forward
  pass within 1e-5 relative on a random network (measured).
- 2026-11-23: the golden trace (two evaluations of a seeded random network
  loaded from binary16 and binary32 bytes, and binary16 decodes) is bit
  identical between the native build and the wasm SIMD128 build (measured,
  vitest).
- 2026-11-23: the three test vectors of the specification pass on the
  published weights: worst listed value error 4.8e-7 relative, worst
  checksum error 7.8e-8 relative, against a tolerance of 1e-4 and 1e-5
  (measured). One evaluation takes 4 to 6 ms in Node on an Apple M1
  (measured). These tests need the weights and run only when
  `HB_MOTION_NET_BIN` and `HB_MOTION_NET_MANIFEST` point at local copies;
  otherwise they are skipped and the test output says so. CI has no
  weights, so CI does not run them.
- 2026-11-23: host on the published weights, 60 Hz, page engine in Node,
  over the last 8 s of 16 s runs (measured): commanded 0.6, 1, 1.6, 2.4 and
  3.5 m/s gave 0.598, 0.999, 1.626, 2.395 and 3.515 m/s; stance paw slide
  p95 per frame 0, 0, 5.7, 4.8 and 10.2 mm with pins, against 7.4, 9.6,
  11.8, 17.6 and 17.4 mm for the network's own paws; 1 rad/s at 1 m/s gave
  0.999 rad/s; idle travels under 5 cm in 3 s. Gated on the weights as
  above.
- 2026-11-23: host on a kinematic stand in (no weights, runs in CI): speed
  within 5 percent at 0.6, 1.2 and 2.5 m/s, turn rate within 10 percent,
  idle, a world velocity with a facing, no NaN on zero, negative, NaN or
  infinite dt or commands, a 1.5 s late prediction held and recovered with
  the largest bone move 47 mm in one frame, a stale prediction dropped,
  stride frequency and duty recovered from contacts (measured).
- 2026-11-23: the example page on the published weights in Chrome 150 on
  an Apple M1 at real frame rate, through `tools/check-examples.mjs`: the
  network ran in the blob worker, 4.5 ms per evaluation, 5 ms wall clock
  latency, 59.9 fps p50, pinned stance slide p95 5.6 mm per frame against
  10.8 mm for the network's paws, while wandering through speeds
  and turns (measured). The screenshot shows a standing four legged
  skeleton; a person watching the gait at frame rate has not been
  recorded.

- 2026-11-23: `Predictor.predict` rejects an input of the wrong length and
  keeps working; a run asked for after `dispose`, a worker crash after
  start, and an engine error with no run id each reject the pending runs
  instead of leaving them open (tested on a small synthetic network in
  the page engine; the worker crash path is untested).

### Not verified by anything

- The worker and the in page fallback from file://, and the fallback on a
  page whose policy refuses blob workers. Node has no worker, so tests run
  the page path only.
- Retargeting the 27 bone skeleton onto another rig; the host gives the
  network's own skeleton, and the bone axes follow the source rig's
  conventions.
- Pace, Sit, Stand, Lie and Jump through the host: they can be held as a
  style, and nothing measures how they look.
- At a gallop (above about 3 m/s) the limbs cannot always reach their pins
  and the paw slides up to about 10 mm per frame p95 (measured above).
