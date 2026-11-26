# @hackbuild/environment

Light a three.js scene around a character with a key light, a rim light, image light and a set built from kit models.

[![npm](https://img.shields.io/npm/v/@hackbuild/environment)](https://www.npmjs.com/package/@hackbuild/environment) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 3.1 kB measured](https://img.shields.io/badge/gzip-3.1%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

Browser status: no preset with a real HDRI or kit model has loaded in a browser yet; only the studio, which needs no file, has drawn, in headless Chrome under the avatar host page.

## What it does

- Describes a scene as data: key and rim light, image light from an HDRI or the three.js room environment, a backdrop, an optional ground disk and fog, and a set of kit models.
- Ships four presets, `studio`, `room`, `cafe` and `outdoors`; the studio needs no file.
- Lists the files a preset needs, so a page can keep a scene off until its files are there.
- Loads a scene fully before it touches yours, then swaps it in with one call and restores tone mapping and exposure on dispose.
- Merges every kit mesh of the same look into one, so a room draws in a few dozen calls.

## Install

```sh
npm install @hackbuild/environment three
```

The main entry has no three.js: presets, the file lists, the missing file error and the light math. `@hackbuild/environment/three` builds the lights, assembles the set and loads a scene.

| subpath | needs | pin |
|---|---|---|
| `@hackbuild/environment` | nothing | none |
| `@hackbuild/environment/three` | `three` (optional peer) | 0.186.1 or later |

## Quick start

```ts
import * as THREE from "three";
import { missingFor, presetOf } from "@hackbuild/environment";
import { loadEnvironment } from "@hackbuild/environment/three";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.2, 3.5);

// a stand in for your character: a capsule at the origin, facing +Z
scene.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 1.1), new THREE.MeshStandardMaterial()).translateY(0.8));

// the studio needs no file; room, cafe and outdoors list the files they need
console.log("room needs", missingFor(presetOf("room")!, () => false));
const env = await loadEnvironment("studio", scene, renderer);
env.attach();
renderer.setAnimationLoop(() => renderer.render(scene, camera));
```

## Live example

The package page with the studio on a stage: [hackbuild-motion/environment](https://hackbuild.github.io/hackbuild-motion/environment/). The character stage of [@hackbuild/avatar-host](../avatar-host/README.md) uses it in the [avatar host page](https://hackbuild.github.io/hackbuild-motion/avatar-host/).

## Concepts

### the character's spot

The character stands at the origin facing +Z, where the camera starts, as in the normalized humanoid space every motion package uses. A layout arranges its set around that spot; nothing here moves the character or the camera.

### files come from your resolver

No HDRI or kit model ships with the package. `loadEnvironment` asks `resolve(path)` for each file a preset names, and you answer with a URL, an `ArrayBuffer`, a `Blob` or null. `needsOf(preset)` and `missingFor(preset, have)` tell you which files a preset still lacks:

```ts
const files = new Map<string, Blob>(); // filled from a drop or a file input
const room = presetOf("room")!;
if (missingFor(room, (p) => files.has(p)).length === 0) {
  const env = await loadEnvironment(room, scene, renderer, { resolve: (p) => files.get(p) ?? null });
  env.attach();
}
```

### load, then attach

`loadEnvironment` builds everything without touching the scene, so the previous scene stays on screen until the next is ready and a stale load never shows. `attach()` puts it in, `dispose()` takes it out, clears only the scene fields it still owns and restores the tone mapping and exposure it found.

### light that keeps skin looking like skin

The HDRI is turned so its brightest point sits behind the key light (`brightestAzimuth`, after a five tap blur so a lone hot pixel does not win). The light probe toon materials read is normalized to an average radiance of 1 and pulled toward grey by `probe.saturation` (`normalizeProbe`), because HDRIs differ in exposure by orders of magnitude.

### merged sets

`assemble(items, scale, load)` bakes every mesh of the set into world space, merges meshes with the same look, makes kit materials non metallic and frees the source geometries.

## API overview

| export | what it does |
|---|---|
| [`PRESETS`](../../docs/api/environment/index.md#presets) | the four presets with their files and licences |
| [`presetOf`](../../docs/api/environment/index.md#presetof) | a preset by id |
| [`needsOf`](../../docs/api/environment/index.md#needsof) | every file a preset needs |
| [`missingFor`](../../docs/api/environment/index.md#missingfor) | the files a preset needs that you do not have |
| [`MissingFileError`](../../docs/api/environment/index.md#missingfileerror) | the error for a file the resolver could not give |
| [`direction`](../../docs/api/environment/index.md#direction) | a unit vector from azimuth and elevation around the character |
| [`brightestAzimuth`](../../docs/api/environment/index.md#brightestazimuth) | the azimuth of the brightest spot of an equirect image |
| [`normalizeProbe`](../../docs/api/environment/index.md#normalizeprobe) | scale a light probe to an average radiance of 1 |
| [`loadEnvironment`](../../docs/api/environment/three.md#loadenvironment) | load a preset fully, ready to attach |
| [`buildRig`](../../docs/api/environment/three.md#buildrig) | the key light with its shadow, and the rim light |
| [`assemble`](../../docs/api/environment/three.md#assemble) | build and merge a set from kit models |
| [`loadHdri`](../../docs/api/environment/three.md#loadhdri) | an HDRI as a float equirect texture |
| [`probeFrom`](../../docs/api/environment/three.md#probefrom) | a normalized light probe from a scene |

The full reference is in [docs/api/environment](../../docs/api/environment/README.md).

## Models and weights

No model, HDRI or texture ships here. The presets name these files, which your resolver gives:

| preset | files | licence | source |
|---|---|---|---|
| studio | none; light from the three.js room environment in code | MIT | three.js |
| room | `hdri/lythwood_room_1k.hdr`, `kenney-furniture/*.glb` | CC0 | Poly Haven, Kenney Furniture kit |
| cafe | `hdri/comfy_cafe_1k.hdr`, `kenney-furniture/*.glb` | CC0 | Poly Haven, Kenney Furniture kit |
| outdoors | `hdri/kloofendal_48d_partly_cloudy_puresky_2k.hdr`, `kenney-nature/*.glb` | CC0 | Poly Haven, Kenney Nature kit |

Each preset carries its HDRI licence and source in `hdri.licence` and `hdri.source` and its kit licence in `kitLicence`, so a page can show the credit line from the record.

## Browser support

| feature | needs | notes |
|---|---|---|
| main entry | any JavaScript runtime | no DOM, runs in Node |
| `/three` | WebGL 2 through three.js | the key light casts a 1024 px shadow map |
| HDRI image light | float textures, PMREM | `HalfFloatType` render target for the probe |
| single file build | `dist/environment.iife.js` | `HackbuildEnvironment` global, `THREE` read from the page, runs from file:// |

Frame cost on a phone is unknown.

## Errors and troubleshooting

| message | cause | what to do |
|---|---|---|
| `environment: could not load <file>. drop the file or pick the studio.` | `MissingFileError`: the resolver gave null, threw, or its URL did not fetch; `error.file` holds the path | give the file through `resolve`, or use the studio |
| `environment: no scene named <id>.` | `loadEnvironment` got an id that is not in `PRESETS` | use `studio`, `room`, `cafe` or `outdoors`, or pass a preset object |

### mistakes to avoid

- Do not add the loaded scene by hand or expect `loadEnvironment` to show it; call `attach()` when you want it on screen and `dispose()` on the old one.
- Do not bundle the HDRIs or kit models with your page build; give them through `resolve` from a drop or a URL and show the licence from the preset.
- Do not move the character away from the origin to fit a set; layouts are built around the origin facing +Z.
- Import `loadEnvironment` from `@hackbuild/environment/three`, not the main entry, which has no three.js.

## Works with

- [@hackbuild/avatar-host](../avatar-host/README.md) holds an environment slot and imports this package on first use.
- [@hackbuild/avatar](../avatar/README.md) loads the character that stands at the origin.
- [@hackbuild/motion-views](../motion-views/README.md) shows a character stage with the studio light.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)); this README is CC-BY-4.0 with its code samples also MIT. The presets name CC0 HDRIs from Poly Haven and CC0 kit models from Kenney, which the package never bundles.

## What is verified, and what is not

### Verified on this machine

| check | result |
|---|---|
| `npx vitest run packages/environment` | 8 of 8 tests pass (counted) |
| the studio needs no file; the room lists its HDRI and kit models once each | tested |
| the brightest azimuth of a synthetic equirect with one bright patch, past a lone hot pixel and a brighter spot below the horizon | tested |
| a probe normalized to mean radiance 1 | within 1e-9 (computed) |
| a 3 by 3 grid of one kit tile assembled into one mesh per material, source geometries freed | tested |
| a missing kit model rejects with its file name | tested |
| the studio on the avatar host page in headless Chrome: shadow map on, the ground takes the shadow, 49 draw calls | pass (measured) |

### Not verified by anything

- `loadHdri` and an HDRI lit preset have not run in a browser or a test.
- No room, cafe or outdoors scene has been drawn here; their kit models and HDRIs are not in this repository. The light figures of the four layouts are vendor figures.
- Shadow quality, draw call counts of a real room and the frame cost on a phone are unknown.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 3,088 bytes | 3,242 bytes |
| `dist/environment.iife.js` (single file build) | 34,995 bytes | 36,744 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.
