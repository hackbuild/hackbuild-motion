// The WebGPU path: WGSL compute kernels for the same models. Half weights
// stay half on the GPU, two per u32, and are widened in the shader with
// unpack2x16float, so the device needs no shader-f16 feature. Sums are f32
// in a 64 thread tree, so results sit near the CPU f32 path, not bit equal.
//
// The WebGPU types are kept loose here so the package builds without a
// WebGPU type package; every call below is in the WebGPU 1.0 core.
import { requiredTensors, type CodebookModel, type MlpModel, type NetManifest } from "./manifest.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Gpu = any;

const WG = 64;

export const MATVEC_WGSL = /* wgsl */ `
struct P { rows: u32, cols: u32, act: u32, has_bias: u32, x_stride: u32, y_stride: u32, half: u32, pad: u32 }
@group(0) @binding(0) var<uniform> p: P;
@group(0) @binding(1) var<storage, read> w: array<u32>;
@group(0) @binding(2) var<storage, read> x: array<f32>;
@group(0) @binding(3) var<storage, read> b: array<f32>;
@group(0) @binding(4) var<storage, read_write> y: array<f32>;
var<workgroup> part: array<f32, ${WG}>;

fn weight(k: u32) -> f32 {
  if (p.half == 1u) {
    let v = unpack2x16float(w[k >> 1u]);
    return select(v.x, v.y, (k & 1u) == 1u);
  }
  return bitcast<f32>(w[k]);
}

fn act(v: f32) -> f32 {
  switch p.act {
    case 1u: { return select(exp(v) - 1.0, v, v > 0.0); }
    case 2u: { return max(v, 0.0); }
    case 3u: { return tanh(v); }
    default: { return v; }
  }
}

@compute @workgroup_size(${WG})
fn main(@builtin(workgroup_id) g: vec3<u32>, @builtin(local_invocation_index) l: u32) {
  let row = g.x;
  let s = g.y;
  var acc = 0.0;
  var i = l;
  loop {
    if (i >= p.cols) { break; }
    acc = acc + weight(row * p.cols + i) * x[s * p.x_stride + i];
    i = i + ${WG}u;
  }
  part[l] = acc;
  workgroupBarrier();
  var span = ${WG / 2}u;
  loop {
    if (span == 0u) { break; }
    if (l < span) { part[l] = part[l] + part[l + span]; }
    workgroupBarrier();
    span = span >> 1u;
  }
  if (l == 0u) {
    var v = part[0];
    if (p.has_bias == 1u) { v = v + b[row]; }
    y[s * p.y_stride + row] = act(v);
  }
}`;

/**
 * Pointwise steps of the models, one entry point each:
 * norm: y = (x - a) / b; denorm: y = y * b[k % n] + a[k % n];
 * softmax: per group of n; concat: y = [code, x];
 * split: u = sb z + hb into y, v = sw z + hw into y2 (first FiLM layer);
 * combine: y[f n + o] = elu(a[o] + t[f] c[o]);
 * film: y[f n + i] = (sw t + sb) x[f n + i] + hw t + hb.
 */
