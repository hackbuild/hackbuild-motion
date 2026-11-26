// The face driver: one owner for every expression weight a body shows.
// Moods ease toward their targets instead of snapping; a quiet face rests
// at a slight smile so it never reads as blank or cross; the lid value comes
// from Blink or the gaze controller; mouth shapes come from @hackbuild/lipsync
// through `mouth`; a playing clip's face track shows at the larger of its
// weight and the mood's and lets go when the clip ends. The face keeps its
// own weights, so the sink (the avatar's ExpressionRig or a three-vrm
// expression manager) needs no read call.

/** What the face writes to: a preset or morph name and a weight. */
export interface ExpressionSink {
  setValue(name: string, weight: number): void;
}

/** The weights a quiet face rests at (vendor). */
export const RESTING_FACE: Readonly<Record<string, number>> = { happy: 0.25, relaxed: 0.3 };

/** Easing rate, resting weights and lid channel name of a face. */
export interface FaceOptions {
  /** Easing rate per second: a mood reaches 1 - 1/e (0.63) of its target in 1/rate s. Default 8 (vendor). */
  rate?: number;
  /** Weights with no mood set. Default RESTING_FACE; pass {} for a neutral face. */
  resting?: Readonly<Record<string, number>>;
  /** Name of the lid channel. Default "blink". */
  lid?: string;
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** The face driver: eases moods toward their targets, rests at a slight smile, and writes lid, mouth and clip face weights to one expression sink. */
export class Face {
  /** Mouth shapes from speech for this frame; call lipsync's `drive` on it before `update`. */
  readonly mouth: ExpressionSink;
  private readonly rate: number;
  private readonly lidName: string;
  private resting: Readonly<Record<string, number>>;
  private mood: { name: string; weight: number } | null = null;
  private readonly target = new Map<string, number>();
  private readonly current = new Map<string, number>();
  private readonly mouthW = new Map<string, number>();
  private readonly written = new Map<string, number>();
  private clipped = new Set<string>();
  private spoken = new Set<string>();
  private lidW = 0;
  private blinkOn = true;

  constructor(
    private readonly sink: ExpressionSink,
    opts: FaceOptions = {},
  ) {
    this.rate = opts.rate ?? 8;
    this.lidName = opts.lid ?? "blink";
    this.resting = opts.resting ?? RESTING_FACE;
    this.mouth = { setValue: (name, w) => void this.mouthW.set(name, clamp01(w)) };
    this.retarget();
  }

  /** Holds one mood at `weight`; null hands the face back to the resting weights. */
  set(name: string | null, weight = 1): void {
    this.mood = name ? { name, weight: clamp01(weight) } : null;
    this.retarget();
  }

  /** The weights a quiet face rests at. */
  setResting(weights: Readonly<Record<string, number>>): void {
    this.resting = weights;
    this.retarget();
  }

  /** The lid weight for this frame, 0 open to 1 closed (from Blink or the gaze controller). */
  lid(weight: number): void {
    this.lidW = clamp01(weight);
  }

  /** Blinking on or off; turning it off mid blink writes the lid open at once. */
  set blink(on: boolean) {
    this.blinkOn = on;
    if (!on) {
      this.lidW = 0;
      this.write(this.lidName, 0);
    }
  }

  get blink(): boolean {
    return this.blinkOn;
  }

  /** The weight last written for a name. */
  value(name: string): number {
    return this.written.get(name) ?? 0;
  }

  /** True while a mood is still easing toward its target. */
  settling(): boolean {
    for (const [name, t] of this.target) if (Math.abs((this.current.get(name) ?? 0) - t) > 1e-3) return true;
    return false;
  }

  /**
   * One frame: eases moods, then writes every channel once. Mouth shapes
   * from speech win their channels; other channels show the larger of the
   * clip weight (`clipFaces`, this frame) and the mood; a channel the clip
   * let go of returns to the mood.
   */
  update(dt: number, clipFaces?: ReadonlyMap<string, number>): void {
    const k = 1 - Math.exp(-this.rate * Math.max(0, dt));
    for (const [name, t] of this.target) {
      const c = this.current.get(name) ?? 0;
      this.current.set(name, c + (t - c) * k);
    }
    const names = new Set<string>([...this.current.keys(), ...this.clipped, ...this.spoken, ...this.mouthW.keys()]);
    if (clipFaces) for (const n of clipFaces.keys()) names.add(n);
    names.delete(this.lidName);
    for (const name of names) {
      const speech = this.mouthW.get(name) ?? 0;
      const v = speech > 0 ? speech : Math.max(clipFaces?.get(name) ?? 0, this.current.get(name) ?? 0);
      this.write(name, v);
    }
    this.write(this.lidName, this.blinkOn ? Math.max(this.lidW, clipFaces?.get(this.lidName) ?? 0) : 0);
    this.clipped = new Set(clipFaces ? clipFaces.keys() : []);
    // speech writes its shapes every frame it runs; what it stopped writing is released next frame
    this.spoken = new Set(this.mouthW.keys());
    this.mouthW.clear();
    // moods at rest that reached 0 drop out of the frame
    for (const [name, t] of this.target) if (t === 0 && (this.current.get(name) ?? 0) < 1e-4) {
      this.target.delete(name);
      this.current.delete(name);
    }
  }

  private write(name: string, w: number): void {
    const v = clamp01(w);
    this.written.set(name, v);
    this.sink.setValue(name, v);
  }

  private retarget(): void {
    for (const name of this.target.keys()) this.target.set(name, 0);
    if (this.mood) this.target.set(this.mood.name, this.mood.weight);
    else for (const [name, w] of Object.entries(this.resting)) this.target.set(name, clamp01(w));
  }
}
