# concepts

The ideas every package in this repository shares. Read them once; each package README then only covers what is its own.

## one normalized humanoid space

Every humanoid package works in the same space: VRM 1.0 bone names, a T pose at rest, +Z forward, meters, and feet at y = 0. @hackbuild/rig maps a rig's own bone names onto it without per rig tables, and @hackbuild/avatar brings VRM, Mixamo, GLB and FBX characters into it. A clip retargeted by @hackbuild/retarget, a look at from @hackbuild/ik and a blink from @hackbuild/presence then work on any of those bodies. Animals and other bodies use named limb chains instead, each with a root, a tip and a pole.

## wasm cores load once

organic, rig, ik, gait, retarget, motion-net, motion-match and bake have a Rust core compiled to wasm with SIMD128 and no threads. Call `await load()` once before the first solve; with no argument it decodes the base64 copy of the wasm that ships in the package, which works from file://, and it also takes a URL, a Response, bytes or a compiled module. `loadSync(bytes)` does the same with no promise. A solver called before the load throws `<package>: wasm not loaded. call load() first.` The same seed gives bit identical numbers from the native and the wasm build.

## three.js is a peer

The cores take plain numbers and arrays, so they run in Node, in a worker or under any engine. Each package that drives a scene has a `/three` subpath that applies the result to three.js objects; three.js is a peer dependency you install at the version you use, and the packages never bundle it.

## files you give

No model, clip, HDRI or weight file ships in a package or on these pages. A character, a BVH clip or the motion network's weights come from a URL you pass or a file the user drops, and its licence stays with it. The motion network's weights are CC BY-NC 4.0, so a page names that licence before it loads them.

## builds that run from file://

Every package has a single file build, `dist/<package>.iife.js`, with its wasm inlined. It is a classic script that sets a `Hackbuild<Package>` global and reads `THREE` from the page, so a page saved to disk works with no server. Chrome refuses module scripts, module workers and dynamic imports of file URLs on such a page; the packages that use a worker start it as a classic script from a Blob, and fall back to running in the page when a worker cannot start.

## randomness is injected

Anything random takes an `Rng = () => number` option, so the same seed gives the same motion in tests, in Node and in the browser. Library code never calls `Math.random`.

## errors name the failure

A thrown message says what failed in lowercase plain words and what to do. A control a device cannot run is disabled with the reason beside it, never offered and then failed.

## numbers carry a label

Every number in these docs says where it came from: measured on a named machine, computed from other numbers, vendor (stated by a publisher), inferred, or unknown.
