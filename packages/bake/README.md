# @hackbuild/bake

Asset baking for the family: GLB optimize, clip packs and the asset lock.
The core is the Rust crate `crates/bake`, which builds both the
`hackbuild-bake` command line tool and the wasm32 (SIMD128) module this
package loads, so a bake in Node, in a page and on the command line gives
the same bytes.

- `optimizeModel(glb, opts)`: per triangle primitive, welds vertices that
  are identical across every attribute and morph target (Meshy style soups
  with one vertex per face corner shrink to shared corners), simplifies
  when `ratio` is under 1 (the meshoptimizer quadric simplifier through
  meshopt-pure, a pure Rust port, MIT), reorders triangles for the vertex
  cache and vertices by first use, writes packed buffers with fresh
  POSITION bounds, and drops accessors and buffer views nothing references.
  Points, lines, strips, quantized positions and primitives with
  extensions pass through and are listed in `report.skipped`. Draco and
  meshopt compressed files and external buffers are refused with the
  reason.
- Texture hooks: the crate decodes no images. `resize` gets each embedded
  image with its role (baseColor, emissive, normal, orm, other, from the
  materials that sample it), its size from the PNG or JPEG header and the
  role's pixel limit, and returns new bytes and a mime type or null. The
  hook may be async (`createImageBitmap` and an `OffscreenCanvas` in a
  page, sharp in Node). Without a hook textures pass through untouched.
- `bakeClips(input)`: local rotations per role and a root track in, an
  HBCP pack out. Rotations are int16 quaternion components (value / 32767),
  sign aligned frame to frame; the root is int16 with a per clip scale. The
  report gives the largest joint angle error after quantisation with the
  role and frame, the root position error, a loop seam check (last to first
  frame against the larger of a limit, default 2 degrees, and twice the
  largest ordinary frame step), and foot contact frames found by forward
  kinematics from height and horizontal speed thresholds, with short runs
  merged. `decodePack` and `sampleClip` are plain TypeScript, so a runtime
  reader skips the wasm.
- `writeLock`, `checkLock`, `lockEntry`, `sha256Hex`: assets.lock.json with
  path, source, licence, SHA-256, size and an optional byte budget. The
  check fails on a hash or size drift, a missing file, an empty licence or
  source, a licence naming a forbidden term as whole tokens (`NC` fails
  `CC-BY-NC-4.0` and passes `NCSA`), or a file over its budget. The CLI
  stores each path relative to the lock file's folder.

## Install

Not published yet. From a clone:

    npm ci && npm run build -w @hackbuild/bake
    cargo build --release -p hackbuild-bake

## Use

```ts
import { load, optimizeModel, bakeClips, writeLock, lockEntry } from "@hackbuild/bake";

await load();
const { glb, report } = await optimizeModel(bytes, {
  ratio: 0.5,
  textures: { baseColor: 1024, normal: 512 },
  resize: async (t) => (t.width && t.width > t.maxSize ? { bytes: await shrink(t.data, t.maxSize), mime: "image/webp" } : null),
});
const { bytes: pack, report: clips } = bakeClips({ fps: 30, skeleton, clips, contacts: { feet: ["leftFoot", "rightFoot"], height: 0.12, speed: 0.45, minFrames: 2 } });
const lock = writeLock([lockEntry("dog.glb", glb, "Meshy export", "owner"), lockEntry("ual.hbcp", pack, "Quaternius UAL", "CC0-1.0", 400_000)]);
```

Command line:

    hackbuild-bake optimize in.glb out.glb --ratio 0.5 --texture-max baseColor=1024 --texture-hook ./resize.sh
    hackbuild-bake textures in.glb
    hackbuild-bake clips clips.json ual.hbcp --report report.json
    hackbuild-bake lock add ual.hbcp --source "Quaternius UAL" --licence CC0-1.0 --budget 400000
    hackbuild-bake lock check --forbid NC
    hackbuild-bake hash file

The texture hook is a program you name. It runs as
`hook <role> <max> <in> <out>`, writes the new image to `<out>` and prints
its mime type on stdout; no output or a non zero exit keeps the original.

`dist/bake.iife.js` is the single file build (`HackbuildBake`, wasm
inlined).

## Pack format (HBCP version 1, little endian)

    "HBCP" u16 version f32 fps u16 roles u8 feet u16 clips
    roles: str each, parents: i16 each, feet: str each
    per clip: str name, f32 dur, u32 n, u8 loop, f32 posScale,
              i16 q[n * roles * 4], i16 p[n * 3], u8 contacts[n]
    str: u16 byte length, then utf-8

## Develop

    npm run build -w @hackbuild/bake
    npx vitest run packages/bake
    cargo test -p hackbuild-bake

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `cargo test -p hackbuild-bake` passed 16 of 16 tests
  (counted), clippy clean natively and for wasm32.
- 2026-11-22: `npx vitest run packages/bake` passed 5 of 5 tests (counted).
- 2026-11-22: the golden trace (pack bytes hash, quantisation errors, seam
  angles, contact counts, optimized GLB hashes and counts at ratios 1 and
  0.3) is bit identical between the native and the wasm build (measured).
- 2026-11-22: on a 12 by 12 synthetic grid soup, the weld took 864
  vertices to 169 and kept all 288 triangles with their winding; at ratio
  0.3 the simplifier left 86 triangles (computed).
- 2026-11-22: int16 rotations stayed within 0.002 degrees of the source on
  the synthetic clips (computed, atan2 of the relative rotation in f64).
- 2026-11-22: the seam check passes a closed walk loop and fails a loop
  cut three quarters of the way round; contacts in the synthetic walk
  alternate and never leave both feet up (computed).
- 2026-11-22: the command line optimize, lock add, lock check (pass, then
  fail after a file change) and clips commands ran end to end (measured in
  `tests/cli.rs`).
- 2026-11-23: the CLI refuses unknown flags and the `--name=value` form, a
  ratio outside 0 to 1, a negative error, and an output that is its own
  input; texture hook files go in a fresh folder made with create_dir
  (tested in `tests/cli.rs`, the hook path itself still untested).
- 2026-11-23: a sparse morph target (the form Blender writes shape keys
  in) keeps its index and value buffer views through optimize; before,
  both views were dropped and the accessor pointed at the wrong data
  (computed, `sparse_morph_targets_keep_their_views`).

### Not verified by anything

- A real model: no Meshy, VRM, UAL or Mixamo file has gone through the
  optimizer yet. Primitives with sparse morph targets pass through
  unwelded; the sparse case is tested only on a synthetic file.
- The `--texture-hook` command path of the CLI and any real image resize.
- Contact thresholds on real clips; the defaults (0.12 m, 0.45 m/s) are
  starting values (inferred).
- KTX2 output, meshopt compression of the output, and size budget
  enforcement for anything beyond the lock check.
- The package in a real browser.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 204,749 bytes | 214,986 bytes |
| `dist/wasm/bake_bg.wasm` | 148,883 bytes | 156,327 bytes |
| `dist/bake.iife.js` (single file build) | 204,855 bytes | 215,097 bytes |

Measured 2026-11-23 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

## Licence

Code MIT (`LICENSE` at the repository root). meshopt-pure is MIT. This
README is CC-BY-4.0, its code samples also MIT.
