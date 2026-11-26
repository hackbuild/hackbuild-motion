// Layered clip player on flat arrays. One owner writes every bone each
// frame: a base layer (idle loop blended with speed matched locomotion), a
// body layer for one shots and loops, and an upper body layer masked to a
// bone set. Loops whose ends differ blend their last seconds into the start
// (the loop seam); a finished one shot fades back to the base (idle
// handback). Bones are indices into the caller's bone list; rotations are
// local quaternions x y z w.
import { minimumJerk, spring, springState } from "@hackbuild/organic";
import { quatAngle, quatPitch, slerpInto } from "./quat.js";

/** A clip on flat arrays: local bone rotations per frame, an optional root track and optional face tracks. */
export interface Clip {
  name: string;
  fps: number;
  frames: number;
  bones: number;
  loop: boolean;
  /** frames * bones * 4 local rotations. */
  rotations: Float32Array;
  /** frames * 3 root (hips) positions, optional. */
  root?: Float32Array;
  /** Expression tracks, one weight per frame each, handed to the face rather than written to bones. */
  faces?: ClipFace[];
}

/** One expression track of a clip, a weight per frame. */
export interface ClipFace {
  /** Expression or morph name. */
  name: string;
  /** frames weights, 0 to 1. */
  weights: Float32Array;
}

/** A face track's weight at time `t` seconds, linear between frames, clamped to the ends. */
export function sampleFace(c: Clip, face: ClipFace, t: number): number {
  const n = Math.min(c.frames, face.weights.length);
  if (n === 0) return 0;
  const f = Math.max(0, Math.min(n - 1, t * c.fps));
  const i = Math.floor(f);
  const a = face.weights[i]!;
  const b = face.weights[Math.min(n - 1, i + 1)]!;
  return a + (b - a) * (f - i);
}

/** A pose on flat arrays: local rotations per bone, x y z w, and the root position. */
export interface Pose {
  rotations: Float32Array;
  root: Float32Array;
}

/** Length of a clip in seconds, from its frame count and rate. */
export const clipDuration = (c: Clip): number => Math.max(0, c.frames - 1) / c.fps;

/** A pose of the given bone count with every rotation at identity and the root at the origin. */
export function createPose(bones: number): Pose {
  const rotations = new Float32Array(bones * 4);
  for (let i = 0; i < bones; i++) rotations[i * 4 + 3] = 1;
  return { rotations, root: new Float32Array(3) };
}

/** Copies the rotations and root of one pose into another of the same size. */
export function copyPose(from: Pose, to: Pose): void {
  to.rotations.set(from.rotations);
  to.root.set(from.root);
}

/** Largest bone rotation difference between the first and last frame, degrees. */
export function seamDegrees(c: Clip): number {
  const last = (c.frames - 1) * c.bones * 4;
  let worst = 0;
  for (let b = 0; b < c.bones; b++) worst = Math.max(worst, quatAngle(c.rotations, b * 4, c.rotations, last + b * 4));
  return (worst * 180) / Math.PI;
}

/** Samples a clip at clip time `t` (clamped), slerping between frames. */
export function sampleClip(c: Clip, t: number, out: Pose, mask?: Uint8Array): void {
  const f = Math.min(Math.max(t * c.fps, 0), c.frames - 1);
  const i0 = Math.floor(f);
  const i1 = Math.min(i0 + 1, c.frames - 1);
  const u = f - i0;
  const n = c.bones * 4;
  for (let b = 0; b < c.bones; b++) {
    if (mask && !mask[b]) continue;
    slerpInto(c.rotations, i0 * n + b * 4, c.rotations, i1 * n + b * 4, u, out.rotations, b * 4);
  }
  if (c.root) for (let k = 0; k < 3; k++) out.root[k] = c.root[i0 * 3 + k]! * (1 - u) + c.root[i1 * 3 + k]! * u;
}

