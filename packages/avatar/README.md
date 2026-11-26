# @hackbuild/avatar

Load VRM, Mixamo, UAL, generic GLB, FBX and MMD characters into one humanoid space, with material repair, a wardrobe, expressions and a first person head hider.

[![npm](https://img.shields.io/npm/v/@hackbuild/avatar)](https://www.npmjs.com/package/@hackbuild/avatar) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 5.6 kB measured](https://img.shields.io/badge/gzip-5.6%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

Browser status: no real model file has been loaded in a browser yet; every load in the tests runs on models built in memory by the test.

## What it does

- Loads a URL, bytes or a dropped file, sniffs the format from its content (GLB, glTF, VRM, VRMA, binary and ASCII FBX), and places the model in the normalized humanoid space: VRM 1.0 bone names, T pose, +Z forward, meters, feet at y = 0.
- Repairs materials that render wrong in three.js: Phong and Lambert to standard, cutouts for hair and lashes, black base colors under a texture, duplicate and failed maps.
- Finds the textures of a dropped folder by path, name, cleaned stem or key words, and fills missing color maps from the files you dropped.
- Sorts meshes into 17 wardrobe slots, drives expressions on any model through one `setValue(name, weight)`, and hides the head for a first person camera.
- Checks VRM licence metadata before an avatar goes into a shareable bundle.

## Install

```sh
npm install @hackbuild/avatar three @pixiv/three-vrm
```

It depends on `@hackbuild/rig`, which maps bone names in wasm. three.js and the VRM and MMD loaders are optional peers behind their subpaths; install the ones you use.

| subpath | needs | pin |
|---|---|---|
| `@hackbuild/avatar` | nothing; format sniffing, the FBX probe, wardrobe classifier, texture index and licence gate | none |
| `@hackbuild/avatar/three` | `three` (optional peer) | 0.186.1 or later |
| `@hackbuild/avatar/vrm` | `three` and `@pixiv/three-vrm` (optional peers) | three-vrm 3.5.5 or later |
| `@hackbuild/avatar/mmd` | `three`, `@pixiv/three-vrm` and `@moeru/three-mmd` (optional peers, three-mmd is a beta) | three-mmd 0.2.0-beta.3 or later |
| `@hackbuild/avatar/iife` | a page with a `THREE` global; leaves out `/vrm` and `/mmd` | none |

## Quick start

```ts
import { load } from "@hackbuild/avatar";
import { loadAvatar } from "@hackbuild/avatar/three";
import { vrmHook } from "@hackbuild/avatar/vrm";
import * as THREE from "three";

await load(); // the rig wasm that maps bone names
const renderer = new THREE.WebGLRenderer();
renderer.setSize(innerWidth, innerHeight);
const scene = new THREE.Scene().add(new THREE.HemisphereLight(0xffffff, 0x444444, 2.5));
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.05, 50);
camera.position.set(0, 1.4, 3.2);
const input = Object.assign(document.createElement("input"), { type: "file", accept: ".vrm,.glb,.gltf,.fbx" });
document.body.append(input, renderer.domElement);

// you pick the model file; it keeps its own licence
input.onchange = async () => {
  const file = input.files?.[0];
  if (!file) return;
  const avatar = await loadAvatar(file, { name: file.name, vrm: vrmHook() });
  console.log(avatar.format, avatar.dialect, avatar.warnings);
  scene.add(avatar.root);
  renderer.setAnimationLoop(() => (avatar.update(1 / 60), renderer.render(scene, camera)));
};
```

## Live example

The demo page loads a VRM, GLB or FBX you drop and shows the rig mapping, T pose fix, material repair, clips and the head hider: [hackbuild-motion/avatar](https://hackbuild.github.io/hackbuild-motion/avatar/). The suite's avatar screen runs on this package: [hackbuild-suite avatar](https://hackbuild.github.io/hackbuild-suite/#/motion/avatar).

## Concepts

### the normalized humanoid space

Every package in this repository works in one space: VRM 1.0 bone names, T pose, +Z forward, meters, feet at y = 0. `normalizeHumanoid` maps the bones with no per rig table (`@hackbuild/rig`), bakes centimeter and millimeter units into the model (`bakeScale`), turns it to face +Z, stands it on the floor and lifts A pose arms to the T pose. `avatar.root` is the group to add to your scene; `avatar.bones` holds the bones by VRM name.

### VRM through a hook

A `.vrm` loads through `@pixiv/three-vrm` only when you pass `vrm: vrmHook()` from `/vrm`; without it the file loads as plain glTF with a warning. `toVrm(avatar)` wraps a loaded GLB or FBX avatar in a three-vrm `VRM`, so one frame loop drives every format. `avatar.update(dt)` runs the three-vrm update or the morph weights of a plain model.

### dropped folders

`managerForFiles(files, modelName)` gives a loading manager whose texture lookup forgives backslash paths, any case, copy suffixes such as `eyes.png.004`, and the model's own name as a prefix. Pass it as `files` and `loadAvatar` also fills missing color maps: first the image that owns a material's UV tile, then one named like the material, then a sibling material's image that covers at least 0.6 of its UVs.

```ts
const files = new Map([...dropped].map((f) => [f.webkitRelativePath || f.name, f] as const));
const avatar = await loadAvatar(model, { name: model.name, files: managerForFiles(files, "model") });
console.log(avatar.repair?.misses); // references no dropped file matched
```

### wardrobe and expressions

`avatar.wardrobe` holds parts per mesh, or per material on a merged mesh, sorted into slots by keywords that include the romanized Japanese names VRoid and Booth models use. `equip(id)` shows one part and hides the rest of its slot; `snapshot` and `restore` keep a look. `avatar.expressions.setValue("happy", 0.4)` works on a VRM and on a plain model, through VRChat, MMD, ARKit and Oculus viseme names.

### MMD models stay local

`loadMmd(file, { files })` from `/mmd` loads a PMX or PMD model as a three-vrm `VRM`, with rigid bodies as spring bones and 0.08 m per unit. Most MMD models forbid redistribution, so the result carries `local: true`, and `MMD_LOCAL_COPY` is the line to show: keep the file on the device.

### the licence gate

`checkRedistribution(meta, { modified })` reads VRM 1.0 and 0.x licence metadata and says whether an avatar may go into a shareable bundle, or asks the person to confirm. Run it for every donor of a composite.

## API overview

| export | what it does |
|---|---|
| [`loadAvatar`](../../docs/api/avatar/three.md#loadavatar) | load a URL, bytes or file into the normalized space |
| [`Avatar`](../../docs/api/avatar/three.md#avatar) | the loaded character: root, bones, wardrobe, expressions, update, dispose |
| [`normalizeHumanoid`](../../docs/api/avatar/three.md#normalizehumanoid) | map bones, fix units, face +Z, stand on the floor, lift to T pose |
| [`repairMaterials`](../../docs/api/avatar/three.md#repairmaterials) | fix materials that render wrong in three.js |
| [`managerForFiles`](../../docs/api/avatar/three.md#managerforfiles) | a loading manager over dropped files |
| [`Wardrobe`](../../docs/api/avatar/three.md#wardrobe) | parts by slot, equip, snapshot and restore |
| [`ExpressionRig`](../../docs/api/avatar/three.md#expressionrig) | VRM expression presets on a plain model |
| [`HeadHider`](../../docs/api/avatar/three.md#headhider) | hide the head for one first person render |
| [`posedBounds`](../../docs/api/avatar/three.md#posedbounds) | framing bounds from the posed skeleton |
| [`vrmHook`](../../docs/api/avatar/vrm.md#vrmhook) | load VRM files through three-vrm |
| [`toVrm`](../../docs/api/avatar/vrm.md#tovrm) | wrap a GLB or FBX avatar in a three-vrm VRM |
| [`loadMmd`](../../docs/api/avatar/mmd.md#loadmmd) | a PMX or PMD model as a VRM, kept on the device |
| [`sniffFormat`](../../docs/api/avatar/index.md#sniffformat) | tell the format from the first bytes |
| [`probeFbx`](../../docs/api/avatar/index.md#probefbx) | tell a character from an animation only FBX |
| [`checkRedistribution`](../../docs/api/avatar/index.md#checkredistribution) | the VRM licence gate for sharing |
| [`TextureIndex`](../../docs/api/avatar/index.md#textureindex) | find the file a texture reference means |
| [`load`](../../docs/api/avatar/index.md#load) | load the rig wasm |

The full reference is in [docs/api/avatar](../../docs/api/avatar/README.md).

## Models and weights

No models ship with this package. You give a URL or a file, and each model keeps its own licence. For a VRM the licence comes from the file's own metadata (`vrmMeta`, then `checkRedistribution`); GLB, FBX and MMD files carry no licence field this package reads, so state the licence where you got the file.

| source | id | size | licence | loads from |
|---|---|---|---|---|
| a VRM you give | none | unknown | the file's VRM metadata | the URL or file you pass |
| a GLB, glTF or FBX you give | none | unknown | stated where you got it | the URL or file you pass |
| a PMX or PMD you give | none | unknown | usually forbids sharing; kept on the device | the file you drop |

## Browser support

| part | needs | Chrome | Safari | Firefox | phone |
|---|---|---|---|---|---|
| core entry | ES2022 and the rig wasm (SIMD128) | yes (measured in tests) | unknown | unknown | unknown |
| `/three` loading and repair | three.js; WebGL to draw | yes (inferred) | unknown | unknown | unknown |
| color map fill by coverage | `createImageBitmap` | yes (inferred) | unknown | unknown | unknown |
| single file build | a classic script, rig wasm inlined, file:// included | yes (inferred) | unknown | unknown | unknown |

The wasm uses SIMD128 and no threads, so no page needs cross origin isolation. Without `createImageBitmap` (in Node, for instance) `sampleImage` returns null and the coverage fallback picks nothing.

## Errors and troubleshooting

| message | cause | what to do |
|---|---|---|
| `@hackbuild/rig: wasm not loaded. call load() first.` | bone mapping ran before the rig wasm loaded | `await load()` from `@hackbuild/avatar` first |
| `avatar: missing required bones: <bones>.` | the mapper found no hips, spine, arms or legs | check the file is a rigged humanoid; a prop or clip only file has no skeleton |
| `avatar: rest analysis needs hips, head and both arms.` | the rest pose could not be measured | use a full humanoid rig |
| `avatar: a vrma file is an animation. load it with a clip loader.` | a VRMA was passed to `loadAvatar` | load it as a clip with `@hackbuild/retarget` |
| `avatar: unknown model format.` | the bytes and the name match no format | pass `name` with the extension, or check the file |
| `avatar: fetch failed with <status> for <url>.` | the URL answered with an error | check the URL and that the server allows the page's origin |
| `avatar: no humanoid skeleton, missing <bones>.` | `toVrm` found too few normalized bones | load the model through `loadAvatar` first and check `avatar.bones` |
| `avatar: the mmd file did not parse. <reason>` | three-mmd could not read the PMX or PMD | check the file and drop its folder so textures resolve |

Warnings that do not throw land in `avatar.warnings`, for instance `vrm loaded as plain gltf. pass vrmHook() from @hackbuild/avatar/vrm for spring bones and expressions.`

## Works with

- [@hackbuild/rig](../rig/README.md) maps the bone names and measures the rest pose.
- [@hackbuild/avatar-host](../avatar-host/README.md) shows an avatar on a stage with a follow camera and a frame loop.
- [@hackbuild/presence](../presence/README.md) drives gaze, blink and clips on the loaded bones.
- [@hackbuild/lipsync](../lipsync/README.md) writes mouth shapes through `avatar.expressions`.
- [@hackbuild/retarget](../retarget/README.md) puts clips from other rigs onto the loaded skeleton.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)); this README is CC-BY-4.0 with its code samples also MIT. No models ship here; each model you load keeps its own licence. `@pixiv/three-vrm` and `@moeru/three-mmd` are MIT.

## What is verified, and what is not

| check | result |
|---|---|
| `npx vitest run packages/avatar` | 75 of 75 tests pass (counted); fixtures are GLB files built in memory, no model files are read or committed |
| a Mixamo named GLB in centimeters, turned 180 degrees, arms 40 degrees down | loads to the T pose facing +Z, toes on y = 0 within 1e-5 m, head height within 1 mm of the reference (computed) |
| a UAL style GLB in meters | loads with no warnings; a two bone model fails with the missing bone list |
| a VRM 1.0 GLB through three-vrm 3.5.5 in Node | gives normalized bones by VRM name; its metadata passes the licence gate unmodified and fails it modified |
| `bakeScale` by 0.01 | skinned vertex world positions equal the scaled originals within 1e-5, root at scale 1 (computed) |
| texture fill | a two tile mesh with crossed material names gets each tile's own file; a sibling image under 0.6 coverage is refused; a Japanese file name matches by key words; a `.sph` reference returns null |
| FBX fragments with Visibility 0 | give the hidden mesh names, binary and ASCII |
| `toVrm` on a Mixamo named GLB | normalized bones at identity rest rotations drive the raw bones |
| `/mmd` with a stand in parser | rigid bodies give colliders and joints; skirt stiffness 1.6, hair 1.2; the upper body moved under the lower body keeps its world matrix within 1e-6; 1.2 m head height for 15 units (computed) |

Not verified by anything:

- No real model file has been loaded: no VRoid VRM, Mixamo export, UAL pack, store FBX, PMX or PMD. The FBX path, stored visibility, the picking loader and the tile and coverage fallbacks run only on fragments built by the tests.
- Nothing has been looked at in a browser: skinned meshes after the A to T lift, cutout materials on hair and lashes, the head hider in a first person camera, MMD springs.
- The 0.6 coverage threshold, the eye ranges and the MMD spring settings are vendor figures, not measured here.
- `toVrm` takes a spring builder; this package derives no spring bones from a GLB or FBX. Part grafting between models is not built.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 5,627 bytes | 5,908 bytes |
| `dist/avatar.iife.js` (single file build) | 152,141 bytes | 159,748 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.
