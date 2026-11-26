// The engine that evaluates the network. `engineMain` drives the crate's
// plain C ABI (`mn_*`) over linear memory and talks to its owner through a
// port. The same function runs in two places:
//
// - a dedicated worker built from a Blob URL. The worker source is
//   `engineMain` turned back into text, so the function reads nothing from
//   this module's scope and the worker runs from file://.
// - the page, behind a MessageChannel. Each message is a task of its own,
//   so the browser can paint between two evaluations.
//
// Protocol, page to engine: "configure-network" (wasm bytes, dims, blob,
// tensor table), "infer" (requestId, input), "teardown".
// Engine to page: "network-configured", "network-configure-failed",
// "inference-done" (requestId, outputs, inferenceMs), "inference-failed"
// (requestId, message), "network-crashed" (message).
import type { Dims, Dtype, Weights } from "./weights.js";

/** Where the network runs: a blob worker or the page. */
export type EngineMode = "worker" | "page";

/** One evaluation of the network: 16 frames of output, the code and the time it took. */
export interface RawPrediction {
  /** 16 rows of 412 denormalized values. */
  frames: Float32Array;
  /** Refined code, 1024 values. */
  code: Float32Array;
  /** Code estimate before refinement. */
  code0: Float32Array;
  /** Milliseconds the evaluation took where it ran (measured). */
  ms: number;
}

interface TensorSlot {
  key: string;
  dtype: Dtype;
  offset: number;
  count: number;
}

type EngineIn =
  | { kind: "configure-network"; wasm: ArrayBuffer; dims: Dims; blob: ArrayBuffer; tensors: TensorSlot[] }
  | { kind: "infer"; requestId: number; input: Float32Array }
  | { kind: "teardown" };

type EngineOut =
  | { kind: "network-configured"; inputLength: number }
  | { kind: "network-configure-failed"; message: string }
  | { kind: "inference-done"; requestId: number; frames: Float32Array; code: Float32Array; code0: Float32Array; inferenceMs: number }
  | { kind: "inference-failed"; requestId: number; message: string }
  | { kind: "network-crashed"; message: string };

interface Port {
  onmessage: ((ev: { data: EngineIn }) => void) | null;
  postMessage(msg: EngineOut, transfer?: Transferable[]): void;
}

interface Abi {
  memory: WebAssembly.Memory;
  mn_alloc(n: number): number;
  mn_free(p: number, n: number): void;
  mn_create(dIn: number, dOut: number, hidden: number, group: number, frames: number, passes: number): number;
  mn_destroy(e: number): void;
  mn_set(e: number, key: number, keyLen: number, dtype: number, data: number, count: number): number;
  mn_missing(e: number): number;
  mn_input(e: number): number;
  mn_output(e: number, which: number): number;
  mn_forward(e: number): number;
  __wbindgen_start?: () => void;
  __wbindgen_externrefs?: WebAssembly.Table;
}

/**
 * The engine loop. Self contained: the worker source is this function's
 * text, so it must not touch anything outside its own body.
 */