/** When a loop seam gets a blend, and how many seconds are blended. */
export interface SeamOptions {
  /** Seams wider than this (degrees) get the blend. Default 2. */
  thresholdDeg?: number;
  /** Seconds blended at the end. Default 0.4. */
  blend?: number;
}

/** How a loop wraps: the blend window and the time it restarts from. */
export interface LoopPlan {
  blend: number;
  restart: number;
  seamDeg: number;
}

/** How a loop wraps: the seam width in degrees, the blend window and the restart time. */
export function planLoop(c: Clip, opts: SeamOptions = {}): LoopPlan {
  const seamDeg = seamDegrees(c);
  const d = clipDuration(c);
  const w = Math.min(opts.blend ?? 0.4, d / 3);
  if (seamDeg <= (opts.thresholdDeg ?? 2) || w <= 0) return { blend: 0, restart: 0, seamDeg };
  return { blend: w, restart: w, seamDeg };
}

const scratch = new Map<number, Pose>();
function scratchPose(bones: number, slot: number): Pose {
  const key = bones * 8 + slot;
  let p = scratch.get(key);
  if (!p) {
    p = createPose(bones);
    scratch.set(key, p);
  }
  return p;
}

/**
 * Samples a loop at play time `t` (seconds since it started). With a seam
 * blend the last `blend` seconds slerp toward the frames at the start of
 * the clip, and every cycle after the first restarts at `blend`, where the
 * blended end lands, so the wrap has no jump.
 */
export function sampleLoop(c: Clip, plan: LoopPlan, t: number, out: Pose, mask?: Uint8Array): void {
  const d = clipDuration(c);
  if (d <= 0) return sampleClip(c, 0, out, mask);
  let ct: number;
  if (t < d) ct = t;
  else {
    const span = d - plan.restart;
    ct = plan.restart + ((((t - d) % span) + span) % span);
  }
  sampleClip(c, ct, out, mask);
  if (plan.blend > 0 && ct > d - plan.blend) {
    const u = (ct - (d - plan.blend)) / plan.blend;
    const head = scratchPose(c.bones, 0);
    // start from this frame's output, so a field the clip does not write
    // (a root on a clip with no root track) blends with itself, never with
    // what an earlier clip left in the shared scratch pose
    copyPose(out, head);
    sampleClip(c, ct - (d - plan.blend), head, mask);
    blendPose(out, head, minimumJerk(u), out, mask);
  }
}

/** out = slerp(a, b, w) per bone, root lerped. `out` may alias `a`. */
export function blendPose(a: Pose, b: Pose, w: number, out: Pose, mask?: Uint8Array): void {
  if (w <= 0) {
    if (out !== a) copyPose(a, out);
    return;
  }
  const n = a.rotations.length / 4;
  for (let i = 0; i < n; i++) {
    if (mask && !mask[i]) continue;
    slerpInto(a.rotations, i * 4, b.rotations, i * 4, Math.min(1, w), out.rotations, i * 4);
  }
  if (!mask) for (let k = 0; k < 3; k++) out.root[k] = a.root[k]! + (b.root[k]! - a.root[k]!) * Math.min(1, w);
}

/** A clip player layer: the whole body, or the masked upper body. */
export type Layer = "body" | "upper";

/** Layer, loop, fade, hold, speed and queue policy of one play call. */
export interface PlayOptions {
  layer?: Layer;
  /** Loop the clip; defaults to the clip's own flag. */
  loop?: boolean;
  /** Fade time in seconds, 0.08 to 0.15 s reads as a natural transition. Default 0.12. */
  fade?: number;
  /** Seconds to hold the last frame of a one shot before handing back. Infinity holds until release. */
  hold?: number;
  /** Seconds to keep a loop running before handing back. */
  loopFor?: number;
  /** A loop marked background waits for a running one shot instead of cutting it. */
  background?: boolean;
  /** replace fades out what the layer plays; queue waits for it to finish. Default replace. */
  policy?: "replace" | "queue";
  speed?: number;
}

/** A clip player event: a clip started, ended, or handed back to the base layer. */
export interface PlayerEvent {
  type: "started" | "ended" | "handback";
  layer: Layer;
  ticket: number;
  name: string;
}

