// Network evaluation off the main thread, with an in-page fallback.
//
// `engineMain` is written to be self contained: it references nothing
// outside its own body, so its source text becomes the whole worker
// script (a blob URL, which also works for pages opened from file://).
// The page fallback calls the same function with a stand in message port,
// so both paths run the same code on the same wasm bytes through the
// crate's plain C ABI.
import type { Weights } from "./weights.js";

export type EngineMode = "worker" | "page";

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

type EngineIn =
  | { kind: "init"; wasm: ArrayBuffer; dims: number[]; bin: ArrayBuffer; tensors: [string, number, number, number][] }
  | { kind: "run"; id: number; input: Float32Array };
type EngineOut = { kind: "ready" } | { kind: "error"; id?: number; message: string } | ({ kind: "result"; id: number } & RawPrediction);

interface Port {
  onmessage: ((ev: { data: EngineIn }) => void) | null;
  postMessage(msg: EngineOut, transfer?: Transferable[]): void;
}

export function engineMain(port: Port): void {
  let ex: Record<string, (...a: number[]) => number> | null = null;
  let mem: WebAssembly.Memory | null = null;
  let h = 0;
  let dims: number[] = [];
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const init = async (m: Extract<EngineIn, { kind: "init" }>) => {
    const mod = await WebAssembly.compile(m.wasm);
    // the generated glue's imports are never reached by the C ABI; stub them
    const imports: Record<string, Record<string, () => never>> = {};
    for (const i of WebAssembly.Module.imports(mod)) {
      (imports[i.module] ??= {})[i.name] = () => {
        throw new Error(`motion-net: unexpected wasm import ${i.name}`);
      };
    }
    const inst = await WebAssembly.instantiate(mod, imports);
    ex = inst.exports as unknown as Record<string, (...a: number[]) => number>;
    mem = inst.exports.memory as WebAssembly.Memory;
    dims = m.dims;
    h = ex.mn_create!(dims[0]!, dims[1]!, dims[2]!, dims[3]!, dims[4]!, dims[5]!);
    if (!h) throw new Error("motion-net: inconsistent dimensions");
    const enc = new TextEncoder();
    for (const [key, dtype, offset, count] of m.tensors) {
      const kb = enc.encode(key);
      const nb = count * (dtype === 0 ? 2 : 4);
      const kp = ex.mn_alloc!(kb.length);
      const dp = ex.mn_alloc!(nb);
      new Uint8Array(mem.buffer, kp, kb.length).set(kb);
      new Uint8Array(mem.buffer, dp, nb).set(new Uint8Array(m.bin, offset, nb));
      const st = ex.mn_set!(h, kp, kb.length, dtype, dp, count);
      ex.mn_free!(kp, kb.length);
      ex.mn_free!(dp, nb);
      if (st !== 0) throw new Error(`motion-net: tensor ${key} rejected (code ${st})`);
    }
    if (ex.mn_missing!(h) !== 0) throw new Error("motion-net: a tensor is missing");
  };
  const run = (id: number, input: Float32Array) => {
    if (!ex || !mem) throw new Error("motion-net: engine not initialized");
    const [dIn, dOut, hid, , frames] = dims as [number, number, number, number, number];
    if (input.length !== dIn) throw new Error(`motion-net: the network takes ${dIn} values, got ${input.length}`);
    const t0 = now();
    new Float32Array(mem.buffer, ex.mn_input!(h), dIn).set(input);
    if (ex.mn_forward!(h) !== 0) throw new Error("motion-net: forward failed");
    const frameData = new Float32Array(mem.buffer, ex.mn_output!(h, 0), frames * dOut).slice();
    const code = new Float32Array(mem.buffer, ex.mn_output!(h, 1), hid).slice();
    const code0 = new Float32Array(mem.buffer, ex.mn_output!(h, 2), hid).slice();
    const out: EngineOut = { kind: "result", id, frames: frameData, code, code0, ms: now() - t0 };
    port.postMessage(out, [frameData.buffer, code.buffer, code0.buffer]);
  };
  port.onmessage = (ev) => {
    const m = ev.data;
    if (m.kind === "init")
      init(m).then(
        () => port.postMessage({ kind: "ready" }),
        (e: Error) => port.postMessage({ kind: "error", message: String(e && e.message ? e.message : e) }),
      );
    else if (m.kind === "run") {
      try {
        run(m.id, m.input);
      } catch (e) {
        port.postMessage({ kind: "error", id: m.id, message: String((e as Error).message ?? e) });
      }
    }
  };
}

export interface PredictorOptions {
  /** "auto" tries a worker and falls back to the page; true insists on a worker; false runs in the page. */
  worker?: boolean | "auto";
  /** The wasm: a URL or bytes. Defaults to the base64 copy shipped in the package. */
  wasm?: URL | string | ArrayBuffer | ArrayBufferView;
  /** How long a worker may take to report ready before the page fallback takes over, ms. */
  workerTimeoutMs?: number;
}

/** Evaluates the network, in a worker or in the page. */
export class Predictor {
  private seq = 0;
  private readonly waiting = new Map<number, { resolve: (p: RawPrediction) => void; reject: (e: Error) => void }>();
  /** Why the worker was not used, when it was not. */
  fallbackReason: string | null = null;
  /** Raw input length the network takes; set by `create`. */
  inputLength = 0;
  private dead: string | null = null;
  private constructor(
    readonly mode: EngineMode,
    private readonly send: (m: EngineIn, transfer?: Transferable[]) => void,
    private readonly stop: () => void,
  ) {}

