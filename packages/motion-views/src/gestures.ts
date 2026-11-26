// Gestures written in code over a body's own bone order, for the verb row
// before any clip file arrives, and the step from a presence clip to a
// three.js AnimationClip that the clip thumbnails need. Bones a gesture
// does not touch keep the pose they had when it was built, so an upper
// layer wave leaves the relaxed left arm where it was.
import { AnimationClip, type Object3D, Quaternion, QuaternionKeyframeTrack, Vector3 } from "three";
import type { Clip } from "@hackbuild/presence";

/** A gesture written in code over the body's own bones. */
export type Gesture = "wave" | "nod" | "shake" | "bow";
/** Every gesture `gestureClip` can make. */
export const GESTURES: readonly Gesture[] = ["wave", "nod", "shake", "bow"];

interface Axes {
  X: Vector3;
  Y: Vector3;
  Z: Vector3;
}

interface Move {
  seconds: number;
  /** Per bone: an absolute local rotation, or a rotation applied after the base. */
  bones: Partial<Record<string, (t: number, q: Quaternion, a: Axes) => "set" | "mul">>;
}

// shapes in the normalized humanoid space: identity rest, +Z forward, left on +X
const MOVES: Record<Gesture, Move> = {
  wave: {
    seconds: 2,
    bones: {
      rightUpperArm: (t, q, a) => (q.setFromAxisAngle(a.Z, -1.2 * Math.sin(Math.PI * t)), "set"),
      rightLowerArm: (t, q, a) => (q.setFromAxisAngle(a.Y, Math.sin(Math.PI * t) * (0.9 + 0.35 * Math.sin(t * Math.PI * 8))), "set"),
    },
  },
  nod: { seconds: 1.2, bones: { head: (t, q, a) => (q.setFromAxisAngle(a.X, 0.22 * Math.sin(t * Math.PI * 2) ** 2), "mul") } },
  shake: { seconds: 1.4, bones: { head: (t, q, a) => (q.setFromAxisAngle(a.Y, 0.3 * Math.sin(t * Math.PI * 4) * Math.sin(Math.PI * t)), "mul") } },
  bow: {
    seconds: 1.8,
    bones: {
      spine: (t, q, a) => (q.setFromAxisAngle(a.X, 0.3 * Math.sin(Math.PI * t)), "mul"),
      chest: (t, q, a) => (q.setFromAxisAngle(a.X, 0.2 * Math.sin(Math.PI * t)), "mul"),
      head: (t, q, a) => (q.setFromAxisAngle(a.X, 0.15 * Math.sin(Math.PI * t)), "mul"),
    },
  },
};

/**
 * A gesture as a presence clip over `names`, starting from `base` (bones
 * times 4 local rotations, the pose when it was built). Bones the body
 * lacks are skipped; returns null when it has none of the gesture's bones.
 */
export function gestureClip(id: Gesture, names: readonly string[], base: ArrayLike<number>, fps = 30): Clip | null {
  const move = MOVES[id];
  const n = names.length;
  const used = Object.keys(move.bones).map((b) => names.indexOf(b));
  if (used.every((i) => i < 0)) return null;
  const frames = Math.round(move.seconds * fps) + 1;
  const rotations = new Float32Array(frames * n * 4);
  const q = new Quaternion();
  const b = new Quaternion();
  const axes: Axes = { X: new Vector3(1, 0, 0), Y: new Vector3(0, 1, 0), Z: new Vector3(0, 0, 1) };
  for (let f = 0; f < frames; f++) {
    const t = f / (frames - 1);
    for (let i = 0; i < n; i++) {
      const at = (f * n + i) * 4;
      b.set(base[i * 4]!, base[i * 4 + 1]!, base[i * 4 + 2]!, base[i * 4 + 3]!);
      const fn = move.bones[names[i]!];
      if (fn) {
        const how = fn(t, q, axes);
        if (how === "mul") b.multiply(q);
        else b.copy(q);
      }
      b.toArray(rotations, at);
    }
  }
  return { name: id, fps, frames, bones: n, loop: false, rotations };
}

/** A presence clip as a three.js AnimationClip with one quaternion track per bone object name. */
export function animationClipOf(clip: Clip, names: readonly string[]): AnimationClip {
  const times = Array.from({ length: clip.frames }, (_, f) => f / clip.fps);
  const tracks = names.map((name, i) => {
    const values = new Float32Array(clip.frames * 4);
    for (let f = 0; f < clip.frames; f++) values.set(clip.rotations.subarray((f * clip.bones + i) * 4, (f * clip.bones + i) * 4 + 4), f * 4);
    return new QuaternionKeyframeTrack(`${name}.quaternion`, times, values);
  });
  return new AnimationClip(clip.name, (clip.frames - 1) / clip.fps, tracks);
}

