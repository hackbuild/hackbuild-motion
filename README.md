# hackbuild-motion

Rigs, retargeting, IK, procedural and neural motion, avatars and lip sync for 3D characters on the web. Rust cores compiled to wasm, TypeScript bindings for three.js.

Status: phase A landed, 2026-11-22. Packages land in `packages/` as
they pass their tests; the table below grows with them.

| package | crate | what |
|---|---|---|
| [`@hackbuild/organic`](packages/organic) | `hackbuild-organic` | springs, inertialization, seeded noise, samplers, body clock |
| [`@hackbuild/rig`](packages/rig) | `hackbuild-rig` | bone name mapper, limb chains, rest analysis, expression and viseme table |
| [`@hackbuild/ik`](packages/ik) | `hackbuild-ik` | two bone with pole, FABRIK, CCD, clamped look at, finger curl, foot locking |
| [`@hackbuild/gait`](packages/gait) | `hackbuild-gait` | Froude gait choice, leg oscillators, footfall tables, posture springs, tail and ears, backend interface |
| [`@hackbuild/retarget`](packages/retarget) | `hackbuild-retarget` | humanoid motion format, clip retargeting between any rigs, BVH and VMD readers, motion tags |

Every package works in one normalized humanoid space (VRM 1.0 bone names,
T pose, +Z forward, meters, feet at y = 0), takes an injected
`Rng = () => number`, loads its wasm from a URL, bytes or an inlined copy so
it runs from file://, and ships a single file IIFE build.

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

### Not verified by anything

- CI on GitHub: the wasm-pack step in the unit job has not run there yet.
- Motion in a real browser at real frame rate.

## Licence

| path | licence |
|---|---|
| code | MIT (LICENSE) |
| README, CHANGELOG, docs | CC-BY-4.0 (LICENSES/CC-BY-4.0.txt), code samples also MIT |