export function engineMain(port: Port): void {
  const now = (): number => (typeof performance === "object" && performance ? performance.now() : Date.now());
  let abi: Abi | null = null;
  let handle = 0;
  let dims: Dims | null = null;
  let broken: string | null = null;

  const say = (msg: EngineOut, transfer?: Transferable[]): void => {
    if (transfer) port.postMessage(msg, transfer);
    else port.postMessage(msg);
  };
  const reason = (e: unknown): string => (e instanceof Error ? e.message : String(e));

  const bindings = (mod: WebAssembly.Module, exportsOf: () => Abi | null): WebAssembly.Imports => {
    // supply whatever the generated glue would; the C ABI needs none of it
    const imports: Record<string, Record<string, WebAssembly.ImportValue>> = {};
    for (const imp of WebAssembly.Module.imports(mod)) {
      if (imp.kind !== "function") throw new Error(`the wasm asks for a ${imp.kind} import named ${imp.name}`);
      const ns = (imports[imp.module] ??= {});
      ns[imp.name] =
        imp.name === "__wbindgen_init_externref_table"
          ? () => {
              const table = exportsOf()?.__wbindgen_externrefs;
              if (!table) return;
              const at = table.grow(4);
              table.set(0, undefined);
              table.set(at, undefined);
              table.set(at + 1, null);
              table.set(at + 2, true);
              table.set(at + 3, false);
            }
          : () => {
              throw new Error(`the wasm called ${imp.module}.${imp.name}, which this engine does not provide`);
            };
    }
    return imports;
  };

  const configure = async (m: Extract<EngineIn, { kind: "configure-network" }>): Promise<void> => {
    const mod = await WebAssembly.compile(m.wasm);
    let live: Abi | null = null;
    const inst = await WebAssembly.instantiate(mod, bindings(mod, () => live));
    live = inst.exports as unknown as Abi;
    live.__wbindgen_start?.();
    const d = m.dims;
    const e = live.mn_create(d.dIn, d.dOut, d.hidden, d.group, d.frames, d.passes);
    if (!e) throw new Error("the network rejected the dimensions");
    const enc = new TextEncoder();
    const src = new Uint8Array(m.blob);
    for (const t of m.tensors) {
      const name = enc.encode(t.key);
      const bytes = t.count * (t.dtype === "f16" ? 2 : 4);
      const kp = live.mn_alloc(name.length) >>> 0;
      const dp = live.mn_alloc(bytes) >>> 0;
      // views are taken after both allocations, which can grow memory
      const heap = new Uint8Array(live.memory.buffer);
      heap.set(name, kp);
      heap.set(src.subarray(t.offset, t.offset + bytes), dp);
      const code = live.mn_set(e, kp, name.length, t.dtype === "f16" ? 0 : 1, dp, t.count);
      live.mn_free(kp, name.length);
      live.mn_free(dp, bytes);
      if (code > 1) {
        live.mn_destroy(e);
        const why = ["", "", "has the wrong element count", "is shorter than its count", "has a bad key or dtype"][code] ?? `failed with code ${code}`;
        throw new Error(`tensor ${t.key} ${why}`);
      }
    }
    const gap = live.mn_missing(e);
    if (gap !== 0) {
      live.mn_destroy(e);
      throw new Error(`tensor number ${gap - 1} of the network was never filled`);
    }
    abi = live;
    handle = e;
    dims = d;
  };

  const infer = (requestId: number, input: Float32Array): void => {
    if (!abi || !dims) return say({ kind: "inference-failed", requestId, message: "motion-net: the engine is not configured" });
    if (input.length !== dims.dIn) return say({ kind: "inference-failed", requestId, message: `motion-net: the input has ${input.length} values, the network takes ${dims.dIn} values` });
    const a = abi;
    let elapsed: number;
    let frames: Float32Array;
    let code: Float32Array;
    let code0: Float32Array;
    try {
      new Float32Array(a.memory.buffer, a.mn_input(handle) >>> 0, dims.dIn).set(input);
      const start = now();
      const status = a.mn_forward(handle);
      elapsed = now() - start;
      if (status !== 0) throw new Error("a tensor went missing before the forward pass");
      const read = (which: number, n: number) => new Float32Array(a.memory.buffer, a.mn_output(handle, which) >>> 0, n).slice();
      frames = read(0, dims.frames * dims.dOut);
      code = read(1, dims.hidden);
      code0 = read(2, dims.hidden);
    } catch (e) {
      // a trap leaves linear memory in an unknown state; stop for good
      broken = `motion-net: the network engine crashed: ${reason(e)}`;
      abi = null;
      return say({ kind: "network-crashed", message: broken });
    }
    say({ kind: "inference-done", requestId, frames, code, code0, inferenceMs: elapsed }, [frames.buffer, code.buffer, code0.buffer]);
  };

  let setup: Promise<void> = Promise.resolve();
  port.onmessage = (ev) => {
    const m = ev.data;
    if (broken) {
      if (m.kind === "infer") say({ kind: "inference-failed", requestId: m.requestId, message: broken });
      return;
    }
    if (m.kind === "configure-network") {
      setup = configure(m).then(
        () => say({ kind: "network-configured", inputLength: m.dims.dIn }),
        (e) => say({ kind: "network-configure-failed", message: `motion-net: the network did not set up: ${reason(e)}` }),
      );
    } else if (m.kind === "infer") {
      const { requestId, input } = m;
      void setup.then(() => infer(requestId, input));
    } else if (m.kind === "teardown") {
      void setup.then(() => {
        if (abi && handle) abi.mn_destroy(handle);
        abi = null;
        handle = 0;
        broken = "motion-net: the engine was torn down";
      });
    }
  };
}

