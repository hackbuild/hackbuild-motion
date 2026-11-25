// MMD models (PMX, PMD) as three-vrm VRMs, so one frame loop drives them
// with every other format. The parser is @moeru/three-mmd (MIT, an
// optional peer, a beta), imported on the first call only, so it never
// joins the chunks a page shares for three.js. Bones map through the mmd
// dialect of the rig mapper, with the D deform leg bones most models skin
// to. Rigid bodies become three-vrm spring bones: bodies that follow a bone
// become colliders, simulated bodies become joints. MMD IK and append
// rotation are not run; clips write the humanoid bones directly. Most MMD
// models forbid redistribution in their readme, so a model is only ever a
// file the person dropped, and the result says so with `local: true`.
import {
  VRMSpringBoneCollider,
  VRMSpringBoneColliderShapeCapsule,
  VRMSpringBoneColliderShapeSphere,
  type VRMSpringBoneColliderGroup,
  VRMSpringBoneJoint,
  VRMSpringBoneManager,
  type VRM,
} from "@pixiv/three-vrm";
import { type Bone, Euler, LoadingManager, MathUtils, type Object3D, type SkinnedMesh, Vector3 } from "three";
import type { HumanBone } from "@hackbuild/rig/bones";
import { mapObject3D } from "@hackbuild/rig/three";
import { type Avatar, type FileTextures, HeadHider, type NormalizeOptions, type VrmResult, Wardrobe, disposeObject, normalizeHumanoid } from "./three.js";
import { toVrm, vrmBones, vrmExpressionSink } from "./vrm.js";

/** Meters per MMD unit (vendor, the MMD convention of 8 cm). */
export const MMD_UNIT = 0.08;

type Vec3 = readonly [number, number, number];

/** The parts of a parsed PMX rigid body the spring builder reads. */
export interface MmdRigidBody {
  name?: string;
  boneIndex: number;
  /** 0 sphere, 1 box, 2 capsule. */
  shapeType: number;
  shapeSize: Vec3;
  /** Rest position in model space, model units. */
  shapePosition: Vec3;
  shapeRotation: Vec3;
  linearDamping: number;
  /** 0 follows its bone, 1 simulated, 2 simulated with the bone's position. */
  physicsMode: number;
}

/** The parts of a parsed PMX model the spring builder reads. */
export interface MmdModelData {
  bones: readonly { position: Vec3 }[];
  rigidBodies: readonly MmdRigidBody[];
}

const SPHERE = 0;
const BOX = 1;
const FOLLOW_BONE = 0;
const SKIRT = /スカート|裙|skirt/i;

/** Joint settings for a simulated bone: skirts a little stiffer than hair and ribbons (vendor). */
export function springSettings(boneName: string, linearDamping: number, sizeX: number, unit: number) {
  return {
    hitRadius: Math.min(sizeX * unit, 0.06),
    stiffness: SKIRT.test(boneName) ? 1.6 : 1.2,
    dragForce: MathUtils.clamp(0.45 + linearDamping * 0.5, 0.45, 0.9),
    gravityPower: 0.35,
    gravityDir: new Vector3(0, -1, 0),
  };
}

// spheres stay spheres; boxes and capsules become capsules along their long (local Y) axis
function colliderShape(b: MmdRigidBody, center: Vector3, unit: number): VRMSpringBoneColliderShapeSphere | VRMSpringBoneColliderShapeCapsule {
  const [x, y, z] = b.shapeSize;
  if (b.shapeType === SPHERE) return new VRMSpringBoneColliderShapeSphere({ offset: center, radius: x * unit });
  const radius = (b.shapeType === BOX ? Math.min(x, z) : x) * unit;
  const half = (b.shapeType === BOX ? y : y / 2) * unit;
  const axis = new Vector3(0, 1, 0).applyEuler(new Euler(b.shapeRotation[0], b.shapeRotation[1], b.shapeRotation[2], "YXZ"));
  return new VRMSpringBoneColliderShapeCapsule({ offset: center.clone().addScaledVector(axis, -half), tail: center.clone().addScaledVector(axis, half), radius });
}

