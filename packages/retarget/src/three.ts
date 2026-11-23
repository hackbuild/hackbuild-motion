// three.js adapter: skeletons from scene graphs, AnimationClip sampling and
// building, and a live per frame retarget from a driver rig.
import { AnimationClip, AnimationMixer, LoopOnce, Matrix4, type Object3D, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from "three";
import { type Clip, RetargetRig, type Skeleton } from "./index.js";

export interface SceneSkeleton {
  skeleton: Skeleton;
  nodes: Object3D[];
  /**
   * For each root joint, its parent's transform in the space of the model
   * root (an FBX armature node often carries a 0.01 scale). Root joint
   * values in a Clip are in model root space.
   */
  rootParents: Map<number, Matrix4>;
  /**
   * World scale of each joint's parent relative to the model root (uniform
   * scale assumed). Clip translations are local offsets times this, so a
   * 0.01 armature under a meter scene reads in one unit throughout.
   */
  scales: Float64Array;
}

const decompose = (m: Matrix4) => {
  const p = new Vector3();
  const q = new Quaternion();
  const s = new Vector3();
  m.decompose(p, q, s);
  return q;
};

/** A root joint's local pose to model root space, or back with `inverse`. */
function rootSpace(m: Matrix4, pos: Vector3, rot: Quaternion, inverse = false): void {
  const mm = inverse ? m.clone().invert() : m;
  pos.applyMatrix4(mm);
  rot.premultiply(decompose(mm));
}

/**
 * The bones under `root` as a skeleton, rest taken from their current local
 * transforms (put the model in its rest pose first). Only `Bone` objects are
 * used when the model has any.
 */
export function skeletonFromObject3D(root: Object3D): SceneSkeleton {
  const all: Object3D[] = [];
  root.traverse((o) => all.push(o));
  const bones = all.filter((o) => (o as Object3D & { isBone?: boolean }).isBone);
  const nodes = bones.length ? bones : all.filter((o) => o !== root);
  const index = new Map(nodes.map((o, i) => [o, i]));
  const n = nodes.length;
  const restT = new Float64Array(n * 3);
  const restR = new Float64Array(n * 4);
  const parents = new Int32Array(n);
  const rootParents = new Map<number, Matrix4>();
  const scales = new Float64Array(n).fill(1);
  root.updateMatrixWorld(true);
  const rootInv = root.matrixWorld.clone().invert();
  const rootScale = root.getWorldScale(new Vector3()).x || 1;
  nodes.forEach((o, i) => {
    const p = o.parent && index.has(o.parent) ? index.get(o.parent)! : -1;
    parents[i] = p;
    const pos = o.position.clone();
    const rot = o.quaternion.clone();
    if (p < 0) {
      // a root joint is kept in the space of `root`
      const m = o.parent && o.parent !== root ? rootInv.clone().multiply(o.parent.matrixWorld) : new Matrix4();
      rootParents.set(i, m);
      rootSpace(m, pos, rot);
    } else {
      scales[i] = o.parent!.getWorldScale(new Vector3()).x / rootScale;
      pos.multiplyScalar(scales[i]!);
    }
    restT.set(pos.toArray(), i * 3);
    restR.set(rot.toArray(), i * 4);
  });
  return { skeleton: { names: nodes.map((o) => o.name), parents, restT, restR }, nodes, rootParents, scales };
}

/** Samples a three.js AnimationClip on `root` at `fps` into a Clip over `nodes`. */
export function sampleAnimationClip(anim: AnimationClip, root: Object3D, scene: SceneSkeleton, fps = 30): Clip {
  const { nodes, rootParents, scales } = scene;
  const saved = nodes.map((o) => [o.position.clone(), o.quaternion.clone()] as const);
  const frames = Math.max(2, Math.round(anim.duration * fps) + 1);
  const n = nodes.length;
  const times = new Float64Array(frames);
  const rotations = new Float64Array(frames * n * 4);
  const translations = new Float64Array(frames * n * 3);
  const moves = new Uint8Array(n);
  const moved = new Set(anim.tracks.filter((t) => t.name.endsWith(".position")).map((t) => t.name.slice(0, -".position".length)));
  nodes.forEach((o, i) => {
    if (moved.has(o.name) || moved.has(o.uuid)) moves[i] = 1;
  });
  const mixer = new AnimationMixer(root);
  // play once and hold the end, so sampling at the duration reads the last key, not the first
  const action = mixer.clipAction(anim);
  action.setLoop(LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  for (let f = 0; f < frames; f++) {
    const t = Math.min(anim.duration, f / fps);
    times[f] = t;
    mixer.setTime(t);
    nodes.forEach((o, j) => {
      const pos = o.position.clone();
      const rot = o.quaternion.clone();
      const m = rootParents.get(j);
      if (m) rootSpace(m, pos, rot);
      else pos.multiplyScalar(scales[j]!);
      rotations.set(rot.toArray(), (f * n + j) * 4);
      translations.set(pos.toArray(), (f * n + j) * 3);
    });
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(root);
  nodes.forEach((o, i) => {
    o.position.copy(saved[i]![0]);
    o.quaternion.copy(saved[i]![1]);
  });
  return { times, rotations, translations, moves };
}

/** A Clip over a scene skeleton as a three.js AnimationClip, tracks bound by node name. */
export function toAnimationClip(clip: Clip, scene: SceneSkeleton, name = "retargeted"): AnimationClip {
  const { nodes, rootParents, scales } = scene;
  const frames = clip.times.length;
  const n = nodes.length;
  const times = Array.from(clip.times);
  const tracks = [];
  const pos = new Vector3();
  const rot = new Quaternion();
  // three binds tracks by name or uuid; a name with reserved characters or
  // shared by two nodes cannot bind, so those tracks use the uuid
  const count = new Map<string, number>();
  for (const o of nodes) count.set(o.name, (count.get(o.name) ?? 0) + 1);
  const key = (o: Object3D) => (/[[\]\.:/]/.test(o.name) || !o.name || count.get(o.name)! > 1 ? o.uuid : o.name);
  for (let j = 0; j < n; j++) {
    const m = rootParents.get(j);
    const q = new Float32Array(frames * 4);
    const p = new Float32Array(frames * 3);
    for (let f = 0; f < frames; f++) {
      rot.fromArray(clip.rotations, (f * n + j) * 4);
      pos.fromArray(clip.translations, (f * n + j) * 3);
      if (m) rootSpace(m, pos, rot, true);
      else pos.divideScalar(scales[j]!);
      rot.toArray(q, f * 4);
      pos.toArray(p, f * 3);
    }
    tracks.push(new QuaternionKeyframeTrack(`${key(nodes[j]!)}.quaternion`, times, q));
    if (clip.moves[j]) tracks.push(new VectorKeyframeTrack(`${key(nodes[j]!)}.position`, times, p));
  }
  return new AnimationClip(name, clip.times[frames - 1] ?? 0, tracks);
}

/**
 * Retargets an AnimationClip made for `srcRoot` onto `dstRoot`. Both models
 * must stand in their rest pose when this runs.
 */
export function retargetAnimation(anim: AnimationClip, srcRoot: Object3D, dstRoot: Object3D, opts: { fps?: number; srcUnit?: number; dstUnit?: number; name?: string } = {}): AnimationClip {
  const src = skeletonFromObject3D(srcRoot);
  const dst = skeletonFromObject3D(dstRoot);
  const clip = sampleAnimationClip(anim, srcRoot, src, opts.fps ?? 30);
  const a = new RetargetRig(src.skeleton, opts.srcUnit === undefined ? {} : { unit: opts.srcUnit });
  const b = new RetargetRig(dst.skeleton, opts.dstUnit === undefined ? {} : { unit: opts.dstUnit });
  try {
    return toAnimationClip(b.bind(a.toHumanoid(clip)), dst, opts.name ?? anim.name);
  } finally {
    a.dispose();
    b.dispose();
  }
}

/**
 * Copies a driver rig's pose onto a target rig every frame: play any clip
 * library on the driver with its own mixer, call `update()` after it.
 */
export class LiveRetarget {
  private readonly src: SceneSkeleton;
  private readonly dst: SceneSkeleton;
  private readonly a: RetargetRig;
  private readonly b: RetargetRig;
  private readonly wr: Float64Array;
  private readonly wp: Float64Array;
  constructor(
    private readonly srcRoot: Object3D,
    dstRoot: Object3D,
    opts: { srcUnit?: number; dstUnit?: number } = {},
  ) {
    this.src = skeletonFromObject3D(srcRoot);
    this.dst = skeletonFromObject3D(dstRoot);
    this.a = new RetargetRig(this.src.skeleton, opts.srcUnit === undefined ? {} : { unit: opts.srcUnit });
    this.b = new RetargetRig(this.dst.skeleton, opts.dstUnit === undefined ? {} : { unit: opts.dstUnit });
    this.wr = new Float64Array(this.src.nodes.length * 4);
    this.wp = new Float64Array(this.src.nodes.length * 3);
  }
  update(): void {
    // world transforms in the driver root's space
    this.srcRoot.updateMatrixWorld(true);
    const inv = this.srcRoot.getWorldQuaternion(new Quaternion()).invert();
    const q = new Quaternion();
    const v = new Vector3();
    this.src.nodes.forEach((o, i) => {
      this.wr.set(o.getWorldQuaternion(q).premultiply(inv).toArray(), i * 4);
      this.wp.set(this.srcRoot.worldToLocal(o.getWorldPosition(v)).toArray(), i * 3);
    });
    const { rotations, translations } = this.b.retargetPose(this.a, this.wr, this.wp);
    this.dst.nodes.forEach((o, i) => {
      o.quaternion.fromArray(rotations, i * 4);
      o.position.fromArray(translations, i * 3);
      const m = this.dst.rootParents.get(i);
      if (m) rootSpace(m, o.position, o.quaternion, true);
      else o.position.divideScalar(this.dst.scales[i]!);
    });
  }
  dispose(): void {
    this.a.dispose();
    this.b.dispose();
  }
}