/** Options of `Predictor.create`: worker choice, wasm source and worker start timeout. */
export interface PredictorOptions {
  /** "auto" tries a worker and falls back to the page; true insists on a worker; false runs in the page. */
  worker?: boolean | "auto";
  /** The wasm: a URL or bytes. Defaults to the base64 copy shipped in the package. */
  wasm?: URL | string | ArrayBuffer | ArrayBufferView;
  /** How long a worker may take to report ready before the page fallback takes over, ms. */
  workerTimeoutMs?: number;
}

interface Waiter {
  resolve(p: RawPrediction): void;
  reject(e: Error): void;
}

interface Channel {
  post(msg: EngineIn, transfer: Transferable[]): void;
  close(): void;
}

/** Why a blob worker cannot be made here, or null when one can be tried. */
function workerBlocker(): string | null {
  if (typeof Worker !== "function") return "no worker support in this runtime";
  if (typeof Blob !== "function" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return "no blob urls in this runtime";
  return null;
}

async function wasmBytesFrom(src: PredictorOptions["wasm"]): Promise<ArrayBuffer> {
  if (src === undefined) {
    const v = (await import("./wasm/inline.js")).wasmBytes();
    return v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) as ArrayBuffer;
  }
  if (src instanceof ArrayBuffer) return src.slice(0);
  if (ArrayBuffer.isView(src)) return src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength) as ArrayBuffer;
  const res = await fetch(String(src));
  if (!res.ok) throw new Error(`motion-net: fetch ${String(src)} answered ${res.status}`);
  return res.arrayBuffer();
}

function setupMessage(w: Weights, wasm: ArrayBuffer): [EngineIn, Transferable[]] {
  const blob = w.bin.slice(0);
  const wasmCopy = wasm.slice(0);
  return [{ kind: "configure-network", wasm: wasmCopy, dims: { ...w.dims }, blob, tensors: w.tensors.map((t) => ({ ...t })) }, [wasmCopy, blob]];
}

/** Starts the engine in a blob worker. Resolves with the channel, or rejects with the reason it could not. */
function startWorker(setup: [EngineIn, Transferable[]], timeoutMs: number, onMessage: (m: EngineOut) => void, onCrash: (why: string) => void): Promise<Channel> {
  const blocked = workerBlocker();
  if (blocked) return Promise.reject(new Error(blocked));
  const text = `"use strict";\n(${engineMain.toString()})(self);\n`;
  const url = URL.createObjectURL(new Blob([text], { type: "text/javascript" }));
  let worker: Worker;
  try {
    worker = new Worker(url);
  } catch (e) {
    URL.revokeObjectURL(url);
    return Promise.reject(new Error(`blob workers refused: ${(e as Error).message}`));
  }
  return new Promise<Channel>((resolve, reject) => {
    let settled = false;
    const channel: Channel = {
      post: (msg, transfer) => worker.postMessage(msg, transfer),
      close: () => worker.terminate(),
    };
    const give = (why: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      reject(new Error(why));
    };
    const timer = setTimeout(() => give(`the worker did not set up within ${timeoutMs} ms`), timeoutMs);
    worker.onmessage = (ev: MessageEvent<EngineOut>) => {
      const m = ev.data;
      if (!settled) {
        if (m.kind === "network-configured") {
          settled = true;
          clearTimeout(timer);
          URL.revokeObjectURL(url);
          resolve(channel);
        } else if (m.kind === "network-configure-failed") give(m.message);
        return;
      }
      onMessage(m);
    };
    worker.onerror = (ev: ErrorEvent) => {
      ev.preventDefault?.();
      const msg = ev.message || "the worker script failed to start";
      if (!settled) give(`the worker failed: ${msg}`);
      else onCrash(`motion-net: the network worker crashed: ${msg}`);
    };
    worker.onmessageerror = () => {
      if (settled) onCrash("motion-net: the network worker sent a message the page could not read");
    };
    worker.postMessage(setup[0], setup[1]);
  });
}

