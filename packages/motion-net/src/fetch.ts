// Weight loading: a URL, an ArrayBuffer or a File. One buffer sized from
// content-length when the server sends it, so the file is held once; an
// optional Cache Storage copy; a SHA-256 check when the caller knows the
// hash; the weight licence stated on first load.
import type { WeightLicence } from "./manifest.js";

export type WeightSource = string | URL | ArrayBuffer | ArrayBufferView | Blob;

export interface FetchOptions {
  /** Hex SHA-256 the bytes must match. */
  sha256?: string;
  /** Cache Storage name; the file is stored there after a verified download. */
  cache?: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const d = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function readBody(res: Response, onProgress?: (f: number) => void): Promise<ArrayBuffer> {
  const total = Number(res.headers.get("content-length")) || 0;
  if (!res.body || !total) {
    const b = await res.arrayBuffer();
    onProgress?.(1);
    return b;
  }
  const out = new Uint8Array(total);
  const reader = res.body.getReader();
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (got + value.length > total) throw new Error("motion-net: the server sent more bytes than content-length");
    out.set(value, got);
    got += value.length;
    onProgress?.(got / total);
  }
  return got === total ? out.buffer : out.slice(0, got).buffer;
}

/** Fetches, verifies and optionally caches a weight file. */
export async function fetchVerified(url: string | URL, opts: FetchOptions = {}): Promise<ArrayBuffer> {
  const key = String(url);
  const caches = (globalThis as { caches?: CacheStorage }).caches;
  if (opts.cache && caches) {
    const hit = await (await caches.open(opts.cache)).match(key);
    if (hit) {
      const b = await hit.arrayBuffer();
      if (!opts.sha256 || (await sha256Hex(b)) === opts.sha256.toLowerCase()) {
        opts.onProgress?.(1);
        return b;
      }
    }
  }
  const init: RequestInit = {};
  if (opts.signal) init.signal = opts.signal;
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`motion-net: weight download failed with status ${res.status}`);
  const bytes = await readBody(res, opts.onProgress);
  if (opts.sha256) {
    const got = await sha256Hex(bytes);
    if (got !== opts.sha256.toLowerCase()) throw new Error(`motion-net: sha-256 mismatch, expected ${opts.sha256}, got ${got}`);
  }
  if (opts.cache && caches) await (await caches.open(opts.cache)).put(key, new Response(bytes.slice(0)));
  return bytes;
}

/** Any weight source to bytes. */
export async function readWeights(source: WeightSource, opts: FetchOptions = {}): Promise<ArrayBuffer> {
  if (source instanceof ArrayBuffer) return verify(source, opts);
  if (ArrayBuffer.isView(source)) return verify(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength) as ArrayBuffer, opts);
  if (typeof Blob !== "undefined" && source instanceof Blob) return verify(await source.arrayBuffer(), opts);
  return fetchVerified(source as string | URL, opts);
}

async function verify(bytes: ArrayBuffer, opts: FetchOptions): Promise<ArrayBuffer> {
  if (opts.sha256) {
    const got = await sha256Hex(bytes);
    if (got !== opts.sha256.toLowerCase()) throw new Error(`motion-net: sha-256 mismatch, expected ${opts.sha256}, got ${got}`);
  }
  return bytes;
}

const stated = new Set<string>();

/** The licence line for a set of weights. */
export function licenceNotice(l: WeightLicence): string {
  return `${l.name}: weights licensed ${l.licence}. ${l.credit}`;
}

/**
 * States the weight licence once per weight name. The default sink is
 * console.info; pass one to show it in a page.
 */
export function stateLicence(l: WeightLicence, sink: (line: string) => void = (s) => console.info(s)): void {
  if (stated.has(l.name)) return;
  stated.add(l.name);
  sink(licenceNotice(l));
}