  /** Runs one evaluation on a raw input of 339 values. */
  predict(input: Float32Array): Promise<RawPrediction> {
    if (this.dead) return Promise.reject(new Error(this.dead));
    if (this.inputLength && input.length !== this.inputLength) {
      return Promise.reject(new Error(`motion-net: the network takes ${this.inputLength} values, got ${input.length}`));
    }
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      const copy = input.slice();
      this.send({ kind: "run", id, input: copy }, [copy.buffer]);
    });
  }

  dispose(): void {
    this.stop();
    this.fail("motion-net: predictor disposed");
  }

  /** @internal Rejects every pending run and every later one. */
  fail(message: string): void {
    this.dead ??= message;
    for (const w of this.waiting.values()) w.reject(new Error(message));
    this.waiting.clear();
  }

  /** @internal */
  receive(m: EngineOut): void {
    if (m.kind === "result") {
      const w = this.waiting.get(m.id);
      this.waiting.delete(m.id);
      w?.resolve({ frames: m.frames, code: m.code, code0: m.code0, ms: m.ms });
    } else if (m.kind === "error" && m.id !== undefined) {
      const w = this.waiting.get(m.id);
      this.waiting.delete(m.id);
      w?.reject(new Error(m.message));
    } else if (m.kind === "error") {
      // an error with no run id leaves the engine in an unknown state
      this.fail(`motion-net: the engine failed: ${m.message}`);
    }
  }

  static async create(weights: Weights, opts: PredictorOptions = {}): Promise<Predictor> {
    const wasm = await wasmBytesOf(opts.wasm);
    const d = weights.dims;
    const init = (): EngineIn => ({
      kind: "init",
      wasm: wasm.slice(0),
      dims: [d.dIn, d.dOut, d.hidden, d.group, d.frames, d.passes],
      bin: weights.bin,
      tensors: weights.tensors.map((t) => [t.key, t.dtype === "f16" ? 0 : 1, t.offset, t.count]),
    });
    const want = opts.worker ?? "auto";
    let reason: string | null = want === false ? "worker off by option" : null;
    if (want !== false) {
      try {
        const p = await workerPredictor(init(), opts.workerTimeoutMs ?? 10000);
        p.inputLength = d.dIn;
        return p;
      } catch (e) {
        if (want === true) throw e;
        reason = (e as Error).message;
      }
    }
    const p = await pagePredictor(init());
    p.fallbackReason = reason;
    p.inputLength = d.dIn;
    return p;
  }
}

async function wasmBytesOf(src: PredictorOptions["wasm"]): Promise<ArrayBuffer> {
  if (src === undefined) {
    const b = (await import("./wasm/inline.js")).wasmBytes();
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  }
  if (src instanceof ArrayBuffer) return src;
  if (ArrayBuffer.isView(src)) return src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength) as ArrayBuffer;
  const res = await fetch(String(src));
  if (!res.ok) throw new Error(`motion-net: wasm fetch answered ${res.status}`);
  return res.arrayBuffer();
}

function workerPredictor(init: EngineIn, timeoutMs: number): Promise<Predictor> {
  if (typeof Worker === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined" || !URL.createObjectURL) {
    return Promise.reject(new Error("no worker in this environment"));
  }
  return new Promise((resolve, reject) => {
    let url = "";
    let w: Worker;
    try {
      url = URL.createObjectURL(new Blob([`(${engineMain.toString()})(self);`], { type: "text/javascript" }));
      w = new Worker(url);
    } catch (e) {
      if (url) URL.revokeObjectURL(url);
      reject(new Error(`the page refused a blob worker: ${(e as Error).message}`));
      return;
    }
    let p: Predictor | null = null;
    const timer = setTimeout(() => {
      w.terminate();
      reject(new Error("the worker did not start in time"));
    }, timeoutMs);
    const ctor = Predictor as unknown as new (m: EngineMode, s: (m: EngineIn, t?: Transferable[]) => void, stop: () => void) => Predictor;
    w.onmessage = (ev: MessageEvent<EngineOut>) => {
      const m = ev.data;
      if (!p) {
        clearTimeout(timer);
        if (m.kind === "ready") {
          p = new ctor("worker", (msg, t) => w.postMessage(msg, t ?? []), () => {
            w.terminate();
            URL.revokeObjectURL(url);
          });
          resolve(p);
        } else {
          w.terminate();
          reject(new Error(m.kind === "error" ? m.message : "the worker answered out of order"));
        }
        return;
      }
      p.receive(m);
    };
    w.onerror = (ev) => {
      if (p) {
        // the worker died after it started: settle every pending run
        w.terminate();
        URL.revokeObjectURL(url);
        p.fail(`motion-net: the worker failed: ${ev.message || "unknown error"}`);
        return;
      }
      clearTimeout(timer);
      w.terminate();
      reject(new Error(`the worker failed: ${ev.message || "blocked"}`));
    };
    w.postMessage(init);
  });
}

function pagePredictor(init: EngineIn): Promise<Predictor> {
  return new Promise((resolve, reject) => {
    let p: Predictor | null = null;
    const ctor = Predictor as unknown as new (m: EngineMode, s: (m: EngineIn, t?: Transferable[]) => void, stop: () => void) => Predictor;
    const port: Port = {
      onmessage: null,
      postMessage(m) {
        if (!p) {
          if (m.kind === "ready") {
            p = new ctor("page", (msg) => setTimeout(() => port.onmessage?.({ data: msg }), 0), () => {
              port.onmessage = null;
            });
            resolve(p);
          } else reject(new Error(m.kind === "error" ? m.message : "engine answered out of order"));
          return;
        }
        p.receive(m);
      },
    };
    engineMain(port);
    port.onmessage!({ data: init });
  });
}
