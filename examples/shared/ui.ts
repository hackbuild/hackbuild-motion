// Shared helpers for the example pages: status line, readout, frame timer,
// webgpu probe, a weight loader that takes a URL or a dropped file, and the
// result object the browser check harness reads (window.__hb).

export type Kind = "ok" | "bad" | "warn" | "info";

export interface CheckResult {
  page: string;
  status: "running" | "pass" | "fail" | "not run";
  reason: string;
  /** every value carries its label in the key, e.g. "inference ms (measured)" */
  numbers: Record<string, number | string>;
  notes: string[];
  /** one entry per docs/browser-checks.md row this page covers */
  checks: Record<string, { status: "pass" | "fail" | "not run"; reason: string }>;
  done: boolean;
}

declare global {
  interface Window {
    __hb: CheckResult;
  }
}

export const params = new URLSearchParams(location.search);
/** true when the check harness opened the page (?auto) */
export const auto = params.has("auto");

export function $(sel: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`no element ${sel}`);
  return el;
}

export function result(page: string): CheckResult {
  const r: CheckResult = { page, status: "running", reason: "", numbers: {}, notes: [], checks: {}, done: false };
  window.__hb = r;
  window.addEventListener("error", (e) => r.notes.push(`error: ${e.message} ${String((e.error as Error | undefined)?.stack ?? "").split("\n").slice(1, 4).join(" < ")}`));
  window.addEventListener("unhandledrejection", (e) => r.notes.push(`rejection: ${String((e as PromiseRejectionEvent).reason)}`));
  return r;
}

export function finish(r: CheckResult, status: CheckResult["status"], reason = ""): void {
  r.status = status;
  r.reason = reason;
  r.done = true;
}

export function check(r: CheckResult, id: string, st: "pass" | "fail" | "not run", reason = ""): void {
  r.checks[id] = { status: st, reason };
}

export function status(text: string, kind: Kind = "info"): void {
  const el = document.querySelector<HTMLElement>("#status");
  if (!el) return;
  el.textContent = text;
  el.dataset.kind = kind;
}

/** Writes label: value rows into #readout. */
export function readout(rows: Record<string, string | number>): void {
  const el = document.querySelector<HTMLElement>("#readout");
  if (!el) return;
  el.replaceChildren(
    ...Object.entries(rows).map(([k, v]) => {
      const d = document.createElement("div");
      const b = document.createElement("b");
      b.textContent = typeof v === "number" ? fmt(v) : v;
      d.append(`${k}: `, b);
      return d;
    }),
  );
}

export function fmt(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return String(v);
  return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(digits);
}

export function quantile(xs: number[], q: number): number {
  if (!xs.length) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? Number.NaN;
}

/** Frame interval and work time sampler over a sliding window. */
export class FrameTimer {
  private last = 0;
  readonly intervals: number[] = [];
  readonly work: number[] = [];
  constructor(private readonly keep = 600) {}
  /** call at the top of a frame with the rAF time */
  tick(now: number): void {
    if (this.last) this.intervals.push(now - this.last);
    this.last = now;
    if (this.intervals.length > this.keep) this.intervals.shift();
  }
  /** wraps the frame's own work */
  time<T>(fn: () => T): T {
    const t = performance.now();
    const v = fn();
    this.work.push(performance.now() - t);
    if (this.work.length > this.keep) this.work.shift();
    return v;
  }
  reset(): void {
    this.intervals.length = 0;
    this.work.length = 0;
    this.last = 0;
  }
  stats(): { frames: number; fpsP50: number; fpsP5: number; frameMsP50: number; frameMsP95: number; workMsP50: number; workMsP95: number } {
    const p50 = quantile(this.intervals, 0.5);
    const p95 = quantile(this.intervals, 0.95);
    return {
      frames: this.intervals.length,
      fpsP50: 1000 / p50,
      fpsP5: 1000 / p95,
      frameMsP50: p50,
      frameMsP95: p95,
      workMsP50: quantile(this.work, 0.5),
      workMsP95: quantile(this.work, 0.95),
    };
  }
  /** the stats as labelled numbers for the harness */
  numbers(prefix = ""): Record<string, number> {
    const s = this.stats();
    const r = (v: number) => Math.round(v * 100) / 100;
    return {
      [`${prefix}frames (measured)`]: s.frames,
      [`${prefix}fps p50 (measured)`]: r(s.fpsP50),
      [`${prefix}fps at frame p95 (measured)`]: r(s.fpsP5),
      [`${prefix}frame ms p95 (measured)`]: r(s.frameMsP95),
      [`${prefix}work ms p50 (measured)`]: r(s.workMsP50),
      [`${prefix}work ms p95 (measured)`]: r(s.workMsP95),
    };
  }
}

