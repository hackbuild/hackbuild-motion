# @hackbuild/retarget

Move clips between any rigs through one normalized humanoid space, with readers for BVH, VMD, VPD, VRMA and Unity text clips.

[![npm](https://img.shields.io/npm/v/@hackbuild/retarget)](https://www.npmjs.com/package/@hackbuild/retarget) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 154.5 kB measured](https://img.shields.io/badge/gzip-154.5%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

Browser status: the demo page has run in Chrome on a BVH walk written in code; no real clip file has been loaded in a browser yet.

## What it does

- Defines `HumanoidMotion`, an interchange format of per bone rotations in the normalized space and hip travel in hip heights, so one motion fits a child and a tall adult.
- Maps and measures any skeleton (facing, units, floor, A or T pose) and retargets clips onto and off it with `RetargetRig`.
- Reads BVH, MikuMikuDance VMD and VPD, VRM animation (VRMA) and Unity text clips of transform curves, solving legs keyed only by foot IK.
- Tags a motion by what the body does (wave, squat, nod, spin, walk, dance, idle and more) and packs it into a compact binary form.
- Retargets three.js `AnimationClip`s between scenes, or copies a driver rig's pose onto a target every frame.

## Install

```sh
npm install @hackbuild/retarget
```

It depends on `@hackbuild/rig` for the bone mapper. three.js is an optional peer, needed only for the `/three` subpath.

| subpath | needs | what |
|---|---|---|
| `@hackbuild/retarget` | none | the format, the rig, BVH and VMD parsers, analysis |
| `@hackbuild/retarget/formats` | none | VMD with face tracks, VPD, Unity text clips |
| `@hackbuild/retarget/three` | `three` 0.186.1 or later (optional peer) | scene skeletons, AnimationClip in and out, live retarget, VRMA |
| `@hackbuild/retarget/wasm` | none | the wasm file, to pass to `load()` as a URL |
| `@hackbuild/retarget/inline` | none | the wasm as base64 |
| `@hackbuild/retarget/iife` | `THREE` global for the three parts | single file build, global `HackbuildRetarget`, wasm inlined |

## Quick start

```ts
import { analyzeMotion, load, packMotion, parseBvh, RetargetRig } from "@hackbuild/retarget";

await load();
// pick any BVH file: its bones map onto the normalized humanoid by name
const input = document.body.appendChild(document.createElement("input"));
input.type = "file";
input.accept = ".bvh";
input.onchange = async () => {
  const file = input.files?.[0];
  if (!file) return;
  const { skeleton, clip } = parseBvh(await file.text());
  const rig = new RetargetRig(skeleton); // meters per unit is guessed from the rest height
  const motion = rig.toHumanoid(clip, { settle: true });
  const found = analyzeMotion(motion);
  console.log(found.duration.toFixed(2), "s,", found.tags.join(" "), packMotion(motion).byteLength, "bytes packed");
  rig.dispose();
};
```

## Live example

The demo page plays a BVH walk recorded on another rig, in centimeters, on the normalized humanoid, and takes your own file: [hackbuild-motion/retarget](https://hackbuild.github.io/hackbuild-motion/retarget/). The suite runs it too: [hackbuild-suite retarget](https://hackbuild.github.io/hackbuild-suite/#/motion/retarget).

## Concepts

### the normalized humanoid space

Every motion is stored as VRM 1.0 bone names, rotations relative to a T pose, +Z forward, meters, feet at y = 0. Hip travel is in multiples of hip height, so a half size body moves half as far. `packMotion` and `unpackMotion` give the compact binary form (`HBM1`, f32, about 16 bytes per bone per frame).

### a rig maps and measures

`new RetargetRig(skeleton)` maps bone names through `@hackbuild/rig`, finds the facing, the unit and the floor, and gives each humanoid bone a rest alignment toward the reference T pose. An A pose source, a model facing -Z, centimeters or scrambled bind orientations make no difference. `toHumanoid(clip)` reads a clip into the space, `bind(motion)` writes a motion onto the rig, `retargetClip` does both at once, and `retargetLimb` gives an end effector target for a limb of another length. Pass `{ unit }` when you know meters per source unit.

### rest and floor

`restFromFirstFrame` turns a T pose kept in frame 0 into the rest, as some BVH releases do. `settleOnFloor` (or `toHumanoid(clip, { settle: true })`) moves a clip a few centimetres off the floor down onto it and leaves an airborne loop alone.

### readers

`parseBvh` takes any channel order and keeps End Sites as helper joints. `parseVmd` reads MikuMikuDance at 30 fps with per channel bezier easing and Shift-JIS names through `TextDecoder`, and solves legs keyed only by foot IK bones with two bone IK. From `/formats`: `readVmd` returns the motion and its face as VRM expression tracks, `parseVpd` reads a pose, and `parseUnityAnim` with `convertUnityGeneric` reads a Unity text clip of transform curves. Unity humanoid muscle clips are refused: their zero pose depends on per avatar rotations Unity does not publish, so export from a generic rig or as VRMA instead.

### three.js

```ts
import { retargetAnimation } from "@hackbuild/retarget/three";

const clip = retargetAnimation(source.animations[0]!, source.scene, avatar.scene);
mixer.clipAction(clip).play();
```

`LiveRetarget` copies a driver rig's pose onto a target every frame, so a clip library on the driver plays on any model. `readVrma` reads a VRM animation by the file's own humanoid table with three's `GLTFLoader`; `pickTake` picks a take by name, else `mixamo.com`, else the longest, and `firstPlayable` tries a file's format variants until one plays.

### analysis

`analyzeMotion` returns duration, loop and pose flags, mean head pitch, energy in hip heights per second, and tags: hands up, cheer, wave, raise hand, squat, crouch, jump, spin, turn, walk, bow, nod, shake head, clap, hand to face, pose, dance, idle.

## API overview

| export | what it does |
|---|---|
| [`load`](../../docs/api/retarget/index.md#load) | load the wasm core once; call before anything else |
| [`RetargetRig`](../../docs/api/retarget/index.md#retargetrig) | map and measure a skeleton, read and write motions |
| [`HumanoidMotion`](../../docs/api/retarget/index.md#humanoidmotion) | the interchange format |
| [`parseBvh`](../../docs/api/retarget/index.md#parsebvh) | read a BVH file |
| [`parseVmd`](../../docs/api/retarget/index.md#parsevmd) | read a MikuMikuDance VMD file |
| [`retargetClip`](../../docs/api/retarget/index.md#retargetclip) | a clip from one rig onto another in one call |
| [`analyzeMotion`](../../docs/api/retarget/index.md#analyzemotion) | tags and measures of a motion |
| [`packMotion`](../../docs/api/retarget/index.md#packmotion) | the compact binary form |
| [`readVmd`](../../docs/api/retarget/formats.md#readvmd) | a VMD as motion and face tracks |
| [`parseUnityAnim`](../../docs/api/retarget/formats.md#parseunityanim) | read a Unity text clip |
| [`retargetAnimation`](../../docs/api/retarget/three.md#retargetanimation) | a three.js clip from one scene onto another |
| [`LiveRetarget`](../../docs/api/retarget/three.md#liveretarget) | copy a driver's pose onto a target every frame |
| [`readVrma`](../../docs/api/retarget/three.md#readvrma) | read a VRM animation file |

The full reference is in [docs/api/retarget](../../docs/api/retarget/README.md).

## Models and weights

No model, clip or weight ships here. The clips and models you load keep their own licences.

| input | where it loads from | licence |
|---|---|---|
| BVH, VMD, VPD, VRMA, Unity clips | a file or URL you give | the file's own |
| three.js scenes and clips | your loader | the model's own |

## Browser support

| needs | Chrome | Safari | Firefox | phone |
|---|---|---|---|---|
| WebAssembly with SIMD128 | yes (measured, Chrome 150) | 16.4 and later (vendor) | yes (vendor) | unknown |
| `TextDecoder("shift_jis")` for VMD and VPD names | yes (vendor) | yes (vendor) | yes (vendor) | unknown |

No WebGPU, workers or wasm threads. From file:// use `dist/retarget.iife.js`, which carries the wasm inlined and reads `THREE` from the page, or call `load()` with no argument. In Node, Shift-JIS decoding needs full ICU, or pass your own `decode` to `parseVmd`.

## Errors and troubleshooting

| message | cause | what to do |
|---|---|---|
| `@hackbuild/retarget: wasm not loaded. call load() first.` | a parser or rig call before `load()` resolved | `await load()` once first |
| `this .vpd is a posing tool pose of unity muscle values, which is not read. save it as a vrma.` | the JSON `.vpd` of a posing tool | export the pose as VRMA |
| `not a vpd pose file` | the file does not start with `Vocaloid Pose Data` | check the file |
| `this vpd has no bones` | the pose names no bone | check the file |
| `not a text unity .anim. save the project with force text serialization.` | a binary Unity clip | set Unity's asset serialization to force text and save again |
| `this .anim is a humanoid muscle clip, which is not read. export it from a generic rig or as a vrma.` | a Unity humanoid muscle clip | export from a generic rig or as VRMA |
| `no curve in this .anim drives a humanoid bone` | no curve path maps to a humanoid bone | check the clip's bone paths |
| `no take named "<take>" in this file` | `pickTake` got a name the file lacks | pick one of the file's take names |
| `this file holds no animation. it may be a model, not a motion.` | the file has no clip | load a motion file |
| `no VRMC_vrm_animation humanoid in this file. it may be a model, not a vrma.` | `readVrma` got a file without the VRMA extension | load a `.vrma` file |
| `this vrma holds no animation` | the VRMA has no clip | check the file |

### mistakes to avoid

- Calling a parser or `new RetargetRig()` before `await load()`.
- Retargeting rig to rig directly: read the source into a `HumanoidMotion` with `toHumanoid`, then `bind` it on the target, so any pair of rigs works.
- Passing hip travel in meters: `HumanoidMotion` stores it in hip heights; `bind` scales it to the target.
- Importing `@hackbuild/retarget/three` without three.js installed, or using the single file build on a page without a `THREE` global.
- Forgetting `dispose()` on a `RetargetRig`: it holds wasm memory.

## Works with

- [@hackbuild/rig](../rig/README.md) maps bone names to the humanoid and holds the expression table the face tracks use.
- [@hackbuild/avatar](../avatar/README.md) loads models into the same normalized space.
- [@hackbuild/presence](../presence/README.md) plays the face tracks and layers clips.
- [@hackbuild/motion-match](../motion-match/README.md) and [@hackbuild/bake](../bake/README.md) take retargeted clips.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)); this README is CC-BY-4.0 with its code samples also MIT. No clips or models ship here; files you load keep their own licences.

## What is verified, and what is not

### Verified on this machine

| check | result | label |
|---|---|---|
| `cargo test -p hackbuild-retarget` | 19 of 19 pass, clippy clean natively and for wasm32 | counted |
| `npx vitest run packages/retarget` | 11 of 11 pass, one a fast-check property over the binary format | counted |
| a rig facing -Z, in centimeters, A pose arms, scrambled bind orientations, 5 seeded motions of 12 frames | bind then read back gives the same rotations within 1e-6 rad and hip offsets within 1e-9; limbs point as the reference body's within 1e-9 | computed |
| a half size body | hip travel halves | computed |
| a VMD left arm with no key, a 5 unit center key | arm 35 degrees below horizontal, hips move 0.4 m | computed |
| a BVH arm keyed 60 degrees down | reads 60 degrees in the normalized space | computed |
| a three.js clip on a 1 m body onto a 60 times larger body facing the other way | same arm angle in the body frame and same share of hip height, within 1e-6; `LiveRetarget` limb directions within 1e-6 | computed |
| a BVH root with zero OFFSET starting crouched, hips at 60 on a 90 leg | rests at 90 | computed |
| VMD foot IK key 0.1 hip heights forward, body 0.15 lower | foot on target within 1 mm, knee in front of the hip to ankle line | computed |
| a foot IK target 3 hip heights down | straight leg of 0.83 m, no NaN | computed |
| a face only VMD of 45 frames | 46 frames; of two blink morphs the one with more keys plays | computed |
| a VRMA arm raise of 60 degrees | reads 60, hips travel 0.5 m, `aa` track 0 to 1 | computed |
| golden trace (seeded BVH and foot IK VMD through parse, retarget, floor, analysis and bind) | bit identical between the native and the wasm build | measured |

### Not verified by anything

- Real files: no Mixamo FBX, UAL glTF, CMU BVH, VRoid VRM, MMD VMD or VPD, VRMA or Unity clip was loaded; the readers and rigs in the tests are synthetic.
- Foot IK ignores the VMD IK on and off frames and the parent of all bone.
- Unity curves sample linearly; tangents are dropped. A generic rig whose bones rest with non identity rotations reads wrong.
- Sorting clips into classes (idle, talk, gesture, locomotion) from file names is not written.
- Non uniform scale on an armature node, and scale animation.
- Motion in a real browser at real frame rate, judged by a person.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 154,498 bytes | 162,222 bytes |
| `dist/wasm/retarget_bg.wasm` | 111,212 bytes | 116,772 bytes |
| `dist/retarget.iife.js` (single file build) | 184,822 bytes | 194,063 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.