const ss = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** Seconds each rig gesture runs. */
const RIG_SECONDS: Record<Gesture, number> = { wave: 2.6, nod: 1.2, shake: 1.4, bow: 2 };

/**
 * A gesture as a presence clip built on the rig itself: each bone is aimed
 * or turned in world space, in the body's own frame (forward, left and up
 * from its shoulders), then read back as local rotations. Works on any
 * humanoid rig, whatever its bone axes. The arm eases up, waves and eases
 * down; nod, shake and bow ease in and out. `bones` and `names` are the
 * body's bone order; the pose they hold now is the base. Returns null when
 * the rig lacks the gesture's bones.
 */
export function rigGestureClip(id: Gesture, bones: readonly Object3D[], names: readonly string[], fps = 30): Clip | null {
  const at = (n: string) => {
    const i = names.indexOf(n);
    return i < 0 ? null : bones[i]!;
  };
  const lu = at("leftUpperArm"), ru = at("rightUpperArm"), rl = at("rightLowerArm"), rh = at("rightHand"), head = at("head");
  const spine = at("spine"), chest = at("chest");
  if (!lu || !ru) return null;
  if (id === "wave" && (!rl || !rh)) return null;
  if ((id === "nod" || id === "shake") && !head) return null;
  if (id === "bow" && !spine) return null;
  const n = bones.length;
  const base = bones.map((b) => b.quaternion.clone());
  const top = bones[0]!.parent ?? bones[0]!;
  top.updateMatrixWorld(true);
  const wp = (o: Object3D, v = new Vector3()) => o.getWorldPosition(v);
  const up = new Vector3(0, 1, 0);
  const L = wp(lu).sub(wp(ru)).setY(0).normalize();
  const F = new Vector3().crossVectors(L, up).normalize();
  const R = L.clone().negate();
  const pq = new Quaternion(), bq = new Quaternion(), rq = new Quaternion();
  const turnWorld = (b: Object3D, rw: Quaternion) => {
    b.parent!.getWorldQuaternion(pq);
    b.getWorldQuaternion(bq);
    b.quaternion.copy(pq.invert().multiply(rw).multiply(bq));
    b.updateMatrixWorld(true);
  };
  const aim = (b: Object3D, child: Object3D, dir: Vector3, w: number) => {
    const cur = wp(child).sub(wp(b)).normalize();
    const want = cur.clone().lerp(dir, w).normalize();
    turnWorld(b, rq.setFromUnitVectors(cur, want));
  };
  const seconds = RIG_SECONDS[id];
  const frames = Math.round(seconds * fps) + 1;
  const rotations = new Float32Array(frames * n * 4);
  const armUp = R.clone().multiplyScalar(0.55).addScaledVector(up, 0.8).addScaledVector(F, 0.22).normalize();
  for (let f = 0; f < frames; f++) {
    const t = f / (frames - 1);
    bones.forEach((b, i) => b.quaternion.copy(base[i]!));
    top.updateMatrixWorld(true);
    if (id === "wave") {
      const e = ss(0, 0.22, t) * (1 - ss(0.8, 1, t));
      aim(ru, rl!, armUp, e);
      const osc = 0.42 * Math.sin(2 * Math.PI * 3 * ss(0.18, 0.84, t)) * ss(0.12, 0.3, t) * (1 - ss(0.74, 0.86, t));
      const fore = up.clone().addScaledVector(F, 0.12).addScaledVector(R, 0.08).applyAxisAngle(F, -osc).normalize();
      aim(rl!, rh!, fore, e);
    } else if (id === "nod") {
      turnWorld(head!, rq.setFromAxisAngle(L, 0.24 * Math.sin(2 * Math.PI * t) ** 2 * (1 - ss(0.85, 1, t))));
    } else if (id === "shake") {
      turnWorld(head!, rq.setFromAxisAngle(up, 0.32 * Math.sin(4 * Math.PI * t) * Math.sin(Math.PI * t)));
    } else {
      const e = ss(0, 0.35, t) * (1 - ss(0.65, 1, t));
      turnWorld(spine!, rq.setFromAxisAngle(L, 0.32 * e));
      if (chest) turnWorld(chest, rq.setFromAxisAngle(L, 0.18 * e));
      if (head) turnWorld(head, rq.setFromAxisAngle(L, -0.12 * e));
    }
    bones.forEach((b, i) => b.quaternion.toArray(rotations, (f * n + i) * 4));
  }
  bones.forEach((b, i) => b.quaternion.copy(base[i]!));
  top.updateMatrixWorld(true);
  return { name: id, fps, frames, bones: n, loop: false, rotations };
}