export const POINTWISE_WGSL = /* wgsl */ `
struct Q { n: u32, count: u32, h: u32, pad: u32 }
@group(0) @binding(0) var<uniform> q: Q;
@group(0) @binding(1) var<storage, read> x: array<f32>;
@group(0) @binding(2) var<storage, read> a: array<f32>;
@group(0) @binding(3) var<storage, read> b: array<f32>;
@group(0) @binding(4) var<storage, read> c: array<f32>;
@group(0) @binding(5) var<storage, read> d: array<f32>;
@group(0) @binding(6) var<storage, read> t: array<f32>;
@group(0) @binding(7) var<storage, read_write> y: array<f32>;
@group(0) @binding(8) var<storage, read_write> y2: array<f32>;

@compute @workgroup_size(${WG})
fn norm(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  if (i >= q.count) { return; }
  y[i] = (x[i] - a[i]) / b[i];
}

@compute @workgroup_size(${WG})
fn denorm(@builtin(global_invocation_id) id: vec3<u32>) {
  let k = id.x;
  if (k >= q.count) { return; }
  let i = k % q.n;
  y[k] = x[k] * b[i] + a[i];
}

@compute @workgroup_size(${WG})
fn softmax(@builtin(global_invocation_id) id: vec3<u32>) {
  let g = id.x;
  if (g * q.n >= q.count) { return; }
  let o = g * q.n;
  var m = x[o];
  for (var i = 1u; i < q.n; i = i + 1u) { m = max(m, x[o + i]); }
  var s = 0.0;
  for (var i = 0u; i < q.n; i = i + 1u) { s = s + exp(x[o + i] - m); }
  for (var i = 0u; i < q.n; i = i + 1u) { y[o + i] = exp(x[o + i] - m) / s; }
}

@compute @workgroup_size(${WG})
fn concat(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  if (i >= q.count) { return; }
  y[i] = select(a[i - q.h], x[i], i < q.h);
}

@compute @workgroup_size(${WG})
fn split(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  if (i >= q.count) { return; }
  y[i] = b[i] * x[i] + d[i];
  y2[i] = a[i] * x[i] + c[i];
}

@compute @workgroup_size(${WG})
fn combine(@builtin(global_invocation_id) id: vec3<u32>) {
  let k = id.x;
  if (k >= q.count) { return; }
  let f = k / q.n;
  let o = k % q.n;
  let e = x[o] + t[f] * a[o];
  y[k] = select(exp(e) - 1.0, e, e > 0.0);
}

@compute @workgroup_size(${WG})
fn film(@builtin(global_invocation_id) id: vec3<u32>) {
  let k = id.x;
  if (k >= q.count) { return; }
  let f = k / q.n;
  let i = k % q.n;
  let tt = t[f];
  y[k] = (a[i] * tt + b[i]) * x[k] + c[i] * tt + d[i];
}`;

export interface GpuModel {
  readonly adapterInfo: string;
  run(input: Float32Array, frames?: number): Promise<Float32Array>;
  dispose(): void;
}

const STORAGE = 0x80; // GPUBufferUsage.STORAGE
const COPY_DST = 0x08;
const COPY_SRC = 0x04;
const UNIFORM = 0x40;
const MAP_READ = 0x01;

/** A WebGPU device when the browser has an adapter; null otherwise. */
export async function requestDevice(): Promise<{ device: Gpu; info: string } | null> {
  const gpu = (globalThis as { navigator?: { gpu?: Gpu } }).navigator?.gpu;
  if (!gpu) return null;
  const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) return null;
  const device = await adapter.requestDevice({
    requiredLimits: { maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize, maxBufferSize: adapter.limits.maxBufferSize },
  });
  const info = adapter.info ? `${adapter.info.vendor} ${adapter.info.architecture}`.trim() : "unknown adapter";
  return { device, info };
}

