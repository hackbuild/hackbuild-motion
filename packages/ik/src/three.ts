// three.js adapter: solvers applied to bones.
import { type Object3D, Quaternion, Vector3 } from "three";
import { type JointLimit, type LookLimits, type LookResult, type Quat, type Vec3, ContactLock, DEFAULT_LOOK_LIMITS, ccd, fabrik, handCurl, lookAngles, lookChain, segmentDeltas, twoBone } from "./index.js";

const tv = (v: Vector3): Vec3 => [v.x, v.y, v.z];
const pos = (o: Object3D): Vec3 => tv(o.getWorldPosition(new Vector3()));

/** Premultiplies a world rotation delta onto an object, keeping its parent. */
export function rotateWorld(o: Object3D, delta: Quat | Quaternion, weight = 1): void {
  const d = delta instanceof Quaternion ? delta.clone() : new Quaternion().fromArray(delta);
  if (weight < 1) d.slerp(new Quaternion(), 1 - weight);
  o.updateWorldMatrix(true, false);
  const world = o.getWorldQuaternion(new Quaternion()).premultiply(d);
  const parent = o.parent ? o.parent.getWorldQuaternion(new Quaternion()) : new Quaternion();
  o.quaternion.copy(parent.invert().multiply(world));
  o.updateMatrixWorld(true);
}

/**
 * Two bone IK on three bones toward a world `target`, bending toward the
 * world `pole` direction. A `weight` below 1 moves the target part of the
 * way from where the end joint is now.
 */
export function solveTwoBone(upper: Object3D, lower: Object3D, end: Object3D, target: Vector3, pole: Vector3, opts: { weight?: number; soft?: number } = {}): boolean {
  upper.updateWorldMatrix(true, true);
  const w = Math.min(1, Math.max(0, opts.weight ?? 1));
  const e = pos(end);
  const t: Vec3 = [e[0] + (target.x - e[0]) * w, e[1] + (target.y - e[1]) * w, e[2] + (target.z - e[2]) * w];
  const s = twoBone(pos(upper), pos(lower), e, t, tv(pole), opts.soft ?? 0);
  rotateWorld(upper, s.upper);
  rotateWorld(lower, s.lower);
  return s.reached;
}

/** FABRIK or CCD on a bone chain (root first, last bone is the end effector). */
export function solveChain(bones: Object3D[], target: Vector3, opts: { method?: "fabrik" | "ccd"; iterations?: number; tolerance?: number; limits?: JointLimit[] } = {}): number {
  bones[0]!.updateWorldMatrix(true, true);
  const old = bones.map(pos);
  const next = old.map((p) => [...p] as Vec3);
  const info = opts.method === "ccd" ? ccd(next, tv(target), opts) : fabrik(next, tv(target), opts);
  for (let i = 0; i < bones.length - 1; i++) {
    // children moved with their parents; measure each segment again before turning it
    const d = segmentDeltas([pos(bones[i]!), pos(bones[i + 1]!)], [next[i]!, next[i + 1]!])[0];
    if (d) rotateWorld(bones[i]!, d);
  }
  return info.error;
}

/**
 * Turns a chain (for example neck then head) toward `target`, with yaw and
 * pitch clamped and shared by `weights`. `frame` is the body's world
 * rotation in the normalized space (+Z forward). Keep `yaw + bodyYaw` from
 * the result and pass it back as `prevYaw`; when `behind` is set, turn the
 * body by `bodyYaw`.
 */
export function lookAtChain(bones: Object3D[], weights: number[], target: Vector3, frame: Quaternion, limits: LookLimits = DEFAULT_LOOK_LIMITS, amount = 1, prevYaw = 0): LookResult {
  const origin = pos(bones[bones.length - 1]!);
  const fq: Quat = [frame.x, frame.y, frame.z, frame.w];
  const a = lookAngles(fq, origin, tv(target), limits, prevYaw);
  const deltas = lookChain(fq, a.yaw * amount, a.pitch * amount, weights);
  bones.forEach((b, i) => rotateWorld(b, deltas[i]!));
  return a;
}

/** The finger and thumb bones of one hand that `curlFingers` rotates; missing bones are skipped. */
export interface FingerBones {
  thumb?: Object3D[];
  index?: Object3D[];
  middle?: Object3D[];
  ring?: Object3D[];
  little?: Object3D[];
}

/** Curls the fingers of one hand by `amount` (0 open, 1 a fist). */
export function curlFingers(hand: Object3D, lowerArm: Object3D, fingers: FingerBones, side: "left" | "right", amount: number): Vec3 {
  const c = handCurl(pos(hand), pos(lowerArm), side, amount, fingers.index?.[0] && pos(fingers.index[0]), fingers.little?.[0] && pos(fingers.little[0]));
  if (amount <= 1e-3) return c.grip;
  const axis = new Vector3(...c.fingerAxis);
  for (const chain of [fingers.index, fingers.middle, fingers.ring, fingers.little]) {
    chain?.slice(0, 3).forEach((b, k) => rotateWorld(b, new Quaternion().setFromAxisAngle(axis, c.fingerAngles[k]!)));
  }
  const thumbAxis = new Vector3(...c.thumbAxis);
  fingers.thumb?.slice(1, 3).forEach((b) => rotateWorld(b, new Quaternion().setFromAxisAngle(thumbAxis, c.thumbAngle)));
  return c.grip;
}

/** Foot lock for a three.js IK target. */
export class FootLock {
  private readonly core: ContactLock;
  private readonly out = new Float64Array(3);
  constructor(threshold = 0.55, release = 0.06) {
    this.core = new ContactLock(threshold, release);
  }
  get locked(): boolean {
    return this.core.locked();
  }
  /** Writes the locked or releasing foot target into `target`. */
  update(dt: number, target: Vector3, contact: number): Vector3 {
    this.core.update(dt, Float64Array.of(target.x, target.y, target.z), contact, this.out);
    return target.set(this.out[0]!, this.out[1]!, this.out[2]!);
  }
  dispose(): void {
    this.core.free();
  }
}
