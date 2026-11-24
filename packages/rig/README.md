# @hackbuild/rig

Rig handling for the normalized humanoid space every package in this
repository works in: VRM 1.0 bone names, T pose, +Z forward, meters, feet
at y = 0. The core is the Rust crate `crates/rig` compiled to wasm32 with
SIMD128; this package loads it, adds the expression and viseme table, and
offers a three.js adapter under `/three`.

- `mapRig(nodes)`: source bone names to the 55 VRM humanoid bones by rules,
  with no per rig table. Names are split into a side, body part words and a
  number; candidates carry a score; chain shifts fix rigs that spend two
  names on one bone (a shoulder under a collar is the upper arm, a foot
  under an ankle is the toes); the spine is assigned by depth; fingers by
  their numbers, with four joint fingers shifted down; MMD Japanese names
  have their own dialect. The report lists missing required bones,
  unmapped and helper bones, losing candidates, MMD D deform bones and a
  dialect guess.
- `limbChains(nodes, rest?)`: the chain model for non humanoids: legs
  `LF RF LH RH`, `tail`, `earL`, `earR`, `spine`, `neck`, `head`, each with
  a root, a tip and a pole measured from the rest pose.
- `analyzeRest(positions)`: facing, units (meters, decimeters,
  centimeters, inches, millimeters; inches only where centimeters would
  read a body under 1 m), floor, hips height and arm and leg pose, with the rotations
  that turn the rig to +Z and lift A pose arms into the T pose.
  `referenceRest()` is a 1.70 m reference humanoid in the normalized space.
- The expression and viseme table: the 18 VRM 1.0 expressions, ARKit 52,
  the 15 Oculus visemes, morph name aliases (VRChat, MMD, plain English),
  ARKit and Oculus composites, viseme to vowel weights, the vowel to
  viseme map, the ARKit shapes a lip consonant adds, and
  `resolveExpressions(morphNames)`. avatar, lipsync and the action grammar
  read this table and keep no copy.
- `/three`: `mapObject3D(root)`, `chainsOf(root)`, `restOf(bones)` and
  `applyRestFix(root, bones, report)`.

Written for this library; the mapper merges the ideas of two earlier
in-house bone classifiers (a dog simulator and an arm solver) with chain shifts and depth assigned spines.

Why the table is TypeScript: it is plain data read by TypeScript packages,
which should not wait for wasm to load to read it.

## Install

Not published yet. From a clone:

    npm ci && npm run build -w @hackbuild/rig

## Use

```ts
import { load, mapRig, resolveExpressions } from "@hackbuild/rig";
import { mapObject3D, restOf, applyRestFix } from "@hackbuild/rig/three";

await load(); // inlined wasm; or a URL or bytes
const { report, bones } = mapObject3D(gltf.scene);
if (report.missingRequired.length) console.warn("not a humanoid:", report.missingRequired);
const rest = restOf(bones);
if (rest) applyRestFix(gltf.scene, bones, rest); // faces +Z, meters, feet on y = 0, T pose arms

const face = resolveExpressions(morphNamesOf(gltf.scene));
face.aa?.binds; // [{ morph: "viseme_aa", weight: 1 }] on a Ready Player Me style head
```

`dist/rig.iife.js` is the single file build (`HackbuildRig`, wasm inlined,
`THREE` read from the page).

## Develop

    npm run build -w @hackbuild/rig
    npx vitest run packages/rig
    cargo test -p hackbuild-rig

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `cargo test -p hackbuild-rig` passed 19 of 19 tests
  (counted), clippy clean natively and for wasm32.
- 2026-11-22: `npx vitest run packages/rig` passed 11 of 11 tests
  (counted), one a fast-check property over node order and namespaces.
- 2026-11-22: the mapper maps all 15 required bones on 11 name sets and the
  named spot checks on 3 more (computed by the corpus test): Mixamo with
  the prefix, Ready Player Me style (Mixamo names without it), Quaternius
  UAL (Unreal mannequin names), Unreal 5 with twist, IK and metacarpal
  bones, VRoid, Meshy humanoid, CMU BVH, 3ds Max Biped, Rigify deform
  bones, SMPL, MMD; Xsens and Character Creator spot checks. A seeded
  property test reshuffles six sets 20 times each with namespaces and an
  FBX style duplicate child and gets the same mapping (computed).
- 2026-11-22: on a Meshy dog rig the humanoid mapper reports missing
  required bones and the chain finder returns the four legs, tail, ears,
  neck and spine in order (computed).
- 2026-11-22: the rest analysis golden trace is bit identical between the
  native and the wasm build (measured), and a turned, centimeter, A pose
  model comes out facing +Z with level arms and toes on y = 0 (computed).

### Not verified by anything

- Real exported files: the name sets were written by hand from exporter
  conventions, an earlier arm solver's driver table and an earlier dog
  simulator's rig names. The Meshy humanoid set is inferred from that
  simulator's sources (`headfront`) and the
  exporter's Mixamo style names, not read from a Meshy file.
- Character Creator and Xsens are spot checked, not required to map fully.
- Rest analysis on rigs whose head is not above the hips in the rest pose.
- Expression resolution on real VRChat, MMD and ARKit models; the viseme to
  vowel weights were chosen by eye.
- `no_std`: the crate uses only `core`, `alloc` and `libm`, but a build
  without `std` is not checked, because the organic dependency builds as a
  cdylib, which needs a panic handler.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 88,908 bytes | 93,353 bytes |
| `dist/wasm/rig_bg.wasm` | 57,198 bytes | 60,057 bytes |
| `dist/rig.iife.js` (single file build) | 90,016 bytes | 94,516 bytes |

Measured 2026-11-24 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

## Licence

Code MIT (`LICENSE` at the repository root). This README is CC-BY-4.0, its
code samples also MIT.
