// @hackbuild/motion-net: a runtime for the categorical codebook matching
// quadruped network and a gait host that drives a dog from it. The network
// runs in Rust on wasm SIMD128 inside a worker, or in the page when a
// worker is refused. Weights are CC BY-NC 4.0 and are fetched at run time.
import { assertReady, loadWasm, loadWasmSync, type WasmSource } from "./load.js";
import * as wasm from "./wasm/motion_net.js";

export type { WasmSource } from "./load.js";
export * from "./layout.js";
export * from "./weights.js";
export * from "./engine.js";

const PKG = "@hackbuild/motion-net";

/** Loads the wasm for the page side helpers (golden trace). The predictor loads its own copy. */
export async function load(source?: WasmSource): Promise<void> {
  await loadWasm(source);
}

export function loadSync(source: ArrayBuffer | ArrayBufferView | WebAssembly.Module): void {
  loadWasmSync(source);
}

/** The seeded random network trace that the native and wasm builds must agree on. */
export function goldenTrace(seed: number): Float64Array {
  assertReady(PKG);
  return wasm.goldenTrace(seed);
}

/** Uniform numbers in [0, 1); the family contract. */
export type Rng = () => number;

/** The linear congruential generator of the specification's test vectors. */
export function lcg(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
export * from "./host.js";