export interface GpuInfo {
  adapter: boolean;
  vendor: string;
  architecture: string;
  description: string;
  shaderF16: boolean;
  reason: string;
}

export async function gpuInfo(): Promise<GpuInfo> {
  const none = (reason: string): GpuInfo => ({ adapter: false, vendor: "", architecture: "", description: "", shaderF16: false, reason });
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return none(isSecureContext ? "this browser has no webgpu." : "webgpu needs https or localhost.");
  try {
    const a = (await gpu.requestAdapter()) as { info?: Record<string, string>; features: Set<string> } | null;
    if (!a) return none("no webgpu adapter.");
    return {
      adapter: true,
      vendor: a.info?.vendor ?? "",
      architecture: a.info?.architecture ?? "",
      description: a.info?.description ?? "",
      shaderF16: a.features.has("shader-f16"),
      reason: "",
    };
  } catch (e) {
    return none(`webgpu adapter request failed: ${(e as Error).message}`);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Resolves after n animation frames. */
export function frames(n: number): Promise<void> {
  return new Promise((res) => {
    let k = 0;
    const f = () => (++k >= n ? res() : requestAnimationFrame(f));
    requestAnimationFrame(f);
  });
}

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface WeightSource {
  /** what the file is, for messages */
  label: string;
  licence: string;
  /** lowercase hex, or "" when unknown */
  sha256: string;
}

/**
 * Fetches a weight file from a URL with progress, or reads a dropped File,
 * checks its SHA-256 when one is known, and states the licence.
 */
export async function loadWeight(
  from: string | File,
  src: WeightSource,
  onProgress: (loaded: number, total: number) => void = () => {},
): Promise<{ bytes: ArrayBuffer; sha256: string; ms: number }> {
  const t = performance.now();
  let bytes: ArrayBuffer;
  if (typeof from === "string") {
    const res = await fetch(from);
    if (!res.ok) throw new Error(`${src.label}: ${res.status} ${res.statusText} from ${from}`);
    const total = Number(res.headers.get("content-length") ?? 0);
    if (res.body) {
      const reader = res.body.getReader();
      const parts: Uint8Array[] = [];
      let loaded = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        loaded += value.byteLength;
        onProgress(loaded, total);
      }
      const out = new Uint8Array(loaded);
      let o = 0;
      for (const p of parts) {
        out.set(p, o);
        o += p.byteLength;
      }
      bytes = out.buffer;
    } else bytes = await res.arrayBuffer();
  } else bytes = await from.arrayBuffer();
  const sha256 = await sha256Hex(bytes);
  if (src.sha256 && sha256 !== src.sha256.toLowerCase()) {
    throw new Error(`${src.label}: sha-256 ${sha256.slice(0, 12)} does not match the known ${src.sha256.slice(0, 12)}. the file was not used.`);
  }
  return { bytes, sha256, ms: performance.now() - t };
}

/** Wires a drop zone and a file input to a callback. */
export function onDrop(zone: HTMLElement, cb: (files: File[]) => void, input?: HTMLInputElement): void {
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("over");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("over"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("over");
    const files = [...(e.dataTransfer?.files ?? [])];
    if (files.length) cb(files);
  });
  input?.addEventListener("change", () => {
    const files = [...(input.files ?? [])];
    if (files.length) cb(files);
  });
}

export function mb(bytes: number): string {
  return `${(bytes / 1e6).toFixed(1)} MB`;
}
