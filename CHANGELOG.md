# Changelog

Versions follow semver per package. Nothing is published to npm yet.

## 0.2.0 (unreleased)

- `@hackbuild/motion-net`: rewritten under MIT from a functional
  specification and the published paper; the earlier CC BY-NC version is
  removed. Weight loader with format checks, the forward pass on wasm
  SIMD128, a blob worker with an in page fallback, and `QuadrupedHost`, a
  gait backend over the published quadruped network. Weights stay CC
  BY-NC 4.0, loaded at run time.

## 0.1.0 (unreleased)

- repository scaffold: rules, hooks, voice and commit linters, CI.
- build tools: `tools/build-wasm.mjs` (wasm-pack, inlined base64) and
  `tools/build-package.mjs` (tsc, wasm copy, single file IIFE).
- `@hackbuild/organic`: halflife springs (exact and fast), spring damper
  with damping ratio, vector and quaternion springs, spring banks, offset
  inertialization for rotations and positions, OU and pink noise, samplers,
  Mulberry32 seeded stream shared bit for bit by Rust, wasm and TypeScript,
  minimum jerk curves, body clock, three.js `PoseInertializer`.
- `@hackbuild/rig`: humanoid bone name mapper without per rig tables
  (chain shifts, depth assigned spine, numbered fingers, MMD dialect,
  report of missing, unmapped, helper and ambiguous bones), limb chains for
  non humanoids, rest analysis (facing, units, floor, A pose), reference
  humanoid, the expression and viseme table (VRM, ARKit 52, Oculus 15),
  three.js `mapObject3D`, `chainsOf`, `restOf`, `applyRestFix`.
- `@hackbuild/ik`: two bone analytic IK with pole and soft reach, FABRIK
  with cone and hinge limits, CCD, segment deltas, clamped look at chains,
  eye direction clamp, hand frame and finger curl, contact locking and
  pelvis drop, three.js `solveTwoBone`, `solveChain`, `lookAtChain`,
  `curlFingers`, `FootLock`.
- `@hackbuild/gait`: footfall tables for four and six legs, Froude gait
  selection with hysteresis and pace bias, leg oscillator with landing
  prediction, minimum jerk swings, step in place and a stop that lets
  swings land, body dynamics (postures, terrain, bob, lean, load shift,
  breathing, sway), tail wag modes, ear springs, potential field steering,
  the locomotion backend interface, three.js `measureQuadruped` and
  `driveQuadruped`.
- `@hackbuild/retarget`: `HumanoidMotion` interchange format with a
  binary pack, rest aligned retargeting between any mapped rigs (facing,
  units, A pose), first frame rest detection, floor settling, BVH and VMD
  readers, motion tags, three.js `retargetAnimation`, `LiveRetarget`,
  `skeletonFromObject3D`, `sampleAnimationClip`, `toAnimationClip`.
- `@hackbuild/rig`: `./bones` and `./expressions` subpath exports.
- `@hackbuild/ik`: look at keeps its side past 2.2 rad on an atan2 sign
  flip and hands targets behind to body turning (`behind`, `bodyYaw`).
- `@hackbuild/gait`: one `MotorState` filled by every motor source, with a
  source label, and `PhaseEstimator` for phase from touchdown timing.
- build order fixed (rig before retarget), tsbuildinfo kept in `dist`, and
  a test that no package source keeps module scope three.js scratch objects.
- `@hackbuild/motion-net`: runtime for dense stacks and codebook matching
  networks (estimator, denoiser, FiLM decoder) with SIMD128 kernels in
  wasm, f64 or f32 accumulation, a WGSL WebGPU path, a blob worker with an
  in page fallback, weight fetch with SHA-256 and Cache Storage, licence
  notices; `CodebookGait`, a quadruped gait host over the published
  network (request time stamps, blend from arrival, per sequence
  playheads, staleness health, coast past the end, turn in place, partial
  decode) filling gait's `MotorState`, and `NeuralFallback` with a 2 s
  procedural hold. Bit equal to an earlier implementation on the quadruped weights
  with f64 sums. No weights in the repository.
- `@hackbuild/motion-match`: feature database, bounding box search
  matching brute force, inertialized transitions, synthetic gait clips,
  gait backend contract; native and wasm bit identical.
- `@hackbuild/presence`: gaze with aversion and seam hold, blink, breath,
  idle scheduler, point, reach and throw timing, layered clip player with
  loop seam and idle handback, head level.
- `@hackbuild/avatar`: VRM (optional three-vrm peer), Mixamo, UAL, GLB
  and FBX loading into the normalized humanoid space; material and texture
  repair; wardrobe slots, alternate garments and part toggles; expression
  binding; first person head hide; redistribution gate.
- `@hackbuild/lipsync`: viseme timeline from word, phoneme or viseme
  events with coarticulation by dominance; audio level and band fallback;
  output to VRM, Oculus or ARKit.
- `@hackbuild/bake`: GLB optimize with texture hooks, clip packs with
  error, seam and contact reports, assets.lock.json writer and checker,
  native CLI and wasm.
- build: `tools/build-package.mjs` runs a package's `scripts/prebuild.mjs`
  and copies `src/generated` into `dist`; `docs/browser-checks.md` lists
  the browser checks that have not run.
