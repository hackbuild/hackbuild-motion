// @hackbuild/motion-net: a runtime for small motion networks (dense
// stacks and codebook matching) on WebGPU or wasm SIMD, in a worker with
// an in page fallback, and a quadruped gait host over the published
// codebook network. Weights never ship here: the caller gives a URL,
// ArrayBuffer or File, and the licence of the weights is stated on load.
import { loadWasm, loadWasmSync, type WasmSource } from "./load.js";
import * as wasm from "./wasm/motion_net.js";
import { readWeights, type FetchOptions, type WeightSource } from "./fetch.js";
import { codebookManifest, QUADRUPED_LICENCE, type CodebookFile } from "./manifest.js";
import { createSession, type SessionOptions } from "./session.js";
import { CodebookGait, readGuidance, type BindPose, type CodebookGaitOptions } from "./quadruped.js";

export type { WasmSource } from "./load.js";
export * from "./manifest.js";
export * from "./fetch.js";
export { createCpuModel, type Accumulation, type CpuModel } from "./cpu.js";
export { createHost, type HostReply, type HostRequest } from "./host.js";
export { createSession, type Backend, type NetSession, type SessionOptions, type Where } from "./session.js";
export { createGpuModel, requestDevice, MATVEC_WGSL, POINTWISE_WGSL, type GpuModel } from "./webgpu.js";
export * from "./quadruped.js";

export async function load(source?: WasmSource): Promise<void> {
  await loadWasm(source);
}

export function loadSync(source: ArrayBuffer | ArrayBufferView | WebAssembly.Module): void {
  loadWasmSync(source);
}

/** The native and wasm agreement trace of the small seeded nets. */
export function goldenTrace(seed: number): Float64Array {
  return wasm.goldenTrace(seed);
}

export interface QuadrupedSource {
  /** The quadruped json (model, skeleton, control, guidances, bin), or a URL to it. */
  manifest: CodebookFile | string | URL;
  /** The quadruped weights: a URL, ArrayBuffer or File. CC BY-NC 4.0. */
  weights: WeightSource;
  /** The 27 bind matrices, or a URL to them. */
  bind: BindPose | string | URL;
  fetch?: FetchOptions;
  session?: SessionOptions;
  gait?: CodebookGaitOptions;
}

const json = async <T>(src: T | string | URL): Promise<T> => (typeof src === "string" || src instanceof URL ? ((await (await fetch(src)).json()) as T) : src);

/**
 * Loads the quadruped codebook network from caller sources and returns its
 * gait host. Load @hackbuild/gait first; the host fills gait's motor state.
 */
export async function loadQuadrupedGait(src: QuadrupedSource): Promise<CodebookGait> {
  await loadWasm();
  const [file, bind, weights] = await Promise.all([json<CodebookFile>(src.manifest), json<BindPose>(src.bind), readWeights(src.weights, src.fetch)]);
  const manifest = codebookManifest(file, QUADRUPED_LICENCE, src.fetch?.sha256);
  const guidance = readGuidance(file, weights);
  const session = await createSession(manifest, weights, src.session);
  return new CodebookGait(session, { file, bind, guidance }, src.gait);
}