/** Starts the engine in this page behind a MessageChannel. */
function startPage(setup: [EngineIn, Transferable[]], onMessage: (m: EngineOut) => void): Promise<Channel> {
  const mc = new MessageChannel();
  const engineSide = mc.port1;
  const pageSide = mc.port2;
  engineMain(engineSide as unknown as Port);
  // in node a listening port holds the process open; the engine should not
  for (const p of [engineSide, pageSide]) (p as unknown as { unref?: () => void }).unref?.();
  const channel: Channel = {
    post: (msg, transfer) => pageSide.postMessage(msg, transfer),
    close: () => {
      pageSide.onmessage = null;
      engineSide.onmessage = null;
      pageSide.close();
      engineSide.close();
    },
  };
  return new Promise<Channel>((resolve, reject) => {
    let settled = false;
    pageSide.onmessage = (ev: MessageEvent<EngineOut>) => {
      const m = ev.data;
      if (!settled) {
        if (m.kind === "network-configured") {
          settled = true;
          resolve(channel);
        } else if (m.kind === "network-configure-failed") {
          settled = true;
          channel.close();
          reject(new Error(m.message));
        }
        return;
      }
      onMessage(m);
    };
    pageSide.postMessage(setup[0], setup[1]);
  });
}

/** Evaluates the network, in a worker or in the page. */
export class Predictor {
  private readonly waiting = new Map<number, Waiter>();
  private nextId = 1;
  private channel: Channel | null = null;
  private dead: string | null = null;
  /** Why the worker was not used, when it was not. */
  fallbackReason: string | null = null;
  /** Raw input length the network takes; set by `create`. */
  inputLength = 0;

  private constructor(readonly mode: EngineMode) {}

  /** Runs one evaluation on a raw input of 339 values. */
  predict(input: Float32Array): Promise<RawPrediction> {
    if (this.dead) return Promise.reject(new Error(this.dead));
    if (input.length !== this.inputLength) return Promise.reject(new Error(`motion-net: the input has ${input.length} values, the network takes ${this.inputLength} values`));
    const requestId = this.nextId++;
    // a copy goes to the engine, so the caller may refill its buffer at once
    const copy = input.slice();
    return new Promise<RawPrediction>((resolve, reject) => {
      this.waiting.set(requestId, { resolve, reject });
      try {
        this.channel!.post({ kind: "infer", requestId, input: copy }, [copy.buffer]);
      } catch (e) {
        this.fail(`motion-net: the engine could not take the request: ${(e as Error).message}`);
      }
    });
  }

  dispose(): void {
    if (this.dead) return;
    this.dead = "motion-net: the predictor was disposed. the run was dropped.";
    this.rejectAll(this.dead);
    this.shutdown();
  }

  /** @internal Rejects every pending run and every later one. */
  fail(message: string): void {
    if (this.dead) return;
    this.dead = message;
    console.warn(message);
    this.rejectAll(message);
    this.shutdown();
  }

  /** @internal */
  receive(m: EngineOut): void {
    if (this.dead) return;
    if (m.kind === "inference-done" || m.kind === "inference-failed") {
      const w = this.waiting.get(m.requestId);
      if (!w) return;
      this.waiting.delete(m.requestId);
      if (m.kind === "inference-done") w.resolve({ frames: m.frames, code: m.code, code0: m.code0, ms: m.inferenceMs });
      else w.reject(new Error(m.message));
    } else if (m.kind === "network-crashed") this.fail(m.message);
  }

  private rejectAll(message: string): void {
    const all = [...this.waiting.values()];
    this.waiting.clear();
    for (const w of all) w.reject(new Error(message));
  }

  private shutdown(): void {
    const c = this.channel;
    this.channel = null;
    if (!c) return;
    try {
      c.post({ kind: "teardown" }, []);
    } catch {
      // the engine is already gone
    }
    c.close();
  }

  static async create(weights: Weights, opts: PredictorOptions = {}): Promise<Predictor> {
    const want = opts.worker ?? "auto";
    const wasm = await wasmBytesFrom(opts.wasm);
    let reason: string | null = want === false ? null : "";
    if (want !== false) {
      const p = new Predictor("worker");
      try {
        p.channel = await startWorker(
          setupMessage(weights, wasm),
          opts.workerTimeoutMs ?? 15000,
          (m) => p.receive(m),
          (why) => p.fail(why),
        );
        p.inputLength = weights.dims.dIn;
        return p;
      } catch (e) {
        reason = (e as Error).message;
        if (want === true) throw new Error(`motion-net: no network worker. ${reason}.`);
      }
    }
    const p = new Predictor("page");
    p.fallbackReason = reason;
    p.channel = await startPage(setupMessage(weights, wasm), (m) => p.receive(m));
    p.inputLength = weights.dims.dIn;
    return p;
  }
}
