import { resolveObjectURL } from "node:buffer";
import { runInNewContext } from "node:vm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Predictor, engineMain, lcg, load, loadWeights, type Weights } from "../src/index.js";
import { wasmBytes } from "../src/wasm/inline.js";
import { SMALL, referenceForward, smallWeights } from "./synthetic.js";

type Msg = { kind: string; [k: string]: unknown };

let weights: Weights;
let values: Record<string, number[]>;

beforeAll(async () => {
  await load();
  const s = smallWeights(11);
  values = s.values;
  weights = await loadWeights({ manifest: s.manifest, bin: s.bin, onLicence: () => {} });
});

const realWorker = (globalThis as { Worker?: unknown }).Worker;
afterEach(() => {
  (globalThis as { Worker?: unknown }).Worker = realWorker;
  vi.restoreAllMocks();
});

const inputOf = (seed: number): Float32Array => {
  const r = lcg(seed);
  return Float32Array.from({ length: SMALL.dIn }, () => 2 * r() - 1);
};

const closeTo = (got: Float32Array, want: number[]) => {
  expect(got.length).toBe(want.length);
  want.forEach((w, i) => expect(Math.abs(got[i]! - w)).toBeLessThan(1e-4 * Math.max(1, Math.abs(w))));
};

/** Runs engineMain's text in a fresh context that shares nothing with this module. */
function isolatedEngine() {
  const seen: Msg[] = [];
  let wake: (() => void) | null = null;
  const port = {
    onmessage: null as ((ev: { data: unknown }) => void) | null,
    postMessage(m: Msg) {
      seen.push(m);
      wake?.();
    },
  };
  runInNewContext(`(${engineMain.toString()})(port)`, { port, TextEncoder, performance });
  const next = async (n: number): Promise<Msg[]> => {
    while (seen.length < n) await new Promise<void>((r) => (wake = r));
    return seen.slice(0, n);
  };
  const send = (data: unknown) => port.onmessage!({ data });
  return { send, next };
}

const configure = (w: Weights) => ({ kind: "configure-network", wasm: wasmBytes().slice().buffer, dims: { ...w.dims }, blob: w.bin.slice(0), tensors: w.tensors.map((t) => ({ ...t })) });

describe("engine protocol", () => {
  it("sets up, answers each request by id with a measured time, and refuses a bad input", async () => {
    const e = isolatedEngine();
    e.send(configure(weights));
    e.send({ kind: "infer", requestId: 7, input: inputOf(1) });
    e.send({ kind: "infer", requestId: 8, input: new Float32Array(3) });
    const [setup, done, refused] = await e.next(3);
    expect(setup).toEqual({ kind: "network-configured", inputLength: SMALL.dIn });
    expect(done!.kind).toBe("inference-done");
    expect(done!.requestId).toBe(7);
    expect(typeof done!.inferenceMs).toBe("number");
    expect(done!.inferenceMs as number).toBeGreaterThanOrEqual(0);
    expect("t" in done!).toBe(false);
    const ref = referenceForward(values, SMALL, inputOf(1));
    closeTo(done!.code as Float32Array, ref.code);
    closeTo(done!.frames as Float32Array, ref.frames);
    expect(refused).toMatchObject({ kind: "inference-failed", requestId: 8 });
    expect(refused!.message).toMatch(/3 values, the network takes 23 values/);
  });

  it("reports a setup failure for a short tensor", async () => {
    const e = isolatedEngine();
    const bad = configure(weights);
    bad.tensors[0]!.count = 1;
    e.send(bad);
    const [m] = await e.next(1);
    expect(m!.kind).toBe("network-configure-failed");
    expect(m!.message).toMatch(/^motion-net: the network did not set up: tensor estimator\.l1\.weight/);
  });

  it("uses none of the retired message names", () => {
    const text = engineMain.toString();
    for (const k of ["ready", "error", "run", "out", "load"]) expect(text).not.toContain(`"${k}"`);
  });
});

