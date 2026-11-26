// three.js adapter: measure a quadruped rig by bone names and drive it from
// the gait, body, tail and ear state each frame.
import { type Object3D, Quaternion, Vector3 } from "three";
import { type BodyGeometry, type BodyPose, type GaitState, type LegSpec, solveLeg } from "./index.js";

/** Bone names of one leg: upper, middle and end joints, then the toe bones. */
export interface LegNames {
  up: string;
  mid: string;
  end: string;
  /** Bones from the end joint down to the toe tip. */
  toes: string[];
}

/** Bone names of a quadruped: the four legs, the hips, and optional spine, tail and ear bones. */
export interface QuadrupedNames {
  legs: { LF: LegNames; RF: LegNames; LH: LegNames; RH: LegNames };
  /** The bone that carries the body's pitch, roll and drop. */
  hips: string;
  spine?: string[];
  tail?: string[];
  ears?: [string, string];
}

interface MeasuredLeg {
  up: Object3D;
  mid: Object3D;
  end: Object3D;
  /** End joint to toe tip at rest, root space. */
  paw: Vector3;
  pole: Vector3;
  endRest: Quaternion;
}

/** A quadruped rig measured from its rest pose by `measureQuadruped`, ready for `driveQuadruped`. */
export interface QuadrupedRig {
  root: Object3D;
  hips: Object3D;
  legs: MeasuredLeg[];
  spine: Object3D[];
  tail: Object3D[];
  ears: Object3D[];
  specs: LegSpec[];
  legLength: number;
  geometry: BodyGeometry;
  rest: Map<Object3D, { p: Vector3; q: Quaternion; s: Vector3 }>;
}

/**
 * Measures leg spots, toe heights, leg length and track width from the rest
 * pose. `root` must sit at the origin with identity rotation and face +Z
 * when this runs. Names can come from `@hackbuild/rig` `limbChains`.
 */
export function measureQuadruped(root: Object3D, names: QuadrupedNames): QuadrupedRig {
  const get = (n: string): Object3D => {
    const o = root.getObjectByName(n);
    if (!o) throw new Error(`gait: no bone named ${n}`);
    return o;
  };
  root.updateMatrixWorld(true);
  const rest = new Map<Object3D, { p: Vector3; q: Quaternion; s: Vector3 }>();
  root.traverse((o) => {
    if (o !== root) rest.set(o, { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() });
  });
  const local = (o: Object3D) => root.worldToLocal(o.getWorldPosition(new Vector3()));
  const rootInv = root.getWorldQuaternion(new Quaternion()).invert();
  const order = ["LF", "RF", "LH", "RH"] as const;
  const legs: MeasuredLeg[] = [];
  const specs: LegSpec[] = [];
  for (const id of order) {
    const n = names.legs[id];
    const up = get(n.up);
    const mid = get(n.mid);
    const end = get(n.end);
    const tip = get(n.toes[n.toes.length - 1] ?? n.end);
    const a = local(up);
    const b = local(mid);
    const c = local(end);
    const t = local(tip);
    const ac = c.clone().sub(a).normalize();
    const pole = b.clone().sub(a);
    pole.sub(ac.clone().multiplyScalar(pole.dot(ac)));
    if (pole.lengthSq() < 1e-12) pole.set(0, 0, id.endsWith("F") ? -1 : 1);
    legs.push({ up, mid, end, paw: t.clone().sub(c), pole: pole.normalize(), endRest: end.getWorldQuaternion(new Quaternion()).premultiply(rootInv) });
    specs.push({ x: t.x, z: t.z, toe: Math.max(t.y, 0.005), front: id.endsWith("F") });
  }
  const hipY = (i: number) => local(legs[i]!.up).y;
  const legLength = (hipY(0) + hipY(2)) / 2;
  const geometry: BodyGeometry = {
    frontZ: (specs[0]!.z + specs[1]!.z) / 2,
    rearZ: (specs[2]!.z + specs[3]!.z) / 2,
    halfWidth: Math.abs(specs[0]!.x - specs[1]!.x) / 2,
    size: legLength / 0.42,
  };
  return {
    root,
    hips: get(names.hips),
    legs,
    spine: (names.spine ?? []).map(get),
    tail: (names.tail ?? []).map(get),
    ears: (names.ears ?? []).map(get),
    specs,
    legLength,
    geometry,
    rest,
  };
}