/**
 * MMD rigid bodies as three-vrm spring bones. A body that follows its bone
 * becomes a collider on that bone; a simulated body on a bone outside the
 * humanoid becomes a joint from the bone to its child. `bones` is the
 * skeleton in PMX order, `unit` meters per model unit. Rigid bodies are
 * given at rest in model space, where every MMD bone is unrotated, so a
 * body's offset from its bone is its offset in the bone's own frame. Null
 * when no body is simulated.
 */
export function buildSprings(model: MmdModelData, bones: readonly Bone[], humanoid: ReadonlySet<Object3D>, unit: number): VRMSpringBoneManager | null {
  const restOf = (i: number): Vector3 => new Vector3().fromArray(model.bones[i]?.position ?? [0, 0, 0]);
  const offsetOf = (b: MmdRigidBody): Vector3 => new Vector3().fromArray(b.shapePosition).sub(restOf(b.boneIndex)).multiplyScalar(unit);
  const colliders: VRMSpringBoneCollider[] = [];
  const simulated = new Map<Bone, MmdRigidBody>();
  for (const b of model.rigidBodies) {
    const bone = bones[b.boneIndex];
    if (!bone) continue;
    if (b.physicsMode === FOLLOW_BONE) {
      const c = new VRMSpringBoneCollider(colliderShape(b, offsetOf(b), unit));
      c.name = b.name ? `collider ${b.name}` : "collider";
      bone.add(c);
      colliders.push(c);
    } else if (!humanoid.has(bone) && !simulated.has(bone)) simulated.set(bone, b);
  }
  if (!simulated.size) return null;
  const groups: VRMSpringBoneColliderGroup[] = [{ colliders, name: "body" }];
  const manager = new VRMSpringBoneManager();
  for (const [bone, b] of simulated) {
    const kids = bone.children.filter((c): c is Bone => (c as Bone).isBone === true);
    const child = kids.find((c) => simulated.has(c)) ?? kids[0] ?? null;
    manager.addJoint(new VRMSpringBoneJoint(bone, child, springSettings(bone.name, b.linearDamping, b.shapeSize[0], unit), groups));
  }
  manager.setInitState();
  return manager;
}

/**
 * MMD hangs the upper and lower body side by side under the center bone; a
 * VRM spine grows out of its hips. Moves the upper body under the lower one
 * at the same world transform, so turning the hips turns the whole figure.
 * Returns true when it moved anything.
 */
export function spineUnderHips(bones: Partial<Record<HumanBone, Object3D>>): boolean {
  const hips = bones.hips;
  const spine = bones.spine;
  if (!hips || !spine) return false;
  for (let p: Object3D | null = hips; p; p = p.parent) if (p === spine) return false;
  for (let p = spine.parent; p; p = p.parent) if (p === hips) return false;
  hips.updateWorldMatrix(true, false);
  spine.updateWorldMatrix(true, false);
  hips.attach(spine);
  return true;
}

export type MmdSource = Blob | ArrayBuffer | ArrayBufferView | string | URL;

export interface MmdLoadOptions {
  /** File name, for the meta and the wardrobe. */
  name?: string;
  /** From `managerForFiles` over the dropped folder: textures resolve by path, then by name. */
  files?: FileTextures;
  manager?: LoadingManager;
  /** Meters per model unit; default `MMD_UNIT`. */
  unit?: number;
  /** Rigid bodies as spring bones. Default true. */
  springs?: boolean;
  normalize?: Omit<NormalizeOptions, "unit" | "deform">;
  /** The parser module; default `import("@moeru/three-mmd")`. */
  parser?: () => Promise<{ MMDLoader: new (manager?: LoadingManager) => MmdLoaderLike }>;
}

/** The part of three-mmd's MMDLoader this module calls. */
export interface MmdLoaderLike {
  setResourcePath(path: string): unknown;
  loadAsync(url: string): Promise<{ mesh: SkinnedMesh; pmx: MmdModelData }>;
}

export interface MmdAvatar extends Avatar {
  format: "unknown";
  vrm: VrmResult;
  /** Always true: an MMD model stays on the device it was dropped on. */
  local: true;
  /** Spring colliders and joints built from the rigid bodies (computed). */
  physics: { colliders: number; joints: number };
}

/** The readme limits of most MMD models, said once on load. */
export const MMD_LOCAL_COPY = "mmd models usually forbid sharing. this one stays on this device.";

