# @hackbuild/motion-net

A runtime for small motion networks, and a quadruped gait host over the
published codebook matching network. The kernels are the Rust crate
`crates/motion-net` compiled to wasm32 with SIMD128; a WGSL path runs the
same models on WebGPU. Code is MIT. No weights ship in this package or
this repository: the caller gives a URL, ArrayBuffer or File, and the
weight licence is stated on first load.

- Models: dense stacks (`kind: "mlp"`, one activation per layer, optional
  input and output normalization) and codebook matching (`kind:
  "codebook"`: an estimator picks a soft code per group, a denoiser refines
  it, a FiLM decoder conditioned on time decodes a sequence of frames).
  Both are written from the published descriptions of the architectures.
- A neutral `NetManifest` (model plus a tensor table of offset, count,
  shape and f16 or f32) and `codebookManifest(file)` for the upstream
  quadruped file layout.
- `createSession(manifest, weights, opts)`: WebGPU first, then the wasm
  kernels in a blob worker, then the same kernels in the page. Each step
  down is said through `onNotice` ("no webgpu adapter. the network runs on
  cpu.", "blob workers are refused here. the network runs in the page at a
  lower rate.").
- CPU accumulation: `f64` (default) gives the same sums as a JavaScript
  double precision port; `f32` ran about 2.8 times faster (measured, see
  below) and stays within 3.1e-7 of it on the quadruped network.
- `fetchVerified` and `readWeights`: one buffer sized from content-length,
  optional Cache Storage copy, SHA-256 check, progress.
- `CodebookGait`, a gait host for the quadruped network that implements
  `@hackbuild/gait`'s `LocomotionBackend` and fills its `MotorState`
  (source `neural`, phase, duty and stride frequency from predicted
  touchdown timing through gait's `PhaseEstimator`).
- `NeuralFallback`: the network with a procedural gait behind it.

## The quadruped network

The weights are AI4AnimationPy's quadruped codebook network by Paul Starke
and Sebastian Starke (Meta), in the web export by sweriko, licensed CC
BY-NC 4.0: non commercial use only. A session that loads them is non
commercial. `loadQuadrupedGait` states this through `onNotice` the first
time it loads them. Sizes from the file (vendor): input 339, latent 1024
in 256 groups of 4, output 412 per frame, 16 frames over 0.5 s, 3 denoiser
passes, 17,704,644 bytes of mostly f16 weights.

The host follows HACKLE lesson 6 and plan item 5.4.2:

- Every request is stamped with the sim time it was made; its sequence
  starts playing at its age on arrival, with its own playhead advanced at
  the playback rate, so a timescale change never jumps the pose.
- The previous sequence blends into a new one over one request interval
  from its arrival (smoothstep).
- Playback speed follows the requested trajectory length, between the
  file's minimum and maximum timescale.
- `health()` gives `staleSeconds` (sim seconds since the request time of
  the sequence in use), `inferenceMs`, `slowFrames`, `ok` and a `reason`.
  Stale above 0.30 s or 3 frames in a row longer than 1/15 s (inferred
  starting values).
- Past the last decoded frame the root coasts on its last velocity,
  halving every 0.15 s (inferred), in place of a clamp.
- Turn in place: a turn rate with no speed gives zero root velocity, a
  trajectory that turns, and the walk guidance. `turnInPlace: false`
  turns it off and the capability says so.
- `enter(from)` seeds root, speed and pose from the outgoing backend and
  requests at once; `follow(root)` keeps the root on the procedural body
  while that one drives, and moves a root the caller pushed out of an
  obstacle: the pose, the sequences in play and the requested
  trajectories move with it, so the next frame does not play back into
  the obstacle (before this, a root held at a wall read 73 m/s of
  speed in the host test, computed).
- Only the frames used before the next request are decoded (`decodeFrames:
  "auto"`): 9 of 16 at 10 Hz with 40 ms latency (computed).
- An in page session predicts at half the file's rate.

`NeuralFallback` hands the body to the procedural backend when `health()`
is not ok, holds it there 2 s (inferred), keeps the network predicting
meanwhile, and calls `onSwitch(to, reason)` on every switch so the caller
inertializes bones and paw targets (`@hackbuild/organic`
`PoseInertializer`). Diagnostics read `motorState()`, which names the
active source.

Differences from the HACKLE host, each found by a test here: the speed
controller integrates the error into a bias instead of adding `kp` times
the error each frame, which oscillated against a network that follows its
request at once; the error uses the speed the body shows (predicted speed
times timescale); the guidance follows the commanded speed; the request
is made after the pose update so its stamp matches its pose (a one frame
lag gave a 2 cm offset and a speed ripple at each arrival); the standing
root hold applies only when the prediction has no travel and never to yaw.

## Install

Not published yet. From a clone:

    npm ci && npm run build -w @hackbuild/gait -w @hackbuild/motion-net

## Use

```ts
import { load as loadGait } from "@hackbuild/gait";
import { loadQuadrupedGait, NeuralFallback } from "@hackbuild/motion-net";

await loadGait();
// your copies of the files; the weights are CC BY-NC 4.0
const neural = await loadQuadrupedGait({
  manifest: "/nn/quadruped.json",
  weights: "/nn/quadruped.bin",
  bind: "/nn/bind.json",
  fetch: { sha256: "<hash of your copy>", cache: "motion-net" },
  session: { onNotice: (line) => (status.textContent = line) },
});
const legs = new NeuralFallback(neural, proceduralBackend, { onSwitch: (to, why) => inertializeFrom(to, why) });

function frame(dt: number) {
  const root = legs.update(dt, { speed: 1.2, turnRate: 0.3 });
  const motor = legs.motorState(); // diagnostics show motor.source
  const { positions, rotations, contacts } = neural.pose(); // network units, 27 bones
}
```

Any model:

```ts
import { createSession, type NetManifest } from "@hackbuild/motion-net";
const s = await createSession(manifest, weights, { prefer: ["webgpu", "wasm-simd"] });
const out = await s.run(input);
```

`dist/motion-net.iife.js` is the single file build (`HackbuildMotionNet`,
both wasm copies inlined: one for the page, one inside the worker source).

## Develop

    npm run build -w @hackbuild/motion-net
    npx vitest run packages/motion-net
    cargo test -p hackbuild-motion-net

Parity with the legacy CPU port needs the owner's local files, which stay
out of git (weights CC BY-NC 4.0, the legacy file outside this
repository):

    node packages/motion-net/scripts/make-golden.mjs <legacy-infer.cjs> <dir with quadruped.json, quadruped.bin>
    HB_QUADRUPED_DIR=<that dir> npx vitest run packages/motion-net

The inputs come from a seed in `scripts/inputs.mjs`; the outputs go to
`test/golden/`, which is gitignored. Without them the two weight tests are
skipped and say so.

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `cargo test -p hackbuild-motion-net` passed 11 of 11 tests
  (counted); clippy clean natively and for wasm32 with the wasm feature.
- 2026-11-22: `npx vitest run packages/motion-net` passed 17 of 17 tests
  (counted), the 2 weight tests included, on the local quadruped files.
- 2026-11-22: the golden trace (a seeded small codebook net and mlp, both
  accumulations) is bit identical between the native and the wasm build
  (measured).
- 2026-11-22: quadruped parity with the legacy JavaScript port over 4
  seeded inputs: f64 accumulation max abs difference 0 (bit equal), f32
  accumulation 3.07e-7; worst full 16 frame run 56.5 ms f64 and 20.0 ms
  f32 in Node 22 on this Mac (measured). The legacy port took 60 to 99 ms
  on the same inputs (measured).
- 2026-11-22: all 65,536 halves decode the same in JavaScript and wasm;
  the small codebook net matches a plain double precision reference within
  2e-6 (f64) and 5e-5 (f32); the split first FiLM layer equals per frame
  FiLM (computed).
- 2026-11-22: real weights, in page session, 120 frames at 30 Hz paced at
  real time (time scale 1): root travelled 3.62 m in 4 s at a 1 m/s command
  with the walk guidance, every bone position finite, health ok, inference
  15 ms for a 9 frame decode (measured).
- 2026-11-22: against a scripted network in sim time: health goes from no
  prediction to ok to stale past 0.30 s; 3 slow frames fail health; speed
  converges to the command with a frame to frame speed change under 0.05
  m/s after 2 s; turn in place turns more than 1 rad with under 2 cm of root
  travel; the coast halves velocity in 0.15 s; the motor state recovers a 2
  Hz contact cycle within 0.2 Hz; the fallback hands over at the neural
  root, holds 2 s, and returns (computed).
- 2026-11-22: both WGSL modules pass naga 30.0.2 validation (measured).

### Not verified by anything

- The WebGPU path has never run: Node has no WebGPU and no browser was
  driven. Its numbers against the CPU path are unknown.
- The blob worker path has never run (Node has no global Worker); the in
  page path speaks the same protocol and is tested.
- Motion of the network on a real dog rig, in a real browser at real frame
  rate. Nobody has looked at it. The retarget onto a rig (the HACKLE
  `nnRig` and `nnApply` work) is not in this package.
- The 0.30 s stale bound, the 2 s hold and the 0.15 s coast halflife are
  starting values, not tuned against a slide metric.
- The last 81 output values per frame are not read (inferred: a guidance
  pose echo).

See `docs/browser-checks.md` at the repository root.

## Size budget

| file | raw | gzip |
|---|---|---|
| `motion_net_bg.wasm` | 83,994 bytes | 36,572 bytes |
| `motion-net.iife.js` (wasm inlined twice, gait wasm included) | 323,171 bytes | 126,039 bytes |

Measured 2026-11-22. Budget: wasm under 100 KB raw.

## Licence

Code MIT (`LICENSE` at the repository root). This README is CC-BY-4.0, its
code samples also MIT. The quadruped weights are CC BY-NC 4.0 and are not
part of this package.