interface Track {
  ticket: number;
  clip: Clip;
  plan: LoopPlan;
  loop: boolean;
  t: number;
  speed: number;
  fade: number;
  hold: number;
  loopFor: number;
  w: number;
  from: number;
  target: number;
  fadeT: number;
  pose: Pose;
  started: boolean;
}

/** A locomotion loop and the speed it was recorded at, in meters per second. */
export interface LocomotionEntry {
  clip: Clip;
  /** Speed the clip was recorded at, m/s. */
  speed: number;
}

/** The idle clip, locomotion loops by speed, the upper body bone set and seam options of a clip player. */
export interface ClipPlayerOptions {
  idle: Clip;
  /** Locomotion loops by recorded speed; blended by speed with a shared phase. */
  locomotion?: LocomotionEntry[];
  /** Bone indices the upper layer writes. */
  upperBones?: readonly number[];
  seam?: SeamOptions;
}

/** Layered clip player that writes every bone each frame: a base of idle and speed matched locomotion, a body layer and a masked upper body layer, with loop seams and idle handback. */
export class ClipPlayer {
  readonly pose: Pose;
  /** This frame's expression weights from the clips' face tracks, each weighted by its layer weight; read after `update`. */
  readonly faces = new Map<string, number>();
  /** Events from the last update. */
  events: PlayerEvent[] = [];
  readonly bones: number;
  private readonly idle: Clip;
  private readonly idlePlan: LoopPlan;
  private readonly loco: (LocomotionEntry & { plan: LoopPlan })[];
  private readonly upperMask: Uint8Array;
  private readonly seam: SeamOptions;
  private readonly plans = new WeakMap<Clip, LoopPlan>();
  private idleT = 0;
  private phase = 0;
  private speed = 0;
  private readonly speedS = springState();
  private readonly layers: Record<Layer, Track[]> = { body: [], upper: [] };
  private readonly queues: Record<Layer, { clip: Clip; opts: PlayOptions; ticket: number }[]> = { body: [], upper: [] };
  private readonly busy: Record<Layer, boolean> = { body: false, upper: false };
  private ticket = 0;
  private readonly basePose: Pose;
  private readonly locoA: Pose;
  private readonly locoB: Pose;

  constructor(opts: ClipPlayerOptions) {
    this.bones = opts.idle.bones;
    this.idle = opts.idle;
    this.seam = opts.seam ?? {};
    this.idlePlan = planLoop(opts.idle, this.seam);
    this.loco = (opts.locomotion ?? []).map((e) => ({ ...e, plan: planLoop(e.clip, this.seam) })).sort((a, b) => a.speed - b.speed);
    this.upperMask = new Uint8Array(this.bones);
    for (const b of opts.upperBones ?? []) if (b >= 0 && b < this.bones) this.upperMask[b] = 1;
    this.pose = createPose(this.bones);
    this.basePose = createPose(this.bones);
    this.locoA = createPose(this.bones);
    this.locoB = createPose(this.bones);
  }

  /** The loop plan the player uses for a clip (seam width and restart). */
  loopPlan(c: Clip): LoopPlan {
    let p = this.plans.get(c);
    if (!p) {
      p = planLoop(c, this.seam);
      this.plans.set(c, p);
    }
    return p;
  }

  /** Ground speed in m/s that the base layer matches. */
  setLocomotion(speed: number): void {
    this.speed = Math.max(0, speed);
  }

  /** Starts a clip on a layer. Returns a ticket; a later play on the same layer replaces or queues it. */
  play(clip: Clip, opts: PlayOptions = {}): number {
    const layer = opts.layer ?? "body";
    const ticket = ++this.ticket;
    const tracks = this.layers[layer];
    const live = tracks.find((t) => t.target === 1);
    const loop = opts.loop ?? clip.loop;
    const waits = live && (opts.policy === "queue" || (opts.background && loop && !live.loop));
    if (waits) this.queues[layer].push({ clip, opts, ticket });
    else this.start(layer, clip, opts, ticket);
    return ticket;
  }

