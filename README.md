# hackbuild-motion

Rigs, retargeting, IK, procedural and neural motion, avatars and lip sync for 3D characters on the web. Rust cores compiled to wasm, TypeScript bindings for three.js.

Status: phases A and C landed, 2026-11-22. Packages land in `packages/` as
they pass their tests; the table below grows with them.

| package | crate | what |
|---|---|---|
| [`@hackbuild/organic`](packages/organic) | `hackbuild-organic` | springs, inertialization, seeded noise, samplers, body clock |
| [`@hackbuild/rig`](packages/rig) | `hackbuild-rig` | bone name mapper, limb chains, rest analysis, expression and viseme table |
| [`@hackbuild/ik`](packages/ik) | `hackbuild-ik` | two bone with pole, FABRIK, CCD, clamped look at, finger curl, foot locking |
| [`@hackbuild/gait`](packages/gait) | `hackbuild-gait` | Froude gait choice, leg oscillators, footfall tables, posture springs, tail and ears, backend interface |
| [`@hackbuild/retarget`](packages/retarget) | `hackbuild-retarget` | humanoid motion format, clip retargeting between any rigs, BVH and VMD readers, motion tags |
| [`@hackbuild/motion-net`](packages/motion-net) | `hackbuild-motion-net` | runtime and quadruped gait host for the codebook matching network on wasm SIMD128, worker with an in page fallback; MIT code, CC BY-NC 4.0 weights loaded at run time, not included |
| [`@hackbuild/motion-match`](packages/motion-match) | `hackbuild-motion-match` | motion matching with inertialized transitions over a clip database |
| [`@hackbuild/presence`](packages/presence) | | gaze, blink, breath, idle scheduler, point, reach, throw, layered clip player |
| [`@hackbuild/avatar`](packages/avatar) | | VRM, Mixamo, UAL, GLB and FBX into the normalized space, material repair, wardrobe, first person head hide |
| [`@hackbuild/lipsync`](packages/lipsync) | | viseme driver from speech timing events or audio level |
| [`@hackbuild/bake`](packages/bake) | `hackbuild-bake` | GLB optimize, clip packs, assets.lock.json; CLI and wasm |

Examples: https://hackbuild.github.io/hackbuild-motion/ (one page per
package, built from `examples/` by `.github/workflows/pages.yml`). The
rigs are built in code; models, clips and weights come from a URL you give
or a file you drop, and the pages state each weight licence on load.
`npm run examples` builds the site into `_site/`; `npm run examples:check`
opens every page in the system Chrome on the real GPU and writes results
and screenshots to `.local/` (see `docs/browser-checks.md`).

Every package works in one normalized humanoid space (VRM 1.0 bone names,
T pose, +Z forward, meters, feet at y = 0), takes an injected
`Rng = () => number`, loads its wasm from a URL, bytes or an inlined copy so
it runs from file://, and ships a single file IIFE build.

## Install

Not published to npm yet. From a clone, build the packages you want:

    npm ci && npm run build -w @hackbuild/organic -w @hackbuild/gait

Each package also ships `dist/<name>.iife.js`, a single file build with its
wasm inlined, for a page opened from file://.

## Use

```ts
import { load, QuadrupedGait } from "@hackbuild/gait";

await load();
// four legs in the body frame (x left, z forward), meters
const legs = [
  { x: 0.09, z: 0.22, toe: 0.02, front: true },
  { x: -0.09, z: 0.22, toe: 0.02, front: true },
  { x: 0.09, z: -0.2, toe: 0.02, front: false },
  { x: -0.09, z: -0.2, toe: 0.02, front: false },
];
let seed = 1;
const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647; // any seeded () => number
const gait = new QuadrupedGait(legs, 0.42, { rng });
const state = gait.update(1 / 60, { x: 0, z: 0, yaw: 0 }, { speed: 1.2, turnRate: 0 });
```

Each package README has a fuller example.

## Develop

    source ~/.nvm/nvm.sh && nvm use
    npx -y npm@11.21.0 install
    npm run build
    npm run typecheck
    npm test
    cargo test --workspace

`npm ci` sets `core.hooksPath` to `.githooks`. Rules for every change are
in RULES.md and CONTRIBUTING.md. The wasm builds need the rustup toolchain
with the `wasm32-unknown-unknown` target and wasm-pack 0.13.1.

## What is verified, and what is not

Each package README carries its own dated list. Across the repository:

### Verified on this machine

- 2026-11-22: native and wasm builds give bit identical numbers for one
  seed, per crate, through a committed golden trace that `cargo test` and
  vitest both check.
- 2026-11-23: the example pages in Chrome 150 on an Apple M1 with the real
  GPU, measured by the automated pass: 13 checks pass, 10 not run, 0 fail
  (counted from the table in `docs/browser-checks.md`).

### Not verified by anything

- A person looking at motion at real frame rate. The owner has not looked
  at any example page yet; `docs/browser-checks.md` lists what waits.

## Licence

| path | licence |
|---|---|
| code | MIT (LICENSE) |
| model weights | none in this repository; each loader names the licence of the weights it is given |
| README, CHANGELOG, docs | CC-BY-4.0 (LICENSES/CC-BY-4.0.txt), code samples also MIT |