function rotateWorld(o: Object3D, q: Quaternion): void {
  o.updateWorldMatrix(true, false);
  const world = o.getWorldQuaternion(new Quaternion()).premultiply(q);
  const parent = o.parent ? o.parent.getWorldQuaternion(new Quaternion()) : new Quaternion();
  o.quaternion.copy(parent.invert().multiply(world));
  o.updateMatrixWorld(true);
}

function setWorld(o: Object3D, q: Quaternion): void {
  const parent = o.parent ? o.parent.getWorldQuaternion(new Quaternion()) : new Quaternion();
  o.quaternion.copy(parent.invert().multiply(q));
  o.updateMatrixWorld(true);
}

/** Optional tail, ear and IK settings for `driveQuadruped`. */
export interface DriveExtras {
  /** Tail link yaw angles and the root link lift, from `TailWag`. */
  tail?: { yaw: number[]; lift: number };
  /** Ear angles, from `Ears`. */
  ears?: [number, number];
  /** Leg IK on or off. Default on. */
  ik?: boolean;
}

/** Writes one frame of gait and body state onto the rig. Returns the legs whose target was out of reach. */
export function driveQuadruped(rig: QuadrupedRig, pose: { x: number; z: number; yaw: number }, gait: GaitState, body: BodyPose, extras: DriveExtras = {}): number[] {
  for (const [o, r] of rig.rest) {
    o.position.copy(r.p);
    o.quaternion.copy(r.q);
    o.scale.copy(r.s);
  }
  const { root } = rig;
  const UP = new Vector3(0, 1, 0);
  root.position.set(pose.x, body.rootY, pose.z);
  root.quaternion.setFromAxisAngle(UP, pose.yaw);
  root.updateMatrixWorld(true);
  const yawQ = root.quaternion.clone();
  const left = new Vector3(1, 0, 0).applyQuaternion(yawQ);
  const fwd = new Vector3(0, 0, 1).applyQuaternion(yawQ);
  const scale = root.getWorldScale(new Vector3()).y || 1;
  // body: drop and shift along the body, then pitch about the left axis and roll about forward
  const hips = rig.hips;
  const shift = new Vector3(0, -body.drop, body.dz).applyQuaternion(yawQ);
  const parentInv = hips.parent ? hips.parent.getWorldQuaternion(new Quaternion()).invert() : new Quaternion();
  hips.position.add(shift.applyQuaternion(parentInv).divideScalar(scale));
  hips.updateMatrixWorld(true);
  rotateWorld(hips, new Quaternion().setFromAxisAngle(fwd, body.roll).multiply(new Quaternion().setFromAxisAngle(left, body.pitch)));
  const n = rig.spine.length;
  rig.spine.forEach((b) => rotateWorld(b, new Quaternion().setFromAxisAngle(UP, body.bend / Math.max(n, 1)).multiply(new Quaternion().setFromAxisAngle(left, body.flex / Math.max(n, 1)))));
  if (extras.tail) {
    rig.tail.forEach((b, i) => {
      const q = new Quaternion().setFromAxisAngle(UP, extras.tail!.yaw[i] ?? 0);
      if (i === 0) q.multiply(new Quaternion().setFromAxisAngle(left, -extras.tail!.lift));
      rotateWorld(b, q);
    });
  }
  if (extras.ears) rig.ears.forEach((b, i) => rotateWorld(b, new Quaternion().setFromAxisAngle(fwd, i === 0 ? extras.ears![0] : -extras.ears![1])));
  const missed: number[] = [];
  if (extras.ik === false) return missed;
  rig.legs.forEach((l, i) => {
    const foot = gait.feet[i];
    if (!foot) return;
    const tilt = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), body.tilt[i] ?? 0);
    const endWorld = yawQ.clone().multiply(tilt).multiply(l.endRest);
    const paw = l.paw.clone().applyQuaternion(tilt).applyQuaternion(yawQ).multiplyScalar(scale);
    const target = new Vector3(foot.x, foot.y, foot.z).sub(paw);
    const p = (o: Object3D) => o.getWorldPosition(new Vector3()).toArray() as [number, number, number];
    const s = solveLeg(p(l.up), p(l.mid), p(l.end), target.toArray() as [number, number, number], l.pole.clone().applyQuaternion(yawQ).toArray() as [number, number, number]);
    rotateWorld(l.up, new Quaternion().fromArray(s.upper));
    rotateWorld(l.mid, new Quaternion().fromArray(s.lower));
    setWorld(l.end, endWorld);
    if (!s.reached) missed.push(i);
  });
  return missed;
}