  /** Releases a held pose or a running loop on a layer: it fades back. */
  release(layer: Layer = "body", fade?: number): void {
    for (const t of this.layers[layer]) if (t.target === 1) this.fadeOut(t, fade ?? t.fade);
  }

  /** Drops everything on a layer, queued plays too. */
  stop(layer: Layer = "body", fade?: number): void {
    this.queues[layer] = [];
    this.release(layer, fade);
  }

  /** Weight of the body layer over the base, 0 when the idle has the body. */
  layerWeight(layer: Layer = "body"): number {
    let rest = 1;
    for (const t of this.layers[layer]) rest *= 1 - t.w;
    return 1 - rest;
  }

  private start(layer: Layer, clip: Clip, opts: PlayOptions, ticket: number): void {
    const fade = opts.fade ?? 0.12;
    for (const t of this.layers[layer]) if (t.target === 1) this.fadeOut(t, fade);
    const loop = opts.loop ?? clip.loop;
    this.layers[layer].push({
      ticket,
      clip,
      plan: loop ? this.loopPlan(clip) : { blend: 0, restart: 0, seamDeg: 0 },
      loop,
      t: 0,
      speed: opts.speed ?? 1,
      fade,
      hold: opts.hold ?? 0,
      loopFor: opts.loopFor ?? Infinity,
      w: 0,
      from: 0,
      target: 1,
      fadeT: 0,
      pose: createPose(this.bones),
      started: false,
    });
    this.busy[layer] = true;
  }

  private fadeOut(t: Track, fade: number): void {
    if (t.target === 0) return;
    t.from = t.w;
    t.target = 0;
    t.fadeT = 0;
    t.fade = Math.max(fade, 1e-3);
  }

  update(dt: number): Pose {
    this.events = [];
    this.updateBase(dt);
    for (const layer of ["body", "upper"] as const) this.updateLayer(layer, dt);
    copyPose(this.basePose, this.pose);
    for (const layer of ["body", "upper"] as const) {
      const mask = layer === "upper" ? this.upperMask : undefined;
      for (const t of this.layers[layer]) blendPose(this.pose, t.pose, t.w, this.pose, mask);
    }
    this.updateFaces();
    return this.pose;
  }

  private updateFaces(): void {
    this.faces.clear();
    const add = (c: Clip, t: number, w: number) => {
      if (!c.faces || w <= 0) return;
      for (const f of c.faces) this.faces.set(f.name, Math.max(this.faces.get(f.name) ?? 0, sampleFace(c, f, t) * w));
    };
    const idleD = clipDuration(this.idle);
    add(this.idle, idleD > 0 ? this.idleT % idleD : 0, 1 - this.layerWeight("body"));
    for (const layer of ["body", "upper"] as const)
      for (const t of this.layers[layer]) {
        const d = clipDuration(t.clip);
        add(t.clip, t.loop && d > 0 ? t.t % d : Math.min(t.t, d), t.w);
      }
  }

  private updateBase(dt: number): void {
    this.idleT += dt;
    sampleLoop(this.idle, this.idlePlan, this.idleT, this.basePose);
    if (this.loco.length === 0) return;
    const v = spring(this.speedS, this.speed, 0.25, dt);
    const first = this.loco[0]!;
    const wLoco = minimumJerk(v / Math.max(first.speed, 1e-3));
    let i = 0;
    while (i < this.loco.length - 2 && v > this.loco[i + 1]!.speed) i++;
    const a = this.loco[i]!;
    const b = this.loco[Math.min(i + 1, this.loco.length - 1)]!;
    const f = b === a ? 0 : Math.min(1, Math.max(0, (v - a.speed) / (b.speed - a.speed)));
    // a shared normalized phase, advanced at the blended cycle rate (cadence matching)
    const da = clipDuration(a.clip);
    const db = clipDuration(b.clip);
    const cycle = da + (db - da) * f;
    if (cycle > 0) this.phase = (this.phase + dt / cycle) % 1;
    if (wLoco <= 0) return;
    sampleLoop(a.clip, { blend: 0, restart: 0, seamDeg: 0 }, this.phase * da, this.locoA);
    if (f > 0) {
      sampleLoop(b.clip, { blend: 0, restart: 0, seamDeg: 0 }, this.phase * db, this.locoB);
      blendPose(this.locoA, this.locoB, f, this.locoA);
    }
    blendPose(this.basePose, this.locoA, wLoco, this.basePose);
  }

