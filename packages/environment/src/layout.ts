// How a scene is put together, and the plain math behind its light. The
// character stands at the origin facing +Z, where the camera starts; a
// layout arranges its set around that spot. Colors here are scene data
// (light, ground and fog tints), not interface colors. No three.js.

export interface LayoutItem {
  /** Kit model path as the caller's resolver knows it, e.g. "kenney-furniture/wall.glb". */
  model: string;
  /** Kit units. */
  at: [number, number, number];
  /** Degrees about +Y. */
  rot?: number;
  scale?: number;
  /** Repeats the item on a grid, one kit unit apart along +X and +Z. */
  grid?: [number, number];
}

export interface EnvironmentLayout {
  /** Kit units to meters, for every item. */
  scale: number;
  /**
   * Degrees around the character the key light comes from: 0 from the
   * camera, positive toward the camera's right. An HDRI is turned so its
   * brightest point sits behind the key light.
   */
  keyAzimuth: number;
  keyElevation: number;
  key: { intensity: number; color: string };
  rim: { intensity: number; color: string };
  /**
   * The light probe, the soft fill toon materials read, at an average
   * radiance of `intensity`; `saturation` 0 to 1 pulls tinted rooms toward
   * grey so skin stays skin.
   */
  probe: { intensity: number; saturation: number };
  /** How much image light reaches standard materials, relative to the HDRI's average. */
  envIntensity: number;
  /** Neutral tone mapping exposure. */
  exposure: number;
  /** The HDRI as backdrop (blurred), or a flat color. */
  backdrop: { blur: number; intensity: number } | { color: string };
  /** A disk under everything for open scenes; takes the character's shadow. */
  ground?: { radius: number; color: string };
  fog?: { color: string; near: number; far: number };
  items: LayoutItem[];
}

export interface HdriRef {
  /** Path as the caller's resolver knows it. */
  file: string;
  /** Licence of the image, shown beside the control that fetches it. */
  licence: string;
  /** Where it comes from, for the credit line. */
  source: string;
}

export interface EnvironmentPreset {
  id: string;
  label: string;
  layout: EnvironmentLayout;
  /** Null lights from the three.js room environment (MIT, in code). */
  hdri: HdriRef | null;
  /** Licence of the kit models the layout uses, or null when it uses none. */
  kitLicence: string | null;
}

/** Every file a preset needs from the caller: the HDRI, then each kit model once. */
export function needsOf(preset: Pick<EnvironmentPreset, "layout" | "hdri">): string[] {
  return [...new Set([...(preset.hdri ? [preset.hdri.file] : []), ...preset.layout.items.map((i) => i.model)])];
}

/** The files of `needsOf` that `have` does not know; empty means the preset can load. */
export function missingFor(preset: Pick<EnvironmentPreset, "layout" | "hdri">, have: (file: string) => boolean): string[] {
  return needsOf(preset).filter((f) => !have(f));
}

/** An Error for a file the resolver could not give; `file` carries the path. */
export class MissingFileError extends Error {
  constructor(readonly file: string) {
    super(`environment: could not load ${file}. drop the file or pick the studio.`);
    this.name = "MissingFileError";
  }
}

const RAD = Math.PI / 180;

/** Unit vector for degrees around the character (0 toward the camera, positive to its right) and above the floor. */
export function direction(azimuthDeg: number, elevationDeg: number): [number, number, number] {
  const a = azimuthDeg * RAD;
  const e = elevationDeg * RAD;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)];
}

/** Azimuth, radians as atan2(x, z), of the direction three.js maps to equirect column `u` (0 to 1). */
export function azimuthOfU(u: number): number {
  // three's equirect lookup: u = atan2(dir.z, dir.x) / 2pi + 0.5
  const theta = (u - 0.5) * Math.PI * 2;
  return Math.atan2(Math.cos(theta), Math.sin(theta));
}

/**
 * Azimuth (radians, atan2(x, z)) of the brightest spot above the horizon of
 * an equirect image in linear RGB(A) floats. A five tap blur keeps a lone
 * hot pixel from winning over a whole window.
 */
export function brightestAzimuth(data: ArrayLike<number>, width: number, height: number, channels = 4): number {
  const step = Math.max(1, Math.floor(width / 256));
  let best = -1;
  let bestU = 0.5;
  for (let y = step; y < height / 2; y += step) {
    for (let x = 0; x < width; x += step) {
      let sum = 0;
      for (const [dx, dy] of [[0, 0], [step, 0], [-step, 0], [0, step], [0, -step]] as const) {
        const i = ((y + dy) * width + ((x + dx + width) % width)) * channels;
        sum += 0.2126 * (data[i] ?? 0) + 0.7152 * (data[i + 1] ?? 0) + 0.0722 * (data[i + 2] ?? 0);
      }
      if (sum > best) {
        best = sum;
        bestU = (x + 0.5) / width;
      }
    }
  }
  return azimuthOfU(bestU);
}

/** Y00 of the real spherical harmonics, 1 / (2 sqrt(pi)) (computed). */
const Y00 = 0.282095;

/**
 * Scales nine spherical harmonic RGB coefficients in place to an average
 * radiance of 1 and pulls each toward its luminance by `saturation` (1
 * keeps the color). HDRIs differ in exposure by orders of magnitude; the
 * returned mean (the original average) lets the caller scale image light
 * the same way.
 */
export function normalizeProbe(coefficients: [number, number, number][], saturation: number): number {
  const c0 = coefficients[0];
  if (!c0) return 1;
  const lum = (c: [number, number, number]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const mean = Math.max(lum(c0) * Y00, 1e-4);
  for (const c of coefficients) {
    const l = lum(c);
    for (let k = 0; k < 3; k++) c[k] = (l + (c[k]! - l) * saturation) / mean;
  }
  return mean;
}

/** Average radiance of a probe from its first coefficient. */
export const probeMean = (c0: [number, number, number]): number => (0.2126 * c0[0] + 0.7152 * c0[1] + 0.0722 * c0[2]) * Y00;
