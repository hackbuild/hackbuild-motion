# @hackbuild/bake

Optimize GLB models, bake animation clips into compact packs, and keep an asset lock with licences and hashes, in the browser, in Node or on the command line.

[![npm](https://img.shields.io/npm/v/@hackbuild/bake)](https://www.npmjs.com/package/@hackbuild/bake) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 204.7 kB measured](https://img.shields.io/badge/gzip-204.7%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

## What it does

- Welds, simplifies and reorders the triangle meshes of a GLB, drops unused data, and hands each embedded image to your resize hook.
- Bakes clips of local rotations and a root track into an HBCP pack of int16 values, with a report of the quantization error, the loop seam and the foot contacts of each clip.
- Reads packs and samples clips in plain TypeScript, so a runtime reader needs no wasm.
- Writes and checks `assets.lock.json`: path, source, licence, SHA-256, size and an optional byte budget per asset.
- Gives the same bytes in a page, in Node and from the `hackbuild-bake` command line tool, which build from one Rust core.

## Install

```sh
npm install @hackbuild/bake
```

No dependencies and no peers. Image decoding and resizing stay on your side, through the hook.

| subpath | what |
|---|---|
| `@hackbuild/bake` | optimize, clip bake, pack reader, lock |
| `@hackbuild/bake/wasm` | the wasm file, to pass to `load()` as a URL |
| `@hackbuild/bake/inline` | the wasm as base64 |
| `@hackbuild/bake/iife` | the single file build, global `HackbuildBake`, wasm inlined |

## Quick start

```ts
import { bakeClips, decodePack, load, optimizeModel, sampleClip, syntheticClips, syntheticGlb } from "@hackbuild/bake";

await load();
// stand ins made in code: a bumpy grid GLB and three clips on a leg rig
const { glb, report } = await optimizeModel(syntheticGlb(1, 48), { ratio: 0.5 });
console.log(report.trianglesIn, "to", report.trianglesOut, "triangles,", report.bytesIn, "to", glb.byteLength, "bytes");

const baked = bakeClips(syntheticClips(1));
for (const r of baked.report) console.log(r.name, r.maxAngleErrorDeg.toFixed(3), "degrees worst error, seam ok:", r.seamOk);

// a reader needs no wasm: decode the pack and sample a clip at 0.25 s
const pack = decodePack(baked.bytes);
const first = Object.values(pack.clips)[0]!;
const pose = new Float32Array(pack.roles.length * 4);
const root = sampleClip(pack, first, 0.25, pose);
console.log(first.name, root, pose.slice(0, 4));
```

## Live example

The package page explains how the baker works, with its code: [hackbuild-motion/bake](https://hackbuild.github.io/hackbuild-motion/bake/). There is no interactive bake page yet.

## Concepts

### optimize

`optimizeModel(glb, opts)` works per triangle primitive. It welds vertices that match across every attribute and morph target, so a soup with one vertex per face corner shrinks to shared corners; simplifies when `ratio` is under 1 with the meshoptimizer quadric simplifier (through meshopt-pure, a pure Rust port, MIT) within `error` of the mesh extent; reorders triangles for the vertex cache and vertices by first use; writes packed buffers with fresh POSITION bounds; and drops accessors and buffer views nothing references. Points, lines, strips, quantized positions and primitives with extensions pass through and are listed in `report.skipped`.

### texture hooks

The core decodes no images. Your `resize` hook gets each embedded image with its role (baseColor, emissive, normal, orm or other, from the materials that sample it), its size from the PNG or JPEG header and the role's limit from `textures`, and returns new bytes and a mime type, or null to keep it. The hook may be async: `createImageBitmap` and an `OffscreenCanvas` in a page, an image library in Node.

```ts
const { glb } = await optimizeModel(bytes, {
  textures: { baseColor: 1024, normal: 512 },
  resize: async (t) => (t.width && t.width > t.maxSize ? { bytes: await shrink(t.data, t.maxSize), mime: "image/webp" } : null),
});
```

### clip packs

`bakeClips(input)` takes a skeleton of roles, parents and rest offsets and clips of local rotations per role and an optional root track. Rotations become int16 quaternion components (value / 32767), sign aligned frame to frame; the root becomes int16 with a per clip scale. The report names the largest joint angle error with its role and frame, the root position error, a loop seam check (last to first frame against the larger of `seamLimitDeg`, default 2 degrees, and twice the largest ordinary step), and contact frames found from foot height and horizontal speed with short runs merged. `sampleClip` blends linearly between frames, wraps loops and clamps one shots.

The pack format, HBCP version 1, little endian:

```text
"HBCP" u16 version f32 fps u16 roles u8 feet u16 clips
roles: str each, parents: i16 each, feet: str each
per clip: str name, f32 dur, u32 n, u8 loop, f32 posScale,
          i16 q[n * roles * 4], i16 p[n * 3], u8 contacts[n]
str: u16 byte length, then utf-8
```

### the asset lock

`lockEntry(path, bytes, source, licence, budget)` measures one file; `writeLock(entries)` writes `assets.lock.json` sorted by path; `checkLock(text, files, forbid)` fails on a hash or size drift, a missing file, an empty licence or source, a licence naming a forbidden term as whole tokens (`NC` fails `CC-BY-NC-4.0` and passes `NCSA`), or a file over its budget.

### the command line tool

The same Rust core builds a native `hackbuild-bake` binary with `cargo build --release -p hackbuild-bake` from the repository; it is not part of the npm package. It stores each lock path relative to the lock file's folder, and refuses unknown flags, the `--name=value` form, a ratio outside 0 to 1, a negative error and an output that is its own input.

```sh
hackbuild-bake optimize in.glb out.glb --ratio 0.5 --texture-max baseColor=1024 --texture-hook ./resize.sh
hackbuild-bake textures in.glb
hackbuild-bake clips clips.json walk.hbcp --report report.json
hackbuild-bake lock add walk.hbcp --source "my clips" --licence CC0-1.0 --budget 400000
hackbuild-bake lock check --forbid NC
hackbuild-bake hash file
```

The texture hook is a program you name. It runs as `hook <role> <max> <in> <out>`, writes the new image to `<out>` and prints its mime type; no output or a non zero exit keeps the original.

## API overview

| export | what it does |
|---|---|
| [`load`](../../docs/api/bake/README.md#load) | load the wasm core once; call before anything else |
| [`optimizeModel`](../../docs/api/bake/README.md#optimizemodel) | weld, simplify and repack a GLB, with the texture hook |
| [`listTextures`](../../docs/api/bake/README.md#listtextures) | the embedded images of a GLB with roles and sizes |
| [`bakeClips`](../../docs/api/bake/README.md#bakeclips) | clips into an HBCP pack, with a report per clip |
| [`decodePack`](../../docs/api/bake/README.md#decodepack) | read a pack; no wasm needed |
| [`sampleClip`](../../docs/api/bake/README.md#sampleclip) | a pose at a time from a packed clip |
| [`lockEntry`](../../docs/api/bake/README.md#lockentry) | a lock row measured from a file |
| [`writeLock`](../../docs/api/bake/README.md#writelock) | assets.lock.json text |
| [`checkLock`](../../docs/api/bake/README.md#checklock) | check files against the lock |
| [`syntheticGlb`](../../docs/api/bake/README.md#syntheticglb) | a test GLB made in code |

The full reference is in [docs/api/bake](../../docs/api/bake/README.md).

## Browser support

| needs | Chrome | Safari | Firefox | phone |
|---|---|---|---|---|
| WebAssembly with SIMD128 | yes (vendor) | 16.4 and later (vendor) | yes (vendor) | unknown |
| `createImageBitmap` and `OffscreenCanvas`, only in your resize hook | yes (vendor) | 16.4 and later (vendor) | yes (vendor) | unknown |

No WebGPU, workers or wasm threads. Nothing here has run in a real browser yet; it runs in Node in the tests. From file:// use `dist/bake.iife.js`, which carries the wasm inlined, or call `load()` with no argument.

## Errors and troubleshooting

| message | cause | what to do |
|---|---|---|
| `@hackbuild/bake: wasm not loaded. call load() first.` | a bake call before `load()` resolved | `await load()` once first |
| `glb: no glTF magic. only binary .glb files are read` | the file is a .gltf or not glTF | convert to a binary .glb |
| `glb: only glTF 2.0 is read` | an older glTF version | export as glTF 2.0 |
| `glb: more than one buffer. merge buffers before baking` | several binary buffers | merge buffers in your exporter |
| `glb: the buffer points at an external uri. embed it first` | an external buffer file | embed the buffer in the GLB |
| `glb: <extension> geometry is compressed. decode it before baking` | Draco or meshopt compressed geometry | decode the geometry first |
| `glb: ...` (missing or overrunning views and accessors) | a damaged or unusual file | check the file in a glTF validator |
| `clip bake: ...` | the skeleton or a clip disagrees on role counts, fps is not above 0, or more than 8 contact roles | fix the input the message names |
| `bake: clip input does not parse: ...` | the clip input could not be read | check every clip has `name` and `q` |
| `bake: no HBCP magic. this is not a clip pack` | `decodePack` got another file | pass a pack from `bakeClips` |
| `bake: unknown pack version` | a pack from a newer format | update the package |
| `bake: the pack ends early` | a truncated pack | fetch or write the pack again |

A primitive the optimizer cannot handle is not an error: it is left as it was and named in `report.skipped`.

## Works with

- [@hackbuild/avatar](../avatar/README.md) loads the optimized models.
- [@hackbuild/retarget](../retarget/README.md) brings clips onto one rig before they are baked.
- [@hackbuild/presence](../presence/README.md) and [@hackbuild/motion-match](../motion-match/README.md) play clips at run time.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)); meshopt-pure, compiled into the core, is MIT. This README is CC-BY-4.0 with its code samples also MIT. No models or clips ship here; the files you bake keep their own licences, which the lock records.

## What is verified, and what is not

### Verified on this machine

| check | result | label |
|---|---|---|
| `cargo test -p hackbuild-bake` | 16 of 16 pass, clippy clean natively and for wasm32 | counted |
| `npx vitest run packages/bake` | 5 of 5 pass | counted |
| golden trace (pack hash, quantization errors, seam angles, contact counts, optimized GLB hashes and counts at ratios 1 and 0.3) | bit identical between the native and the wasm build | measured |
| a 12 by 12 synthetic grid soup | the weld took 864 vertices to 169 and kept all 288 triangles with their winding; ratio 0.3 left 86 triangles | computed |
| int16 rotations on the synthetic clips | within 0.002 degrees of the source | computed |
| the seam check | passes a closed walk loop, fails a loop cut three quarters of the way round | computed |
| contacts in the synthetic walk | alternate and never leave both feet up | computed |
| command line optimize, lock add, lock check (pass, then fail after a file change) and clips | ran end to end in `tests/cli.rs` | measured |
| command line refusals of bad flags, ratios, errors and an output equal to its input | refused in `tests/cli.rs` | tested |
| a sparse morph target, the form Blender writes shape keys in | keeps its index and value buffer views through optimize | computed |

### Not verified by anything

- A real model: no Meshy, VRM, UAL or Mixamo file has gone through the optimizer. Sparse morph targets are tested only on a synthetic file.
- The `--texture-hook` path of the command line tool and any real image resize.
- Contact thresholds on real clips; 0.12 m and 0.45 m/s are starting values, not tuned.
- KTX2 output, meshopt compression of the output, and size budgets beyond the lock check.
- The package in a real browser.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 204,749 bytes | 214,986 bytes |
| `dist/wasm/bake_bg.wasm` | 148,883 bytes | 156,327 bytes |
| `dist/bake.iife.js` (single file build) | 204,855 bytes | 215,097 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.