/** "pmx" or "pmd" from the first bytes, else null. */
export function mmdFormat(bytes: Uint8Array): "pmx" | "pmd" | null {
  const head = String.fromCharCode(...bytes.subarray(0, 4));
  if (head === "PMX ") return "pmx";
  if (head.startsWith("Pmd")) return "pmd";
  return null;
}

const urlOf = (src: MmdSource): { url: string; revoke(): void } => {
  if (typeof src === "string" || src instanceof URL) return { url: String(src), revoke() {} };
  const blob = src instanceof Blob ? src : new Blob([ArrayBuffer.isView(src) ? new Uint8Array(src.buffer as ArrayBuffer, src.byteOffset, src.byteLength) : src]);
  const url = URL.createObjectURL(blob);
  return { url, revoke: () => URL.revokeObjectURL(url) };
};

/**
 * Loads a dropped PMX or PMD model into the normalized humanoid space and
 * wraps it as a VRM: `avatar.vrm.vrm` is the three-vrm `VRM`, its
 * normalized bones are `avatar.bones`, and `avatar.update(dt)` steps
 * expressions, gaze and springs. Needs the rig wasm: `await load()`.
 */
export async function loadMmd(src: MmdSource, opts: MmdLoadOptions = {}): Promise<MmdAvatar> {
  const unit = opts.unit ?? MMD_UNIT;
  const name = opts.name ?? (typeof File !== "undefined" && src instanceof File ? src.name : "mmd");
  const { MMDLoader } = await (opts.parser ?? (() => import("@moeru/three-mmd") as unknown as ReturnType<NonNullable<MmdLoadOptions["parser"]>>))();
  const loader = new MMDLoader(opts.manager ?? opts.files?.manager ?? new LoadingManager());
  // texture references come back relative, so the drop index can find them
  if (opts.files || typeof src !== "string") loader.setResourcePath("./");
  const { url, revoke } = urlOf(src);
  let parsed: Awaited<ReturnType<MmdLoaderLike["loadAsync"]>>;
  try {
    parsed = await loader.loadAsync(url);
  } catch (e) {
    throw new Error(`avatar: the mmd file did not parse. ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    revoke();
  }
  const { mesh, pmx } = parsed;
  mesh.name ||= name;
  mesh.updateMatrixWorld(true);
  const mapped = mapObject3D(mesh);
  for (const d of mapped.report.deform) mapped.bones[d.bone] = mapped.nodes[d.node]!;
  spineUnderHips(mapped.bones);
  const humanoid = normalizeHumanoid(mesh, { ...opts.normalize, unit, deform: true });
  const raw = new Set<Object3D>(Object.values(humanoid.bones).filter((o): o is Object3D => !!o));
  const built: { m: VRMSpringBoneManager | null } = { m: null };
  const vrm: VRM = toVrm(
    { root: humanoid.root, bones: humanoid.bones, vrm: null },
    {
      name,
      springs: () => (opts.springs === false ? null : (built.m = buildSprings(pmx, mesh.skeleton.bones, raw, unit))),
    },
  );
  const joints = [...(built.m?.joints ?? [])];
  const physics = { colliders: new Set(joints.flatMap((j) => j.colliderGroups.flatMap((g) => g.colliders))).size, joints: joints.length };
  const expressions = vrmExpressionSink(vrm);
  const result: VrmResult = { root: vrm.scene, bones: vrmBones(vrm), expressions, update: (dt) => vrm.update(dt), meta: vrm.meta, vrm };
  const warnings = [MMD_LOCAL_COPY, "mmd ik and append rotation are not run; clips write the humanoid bones."];
  if (humanoid.rest.aPose) warnings.push("arms were in an a pose and were lifted to a t pose.");
  return {
    format: "unknown",
    dialect: humanoid.report.dialect,
    root: vrm.scene,
    bones: result.bones,
    humanoid,
    wardrobe: Wardrobe.from(mesh),
    expressions,
    head: result.bones.head ? new HeadHider(humanoid.bones.head!) : null,
    animations: [],
    repair: null,
    vrm: result,
    warnings,
    local: true,
    physics,
    update(dt: number) {
      vrm.update(dt);
    },
    dispose() {
      disposeObject(vrm.scene);
    },
  };
}
