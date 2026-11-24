// VRM through @pixiv/three-vrm (MIT, optional peer). VRM is already the
// normalized humanoid space, so this hook reads the normalized bones that
// three-vrm builds, turns VRM 0.x models to face +Z, and drives the face
// through the VRM expression manager.
import {
  VRM,
  VRMExpression,
  VRMExpressionManager,
  VRMExpressionMorphTargetBind,
  VRMHumanoid,
  VRMLoaderPlugin,
  VRMLookAt,
  VRMLookAtBoneApplier,
  VRMLookAtRangeMap,
  VRMUtils,
  type VRMHumanBones,
  type VRMSpringBoneManager,
} from "@pixiv/three-vrm";
import { Group, type Mesh, type Object3D, Vector3 } from "three";
import { resolveExpressions } from "@hackbuild/rig/expressions";
import type { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HUMAN_BONES, type HumanBone } from "@hackbuild/rig/bones";
import type { VrmMetaLike } from "./format.js";
import type { Avatar, ExpressionSink, VrmHook, VrmResult } from "./three.js";

export interface VrmHookOptions {
  /** Drop vertices no bone or morph uses. Default true. */
  removeUnusedVertices?: boolean;
  /** Merge skeletons so the skin update runs once per frame. Default true. */
  combineSkeletons?: boolean;
}

/** Normalized bones of a loaded VRM by VRM 1.0 name. */
export function vrmBones(vrm: VRM): Partial<Record<HumanBone, Object3D>> {
  const out: Partial<Record<HumanBone, Object3D>> = {};
  for (const b of HUMAN_BONES) {
    const node = vrm.humanoid.getNormalizedBoneNode(b);
    if (node) out[b] = node;
  }
  return out;
}

/** The VRM expression manager as a sink; unknown names are ignored by three-vrm. */
export function vrmExpressionSink(vrm: VRM): ExpressionSink {
  return { setValue: (name, w) => vrm.expressionManager?.setValue(name, Math.max(0, Math.min(1, w))) };
}

/** Metadata in the shape `checkRedistribution` reads. */
export function vrmMeta(vrm: VRM): VrmMetaLike {
  const m = vrm.meta as unknown as Record<string, unknown>;
  return {
    metaVersion: String(m.metaVersion ?? ""),
    ...(typeof m.allowRedistribution === "boolean" ? { allowRedistribution: m.allowRedistribution } : {}),
    ...(typeof m.modification === "string" ? { modification: m.modification } : {}),
    ...(typeof m.licenseName === "string" ? { licenseName: m.licenseName } : {}),
    ...(typeof m.otherLicenseUrl === "string" ? { otherLicenseUrl: m.otherLicenseUrl } : {}),
  };
}

/** Builds the result `loadAvatar` returns for a VRM. */
export function fromVrm(vrm: VRM, opts: VrmHookOptions = {}): VrmResult {
  if (opts.removeUnusedVertices !== false) VRMUtils.removeUnnecessaryVertices(vrm.scene);
  if (opts.combineSkeletons !== false) VRMUtils.combineSkeletons(vrm.scene);
  VRMUtils.rotateVRM0(vrm);
  vrm.scene.updateMatrixWorld(true);
  return {
    root: vrm.scene,
    bones: vrmBones(vrm),
    expressions: vrmExpressionSink(vrm),
    update: (dt) => vrm.update(dt),
    meta: vrmMeta(vrm),
    vrm,
  };
}

/** Pass as `loadAvatar(src, { vrm: vrmHook() })`. */
export function vrmHook(opts: VrmHookOptions = {}): VrmHook {
  return {
    register(loader: GLTFLoader) {
      loader.register((parser) => new VRMLoaderPlugin(parser));
    },
    finish(gltf: GLTF) {
      const vrm = gltf.userData.vrm as VRM | undefined;
      return vrm ? fromVrm(vrm, opts) : null;
    },
  };
}

/** Eye turn limits for non VRM eye bones, degrees: sideways 12, up and down 8 (vendor). Wider turns show the socket. */
export const EYE_RANGE = { yaw: 12, pitch: 8 } as const;

