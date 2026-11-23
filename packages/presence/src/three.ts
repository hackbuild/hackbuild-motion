// three.js adapter: clips from AnimationClip tracks, poses onto bones, gaze
// onto neck, head and eyes, and world space aiming for point and reach.
// Bones are expected in the normalized humanoid space (rest rotations that
// keep +Y up and +Z forward), the space @hackbuild/avatar loads into.
import { type AnimationClip, type KeyframeTrack, type Object3D, Quaternion, Vector3 } from "three";
import { type Clip, type Pose } from "./clip.js";
import { type GazeOutput } from "./gaze.js";

export interface ClipFromThreeOptions {
  fps?: number;
  loop?: boolean;
  /** Bone whose position track becomes the clip root. */
  rootBone?: string;
  /** Rest rotations for bones the clip has no track for. */
  rest?: readonly (Object3D | null)[];
}

interface Sampler {
  evaluate(t: number): ArrayLike<number>;
}
// createInterpolant is set on every track at runtime (slerp for quaternion
// tracks) but is missing from the type declarations
const interpolant = (track: KeyframeTrack): Sampler => (track as unknown as { createInterpolant(): Sampler }).createInterpolant();

/** Samples a three.js AnimationClip into a flat Clip over the given bone names. */
export function clipFromThree(clip: AnimationClip, bones: readonly string[], opts: ClipFromThreeOptions = {}): Clip {
  const fps = opts.fps ?? 30;
  const frames = Math.max(2, Math.round(clip.duration * fps) + 1);
  const rotations = new Float32Array(frames * bones.length * 4);
  const tracks = new Map(clip.tracks.map((t) => [t.name, t]));
  const value = new Float32Array(4);
  bones.forEach((name, b) => {
    const track = tracks.get(`${name}.quaternion`);
    const rest = opts.rest?.[b]?.quaternion;
    const interp = track ? interpolant(track) : undefined;
    for (let f = 0; f < frames; f++) {
      const o = (f * bones.length + b) * 4;
      if (interp) value.set(interp.evaluate(Math.min(f / fps, clip.duration)));
      else if (rest) value.set([rest.x, rest.y, rest.z, rest.w]);
      else value.set([0, 0, 0, 1]);
      rotations.set(value, o);
    }
  });
  const out: Clip = { name: clip.name, fps, frames, bones: bones.length, loop: opts.loop ?? true, rotations };
  const rootTrack = opts.rootBone ? tracks.get(`${opts.rootBone}.position`) : undefined;
  if (rootTrack) {
    const interp = interpolant(rootTrack);
    const root = new Float32Array(frames * 3);
    for (let f = 0; f < frames; f++) root.set(interp.evaluate(Math.min(f / fps, clip.duration)), f * 3);
    out.root = root;
  }
  return out;
}

/** Writes a pose onto bones (same order as the clip). `root` gets the root position when given. */
export function applyPose(pose: Pose, bones: readonly (Object3D | null)[], root?: Object3D | null): void {
  bones.forEach((b, i) => {
    if (b) b.quaternion.fromArray(pose.rotations, i * 4);
  });
  if (root) root.position.fromArray(pose.root);
}

// scratch objects are made per call: module scope ones are shared by every
// caller of the module and get overwritten across systems
function yawPitchQuat(yaw: number, pitch: number, out: Quaternion): Quaternion {
  // pitch up is a turn about -X when +Z is forward
  return out.setFromAxisAngle(new Vector3(0, 1, 0), yaw).multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -pitch));
}

export interface GazeRig {
  neck?: Object3D | null;
  head: Object3D;
  leftEye?: Object3D | null;
  rightEye?: Object3D | null;
}

/**
 * Adds a gaze frame onto the rig after the pose is written: head angles are
 * split between neck and head (`neckShare` to the neck), eye angles set the
 * eye bones. Call after `applyPose` each frame.
 */
export function applyGaze(g: GazeOutput, rig: GazeRig, neckShare = 0.35): void {
  const share = rig.neck ? neckShare : 0;
  const qa = new Quaternion();
  if (rig.neck) rig.neck.quaternion.premultiply(yawPitchQuat(g.headYaw * share, g.headPitch * share, qa));
  rig.head.quaternion.premultiply(yawPitchQuat(g.headYaw * (1 - share), g.headPitch * (1 - share), qa));
  for (const eye of [rig.leftEye, rig.rightEye]) if (eye) eye.quaternion.copy(yawPitchQuat(g.eyeYaw, g.eyePitch, qa));
}

/**
 * Turns `bone` in world space so the direction to `child` swings toward
 * `target` by `weight` (0 to 1). The bone keeps its twist.
 */
export function aimBone(bone: Object3D, child: Object3D, target: Vector3, weight: number): void {
  if (weight <= 0) return;
  const [va, vb, vc] = [new Vector3(), new Vector3(), new Vector3()];
  const [qa, qw, qp] = [new Quaternion(), new Quaternion(), new Quaternion()];
  bone.updateWorldMatrix(true, false);
  child.updateWorldMatrix(false, false);
  const p = bone.getWorldPosition(va);
  const from = child.getWorldPosition(vb).sub(p).normalize();
  const to = vc.copy(target).sub(p).normalize();
  if (from.lengthSq() < 1e-12 || to.lengthSq() < 1e-12) return;
  const delta = qa.setFromUnitVectors(from, to);
  qa.slerp(qw.identity(), 1 - Math.min(1, weight));
  bone.getWorldQuaternion(qw);
  const parent = bone.parent;
  const parentWorld = parent ? parent.getWorldQuaternion(qp) : qp.identity();
  // new world = delta * world; local = parent^-1 * new world
  bone.quaternion.copy(parentWorld.invert().multiply(delta.multiply(qw)));
  bone.updateWorldMatrix(false, true);
}

export interface ArmChain {
  upper: Object3D;
  lower: Object3D;
  hand: Object3D;
}

/** Point or reach: the upper arm, then the forearm, swing toward the target. */
export function reachArm(arm: ArmChain, target: Vector3, weight: number): void {
  aimBone(arm.upper, arm.lower, target, 0.85 * weight);
  aimBone(arm.lower, arm.hand, target, 0.8 * weight);
}