/** A stand in for a browser Worker: reads the blob URL and runs its text in an isolated context. */
class BlobWorker {
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: ((ev: { message: string; preventDefault(): void }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  scope: { onmessage: ((ev: { data: unknown }) => void) | null; postMessage(m: unknown, t?: Transferable[]): void };
  private started: Promise<void>;
  constructor(url: string) {
    const blob = resolveObjectURL(url);
    if (!blob) throw new Error("blob url not found");
    this.scope = {
      onmessage: null,
      postMessage: (m, t) => {
        const data = structuredClone(m, { transfer: t ?? [] });
        queueMicrotask(() => this.onmessage?.({ data }));
      },
    };
    this.started = blob.text().then((src) => {
      runInNewContext(src, { self: this.scope, TextEncoder, performance });
    });
  }
  postMessage(m: unknown, t?: Transferable[]) {
    const data = structuredClone(m, { transfer: t ?? [] });
    void this.started.then(() => this.scope.onmessage?.({ data }));
  }
  terminate() {
    this.scope.onmessage = null;
  }
}

describe("worker and page fallback", () => {
  it("falls back to the page when this runtime has no worker, and says why", async () => {
    (globalThis as { Worker?: unknown }).Worker = undefined;
    const p = await Predictor.create(weights, { worker: "auto" });
    expect(p.mode).toBe("page");
    expect(p.fallbackReason).toBe("no worker support in this runtime");
    const r = await p.predict(inputOf(2));
    closeTo(r.code, referenceForward(values, SMALL, inputOf(2)).code);
    p.dispose();
  });

  it("falls back when blob workers are refused", async () => {
    (globalThis as { Worker?: unknown }).Worker = class {
      constructor() {
        throw new Error("refused by the content security policy");
      }
    };
    const p = await Predictor.create(weights);
    expect(p.mode).toBe("page");
    expect(p.fallbackReason).toBe("blob workers refused: refused by the content security policy");
    p.dispose();
  });

  it("falls back when the worker never sets up, and refuses when a worker is required", async () => {
    (globalThis as { Worker?: unknown }).Worker = class {
      onmessage = null;
      postMessage() {}
      terminate() {}
    };
    const p = await Predictor.create(weights, { workerTimeoutMs: 30 });
    expect(p.mode).toBe("page");
    expect(p.fallbackReason).toMatch(/did not set up within 30 ms/);
    p.dispose();
    await expect(Predictor.create(weights, { worker: true, workerTimeoutMs: 30 })).rejects.toThrow(/^motion-net: no network worker/);
  });

  it("runs the blob worker source on its own and matches the reference", async () => {
    (globalThis as { Worker?: unknown }).Worker = BlobWorker;
    const p = await Predictor.create(weights, { worker: true });
    expect(p.mode).toBe("worker");
    expect(p.fallbackReason).toBeNull();
    const r = await p.predict(inputOf(3));
    closeTo(r.frames, referenceForward(values, SMALL, inputOf(3)).frames);
    expect(r.ms).toBeGreaterThanOrEqual(0);
    p.dispose();
  });

  it("returns to the event loop before a page run settles", async () => {
    const p = await Predictor.create(weights, { worker: false });
    for (let i = 0; i < 3; i++) {
      let turned = false;
      setImmediate(() => (turned = true));
      await p.predict(inputOf(10 + i));
      expect(turned).toBe(true);
    }
    p.dispose();
  });
});

describe("request bookkeeping", () => {
  it("resolves concurrent requests with their own results, and the caller may reuse its buffer", async () => {
    const p = await Predictor.create(weights, { worker: false });
    const buf = new Float32Array(SMALL.dIn);
    const order: number[] = [];
    const runs = [5, 6, 7, 8].map((seed, i) => {
      buf.set(inputOf(seed));
      const run = p.predict(buf).then((r) => (order.push(i), r));
      buf.fill(99);
      return run;
    });
    const got = await Promise.all(runs);
    [5, 6, 7, 8].forEach((seed, i) => closeTo(got[i]!.code, referenceForward(values, SMALL, inputOf(seed)).code));
    expect(order).toEqual([0, 1, 2, 3]);
    p.dispose();
  });

  it("dispose rejects every pending request with a lowercase message", async () => {
    const p = await Predictor.create(weights, { worker: false });
    const runs = [1, 2, 3].map((s) => p.predict(inputOf(s)));
    p.dispose();
    for (const r of runs) await expect(r).rejects.toThrow("motion-net: the predictor was disposed. the run was dropped.");
    await expect(p.predict(inputOf(1))).rejects.toThrow(/disposed/);
  });

  it("a crashed engine rejects pending requests and reports once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const p = await Predictor.create(weights, { worker: false });
    const runs = [1, 2].map((s) => p.predict(inputOf(s)));
    const crash = { kind: "network-crashed", message: "motion-net: the network engine crashed: unreachable" };
    p.receive(crash as Parameters<Predictor["receive"]>[0]);
    p.receive(crash as Parameters<Predictor["receive"]>[0]);
    p.fail("motion-net: a second failure");
    for (const r of runs) await expect(r).rejects.toThrow("motion-net: the network engine crashed: unreachable");
    await expect(p.predict(inputOf(1))).rejects.toThrow(/crashed/);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toBe(crash.message);
  });
});
