# @hackbuild/motion-net

Run the published quadruped categorical codebook matching network in the browser and drive a dog's gait from it.

[![npm](https://img.shields.io/npm/v/@hackbuild/motion-net)](https://www.npmjs.com/package/@hackbuild/motion-net) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 48.0 kB measured](https://img.shields.io/badge/gzip-48.0%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

Browser status: Chrome 150 on an Apple M1 has run the demo page on the published weights at real frame rate, with the network in a blob worker; no other browser or device has run real weights yet.

## What it does

- Loads the network's JSON manifest and flat binary from a URL, bytes or a File, checks the SHA-256 when you give one, and checks every tensor's dtype, shape, count, alignment and range before anything runs.
- Runs the forward pass (code estimate, three refinement passes, a time conditioned decoder for 16 frames) in Rust on wasm SIMD128, in a blob worker or in the page when a worker is refused.
- Drives a dog with `QuadrupedHost`: turns a speed and turn command into network inputs, plays predictions back in time, integrates root motion and pins planted paws.
- Implements the locomotion backend contract of `@hackbuild/gait`, so the network can stand in for the procedural gait.
- States the weight licence once per page before the first load; no weights ship in the package or on the demo site.

## Install

```sh
npm install @hackbuild/motion-net
```

No dependencies and no peers. The host gives bone positions and rotations as plain arrays, so any renderer can draw the dog.

| subpath | what |
|---|---|
| `@hackbuild/motion-net` | weights, predictor, host, layout constants |
| `@hackbuild/motion-net/wasm` | the wasm file, to pass as `wasm` to `Predictor.create` or to `load()` |
| `@hackbuild/motion-net/inline` | the wasm as base64, used when you pass nothing |
| `@hackbuild/motion-net/iife` | the single file build, global `HackbuildMotionNet`, wasm inlined |

## Quick start

```ts
import { loadWeights, Predictor, QuadrupedHost } from "@hackbuild/motion-net";

// the weights are not in this package: give their urls as ?manifest=<url>&bin=<url>
const q = new URLSearchParams(location.search);
const manifest = q.get("manifest");
const bin = q.get("bin");
if (!manifest || !bin) throw new Error("give the weight urls as ?manifest=<url>&bin=<url>");
// onLicence gets the weights' own licence line (non commercial) before anything runs
const weights = await loadWeights({ manifest, bin, onLicence: (line) => document.body.append(line) });
const predictor = await Predictor.create(weights); // a blob worker, or the page when workers are refused
const host = new QuadrupedHost(predictor, weights.styles);

let last = performance.now();
function frame(now: number) {
  const root = host.update((now - last) / 1000, { speed: 1.2, turnRate: 0.3 });
  last = now;
  document.title = `${root.speed.toFixed(2)} m/s, ${host.motorState().contacts.filter(Boolean).length} paws down`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

## Live example

The demo page drives a dog of simple shapes from the network, with speed, turn, style and foot slide, on weights fetched from a URL you give or read from dropped files: [hackbuild-motion/motion-net](https://hackbuild.github.io/hackbuild-motion/motion-net/). The suite runs it too: [hackbuild-suite motion net](https://hackbuild.github.io/hackbuild-suite/#/motion/motion-net).

## Concepts

### weights you give

`loadWeights({ manifest, bin })` takes each part as a URL, bytes, a File or a Blob, and the manifest also as a parsed object. `UPSTREAM` names one public copy pinned to a commit, with its SHA-256 and size; pass `sha256: UPSTREAM.binSha256` to check it. The licence line (`WEIGHT_LICENCE`) goes to `onLicence`, or to `console.info`, on the first load in a page. `validate(manifest, bytes)` lists every mismatch without loading.

```ts
import { loadWeights, UPSTREAM } from "@hackbuild/motion-net";

const weights = await loadWeights({ manifest: UPSTREAM.manifest, bin: UPSTREAM.bin, sha256: UPSTREAM.binSha256, onProgress: (n, total) => console.log(n, total) });
```

### the predictor

`Predictor.create(weights, { worker })` starts the engine in a worker made from a Blob, which also starts from file://. The worker drives the wasm through a plain C ABI with no generated glue. With `worker: "auto"` (the default) a refused or slow worker (`workerTimeoutMs`, 15 s) falls back to the page, and `mode` and `fallbackReason` say which ran; `worker: true` throws instead. `predict(input)` takes 339 values and returns 16 frames of 412. The binary16 weights decode exactly to f32, and the dot product keeps 16 running sums in a fixed order, so the native and wasm builds give the same bits.

### the host

`new QuadrupedHost(predictor, weights.styles, tuning)` runs once per frame with `update(dt, command)`. It smooths the command (speed and turn rate, or a world `velocity` and `facing`), picks a style by speed (Idle, Walk, Trot, Canter) or holds the one you name, asks for a new prediction every 0.1 s with one in flight, plays each from the time it was requested so latency is skipped, hides the seam with a decaying offset, pins each paw in stance with a two bone solve, and holds the last pose when a prediction is late. Every value in `DEFAULT_TUNING` carries its reason in the source.

### frames and output

The host's frame is the family one: right handed, +Z forward, +X to the dog's left, positive yaw turning left, as in `@hackbuild/gait`. After each update read `root`, `rootVelocity`, `positions` (27 bones, x y z, meters), `rotations` (27 quaternions), `paws`, `style`, `latencyMs`, `evalMs` and `footSlide`. `BONES` and `PARENTS` give the 27 bone skeleton of the network, whose bone axes follow its source rig.

### the backend contract

`update` returns root motion and `motorState()` returns source `neural` with phase, duty, stride frequency and paw contacts, the same shape `@hackbuild/gait` and `@hackbuild/motion-match` use.

## API overview

| export | what it does |
|---|---|
| [`loadWeights`](../../docs/api/motion-net/README.md#loadweights) | read, check and hold the manifest and binary |
| [`validate`](../../docs/api/motion-net/README.md#validate) | list every way a manifest and binary disagree with the format |
| [`UPSTREAM`](../../docs/api/motion-net/README.md#upstream) | one public copy pinned to a commit, with its SHA-256 |
| [`WEIGHT_LICENCE`](../../docs/api/motion-net/README.md#weight_licence) | the licence line stated on first load |
| [`Predictor`](../../docs/api/motion-net/README.md#predictor) | evaluate the network in a worker or the page |
| [`QuadrupedHost`](../../docs/api/motion-net/README.md#quadrupedhost) | drive a dog from the network; a locomotion backend |
| [`HostCommand`](../../docs/api/motion-net/README.md#hostcommand) | speed, turn, velocity, facing and style |
| [`DEFAULT_TUNING`](../../docs/api/motion-net/README.md#default_tuning) | the host's timing, smoothing and pinning values |
| [`BONES`](../../docs/api/motion-net/README.md#bones) | the 27 bone order of the network |
| [`STYLES`](../../docs/api/motion-net/README.md#styles) | the nine style labels |

The full reference is in [docs/api/motion-net](../../docs/api/motion-net/README.md).

## Models and weights

| model | file | size | licence | loads from |
|---|---|---|---|---|
| quadruped categorical codebook matching network (Starke et al., SIGGRAPH 2024) | `quadruped.json` and `quadruped.bin` | 17,704,644 bytes for the binary (vendor) | CC BY-NC 4.0, Paul Starke and Sebastian Starke, Meta, AI4AnimationPy; not for commercial use | a URL or files you give; `UPSTREAM` names a public copy pinned to a commit |

The weights are never included in this package, its builds or the demo site. The code is MIT and was written from a functional specification of the network (weight format, equations, input and output layout, test vectors) and the published paper.

## Browser support

| needs | Chrome | Safari | Firefox | phone |
|---|---|---|---|---|
| WebAssembly with SIMD128 | yes (measured, Chrome 150) | 16.4 and later (vendor) | yes (vendor) | unknown |
| blob workers, or the in page fallback | worker (measured, Chrome 150) | unknown | unknown | unknown |
| `crypto.subtle` for the SHA-256 check | yes (vendor) | yes (vendor) | yes (vendor) | yes on https (vendor) |

No WebGPU and no wasm threads, so no cross origin isolation. A page whose policy refuses blob workers runs the network in the page, between paints. From file:// use `dist/motion-net.iife.js` and give the weights as dropped files, since a page opened from disk cannot fetch local files.

## Errors and troubleshooting

| message | cause | what to do |
|---|---|---|
| `motion-net: could not fetch <url>: ...` | the network refused the weight URL (offline, CORS) | check the URL and that its host allows your origin |
| `motion-net: fetch <url> answered <status>` | the weight or wasm URL answered an error | check the URL |
| `motion-net: the manifest is not JSON` | the manifest part is not the JSON manifest | pass `quadruped.json`, or a parsed manifest object |
| `motion-net: sha-256 of the binary is <hash>, expected <hash>` | the binary differs from the one you named | download it again, or check the `sha256` you passed |
| `motion-net: the weights do not match the format: ...` | a tensor is missing or has the wrong dtype, shape, count, offset or range | use the manifest and binary that belong together; `validate` lists every mismatch |
| `motion-net: model.<key> is missing or not a positive integer` | the manifest's model section is incomplete | check the manifest |
| `motion-net: no network worker. <reason>.` | `worker: true` and no worker could start | use `worker: "auto"` to fall back to the page |
| `motion-net: the input has <n> values, the network takes <m> values` | `predict` got an input of the wrong length | pass 339 values, the layout in `IN` |
| `motion-net: the predictor was disposed. the run was dropped.` | a run asked for after `dispose()` | create a new predictor |
| `@hackbuild/motion-net: wasm not loaded. call load() first.` | `goldenTrace` before `load()` | `await load()`; the predictor loads its own copy |

## Works with

- [@hackbuild/gait](../gait/README.md) defines the same backend contract; the host can replace the procedural gait.
- [@hackbuild/motion-match](../motion-match/README.md) is the other data driven backend, over your own clips.
- [@hackbuild/ik](../ik/README.md) holds the foot lock and two bone solves a renderer can add on another rig.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)); this README is CC-BY-4.0 with its code samples also MIT. The weights are CC BY-NC 4.0 (Paul Starke and Sebastian Starke, Meta, AI4AnimationPy), not for commercial use, and are not part of this package.

## What is verified, and what is not

### Verified on this machine

| check | result | label |
|---|---|---|
| `cargo test -p hackbuild-motion-net` | 8 of 8 pass, clippy clean natively and for wasm32 with SIMD128 | counted |
| a double precision evaluation of the equations against the crate's forward pass on a random network | within 1e-5 relative | measured |
| golden trace (two evaluations of a seeded random network from binary16 and binary32 bytes, and binary16 decodes) | bit identical between the native and the wasm SIMD128 build | measured |
| the three test vectors of the specification on the published weights | worst value error 4.8e-7 relative, worst checksum error 7.8e-8 relative, against 1e-4 and 1e-5 | measured |
| one evaluation in Node on an Apple M1 | 4 to 6 ms | measured |
| host on the published weights, 60 Hz, page engine in Node, last 8 s of 16 s runs | 0.6, 1, 1.6, 2.4 and 3.5 m/s commanded gave 0.598, 0.999, 1.626, 2.395 and 3.515 m/s; 1 rad/s at 1 m/s gave 0.999 rad/s; idle travels under 5 cm in 3 s | measured |
| stance paw slide p95 per frame at the same speeds | 0, 0, 5.7, 4.8 and 10.2 mm pinned, against 7.4, 9.6, 11.8, 17.6 and 17.4 mm for the network's own paws | measured |
| host on a kinematic stand in, no weights, in CI | speed within 5 percent at 0.6, 1.2 and 2.5 m/s, turn within 10 percent, no NaN on zero, negative, NaN or infinite input, a 1.5 s late prediction held with the largest bone move 47 mm, a stale prediction dropped | measured |
| the demo page on the published weights in Chrome 150 on an Apple M1 | blob worker, 4.5 ms per evaluation, 5 ms latency, 59.9 fps p50, pinned slide p95 5.6 mm per frame against 10.8 mm for the network's paws | measured |
| `Predictor` on a small synthetic network in the page engine | a wrong length input rejects and the predictor keeps working; a run after `dispose` and an engine error reject pending runs | tested |

The tests that need the weights run only when `HB_MOTION_NET_BIN` and `HB_MOTION_NET_MANIFEST` point at local copies; otherwise they are skipped and the output says so. CI has no weights.

### Not verified by anything

- The worker and the page fallback from file://, a page whose policy refuses blob workers, and a worker crash after start.
- A person watching the gait at frame rate; the browser run measured it, nobody looked.
- Retargeting the 27 bone skeleton onto another rig.
- Pace, Sit, Stand, Lie and Jump through the host: they can be held as a style, and nothing measures how they look.
- At a gallop, above about 3 m/s, the limbs cannot always reach their pins and paws slide up to about 10 mm per frame p95.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 47,951 bytes | 50,348 bytes |
| `dist/wasm/motion_net_bg.wasm` | 23,690 bytes | 24,874 bytes |
| `dist/motion-net.iife.js` (single file build) | 48,160 bytes | 50,568 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.
