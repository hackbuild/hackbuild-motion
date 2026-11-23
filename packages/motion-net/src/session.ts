// A session runs one model on the best path the device has: WebGPU, else
// the wasm SIMD kernels in a worker, else the same kernels in the page.
// Each step down is reported through `onNotice` in the words a page shows.
import type { Accumulation } from "./cpu.js";
import { createHost, type HostReply, type HostRequest } from "./host.js";
import { loadWasm, type WasmSource } from "./load.js";
import type { NetManifest } from "./manifest.js";
import { stateLicence } from "./fetch.js";
import { createGpuModel, type GpuModel } from "./webgpu.js";

export type Backend = "webgpu" | "wasm-simd";
export type Where = "gpu" | "worker" | "page";

export interface SessionOptions {
  /** Paths to try in order. Default: webgpu, then wasm-simd. */
  prefer?: Backend[];
  /** Run the CPU path in a worker. Default true; false runs it in the page. */
  worker?: boolean;
  /** CPU accumulation; f64 by default. */
  accum?: Accumulation;
  /** Wasm for the in page path; the inlined copy by default. */
  wasm?: WasmSource;
  /** Where licence and fallback lines go; console.info by default. */
  onNotice?: (line: string) => void;
}

export interface NetSession {
  readonly backend: Backend;
  readonly where: Where;
  /** Milliseconds of the last run, measured where it ran. */
  readonly lastMs: number;
  /** Runs one input. Codebook models return `frames` frames (all by default). */
  run(input: Float32Array, frames?: number): Promise<Float32Array>;
  dispose(): void;
}

const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** A channel to a host: a worker, or the same host behind a zero delay hop in the page. */
interface Channel {
  send(m: HostRequest, transfer?: Transferable[]): void;
  onReply: (m: HostReply) => void;
  close(): void;
}

function pageChannel(wasm?: WasmSource): Channel {
  const ch: Channel = {
    onReply: () => {},
    send: (m) => {
      setTimeout(() => void host(m), 0);
    },
    close: () => {},
  };
  const host = createHost((r) => setTimeout(() => ch.onReply(r), 0), () => loadWasm(wasm));
  return ch;
}

async function workerChannel(): Promise<Channel | null> {
  if (typeof Worker === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined" || !URL.createObjectURL) return null;
  let source: string;
  try {
    source = (await import("./generated/worker-source.js")).workerSource;
  } catch {
    return null;
  }
  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  try {
    const w = new Worker(url);
    const ch: Channel = {
      onReply: () => {},
      send: (m, t) => w.postMessage(m, t ?? []),
      close: () => {
        w.terminate();
        URL.revokeObjectURL(url);
      },
    };
    w.onmessage = (e: MessageEvent) => ch.onReply(e.data as HostReply);
    w.onerror = (e: ErrorEvent) => ch.onReply({ t: "error", message: e.message || "worker error" });
    return ch;
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

class CpuSession implements NetSession {
  readonly backend = "wasm-simd" as const;
  lastMs = 0;
  private next = 1;
  private readonly waiting = new Map<number, { ok: (o: Float32Array) => void; fail: (e: Error) => void; t0: number }>();
  constructor(
    private readonly ch: Channel,
    readonly where: Where,
    private readonly frames: number,
  ) {
    ch.onReply = (m) => this.reply(m);
  }
  private reply(m: HostReply): void {
    if (m.t === "out") {
      const w = this.waiting.get(m.id);
      this.waiting.delete(m.id);
      this.lastMs = m.ms;
      w?.ok(m.out);
    } else if (m.t === "error" && m.id !== undefined) {
      const w = this.waiting.get(m.id);
      this.waiting.delete(m.id);
      w?.fail(new Error(m.message));
    }
  }
  run(input: Float32Array, frames = this.frames): Promise<Float32Array> {
    const id = this.next++;
    const copy = input.slice();
    return new Promise((ok, fail) => {
      this.waiting.set(id, { ok, fail, t0: now() });
      this.ch.send({ t: "run", id, input: copy, frames }, [copy.buffer]);
    });
  }
  dispose(): void {
    this.ch.send({ t: "dispose" });
    this.ch.close();
    for (const w of this.waiting.values()) w.fail(new Error("motion-net: session disposed"));
    this.waiting.clear();
  }
}

class GpuSession implements NetSession {
  readonly backend = "webgpu" as const;
  readonly where = "gpu" as const;
  lastMs = 0;
  constructor(private readonly model: GpuModel) {}
  async run(input: Float32Array, frames?: number): Promise<Float32Array> {
    const t0 = now();
    const out = await this.model.run(input, frames);
    this.lastMs = now() - t0;
    return out;
  }
  dispose(): void {
    this.model.dispose();
  }
}

function loadOn(ch: Channel, manifest: NetManifest, weights: ArrayBuffer, accum: Accumulation, transfer: boolean): Promise<number> {
  return new Promise((ok, fail) => {
    ch.onReply = (m) => {
      if (m.t === "ready") ok(m.bytes);
      else if (m.t === "error") fail(new Error(m.message));
    };
    ch.send({ t: "load", manifest, weights, accum }, transfer ? [weights] : []);
  });
}

/**
 * Creates a session. The weight buffer is copied once into the worker, so
 * the caller keeps its own. States the weight licence through `onNotice`.
 */
export async function createSession(manifest: NetManifest, weights: ArrayBuffer, opts: SessionOptions = {}): Promise<NetSession> {
  const notice = opts.onNotice ?? ((s: string) => console.info(s));
  stateLicence(manifest.licence, notice);
  const prefer = opts.prefer ?? ["webgpu", "wasm-simd"];
  const frames = manifest.model.kind === "codebook" ? manifest.model.frames : 1;
  for (const b of prefer) {
    if (b === "webgpu") {
      try {
        return new GpuSession(await createGpuModel(manifest, weights));
      } catch (e) {
        notice(e instanceof Error && e.message.startsWith("no webgpu") ? e.message : `webgpu failed: ${e instanceof Error ? e.message : String(e)}. the network runs on cpu.`);
      }
      continue;
    }
    const accum = opts.accum ?? "f64";
    if (opts.worker !== false) {
      const ch = await workerChannel();
      if (ch) {
        try {
          await loadOn(ch, manifest, weights.slice(0), accum, true);
          return new CpuSession(ch, "worker", frames);
        } catch (e) {
          ch.close();
          notice(`the network worker failed: ${e instanceof Error ? e.message : String(e)}. it runs in the page at a lower rate.`);
        }
      } else notice("blob workers are refused here. the network runs in the page at a lower rate.");
    }
    const ch = pageChannel(opts.wasm);
    await loadOn(ch, manifest, weights, accum, false);
    return new CpuSession(ch, "page", frames);
  }
  throw new Error("motion-net: no backend in prefer");
}
