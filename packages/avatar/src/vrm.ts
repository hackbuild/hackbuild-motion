// VRM through @pixiv/three-vrm (MIT, optional peer). VRM is already the
// normalized humanoid space, so this hook reads the normalized bones that
// three-vrm builds, turns VRM 0.x models to face +Z, and drives the face
// through the VRM expression manager.
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import type { Object3D } from "three";
import type { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HUMAN_BONES, type HumanBone } from "@hackbuild/rig/bones";
import type { VrmMetaLike } from "./format.js";
import type { ExpressionSink, VrmHook, VrmResult } from "./three.js";

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
