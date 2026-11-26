// Clip items for the strip: one shape for clips from a baked pack
// (@hackbuild/bake), from a retarget (@hackbuild/retarget) and from a body's
// own file. The adapters read structural types, so this entry needs neither
// wasm package; pass what bake and retarget hand back.
import { secondsWord } from "./words.js";

/** Where a clip came from: a baked pack, a retarget, the body's own file, or code. */
export type ClipFrom = "bake" | "retarget" | "body" | "code";

/** One clip as the strip shows it: id, name, length, loop, source, tags, warning and still. */
export interface ClipItem {
  id: string;
  name: string;
  /** Length in seconds. */
  seconds: number;
  loop: boolean;
  from: ClipFrom;
  /** Words for what the body does: walk, wave, nod. */
  tags?: string[];
  /** A problem a person should see before they pick it: "the loop jumps 14 degrees at the seam". */
  warn?: string;
  /** A thumbnail: an image URL or a PNG Blob. The strip draws one from `clip` when this is missing. */
  thumb?: string | Blob;
}

/** The strip's second line: "2.4 s, loops" or "walk, 2.4 s, loops". */
export function clipMeta(c: Pick<ClipItem, "seconds" | "loop" | "tags">): string {
  const tag = c.tags?.[0];
  return [tag, secondsWord(c.seconds), c.loop ? "loops" : "once"].filter(Boolean).join(", ");
}

/** What bake's decodePack returns, in the fields the strip reads. */
export interface PackLike {
  fps: number;
  clips: Record<string, { name: string; dur: number; n: number; loop: boolean }>;
}

/** What bake's bakeClips reports per clip, in the fields the strip reads. */
export interface PackReportLike {
  name: string;
  seamAngleDeg: number | null;
  seamOk: boolean | null;
  maxAngleErrorDeg: number;
}

/** Items from a clip pack, with the bake report's seam check as a warning. */
export function clipsFromPack(pack: PackLike, report: readonly PackReportLike[] = [], prefix = "pack"): ClipItem[] {
  const by = new Map(report.map((r) => [r.name, r]));
  return Object.values(pack.clips).map((c) => {
    const r = by.get(c.name);
    const item: ClipItem = { id: `${prefix}:${c.name}`, name: c.name, seconds: c.n > 1 ? (c.n - 1) / pack.fps : c.dur, loop: c.loop, from: "bake" };
    if (r && c.loop && r.seamOk === false && r.seamAngleDeg !== null) item.warn = `the loop jumps ${Math.round(r.seamAngleDeg)} degrees at the seam.`;
    else if (r && r.maxAngleErrorDeg > 2) item.warn = `packing moved a bone up to ${r.maxAngleErrorDeg.toFixed(1)} degrees.`;
    return item;
  });
}

/** What retarget's analyzeMotion returns, in the fields the strip reads. */
export interface FindingsLike {
  duration: number;
  looping: boolean;
  tags: readonly string[];
}

/** An item from a retargeted motion and its findings. */
export function clipFromFindings(id: string, name: string, f: FindingsLike): ClipItem {
  return { id, name, seconds: f.duration, loop: f.looping, from: "retarget", tags: [...f.tags] };
}

/** Items for the clips a loaded file carries, by name and length. */
export function clipsFromBody(clips: readonly { name: string; duration: number }[], prefix = "body"): ClipItem[] {
  return clips.map((c, i) => ({ id: `${prefix}:${i}`, name: c.name || `clip ${i + 1}`, seconds: c.duration, loop: /loop|idle|walk|run/i.test(c.name), from: "body" as const }));
}

/** The next id after `id` in the strip, wrapping, for a key or a play all. */
export function nextClip(items: readonly ClipItem[], id: string | null, step = 1): string | null {
  if (!items.length) return null;
  const i = items.findIndex((c) => c.id === id);
  const n = items.length;
  return items[(((i < 0 ? (step > 0 ? -1 : 0) : i) + step) % n + n) % n]!.id;
}
