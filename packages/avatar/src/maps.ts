// Color maps for materials whose own texture is missing. Model packs made
// for another tool often keep the texture assignment outside the model file,
// so a material arrives with no map, or a map that names a file the pack
// never shipped. Three sources of a replacement, in order:
// - the tile it sits on, for UDIM style meshes whose UVs spread over several
//   unit tiles with one image each (a material named "Torso" can sit on the
//   tile whose image is called something else);
// - an image named like the material;
// - an image a sibling material on the same mesh uses, taken only when its
//   painted area covers most of this material's UVs, so an untextured part
//   (nails, metal) is not painted with the skin beside it.
// With several candidates the image whose painted area covers the
// material's UVs best wins.
import type { Material, Mesh } from "three";

/** Slack for UVs that touch or barely cross a tile edge (vendor). */
const EDGE = 0.02;
/** Side of the copy an image is sampled from, pixels. */
export const SAMPLE_SIZE = 128;
/** Most triangle centers sampled per material. */
const MAX_SAMPLES = 512;
/** Color distance (sum over channels, 0 to 765) under which a pixel is background (vendor). */
const NEAR = 30;
/** Least coverage for a sibling's image to be taken (vendor). */
export const SIBLING_MIN = 0.6;

/** A material's share of a mesh: the UV tile it lies in and how many vertices use it. */
export interface TileGroup<M> {
  material: M;
  /** "u,v" of the unit cell the group's UVs lie in, or null when they span more than one. */
  tile: string | null;
  /** Vertex references in the group, to choose among several files. */
  weight: number;
}

const materialsOf = (mesh: Mesh): Material[] => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]);

function groupsOf(mesh: Mesh): { start: number; count: number; materialIndex?: number | undefined }[] {
  const g = mesh.geometry;
  const n = g.index ? g.index.count : (g.attributes.uv?.count ?? 0);
  return g.groups.length ? g.groups : [{ start: 0, count: n, materialIndex: 0 }];
}

/** Material groups of one mesh with the UV tile each lies in. */
export function tileGroups(mesh: Mesh): TileGroup<Material>[] {
  const g = mesh.geometry;
  const uv = g.attributes.uv;
  if (!uv) return [];
  const mats = materialsOf(mesh);
  const index = g.index;
  return groupsOf(mesh).flatMap((grp) => {
    const material = mats[grp.materialIndex ?? 0];
    if (!material || grp.count === 0) return [];
    const lo = [Infinity, Infinity];
    const hi = [-Infinity, -Infinity];
    for (let i = grp.start; i < grp.start + grp.count; i++) {
      const k = index ? index.getX(i) : i;
      const u = uv.getX(k);
      const v = uv.getY(k);
      lo[0] = Math.min(lo[0]!, u);
      hi[0] = Math.max(hi[0]!, u);
      lo[1] = Math.min(lo[1]!, v);
      hi[1] = Math.max(hi[1]!, v);
    }
    const cell = (c: number): number | null => (Math.floor(lo[c]! + EDGE) === Math.floor(hi[c]! - EDGE) ? Math.floor(lo[c]! + EDGE) : null);
    const cu = cell(0);
    const cv = cell(1);
    return [{ material, tile: cu === null || cv === null ? null : `${cu},${cv}`, weight: grp.count }];
  });
}

/**
 * The file each tiled group should show, given what its material matched by
 * name (null for none). Each file gets one owner tile where the claims allow
 * it; a material whose match belongs to another tile, or that matched
 * nothing, takes its own tile's file. Empty unless the groups cover two or
 * more tiles.
 */
