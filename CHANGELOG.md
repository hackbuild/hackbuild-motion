# Changelog

Versions follow semver per package. Nothing is published to npm yet.

## 0.1.0 (unreleased)

- repository scaffold: rules, hooks, voice and commit linters, CI.
- build tools: `tools/build-wasm.mjs` (wasm-pack, inlined base64) and
  `tools/build-package.mjs` (tsc, wasm copy, single file IIFE).
- `@hackbuild/organic`: halflife springs (exact and fast), spring damper
  with damping ratio, vector and quaternion springs, spring banks, offset
  inertialization for rotations and positions, OU and pink noise, samplers,
  Mulberry32 seeded stream shared bit for bit by Rust, wasm and TypeScript,
  minimum jerk curves, body clock, three.js `PoseInertializer`.
