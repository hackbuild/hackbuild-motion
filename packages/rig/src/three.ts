// three.js adapter: map a loaded model's bones, find limb chains, analyse
// and fix the rest pose.
import { Group, Object3D, Quaternion, Vector3 } from "three";
import type { HumanBone } from "./bones.js";
import { type LimbChain, type RestReport, type RigMapReport, type Vec3, analyzeRest, limbChains, mapRig } from "./index.js";

/** The result of `mapObject3D`: the map report, the scene object of each humanoid bone, and the nodes in report order. */
export interface MappedObject {
  report: RigMapReport;
  /** Humanoid bone to scene object. */
  bones: Partial<Record<HumanBone, Object3D>>;
  nodes: Object3D[];
}

function collect(root: Object3D, bonesOnly: boolean): Object3D[] {
  const nodes: Object3D[] = [];
  root.traverse((o) => {
    if (!bonesOnly || (o as Object3D & { isBone?: boolean }).isBone) nodes.push(o);
  });
  return nodes;
}

/**
 * Maps the bones under `root`. Only `Bone` objects are considered when the
 * model has any; otherwise every named node.
 */
export function mapObject3D(root: Object3D): MappedObject {
  const hasBones = collect(root, true).length > 0;
  const nodes = collect(root, hasBones);
  const index = new Map(nodes.map((o, i) => [o, i]));
  const report = mapRig(nodes.map((o) => ({ name: o.name, parent: o.parent ? (index.get(o.parent) ?? null) : null })));
  const bones: Partial<Record<HumanBone, Object3D>> = {};
  for (const [b, i] of Object.entries(report.byBone) as [HumanBone, number][]) bones[b] = nodes[i]!;
  return { report, bones, nodes };
}

/** Limb chains under `root` with poles measured from the current world pose. */
export function chainsOf(root: Object3D): { chains: LimbChain[]; nodes: Object3D[] } {
  root.updateMatrixWorld(true);
  const hasBones = collect(root, true).length > 0;
  const nodes = collect(root, hasBones);
  const index = new Map(nodes.map((o, i) => [o, i]));
  const v = new Vector3();
  const rest = nodes.map((o) => o.getWorldPosition(v).toArray() as Vec3);
  const chains = limbChains(
    nodes.map((o) => ({ name: o.name, parent: o.parent ? (index.get(o.parent) ?? null) : null })),
    rest,
  );
  return { chains, nodes };
}

/** Rest analysis of mapped bones at their current world positions. */
export function restOf(bones: Partial<Record<HumanBone, Object3D>>): RestReport | null {
  const v = new Vector3();
  const pos: Partial<Record<HumanBone, Vec3>> = {};
  for (const [b, o] of Object.entries(bones) as [HumanBone, Object3D][]) {
    o.updateWorldMatrix(true, false);
    pos[b] = o.getWorldPosition(v).toArray() as Vec3;
  }
  return analyzeRest(pos);
}

/** Options of `applyRestFix`. */
export interface RestFixOptions {
  /** Target height for the head joint in meters; default keeps the measured size. */
  headHeight?: number;
  /** Lift A pose arms into the T pose. Default true. */
  tPoseArms?: boolean;
  /** Straighten splayed legs. Default false. */
  straightLegs?: boolean;
}

/** World rotation `q` applied to an object, keeping its parent. */
function rotateWorld(o: Object3D, q: Quaternion): void {
  const world = o.getWorldQuaternion(new Quaternion()).premultiply(q);
  const parent = o.parent ? o.parent.getWorldQuaternion(new Quaternion()) : new Quaternion();
  o.quaternion.copy(parent.invert().multiply(world));
  o.updateMatrixWorld(true);
}

/**
 * Wraps `root` in a group that faces it +Z, scales it to meters and puts its
 * feet on y = 0, then lifts A pose arms into the T pose. Returns the group.
 */
export function applyRestFix(root: Object3D, bones: Partial<Record<HumanBone, Object3D>>, report: RestReport, opts: RestFixOptions = {}): Group {
  const group = new Group();
  group.name = "restFix";
  const parent = root.parent;
  if (parent) parent.add(group);
  group.add(root);
  let scale = report.scale;
  if (opts.headHeight) scale = opts.headHeight / report.height;
  group.quaternion.fromArray(report.fix);
  group.scale.setScalar(scale);
  group.updateMatrixWorld(true);
  const floor = (report.floor / report.scale) * scale;
  group.position.y -= floor;
  group.updateMatrixWorld(true);
  const lift = (b: HumanBone | undefined, q: [number, number, number, number]) => {
    const o = b && bones[b];
    if (o) rotateWorld(o, new Quaternion().fromArray(q));
  };
  if (opts.tPoseArms !== false) {
    lift("leftUpperArm", report.armFix[0]);
    lift("rightUpperArm", report.armFix[1]);
  }
  if (opts.straightLegs) {
    lift("leftUpperLeg", report.legFix[0]);
    lift("rightUpperLeg", report.legFix[1]);
  }
  return group;
}