export function resolveTiles<M>(groups: readonly TileGroup<M>[], matched: (m: M) => string | null): Map<M, string | null> {
  const out = new Map<M, string | null>();
  if (new Set(groups.map((g) => g.tile).filter((t) => t !== null)).size < 2) return out;
  const tiled = groups.filter((g): g is TileGroup<M> & { tile: string } => g.tile !== null);
  const claims = new Map<string, Set<string>>();
  for (const g of tiled) {
    const f = matched(g.material);
    if (f) claims.set(f, (claims.get(f) ?? new Set()).add(g.tile));
  }
  const owner = new Map<string, string>();
  const owns = (tile: string): boolean => [...owner.values()].includes(tile);
  // sole claims first, then files whose other claimants already own one
  for (let changed = true; changed; ) {
    changed = false;
    for (const [file, tiles] of claims) {
      if (owner.has(file)) continue;
      const free = [...tiles].filter((t) => !owns(t));
      const pick = tiles.size === 1 ? [...tiles][0] : free.length === 1 ? free[0] : undefined;
      if (pick !== undefined) {
        owner.set(file, pick);
        changed = true;
      }
    }
  }
  // a tile's own file is the one its heaviest material matched
  const tileFile = new Map<string, { file: string; weight: number }>();
  for (const g of tiled) {
    const f = matched(g.material);
    if (!f || owner.get(f) !== g.tile) continue;
    const cur = tileFile.get(g.tile);
    if (!cur || g.weight > cur.weight) tileFile.set(g.tile, { file: f, weight: g.weight });
  }
  for (const g of tiled) {
    const f = matched(g.material);
    const theirs = f !== null && owner.has(f) && owner.get(f) !== g.tile;
    out.set(g.material, f && !theirs ? f : (tileFile.get(g.tile)?.file ?? null));
  }
  return out;
}

const frac = (x: number): number => x - Math.floor(x);

/** UV centers of the material's triangles on `mesh`, wrapped to 0 to 1 (tiles and repeat wrapping sample one image). */
export function uvCenters(mesh: Mesh, material: Material): Float32Array {
  const g = mesh.geometry;
  const uv = g.attributes.uv;
  if (!uv) return new Float32Array(0);
  const mats = materialsOf(mesh);
  const index = g.index;
  const tris: number[] = [];
  for (const grp of groupsOf(mesh)) if (mats[grp.materialIndex ?? 0] === material) for (let i = grp.start; i + 2 < grp.start + grp.count; i += 3) tris.push(i);
  const step = Math.max(1, Math.floor(tris.length / MAX_SAMPLES));
  const out: number[] = [];
  for (let t = 0; t < tris.length; t += step) {
    let u = 0;
    let v = 0;
    for (let c = 0; c < 3; c++) {
      const k = index ? index.getX(tris[t]! + c) : tris[t]! + c;
      u += uv.getX(k);
      v += uv.getY(k);
    }
    out.push(frac(u / 3), frac(v / 3));
  }
  return Float32Array.from(out);
}

/** A small copy of an image and its background color (the commonest color along its border). */
export interface ImageSample {
  pixels: Uint8ClampedArray;
  size: number;
  background: [number, number, number];
}

