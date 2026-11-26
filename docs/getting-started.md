# getting started

The packages under @hackbuild in this repository move 3D characters on the web: bones, inverse kinematics, legged gait, retargeted clips, gaze and blink, avatars, lip sync and the stage that hosts them. Each one does one job, installs from npm on its own, and ships its types. The math runs in Rust cores compiled to wasm; three.js is a peer you bring.

## install

Install the packages you use. A procedural dog needs one:

```sh
npm install @hackbuild/gait
```

A humanoid on a three.js stage needs the avatar, its host and three:

```sh
npm install @hackbuild/avatar @hackbuild/avatar-host three
```

Every package is ESM only and MIT. three.js and the VRM and MMD loaders are peers: you install the version you use, and a package's `/three` subpath works with it. Each package README lists its peers and its subpaths.

## your first program

This page runs the gait core for a four legged body at three speeds and prints the gait it picks. The wasm loads once through `load()`, and the randomness is a seeded function you pass in.

<!-- example: examples/docs/first.ts -->

The code is [examples/docs/first.ts](../examples/docs/first.ts) in the repository. Every package README starts with a quick start like it, of 10 to 20 lines, taken from `examples/<package>/quick.ts` in the repository and typechecked in CI.

## where to go next

- [concepts](concepts.md): the ideas every package shares, read once.
- The examples: the demo pages of this site, one per package, each with its source linked.
- A package page: its README, then its API reference, generated from the TSDoc in the code.
- For a coding agent: [llms.txt](https://hackbuild.github.io/hackbuild-motion/llms.txt) lists every package's `llms.md`, a single file with its exports, examples and the mistakes to avoid.

## packages

<!-- packages -->