/** Builds the GPU model; throws when a tensor is missing or a buffer exceeds the device limits. */
export async function createGpuModel(manifest: NetManifest, weights: ArrayBuffer, dev?: { device: Gpu; info: string }): Promise<GpuModel> {
  const got = dev ?? (await requestDevice());
  if (!got) throw new Error("no webgpu adapter. the network runs on cpu.");
  const { device, info } = got;
  const owned: Gpu[] = [];
  const buffer = (size: number, usage: number): Gpu => {
    const b = device.createBuffer({ size: Math.max(16, Math.ceil(size / 4) * 4), usage });
    owned.push(b);
    return b;
  };
  const upload = (data: ArrayBufferView): Gpu => {
    const b = buffer(data.byteLength, STORAGE | COPY_DST);
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const padded = new Uint8Array(Math.ceil(bytes.length / 4) * 4);
    padded.set(bytes);
    device.queue.writeBuffer(b, 0, padded);
    return b;
  };
  const tensors = new Map<string, Gpu>();
  const halves = new Set<string>();
  for (const name of requiredTensors(manifest.model)) {
    const e = manifest.tensors[name];
    if (!e) throw new Error(`motion-net: the manifest has no tensor ${name}`);
    const size = e.count * (e.dtype === "f16" ? 2 : 4);
    tensors.set(name, upload(new Uint8Array(weights, e.offset, size)));
    if (e.dtype === "f16") halves.add(name);
  }
  const t = (name: string): Gpu => tensors.get(name)!;
  const zero = upload(new Float32Array(4));

  const matvecModule = device.createShaderModule({ code: MATVEC_WGSL });
  const pointModule = device.createShaderModule({ code: POINTWISE_WGSL });
  const matvecPipe = device.createComputePipeline({ layout: "auto", compute: { module: matvecModule, entryPoint: "main" } });
  const point = new Map<string, Gpu>();
  for (const e of ["norm", "denorm", "softmax", "concat", "split", "combine", "film"]) point.set(e, device.createComputePipeline({ layout: "auto", compute: { module: pointModule, entryPoint: e } }));

  type Step = { pipe: Gpu; group: Gpu; x: number; y: number };
  const steps: Step[] = [];
  const uniform = (words: number[]): Gpu => {
    const b = buffer(words.length * 4, UNIFORM | COPY_DST);
    device.queue.writeBuffer(b, 0, Uint32Array.from(words));
    return b;
  };
  const matvec = (wName: string, bName: string | null, rows: number, cols: number, x: Gpu, y: Gpu, act: number, batch = 1, xStride = cols, yStride = rows, wHalf = halves.has(wName)): void => {
    const u = uniform([rows, cols, act, bName ? 1 : 0, xStride, yStride, wHalf ? 1 : 0, 0]);
    const group = device.createBindGroup({
      layout: matvecPipe.getBindGroupLayout(0),
      entries: [u, t(wName), x, bName ? t(bName) : zero, y].map((buf, binding) => ({ binding, resource: { buffer: buf } })),
    });
    steps.push({ pipe: matvecPipe, group, x: rows, y: batch });
  };
  const pw = (entry: string, n: number, count: number, h: number, io: { x?: Gpu; a?: Gpu; b?: Gpu; c?: Gpu; d?: Gpu; t?: Gpu; y: Gpu; y2?: Gpu }): void => {
    const pipe = point.get(entry)!;
    // the auto layout keeps only the bindings an entry point uses
    const used: Record<string, number[]> = {
      norm: [0, 1, 2, 3, 7],
      denorm: [0, 1, 2, 3, 7],
      softmax: [0, 1, 7],
      concat: [0, 1, 2, 7],
      split: [0, 1, 2, 3, 4, 5, 7, 8],
      combine: [0, 1, 2, 6, 7],
      film: [0, 1, 2, 3, 4, 5, 6, 7],
    };
    const all = [uniform([n, count, h, 0]), io.x ?? zero, io.a ?? zero, io.b ?? zero, io.c ?? zero, io.d ?? zero, io.t ?? zero, io.y, io.y2 ?? zero];
    const group = device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: used[entry]!.map((binding) => ({ binding, resource: { buffer: all[binding] } })) });
    steps.push({ pipe, group, x: Math.ceil((entry === "softmax" ? count / n : count) / WG), y: 1 });
  };

  const m = manifest.model;
  const input = buffer(inputDim(m) * 4, STORAGE | COPY_DST);
  let out: Gpu;
  let outFloats: number;
  let frameCount = 1;
  let outDim: number;
  if (m.kind === "codebook") {
    const { input: n, latent: h, frames: s, output: o, group, iterations } = m;
    const c = n + h;
    const f = (k: number): Gpu => buffer(k * 4, STORAGE | COPY_SRC | COPY_DST);
    const x = f(n), h1 = f(h), h2 = f(h), logits = f(h), code = f(h), cat = f(c), u = f(c), v = f(c), a = f(h), cc = f(h), y1 = f(s * h), z = f(s * h), y2 = f(s * h), raw = f(s * o);
    out = f(s * o);
    outFloats = s * o;
    frameCount = s;
    outDim = o;
    // normalized times, computed once on the CPU
    const tm = new Float32Array(weights.slice(manifest.tensors["time_stats.mean"]!.offset, manifest.tensors["time_stats.mean"]!.offset + 4))[0]!;
    const ts = new Float32Array(weights.slice(manifest.tensors["time_stats.std"]!.offset, manifest.tensors["time_stats.std"]!.offset + 4))[0]!;
    const te = manifest.tensors["timing"]!;
    const times = upload(Float32Array.from(new Float32Array(weights.slice(te.offset, te.offset + te.count * 4)), (v0) => (v0 - tm) / ts));
    pw("norm", n, n, 0, { x: input, a: t("input_stats.mean"), b: t("input_stats.std"), y: x });
    const mlp3 = (net: string, src: Gpu, cols: number): void => {
      matvec(`${net}.l1.weight`, `${net}.l1.bias`, h, cols, src, h1, 1);
      matvec(`${net}.l2.weight`, `${net}.l2.bias`, h, h, h1, h2, 1);
      matvec(`${net}.l3.weight`, `${net}.l3.bias`, h, h, h2, logits, 0);
      pw("softmax", group, h, 0, { x: logits, y: code });
      pw("concat", 0, c, h, { x: code, a: x, y: cat });
    };
    mlp3("estimator", x, n);
    for (let i = 0; i < iterations; i++) mlp3("denoiser", cat, c);
    const film = (l: number) => ({
      a: t(`decoder.l${l}.film.scale.weight`),
      b: t(`decoder.l${l}.film.scale.bias`),
      c: t(`decoder.l${l}.film.shift.weight`),
      d: t(`decoder.l${l}.film.shift.bias`),
    });
    pw("split", c, c, 0, { x: cat, ...film(1), y: u, y2: v });
    matvec("decoder.l1.linear.weight", "decoder.l1.linear.bias", h, c, u, a, 0);
    matvec("decoder.l1.linear.weight", null, h, c, v, cc, 0);
    pw("combine", h, s * h, 0, { x: a, a: cc, t: times, y: y1 });
    pw("film", h, s * h, 0, { x: y1, ...film(2), t: times, y: z });
    matvec("decoder.l2.linear.weight", "decoder.l2.linear.bias", h, h, z, y2, 1, s, h, h);
    pw("film", h, s * h, 0, { x: y2, ...film(3), t: times, y: z });
    matvec("decoder.l3.linear.weight", "decoder.l3.linear.bias", o, h, z, raw, 0, s, h, o);
    pw("denorm", o, s * o, 0, { x: raw, a: t("output_stats.mean"), b: t("output_stats.std"), y: out });
  } else {
    const dims = m.dims;
    const f = (k: number): Gpu => buffer(k * 4, STORAGE | COPY_SRC | COPY_DST);
    let cur = input;
    if (m.stats) {
      cur = f(dims[0]!);
      pw("norm", dims[0]!, dims[0]!, 0, { x: input, a: t("input_stats.mean"), b: t("input_stats.std"), y: cur });
    }
    const codes = { none: 0, elu: 1, relu: 2, tanh: 3 } as const;
    for (let i = 0; i < m.activations.length; i++) {
      const next = f(dims[i + 1]!);
      matvec(`${m.prefix}${i}.weight`, `${m.prefix}${i}.bias`, dims[i + 1]!, dims[i]!, cur, next, codes[m.activations[i]!]);
      cur = next;
    }
    outDim = dims[dims.length - 1]!;
    outFloats = outDim;
    if (m.stats) {
      out = f(outDim);
      pw("denorm", outDim, outDim, 0, { x: cur, a: t("output_stats.mean"), b: t("output_stats.std"), y: out });
    } else out = cur;
  }
  const readback = buffer(outFloats * 4, MAP_READ | COPY_DST);
  let busy = false;
  return {
    adapterInfo: info,
    async run(x: Float32Array, frames = frameCount): Promise<Float32Array> {
      if (busy) throw new Error("motion-net: the gpu model is still running the last input");
      busy = true;
      try {
        device.queue.writeBuffer(input, 0, x);
        const enc = device.createCommandEncoder();
        const pass = enc.beginComputePass();
        for (const st of steps) {
          pass.setPipeline(st.pipe);
          pass.setBindGroup(0, st.group);
          pass.dispatchWorkgroups(st.x, st.y);
        }
        pass.end();
        enc.copyBufferToBuffer(out, 0, readback, 0, outFloats * 4);
        device.queue.submit([enc.finish()]);
        await readback.mapAsync(MAP_READ);
        const all = new Float32Array(readback.getMappedRange().slice(0));
        readback.unmap();
        return all.slice(0, Math.min(frames, frameCount) * outDim);
      } finally {
        busy = false;
      }
    },
    dispose(): void {
      for (const b of owned) b.destroy();
      owned.length = 0;
    },
  };
}

function inputDim(m: CodebookModel | MlpModel): number {
  return m.kind === "codebook" ? m.input : m.dims[0]!;
}
