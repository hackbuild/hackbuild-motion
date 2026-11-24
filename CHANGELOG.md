# Changelog

Versions follow semver per package. Nothing is published to npm yet.

## 0.2.0 (unreleased)

### Motion formats, 2026-11-24

- `@hackbuild/retarget`: VMD legs keyed only by foot IK bones are solved
  in the crate (two bone IK, knee toward the facing, foot keeps the IK
  bone's rotation, clamped out of reach), with the golden trace extended.
  New `/formats` subpath: `readVmd` and `faceTracks` (morph keys to
  expression tracks for presence clips), `parseVpd` with the posing tool
  JSON sniff, `parseUnityAnim` and `convertUnityGeneric`. `/three` gains
  `readVrma`, `pickTake` and `firstPlayable`. Unity humanoid muscle clips
  are refused with a reason; see the README.

### Face driver and rest stance, 2026-11-24

- `@hackbuild/presence`: `Face`, one owner for every expression weight:
  moods eased at rate 8, resting weights (happy 0.25, relaxed 0.3,
  vendor), the lid from `Blink` or gaze, speech mouth shapes first, clip
  face tracks at the larger of clip and mood. `Clip` gains optional
  `faces`; `ClipPlayer.faces` holds the frame's weights by layer weight.
  `restStance` and `restStanceFromThree` lower the arms for a body with
  no idle clip.
- `@hackbuild/avatar-host`: `Body` writes its face through `Face` and
  stands in the rest stance (`stance`, `restingFace` options).

### Environment, 2026-11-24

- `@hackbuild/avatar-host`: the environment slot. `stage.environment` and
  `showEnvironment` show a scene with ticketed loads, the body casting a
  shadow, the plain lights off and the pixel ratio capped at 1.5; the
  element takes an `environment` attribute. The example page has a
  studio light toggle and two browser checks for it.

- `@hackbuild/environment`: new package. Studio, room, cafe and outdoors
  layouts as data with the files each needs (`needsOf`, `missingFor`);
  only the studio works with no file. `loadEnvironment` loads fully before
  `attach`, turns an HDRI so its brightest point sits behind the key
  light, bakes a light probe normalized to mean radiance 1, and restores
  tone mapping on dispose. `assemble` merges a kit set by material.
  Bundles no HDRI and no model.

### Model pack repair, 2026-11-24

- `@hackbuild/avatar`: `normalizeHumanoid` bakes units into the model
  (`bakeScale`); the wrapper group keeps facing and floor at scale 1.
  `managerForFiles` adds a picking texture loader (`userData.ready`,
  `userData.file`, TGA) and guards `decodeURIComponent`. `fillMaps` fills
  missing color maps from a UV tile owner, a name match or a sibling image
  at coverage 0.6 or more (vendor), and `RepairReport` gains `byTile`,
  `byName`, `byCoverage` and `misses`. FBX meshes stored hidden start
  hidden (`hiddenInFile`, `applyStartingVisibility`). `TextureIndex`
  splits words on Unicode letters and digits and never matches a sphere
  map as a color. `/vrm` gains `toVrm`, a three-vrm `VRM` around a GLB or
  FBX avatar.
- `@hackbuild/presence`: `applyGaze` keeps eye bones inside 12 degrees
  sideways and 8 up and down by default (`eyeLimitDeg`, vendor).

### hackbuild-ui pin, 2026-11-23

- examples: hackbuild-ui 0.4.4 to 0.5.0 at commit 5211c3a, pinned by
  hackbuild-ui `tools/pin-ui.mjs`; `tools/vendor/hackbuild-ui.pin` records
  version, commit and sha-256, and `npm run ui:check` (run in CI before
  `npm ci`) checks the tarball, SHA256SUMS, package.json and the lockfile
  against it.

### Release readiness, 2026-11-23

- ci: `packages` job packs every package and runs the files allowlist,
  manifest, peer, publint, attw and gzip size budget checks
  (`tools/lint-packages.mjs`, `tools/size-budget.json`); README size
  tables are generated from the budget. `browser` job loads each single
  file build from file:// in headless Chrome, three.js first for the
  adapters. The `unit` job summary names every skipped test.
  `tools/lint-authors.mjs` checks package.json and Cargo.toml authors.
  `rust-toolchain.toml` pins Rust 1.95.0.
- Every tarball shipped `dist/.tsbuildinfo`; the build info now sits
  beside each tsconfig.
- Changesets for versions and package changelogs; `release.yml` runs on
  manual dispatch only, packs and uploads the tarballs, and publishes
  nothing.
- Verified on macOS 12: publint and attw clean on all eleven tarballs,
  all eleven single file builds load in headless Chrome, cargo tests
  on 1.95.0. Not verified until the push: the Linux runner.

- `@hackbuild/motion-net`: rewritten under MIT from a functional
  specification and the published paper; the earlier CC BY-NC version is
  removed. Weight loader with format checks, the forward pass on wasm
  SIMD128, a blob worker with an in page fallback, and `QuadrupedHost`, a
  gait backend over the published quadruped network. Weights stay CC
  BY-NC 4.0, loaded at run time.
- Example pages: restyled on the hack.build design system, hackbuild-ui
  0.4.4 vendored pinned by commit in `tools/vendor` with its sha-256
  checked in CI, fonts inlined so the pages open offline. Mobile first:
  the viewport sits above the controls on a phone, one finger orbits and
  two pinch zoom, controls take 44 px rows and 16 px fields, a drop zone
  opens the file picker on tap, and the avatar and lipsync pages frame the
  face on a viewport under 641 px. The dark scene branch is gone.

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
