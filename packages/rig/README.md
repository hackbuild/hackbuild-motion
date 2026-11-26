# @hackbuild/rig

Bring any humanoid or legged skeleton into one normalized space: bone name mapping with no per rig table, limb chains, rest pose analysis, and the expression and viseme table.

[![npm](https://img.shields.io/npm/v/@hackbuild/rig)](https://www.npmjs.com/package/@hackbuild/rig) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 89.0 kB measured](https://img.shields.io/badge/gzip-89.0%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

## What it does

- Maps source bone names to the 55 VRM 1.0 humanoid bones by rules (`mapRig`), for Mixamo, VRoid, Unreal, Rigify, 3ds Max Biped, SMPL, MMD and generic names, and reports what is missing, unmapped or ambiguous.
- Finds limb chains on quadrupeds and other rigs (`limbChains`): four legs, tail, ears, spine, neck and head, each with a measured pole.
- Measures a rest pose (`analyzeRest`): which way it faces, its units, its floor, and the rotations that turn it to +Z and lift A pose arms into a T pose.
- Holds one expression and viseme table: the 18 VRM expressions, ARKit 52, the 15 Oculus visemes, morph name aliases and composites, and `resolveExpressions` to bind them to a model's morphs.
- Does the same on three.js objects under `/three`: `mapObject3D`, `chainsOf`, `restOf`, `applyRestFix`.

## Install

```sh
npm install @hackbuild/rig
```

three.js is an optional peer, needed only for the `/three` subpath.

| subpath | what | needs |
|---|---|---|
| `@hackbuild/rig` | mapper, chains, rest analysis, the bone list and the expression table | nothing |
| `@hackbuild/rig/bones` | `HUMAN_BONES` and helpers, with no wasm | nothing |
| `@hackbuild/rig/expressions` | the expression and viseme table, with no wasm | nothing |
| `@hackbuild/rig/three` | `mapObject3D`, `chainsOf`, `restOf`, `applyRestFix` | `three` 0.186.1 or later (optional peer) |
| `@hackbuild/rig/wasm` | the wasm file, for `load(url)` | nothing |
| `@hackbuild/rig/inline` | the wasm as base64, what `load()` uses with no argument | nothing |
| `@hackbuild/rig/iife` | `dist/rig.iife.js`, a classic script setting `HackbuildRig` | `THREE` on the page for the adapter |

## Quick start

```ts
import { analyzeRest, load, mapRig, referenceRest, resolveExpressions } from "@hackbuild/rig";

// the wasm core is inlined; load() also takes a URL or bytes
await load();

// a Mixamo style skeleton as name and parent pairs, as you would read it from a glTF
const names = ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand", "RightShoulder", "RightArm", "RightForeArm", "RightHand", "LeftUpLeg", "LeftLeg", "LeftFoot", "RightUpLeg", "RightLeg", "RightFoot"];
const parent = [-1, 0, 1, 2, 3, 4, 3, 6, 7, 8, 3, 10, 11, 12, 0, 14, 15, 0, 17, 18];
const report = mapRig(names.map((n, i) => ({ name: `mixamorig:${n}`, parent: parent[i] ?? null })));
console.log(report.dialect, `coverage ${report.coverage}`, "missing", report.missingRequired, "left forearm is node", report.byBone.leftLowerArm);

// rest pose analysis: facing, units, floor and T pose fixes (here the 1.70 m reference)
const rest = analyzeRest(referenceRest());
console.log(rest?.units, `head at ${rest?.height.toFixed(2)}`, `A pose ${rest?.aPose}`);

// which morphs make each VRM expression on a Ready Player Me style head
const face = resolveExpressions(["viseme_aa", "viseme_O", "eyeBlinkLeft", "eyeBlinkRight", "mouthSmile"]);
console.log(face.aa?.binds, face.blink?.source);
```

## Live example

The retarget demo page maps a BVH rig and your own dropped file with this package: [hackbuild-motion/retarget](https://hackbuild.github.io/hackbuild-motion/retarget/). The package page shows how it works: [hackbuild-motion/rig](https://hackbuild.github.io/hackbuild-motion/rig/). In the suite: [hackbuild-suite retarget](https://hackbuild.github.io/hackbuild-suite/#/motion/retarget).

## Concepts

### the normalized humanoid space

Every package in this repository works in one space: VRM 1.0 bone names, T pose, +Z forward, +Y up, meters, feet at y = 0. This package gets a rig there. `mapRig` names the bones, `analyzeRest` finds the turn, scale and floor, and `applyRestFix` (three.js) applies them under a new group.

```ts
import { applyRestFix, mapObject3D, restOf } from "@hackbuild/rig/three";

const { report, bones } = mapObject3D(gltf.scene);
const rest = report.missingRequired.length ? null : restOf(bones);
if (rest) scene.add(applyRestFix(gltf.scene, bones, rest)); // faces +Z, meters, feet on y = 0, T pose arms
```

### mapping by rules

Names are split into a side, body part words and a number, and candidates are scored. Chain shifts fix rigs that spend two names on one bone (a shoulder under a collar is the upper arm, a foot under an ankle is the toes), the spine is assigned by depth, and fingers by their numbers. MMD Japanese names have their own dialect. The report says which bones lost to a better candidate, which were helpers, and the `coverage` of the 15 required bones.

### chains for everything else

A dog, a horse or a creature is not a humanoid. `limbChains` returns named chains (`LF RF LH RH`, `tail`, `earL`, `earR`, `spine`, `neck`, `head`) with root, tip and a pole measured from the rest positions you pass.

### load the wasm first, except for the table

`load()` instantiates the wasm once; with no argument it decodes the inlined copy, which works from file://. The mapper, chains and rest analysis throw until it is loaded. The bone list and the expression table are plain TypeScript data (also under `/bones` and `/expressions`), so packages that only read them never wait for wasm.

## API overview

| export | what it does |
|---|---|
| [`load`](../../docs/api/rig/index.md#load) | instantiate the wasm, inlined by default |
| [`mapRig`](../../docs/api/rig/index.md#maprig) | source bone names to VRM humanoid bones |
| [`RigMapReport`](../../docs/api/rig/index.md#rigmapreport) | what mapped, what is missing, the dialect and coverage |
| [`limbChains`](../../docs/api/rig/index.md#limbchains) | named limb chains with poles |
| [`analyzeRest`](../../docs/api/rig/index.md#analyzerest) | facing, units, floor and T pose fixes of a rest pose |
| [`referenceRest`](../../docs/api/rig/index.md#referencerest) | a 1.70 m reference humanoid in the normalized space |
| [`HUMAN_BONES`](../../docs/api/rig/bones.md#human_bones) | the VRM 1.0 bone names |
| [`resolveExpressions`](../../docs/api/rig/expressions.md#resolveexpressions) | bind VRM presets to a model's morph names |
| [`VISEME_TO_VOWELS`](../../docs/api/rig/expressions.md#viseme_to_vowels) | Oculus viseme to VRM vowel weights |
| [`mapObject3D`](../../docs/api/rig/three.md#mapobject3d) | map a three.js scene's bones |
| [`restOf`](../../docs/api/rig/three.md#restof) | rest analysis of mapped three.js bones |
| [`applyRestFix`](../../docs/api/rig/three.md#applyrestfix) | turn, scale and floor a three.js model into the normalized space |
| [`chainsOf`](../../docs/api/rig/three.md#chainsof) | limb chains of a three.js scene |

The full reference is in [docs/api/rig](../../docs/api/rig/README.md).

## Browser support

| feature | needs | notes |
|---|---|---|
| wasm core | WebAssembly with SIMD128 | every current desktop and phone browser (inferred); no threads, so no cross origin isolation |
| bone list and expression table | nothing | plain TypeScript, also in Node |
| `/three` adapter | three.js 0.186.1 or later | |
| file:// | `dist/rig.iife.js` | a classic script with the wasm inlined; reads `THREE` from the page |

## Errors and troubleshooting

| message | cause | what to do |
|---|---|---|
| `@hackbuild/rig: wasm not loaded. call load() first.` | `mapRig`, `limbChains`, `analyzeRest` or an adapter call ran before `load()` resolved | `await load()` once at start up |
| a `WebAssembly` compile or fetch error | `load(url)` pointed at a missing or wrong file | call `load()` with no argument to use the inlined copy, or check the URL serves `rig_bg.wasm` |

Nothing else throws. A rig that is not a humanoid comes back with `missingRequired` filled and a low `coverage`, and `analyzeRest` returns null when hips, head or arms are missing; use `limbChains` for such rigs.

## Works with

- [@hackbuild/avatar](../avatar/README.md) loads VRM, GLB and FBX files and uses this mapper and rest fix.
- [@hackbuild/retarget](../retarget/README.md) moves clips between rigs this package mapped.
- [@hackbuild/gait](../gait/README.md) takes leg names from `limbChains`.
- [@hackbuild/lipsync](../lipsync/README.md) reads the viseme table.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)); this README is CC-BY-4.0 with its code samples also MIT. No weights or model files ship here.

## What is verified, and what is not

| check | result | label |
|---|---|---|
| `cargo test -p hackbuild-rig` | 19 of 19 pass, clippy clean natively and for wasm32 | counted |
| `npx vitest run packages/rig` | 11 of 11 pass, one a fast-check property over node order and namespaces | counted |
| name set corpus | all 15 required bones map on 11 name sets (Mixamo with and without the prefix, Quaternius UAL, Unreal 5 with twist, IK and metacarpal bones, VRoid, Meshy humanoid, CMU BVH, 3ds Max Biped, Rigify deform bones, SMPL, MMD); Xsens and Character Creator spot checks pass | computed |
| shuffled sets | six sets reshuffled 20 times each, with namespaces and an FBX style duplicate child, map the same | computed |
| Meshy dog rig | the humanoid mapper reports missing bones; the chain finder returns four legs, tail, ears, neck and spine in order | computed |
| rest analysis | golden trace bit identical between native and wasm; a turned, centimeter, A pose model comes out facing +Z with level arms and toes on y = 0 | measured |

Not verified by anything:

- Real exported files: the name sets were written by hand from exporter conventions, not read from exported files. The Meshy humanoid set is inferred.
- Character Creator and Xsens are spot checked, not required to map fully.
- Rest analysis on rigs whose head is not above the hips in the rest pose.
- Expression resolution on real VRChat, MMD and ARKit models; the viseme to vowel weights were chosen by eye.
- A build without `std`: the crate uses only `core`, `alloc` and `libm`, but this is not checked.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 89,029 bytes | 93,480 bytes |
| `dist/wasm/rig_bg.wasm` | 57,198 bytes | 60,057 bytes |
| `dist/rig.iife.js` (single file build) | 90,127 bytes | 94,633 bytes |

Measured 2026-11-26 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.
