// Gestures written in code over a body's own bone order, for the verb row
// before any clip file arrives, and the step from a presence clip to a
// three.js AnimationClip that the clip thumbnails need. Bones a gesture
// does not touch keep the pose they had when it was built, so an upper
// layer wave leaves the relaxed left arm where it was.
import { AnimationClip, Quaternion, QuaternionKeyframeTrack, Vector3 } from "three";
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
