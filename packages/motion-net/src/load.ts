// Loads the motion-net wasm once. The source can be a URL (fetched), bytes
// (ArrayBuffer or a typed array), a compiled WebAssembly.Module, or nothing,
// in which case the base64 copy in ./wasm/inline.js is decoded, which works
// from file:// where fetch of a local file is refused.
import initAsync, { initSync as initFromBytes } from "./wasm/motion_net.js";

export type WasmSource = URL | string | Response | ArrayBuffer | ArrayBufferView | WebAssembly.Module;

let pending: Promise<void> | null = null;
let ready = false;

const isBytes = (s: unknown): s is ArrayBuffer | ArrayBufferView | WebAssembly.Module =>
  s instanceof ArrayBuffer || ArrayBuffer.isView(s) || (typeof WebAssembly !== "undefined" && s instanceof WebAssembly.Module);

export function wasmReady(): boolean {
  return ready;
}

/** Instantiates the wasm. Later calls return the first load. */
export function loadWasm(source?: WasmSource): Promise<void> {
  if (pending) return pending;
  pending = (async () => {
    let input: WasmSource | undefined = source;
    if (input === undefined) input = (await import("./wasm/inline.js")).wasmBytes();
    if (isBytes(input)) initFromBytes({ module: input as BufferSource | WebAssembly.Module });
    else await initAsync({ module_or_path: input as URL | string | Response });
    ready = true;
  })();
  pending.catch(() => {
    pending = null;
  });
  return pending;
}

/** Synchronous load from bytes or a compiled module. */
export function loadWasmSync(source: ArrayBuffer | ArrayBufferView | WebAssembly.Module): void {
  if (ready) return;
  initFromBytes({ module: source as BufferSource | WebAssembly.Module });
  ready = true;
  pending = Promise.resolve();
}

export function assertReady(pkg: string): void {
  if (!ready) throw new Error(`${pkg}: wasm not loaded. call load() first.`);
}
