# @hackbuild/organic

Critically damped springs, offset inertialization, seeded noise and samplers
for procedural animation. The core is the Rust crate `crates/organic`
compiled to wasm32 with SIMD128; this package loads it and adds the scalar
kernel in TypeScript plus a three.js adapter under `/three`.

What is in it:

- springs parameterised by halflife: `spring`, `decay`, `velocitySpring`,
  `springDamper` (explicit damping ratio), vector and quaternion springs in
  the crate, `SpringBank` for many springs per frame in wasm. Each comes
  with the exact exp and the fast rational approximation.
- `Inertializer` (flat arrays) and `PoseInertializer` (three.js bones and
  positions): offset inertialization for rotations, root motion and IK
  targets alike.
- `OU` with the exact discrete update, `Pink` (summed OU octaves),
  `NoiseBank` in wasm.
- samplers: `gauss`, `exGaussian`, `truncatedPowerLaw`, `vonMises`,
  `poissonGap`, `eventInStep`, `gamma`, `logNormal`, `weightedIndex`.
- `seededRng` (Mulberry32), `hashSeed`, `minimumJerk`, `keyed`,
  `BodyClock` (circadian drive and sleep pressure).

The spring and inertialization formulas follow Daniel Holden's published
articles "Spring-It-On" and "Dead Blending" (theorangeduck.com). Written for
this library from the HACKLE organic kernel.

Why part of it is TypeScript: a scalar spring step or one random draw costs
less than a call into wasm, so the scalar kernel lives in `src/scalar.ts`.
It is written in the same operation order as the crate, and the tests check
that `seededRng` and the fast spring give the same bits as the wasm build.
Functions that use `exp`, `log` or `cos` can differ from the wasm build in
the last bit, because the crate uses `libm` and TypeScript uses `Math`.

## Install

Not published yet. From a clone:

    npm ci && npm run build -w @hackbuild/organic

## Use

```ts
import { load, seededRng, spring, springState, sample } from "@hackbuild/organic";
import { PoseInertializer } from "@hackbuild/organic/three";

await load(); // inlined wasm; or load(new URL("organic_bg.wasm", import.meta.url)) or load(bytes)
const rng = seededRng("rex");
const head = springState(0);
const inert = new PoseInertializer([hips, spine, neck], { positions: [hips] });

function frame(dt: number, switched: boolean) {
  spring(head, targetYaw, 0.12, dt);
  if (sample.eventInStep(0.3, dt, rng)) blink();
  writeNewPose();
  if (switched) inert.capture();
  inert.apply(dt, 0.15);
}
```

`dist/organic.iife.js` is the single file build: a classic script that
defines `HackbuildOrganic` with the wasm inlined, for pages opened from
file://. It reads `THREE` from the page.

## Develop

    source ~/.nvm/nvm.sh && nvm use 22.18.0
    npx -y npm@11.21.0 install
    npm run build -w @hackbuild/organic   # wasm-pack, tsc, iife
    npx vitest run packages/organic
    cargo test -p hackbuild-organic
    HB_REGEN_GOLDEN=1 cargo test -p hackbuild-organic   # after a deliberate numeric change

The wasm build needs the rustup toolchain with the `wasm32-unknown-unknown`
target and wasm-pack 0.13.1; `tools/build-wasm.mjs` puts `~/.cargo/bin`
first on PATH.

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `cargo test -p hackbuild-organic` passed 25 of 25 tests
  (counted), with clippy clean natively and for wasm32, and the crate
  compiling as `no_std` without the `std` feature.
- 2026-11-22: `npx vitest run packages/organic` passed 17 of 17 tests
  (counted), three of them property tests over fast-check.
- 2026-11-22: the golden trace (126 values over every sampler, spring,
  noise process, the inertializer and the clock, seed 20261122) is bit
  identical between the native build and the wasm build (measured, test
  `golden trace is bit identical to the native build`).
- 2026-11-22: the fast exp stays within 0.2 percent of `exp(-x)` on 0 to 1
  (measured on 1001 points in Rust and by property in TypeScript).
- 2026-11-22: the IIFE bundle loads in Node with three from the global
  scope and reproduces the first golden value (measured by hand).

### Not verified by anything

- Motion in a real browser at real frame rate: nobody has looked at it yet.
- The iife bundle on a page opened from file:// in a browser.
- Performance against the original HACKLE kernel.
- Dead blending, which the plan lists beside offset inertialization, is not
  written.

## Size budget

| file | raw | gzip |
|---|---|---|
| `organic_bg.wasm` | 60,702 bytes | 23,791 bytes |
| `organic.iife.js` (wasm inlined as base64) | 107,890 bytes | 42,294 bytes |

Measured 2026-11-22 with wasm-opt from wasm-pack 0.13.1. Budget: wasm
under 80 KB raw; a change that crosses it says why in its commit.

## Licence

Code MIT (`LICENSE` at the repository root). This README is CC-BY-4.0, its
code samples also MIT.