export interface ToVrmOptions {
  /** Spring bones, built once the model is in meters and at rest. */
  springs?(root: Object3D): VRMSpringBoneManager | null;
  /** Name for the VRM meta; default "avatar". */
  name?: string;
}

const REQUIRED = ["hips", "spine", "head", "leftUpperArm", "leftLowerArm", "leftHand", "rightUpperArm", "rightLowerArm", "rightHand", "leftUpperLeg", "leftLowerLeg", "leftFoot", "rightUpperLeg", "rightLowerLeg", "rightFoot"] as const;

/**
 * Wraps a loaded non VRM avatar (GLB, FBX) in an in memory three-vrm `VRM`,
 * so one frame loop drives every format: a humanoid whose normalized bones
 * have identity rest rotations, an expression manager built from the rig
 * expression table, eye bone look at inside `EYE_RANGE`, and optional
 * springs. The model must be normalized (`loadAvatar` does that). Call
 * `vrm.update(dt)` each frame and pose the normalized bones.
 */
export function toVrm(avatar: Pick<Avatar, "root" | "bones" | "vrm">, opts: ToVrmOptions = {}): VRM {
  if (avatar.vrm) return avatar.vrm.vrm as VRM;
  const missing = REQUIRED.filter((b) => !avatar.bones[b]);
  if (missing.length) throw new Error(`avatar: no humanoid skeleton, missing ${missing.slice(0, 4).join(", ")}.`);
  avatar.root.updateMatrixWorld(true);
  const humanBones = Object.fromEntries(Object.entries(avatar.bones).map(([name, node]) => [name, { node }])) as unknown as VRMHumanBones;
  const humanoid = new VRMHumanoid(humanBones, { autoUpdateHumanBones: true });
  // the rig sits beside the model, so both share world units
  const scene = new Group();
  scene.name = opts.name ?? "avatar";
  const parent = avatar.root.parent;
  if (parent) parent.add(scene);
  scene.add(avatar.root, humanoid.normalizedHumanBonesRoot);

  const meshes: Mesh[] = [];
  avatar.root.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh && m.morphTargetDictionary) meshes.push(m);
  });
  const names = new Set(meshes.flatMap((m) => Object.keys(m.morphTargetDictionary!)));
  const manager = new VRMExpressionManager();
  for (const [preset, found] of Object.entries(resolveExpressions(names))) {
    if (!found) continue;
    const e = new VRMExpression(preset);
    for (const b of found.binds)
      for (const m of meshes) {
        const index = m.morphTargetDictionary![b.morph];
        if (index !== undefined) e.addBind(new VRMExpressionMorphTargetBind({ primitives: [m], index, weight: b.weight }));
      }
    // smiles on such rigs often close the eyes already; a blink on top pushes the lids through
    if (preset === "happy" || preset === "relaxed") e.overrideBlink = "blend";
    manager.registerExpression(e);
    scene.add(e);
  }

  let lookAt: VRMLookAt | undefined;
  const l = humanoid.getRawBoneNode("leftEye");
  const r = humanoid.getRawBoneNode("rightEye");
  const head = humanoid.getRawBoneNode("head");
  if (l && r && head) {
    const side = new VRMLookAtRangeMap(90, EYE_RANGE.yaw);
    const vert = new VRMLookAtRangeMap(90, EYE_RANGE.pitch);
    lookAt = new VRMLookAt(humanoid, new VRMLookAtBoneApplier(humanoid, side, side, vert, vert));
    const mid = l.getWorldPosition(new Vector3()).add(r.getWorldPosition(new Vector3())).multiplyScalar(0.5);
    lookAt.offsetFromHeadBone.copy(mid.sub(head.getWorldPosition(new Vector3())));
  }
  const springs = opts.springs?.(avatar.root) ?? undefined;
  return new VRM({
    scene,
    humanoid,
    expressionManager: manager,
    ...(lookAt ? { lookAt } : {}),
    ...(springs ? { springBoneManager: springs } : {}),
    meta: { metaVersion: "1", name: opts.name ?? "avatar", authors: [], licenseUrl: "" },
  });
}
