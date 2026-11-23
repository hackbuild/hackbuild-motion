# Changelog

Versions follow semver per package. Nothing is published to npm yet.

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
