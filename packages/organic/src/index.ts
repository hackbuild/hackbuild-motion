// @hackbuild/organic: springs, inertialization, seeded noise and samplers.
// Scalar functions are plain TypeScript (./scalar.ts); batch springs, pose
// inertialization and seeded noise banks run in wasm after load().
import { assertReady, loadWasm, loadWasmSync, type WasmSource } from "./load.js";
import * as wasm from "./wasm/organic.js";

export * from "./scalar.js";
export type { WasmSource } from "./load.js";
export { SpringBank, Inertializer, NoiseBank, SeededRng } from "./wasm/organic.js";

/** Loads the wasm. With no argument the inlined copy is used (works from file://). */
export async function load(source?: WasmSource): Promise<void> {
  await loadWasm(source);
}

/** Loads the wasm synchronously from bytes or a compiled module. */
export function loadSync(source: ArrayBuffer | ArrayBufferView | WebAssembly.Module): void {
  loadWasmSync(source);
}

/** The golden scenario run in wasm, for the native and wasm agreement test. */
export function goldenTrace(seed: number): Float64Array {
  assertReady("@hackbuild/organic");
  return wasm.goldenTrace(seed);
}