/** An ImageSample from RGBA pixels of a `size` by `size` copy. */
export function samplePixels(pixels: Uint8ClampedArray, size = SAMPLE_SIZE): ImageSample {
  const counts = new Map<number, number>();
  for (let i = 0; i < size; i++) {
    for (const [x, y] of [[i, 0], [i, size - 1], [0, i], [size - 1, i]] as const) {
      const p = (y * size + x) * 4;
      const key = ((pixels[p]! >> 3) << 10) | ((pixels[p + 1]! >> 3) << 5) | (pixels[p + 2]! >> 3);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  let top = 0;
  let most = -1;
  for (const [k, n] of counts) if (n > most) [top, most] = [k, n];
  return { pixels, size, background: [((top >> 10) & 31) * 8 + 4, ((top >> 5) & 31) * 8 + 4, (top & 31) * 8 + 4] };
}

/**
 * Samples a loaded image. The resize to 128 px goes through
 * `createImageBitmap` where the page has it, which lets the browser decode
 * and scale away from the page's own work (inferred, browser dependent);
 * the read back uses an OffscreenCanvas. Null where neither exists or the
 * image cannot be drawn (decoded TGA data); such a candidate scores 0.
 */
export async function sampleImage(image: CanvasImageSource | ImageBitmapSource): Promise<ImageSample | null> {
  if (typeof OffscreenCanvas === "undefined") return null;
  try {
    const ctx = new OffscreenCanvas(SAMPLE_SIZE, SAMPLE_SIZE).getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    let src = image as CanvasImageSource;
    let bitmap: ImageBitmap | null = null;
    if (typeof createImageBitmap === "function") {
      bitmap = await createImageBitmap(image as ImageBitmapSource, { resizeWidth: SAMPLE_SIZE, resizeHeight: SAMPLE_SIZE, resizeQuality: "low" });
      src = bitmap;
    }
    ctx.drawImage(src, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    bitmap?.close();
    return samplePixels(ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data);
  } catch {
    return null;
  }
}

/** Share of UV centers on painted pixels. Textures are flipped on upload, so v = 0 is the bottom row. */
export function coverage(img: ImageSample, uvs: Float32Array): number {
  const n = uvs.length / 2;
  if (!n) return 0;
  const { size, pixels: px } = img;
  const [br, bg, bb] = img.background;
  let painted = 0;
  for (let i = 0; i < n; i++) {
    const x = Math.min(size - 1, Math.floor(uvs[i * 2]! * size));
    const y = Math.min(size - 1, Math.floor((1 - uvs[i * 2 + 1]!) * size));
    const p = (y * size + x) * 4;
    if (px[p + 3]! < 10) continue;
    if (Math.abs(px[p]! - br) + Math.abs(px[p + 1]! - bg) + Math.abs(px[p + 2]! - bb) > NEAR) painted++;
  }
  return painted / n;
}

/** The rule that picked a color map: UV tile, material name or coverage. */
export type MapVia = "tile" | "name" | "coverage";

/** The image file chosen for a material and the rule that chose it. */
export interface PickedMap {
  file: string;
  via: MapVia;
}

/** Where `pickMap` looks for a material's color map: its own map, a file named like it, and image samples. */
export interface MapSources {
  /** The file a material's own map came from, or null when it has none. */
  own(m: Material): string | null;
  /** The file named like a material, or null. */
  byName(name: string): string | null;
  /** A sample of a file's image, or null when it cannot be read. */
  sample(file: string): Promise<ImageSample | null>;
}

const unique = (files: (string | null | undefined)[]): string[] => [...new Set(files.filter((f): f is string => !!f))];

function concat(parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const yieldTurn = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/**
 * A color map for every material on `meshes` with no own map: its tile's
 * file, then its name match, then a sibling's image at coverage 0.6 or
 * more. Several candidates are scored by coverage, one image at a time with
 * a yield between images. A material with no candidate maps to null.
 */
export async function pickMaps(meshes: readonly Mesh[], src: MapSources): Promise<Map<Material, PickedMap | null>> {
  const tiled = new Map<Material, string | null>();
  const meshesOf = new Map<Material, Mesh[]>();
  const byName = (m: Material): string | null => (src.own(m) ? null : src.byName(m.name));
  for (const mesh of meshes) {
    for (const m of materialsOf(mesh)) meshesOf.set(m, [...(meshesOf.get(m) ?? []), mesh]);
    for (const [m, file] of resolveTiles(tileGroups(mesh), byName)) if (!src.own(m) && !tiled.has(m)) tiled.set(m, file);
  }
  const out = new Map<Material, PickedMap | null>();
  for (const [mat, ms] of meshesOf) {
    if (src.own(mat)) continue;
    const tile = tiled.get(mat) ?? null;
    const named = src.byName(mat.name);
    const claimed = unique([tile, named]);
    const siblings = ms.flatMap((mesh) => materialsOf(mesh).filter((m) => m !== mat).map((m) => src.own(m) ?? src.byName(m.name)));
    const candidates = unique([...claimed, ...siblings]);
    const via = (f: string): MapVia => (f === tile ? "tile" : "name");
    if (candidates.length === claimed.length && claimed.length < 2) {
      out.set(mat, claimed[0] ? { file: claimed[0], via: via(claimed[0]) } : null);
      continue;
    }
    const uvs = concat(ms.map((mesh) => uvCenters(mesh, mat)));
    let best: string | null = null;
    let top = -1;
    for (const file of candidates) {
      const img = await src.sample(file);
      await yieldTurn();
      const score = img ? coverage(img, uvs) : 0;
      if (!claimed.includes(file) && score < SIBLING_MIN) continue;
      if (score > top) [top, best] = [score, file];
    }
    out.set(mat, best ? { file: best, via: claimed.length === 1 && best === claimed[0] ? via(best) : "coverage" } : null);
  }
  return out;
}