  private updateLayer(layer: Layer, dt: number): void {
    const tracks = this.layers[layer];
    const mask = layer === "upper" ? this.upperMask : undefined;
    for (const t of tracks) {
      if (!t.started) {
        t.started = true;
        this.events.push({ type: "started", layer, ticket: t.ticket, name: t.clip.name });
      }
      t.t += dt * t.speed;
      const d = clipDuration(t.clip);
      if (t.target === 1) {
        // one shot: begin the fade so it completes as the clip (and any hold) ends
        if (!t.loop && t.hold !== Infinity && t.t >= d + t.hold - t.fade) this.fadeOut(t, t.fade);
        if (t.loop && t.t >= t.loopFor) this.fadeOut(t, t.fade);
      }
      t.fadeT += dt;
      const u = Math.min(1, t.fadeT / t.fade);
      t.w = t.from + (t.target - t.from) * minimumJerk(u);
      if (t.loop) sampleLoop(t.clip, t.plan, t.t, t.pose, mask);
      else sampleClip(t.clip, Math.min(t.t, d), t.pose, mask);
    }
    // queued plays start when nothing live is left on the layer
    if (!tracks.some((t) => t.target === 1)) {
      const next = this.queues[layer].shift();
      if (next) this.start(layer, next.clip, next.opts, next.ticket);
    }
    const kept: Track[] = [];
    for (const t of tracks) {
      if (t.target === 0 && t.w <= 1e-4) this.events.push({ type: "ended", layer, ticket: t.ticket, name: t.clip.name });
      else kept.push(t);
    }
    this.layers[layer] = kept;
    if (this.busy[layer] && kept.length === 0) {
      this.busy[layer] = false;
      this.events.push({ type: "handback", layer, ticket: 0, name: this.idle.name });
    }
  }
}

/**
 * Head level: mocap idles hold the head 10 to 20 degrees down, which reads
 * as a glare once the eyes aim at a face. The clip's head pitch is low
 * passed (1.2 s halflife) and the head lifted by the slow part only, up to
 * `maxLift` (10 degrees), so nods still pass and a slump still reads.
 */
export class HeadLevel {
  private readonly avg = springState();
  private primed = false;
  constructor(
    public maxLift = (10 * Math.PI) / 180,
    public halflife = 1.2,
  ) {}
  /** Takes the head pitch the clip produced (radians, up positive) and returns the lift to add. */
  update(dt: number, clipPitch: number): number {
    if (!this.primed) {
      this.avg.x = clipPitch;
      this.primed = true;
    }
    spring(this.avg, clipPitch, this.halflife, dt);
    return Math.min(this.maxLift, Math.max(0, -this.avg.x));
  }
  /** Reads the head pitch from a pose and lifts it in place, about the parent X axis. */
  apply(dt: number, pose: Pose, head: number): number {
    const lift = this.update(dt, quatPitch(pose.rotations, head * 4));
    if (lift > 0) {
      const s = Math.sin(-lift / 2);
      const c = Math.cos(-lift / 2);
      const r = pose.rotations;
      const o = head * 4;
      const x = r[o]!, y = r[o + 1]!, z = r[o + 2]!, w = r[o + 3]!;
      // q' = qx(-lift) * q
      r[o] = c * x + s * w;
      r[o + 1] = c * y - s * z;
      r[o + 2] = c * z + s * y;
      r[o + 3] = c * w - s * x;
    }
    return lift;
  }
}
