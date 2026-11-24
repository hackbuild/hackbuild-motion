# @hackbuild/retarget

Motion between rigs through the normalized humanoid space (VRM 1.0 bone
names, T pose, +Z forward, meters, feet at y = 0). The core is the Rust
crate `crates/retarget` compiled to wasm32 with SIMD128; this package loads
it and offers a three.js adapter under `/three`.

- `HumanoidMotion`, the interchange format: per bone local rotations in
  the normalized space and hip travel in multiples of hip height, so one
  motion fits a child and a tall adult. `packMotion` and `unpackMotion`
  give a compact binary form (`HBM1`, f32, about 16 bytes per bone per
  frame).
- `RetargetRig`: maps a skeleton with `@hackbuild/rig`, measures its
  facing, units and floor, and gives every humanoid bone a rest alignment
  toward the reference T pose. An A pose source (Ready Player Me style,
  VRoid, MMD) retargets without a T pose frame; a facing of -Z, centimeters
  or a scrambled bind orientation make no difference. `toHumanoid(clip)`,
  `bind(motion)`, `retargetPose` for one frame, `retargetClip` for both
  steps at once, `retargetLimb` for end effector targets.
- `restFromFirstFrame`: a T pose kept in frame 0 becomes the rest (the CMU
  BVH release does this). `settleOnFloor`: a clip a few centimetres off the
  floor touches it; an airborne loop is left alone.
- Readers: `parseBvh` (any channel order, End Sites kept as helper joints)
  and `parseVmd` (MikuMikuDance, 30 fps, per channel bezier easing, Shift-JIS
  names through `TextDecoder`, morph keys returned for the face).
- `analyzeMotion`: tags from what the body does (hands up, cheer, wave,
  raise hand, squat, crouch, jump, spin, turn, walk, bow, nod, shake head,
  clap, hand to face, pose, dance, idle), loop and pose flags, mean head
  pitch and energy.
- `/three`: `skeletonFromObject3D`, `sampleAnimationClip`,
  `toAnimationClip`, `retargetAnimation(clip, srcRoot, dstRoot)` and
  `LiveRetarget`, which copies a driver rig's pose onto a target every
  frame so a whole clip library on the driver plays on any model.

Written for this library. The rest alignment generalizes an earlier arm
solver's retarget (bone directions aligned at rest).

## Install

Not published yet. From a clone:

    npm ci && npm run build -w @hackbuild/rig -w @hackbuild/retarget

## Use

```ts
import { load, parseBvh, RetargetRig, analyzeMotion } from "@hackbuild/retarget";
import { retargetAnimation, skeletonFromObject3D, toAnimationClip } from "@hackbuild/retarget/three";

await load();
const clip = retargetAnimation(mixamoGltf.animations[0], mixamoGltf.scene, avatar.scene);
mixer.clipAction(clip).play();

const bvh = parseBvh(await (await fetch("walk.bvh")).text());
const motion = new RetargetRig(bvh.skeleton).toHumanoid(bvh.clip, { settle: true });
analyzeMotion(motion).tags; // ["walk"]
const target = skeletonFromObject3D(avatar.scene);
const onAvatar = toAnimationClip(new RetargetRig(target.skeleton).bind(motion), target, "walk");
```

`dist/retarget.iife.js` is the single file build (`HackbuildRetarget`,
wasm inlined, `THREE` read from the page).

## Develop

    npm run build -w @hackbuild/rig -w @hackbuild/retarget
    npx vitest run packages/retarget
    cargo test -p hackbuild-retarget

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `cargo test -p hackbuild-retarget` passed 14 of 14 tests
  (counted), clippy clean natively and for wasm32.
- 2026-11-22: `npx vitest run packages/retarget` passed 10 of 10 tests
  (counted), one a fast-check property over the binary format.
- 2026-11-22: on a rig turned to face -Z, in centimeters, with A pose arms
  and every bind orientation scrambled, binding a random motion and reading
  it back gave the same normalized rotations within 1e-6 rad and the same
  hip offsets within 1e-9 (computed, 5 seeded motions of 12 frames), and
  its limbs pointed where the reference body's limbs point within 1e-9
  (computed).
- 2026-11-22: hip travel scales with hip height (a half size body moves
  half as far); a VMD left arm with no key rotation comes out 35 degrees
  below horizontal in the normalized space and a 5 unit center key moves
  the hips 0.4 m; a BVH arm keyed 60 degrees down reads 60 degrees in the
  normalized space (computed).
- 2026-11-22: a three.js clip on a 1 m Mixamo named body retargeted onto a
  60 times larger body facing the other way moves the arm by the same
  angle in the body's own frame and the hips by the same share of hip
  height, within 1e-6 (computed); `LiveRetarget` matches limb directions
  within 1e-6 (computed).
- 2026-11-22: the golden trace (a seeded BVH through parse, retarget,
  floor, analysis and bind) is bit identical between the native and the
  wasm build (measured).
- 2026-11-23: a BVH root with a zero OFFSET rests on the frame 0 floor
  (its lowest joint) plus the rest pose's root to lowest joint height. A
  clip that starts crouched with the hips at 60 on a 90 leg rests at 90
  (computed); before, it rested at 60 and the clip floated 30 units. The
  TypeScript suite passes 11 of 11, `cargo test -p hackbuild-retarget`
  15 of 15 (counted).

### Not verified by anything

- Real files: no Mixamo FBX, UAL glTF, CMU BVH, VRoid VRM or MMD VMD was
  loaded; the readers and rigs in the tests are synthetic.
- VMD legs keyed only by foot IK bones stay in the rest pose; foot IK is
  not solved. VMD morph keys are returned but not mapped to presets here
  (`@hackbuild/rig` `resolveExpressions` holds the MMD names).
- VRMA and Unity `.anim` readers, multi take files and the clip class pass
  (idle, talk, gesture, locomotion and so on from file names) are not
  written. The motion tag words have not been checked against the action
  grammar's vocabulary, which does not exist yet.
- Non uniform scale on an armature node, and scale animation.
- Motion in a real browser at real frame rate.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 146,773 bytes | 154,111 bytes |
| `dist/wasm/retarget_bg.wasm` | 105,847 bytes | 111,139 bytes |
| `dist/retarget.iife.js` (single file build) | 149,179 bytes | 156,637 bytes |

Measured 2026-11-24 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

## Licence

Code MIT (`LICENSE` at the repository root). This README is CC-BY-4.0, its
code samples also MIT.
