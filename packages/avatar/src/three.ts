// three.js side of @hackbuild/avatar: load a character, repair its
// materials, put it in the normalized humanoid space, collect wardrobe
// parts, bind expressions, and hide the head for first person renders.
import {
  Box3,
  type Camera,
  type Color,
  LoadingManager,
  type Material,
  Mesh,
  MeshLambertMaterial,
  MeshPhongMaterial,
  MeshStandardMaterial,
  type Object3D,
  type Group,
  type AnimationClip,
  SRGBColorSpace,
  type Scene,
  type SkinnedMesh,
  type Texture,
  Vector3,
} from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { type ResolvedExpression, type VrmExpression, resolveExpressions } from "@hackbuild/rig/expressions";
import type { HumanBone } from "@hackbuild/rig/bones";
import type { RestReport, RigMapReport } from "@hackbuild/rig";
import { applyRestFix, mapObject3D, restOf } from "@hackbuild/rig/three";
import { type AvatarFormat, sniffFormat } from "./format.js";
import { TextureIndex } from "./textures.js";
import { GROUP_ORDER, type PartGroup, type SlotLabel, alternates, categorize, partLabel } from "./wardrobe.js";

// ---------------------------------------------------------------- materials

export interface RepairOptions {
  /** Alpha cutoff for materials turned into cutouts. Default 0.5. */
  cutoff?: number;
  /** Render both faces for meshes whose name passes, or for all when true. */
  doubleSided?: boolean | ((mesh: Mesh) => boolean);
  /** A texture whose image failed; default checks for a finished image of zero width. */
  isBroken?: (t: Texture) => boolean;
}

export interface RepairReport {
  /** Phong and Lambert materials replaced by MeshStandardMaterial. */
  converted: number;
  /** Materials turned into alpha cutouts. */
  cutouts: number;
  /** Black base colors under a texture reset to white. */
  whitened: number;
  /** Duplicate alpha maps and failed maps removed. */
  droppedMaps: number;
  /** Color maps set to sRGB. */
  colorSpace: number;
}

const MAP_SLOTS = ["map", "normalMap", "emissiveMap", "alphaMap", "roughnessMap", "metalnessMap", "aoMap", "bumpMap", "specularMap"] as const;

function defaultBroken(t: Texture): boolean {
  const img = t.image as { width?: number; naturalWidth?: number; complete?: boolean } | null | undefined;
  if (!img) return false;
  const w = img.naturalWidth ?? img.width;
  return img.complete === true && w === 0;
}

/**
 * Blinn-Phong shininess to a roughness: sqrt(2 / (n + 2)), the usual
 * Beckmann correspondence (inferred), clamped to 0.15 to 1.
 */
export const roughnessFromShininess = (n: number): number => Math.min(1, Math.max(0.15, Math.sqrt(2 / (Math.max(0, n) + 2))));

type AnyMat = Material & Record<string, unknown>;

function toStandard(m: MeshPhongMaterial | MeshLambertMaterial): MeshStandardMaterial {
  const s = new MeshStandardMaterial({
    name: m.name,
    color: m.color.clone(),
    map: m.map,
    emissive: m.emissive.clone(),
    emissiveMap: m.emissiveMap,
    emissiveIntensity: m.emissiveIntensity,
    alphaMap: m.alphaMap,
    normalMap: (m as MeshPhongMaterial).normalMap ?? null,
    transparent: m.transparent,
    opacity: m.opacity,
    side: m.side,
    alphaTest: m.alphaTest,
    vertexColors: m.vertexColors,
    roughness: m instanceof MeshPhongMaterial ? roughnessFromShininess(m.shininess) : 0.9,
    metalness: 0,
  });
  s.userData = { ...m.userData, repairedFrom: m.type };
  return s;
}

/**
 * Fixes the exporter errors that make dropped models look wrong: Phong and
 * Lambert become MeshStandardMaterial; an opaque material flagged
 * transparent becomes a cutout (teeth and eye sorting); zero opacity over a
 * texture becomes a cutout (Blender alpha setup); black base color under a
 * texture becomes white; an alpha map that repeats the color map is
 * dropped (FBXLoader reads it from the green channel); failed maps are
 * dropped; color maps are sRGB; skinned meshes are never frustum culled,
 * since their bounds stay at the rest pose.
 */
export function repairMaterials(root: Object3D, opts: RepairOptions = {}): RepairReport {
  const r: RepairReport = { converted: 0, cutouts: 0, whitened: 0, droppedMaps: 0, colorSpace: 0 };
  const cutoff = opts.cutoff ?? 0.5;
  const broken = opts.isBroken ?? defaultBroken;
  const done = new Map<Material, Material>();
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    if ((mesh as SkinnedMesh).isSkinnedMesh) mesh.frustumCulled = false;
    const two = typeof opts.doubleSided === "function" ? opts.doubleSided(mesh) : opts.doubleSided === true;
    const fix = (m: Material): Material => {
      const seen = done.get(m);
      if (seen) return seen;
      let out: Material = m;
      if (m instanceof MeshPhongMaterial || m instanceof MeshLambertMaterial) {
        out = toStandard(m);
        r.converted++;
      }
      const a = out as AnyMat;
      for (const slot of MAP_SLOTS) {
        const t = a[slot] as Texture | null | undefined;
        if (t && broken(t)) {
          a[slot] = null;
          r.droppedMaps++;
        }
      }
      const map = a.map as Texture | null | undefined;
      const alphaMap = a.alphaMap as Texture | null | undefined;
      if (map && alphaMap && (alphaMap === map || (alphaMap.image != null && alphaMap.image === map.image))) {
        a.alphaMap = null;
        r.droppedMaps++;
      }
      const color = a.color as Color | undefined;
      if (map && color && color.r === 0 && color.g === 0 && color.b === 0) {
        color.setRGB(1, 1, 1);
        r.whitened++;
      }
      if (map && out.opacity <= 0.001) {
        out.opacity = 1;
        out.transparent = false;
        out.alphaTest = cutoff;
        out.depthWrite = true;
        r.cutouts++;
      } else if (out.transparent && out.opacity >= 0.99 && !(a.alphaMap as Texture | null)) {
        out.transparent = false;
        out.alphaTest = Math.max(out.alphaTest, cutoff);
        out.depthWrite = true;
        r.cutouts++;
      }
      for (const slot of ["map", "emissiveMap"] as const) {
        const t = a[slot] as Texture | null | undefined;
        if (t && t.colorSpace !== SRGBColorSpace) {
          t.colorSpace = SRGBColorSpace;
          t.needsUpdate = true;
          r.colorSpace++;
        }
      }
      if (two) out.side = 2;
      out.needsUpdate = true;
      done.set(m, out);
      return out;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(fix) : fix(mesh.material);
  });
  return r;
}

/**
 * A LoadingManager that sends every texture reference through a lenient
 * index of the files the person dropped, so wrong paths in the model still
 * find their images. `files` maps relative path to a Blob or a URL.
 */
export function managerForFiles(files: ReadonlyMap<string, Blob | string>, modelName = ""): { manager: LoadingManager; index: TextureIndex; misses: string[]; dispose(): void } {
  const index = new TextureIndex([...files.keys()], modelName);
  const urls = new Map<string, string>();
  const created: string[] = [];
  const misses: string[] = [];
  const urlOf = (file: string) => {
    let u = urls.get(file);
    if (!u) {
      const v = files.get(file)!;
      u = typeof v === "string" ? v : URL.createObjectURL(v);
      if (typeof v !== "string") created.push(u);
      urls.set(file, u);
    }
    return u;
  };
  const manager = new LoadingManager();
  manager.setURLModifier((url) => {
    if (/^(blob|data|https?):/.test(url) && !files.has(url)) return url;
    const hit = index.forReference(decodeURIComponent(url));
    if (hit) return urlOf(hit);
    misses.push(url);
    return url;
  });
  return { manager, index, misses, dispose: () => created.forEach((u) => URL.revokeObjectURL(u)) };
}

// ---------------------------------------------------------------- humanoid

export interface NormalizeOptions {
  /** Head joint height in meters; default keeps the measured size. */
  headHeight?: number;
  /** Lift A pose arms to the T pose. Default true. */
  tPoseArms?: boolean;
  /** Straighten splayed legs. Default false. */
  straightLegs?: boolean;
}

export interface Humanoid {
  /** Group that holds the model in the normalized space. */
  root: Group;
  model: Object3D;
  bones: Partial<Record<HumanBone, Object3D>>;
  report: RigMapReport;
  rest: RestReport;
  /** Head joint height above the floor after normalizing, meters (measured). */
  headHeight: number;
}

/**
 * Maps the model's bones to VRM 1.0 names, then wraps it so it faces +Z,
 * stands in meters with its feet on y = 0, and lifts A pose arms into the
 * T pose. Throws with the missing bone list when a required bone is absent.
 * Needs the rig wasm: `await load()` first.
 */
export function normalizeHumanoid(model: Object3D, opts: NormalizeOptions = {}): Humanoid {
  model.updateMatrixWorld(true);
  const mapped = mapObject3D(model);
  if (mapped.report.missingRequired.length) throw new Error(`avatar: missing required bones: ${mapped.report.missingRequired.join(", ")}.`);
  const rest = restOf(mapped.bones);
  if (!rest) throw new Error("avatar: rest analysis needs hips, head and both arms.");
  const fix: { headHeight?: number; tPoseArms?: boolean; straightLegs?: boolean } = {};
  if (opts.headHeight !== undefined) fix.headHeight = opts.headHeight;
  if (opts.tPoseArms !== undefined) fix.tPoseArms = opts.tPoseArms;
  if (opts.straightLegs !== undefined) fix.straightLegs = opts.straightLegs;
  const root = applyRestFix(model, mapped.bones, rest, fix);
  root.updateMatrixWorld(true);
  const head = mapped.bones.head!.getWorldPosition(new Vector3());
  const rootY = root.parent ? root.parent.getWorldPosition(new Vector3()).y : 0;
  return { root, model, bones: mapped.bones, report: mapped.report, rest, headHeight: head.y - rootY };
}

// ---------------------------------------------------------------- wardrobe

export interface Part {
  id: string;
  name: string;
  label: SlotLabel | null;
  group: PartGroup | "other";
  /** Meshes the toggle shows and hides. */
  meshes: Mesh[];
  /** Set when the part is one material of a merged mesh. */
  material?: Material;
  visible: boolean;
}

/**
 * Parts per mesh, or per material when one mesh carries several named
 * materials (merged MMD style meshes). Alternate garment states start
 * hidden. Slots hold several parts; `equip` shows one and hides the rest of
 * its slot.
 */
export class Wardrobe {
  readonly parts: Part[] = [];

  static from(root: Object3D): Wardrobe {
    const w = new Wardrobe();
    const meshes: Mesh[] = [];
    root.traverse((o) => {
      if ((o as Mesh).isMesh) meshes.push(o as Mesh);
    });
    let n = 0;
    for (const mesh of meshes) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const named = mats.filter((m) => m.name);
      const meshCat = categorize(mesh.name);
      if (mats.length > 1 && named.length === mats.length && !(meshCat && meshCat.group !== "base")) {
        for (const m of mats) {
          const c = categorize(m.name);
          w.parts.push({ id: `p${n++}`, name: partLabel(m.name), label: c?.label ?? null, group: c?.group ?? "other", meshes: [mesh], material: m, visible: m.visible });
        }
      } else {
        const c = meshCat ?? (named[0] ? categorize(named[0].name) : null);
        w.parts.push({ id: `p${n++}`, name: partLabel(mesh.name || named[0]?.name || `mesh ${n}`), label: c?.label ?? null, group: c?.group ?? "other", meshes: [mesh], visible: mesh.visible });
      }
    }
    const alt = alternates(w.parts.map((p) => p.name));
    for (const p of w.parts) if (alt.has(p.name)) w.setVisible(p.id, false);
    const rank = (g: Part["group"]) => (g === "other" ? GROUP_ORDER.length - 0.5 : GROUP_ORDER.indexOf(g));
    w.parts.sort((a, b) => rank(a.group) - rank(b.group));
    return w;
  }

  get(id: string): Part | undefined {
    return this.parts.find((p) => p.id === id);
  }

  slot(label: SlotLabel): Part[] {
    return this.parts.filter((p) => p.label === label);
  }

  setVisible(id: string, on: boolean): void {
    const p = this.get(id);
    if (!p) return;
    p.visible = on;
    if (p.material) p.material.visible = on;
    else for (const m of p.meshes) m.visible = on;
  }

  toggle(id: string): boolean {
    const p = this.get(id);
    if (p) this.setVisible(id, !p.visible);
    return p?.visible ?? false;
  }

  /** Shows a part and hides the other parts in its slot. */
  equip(id: string): void {
    const p = this.get(id);
    if (!p) return;
    if (p.label) for (const o of this.slot(p.label)) if (o.id !== id) this.setVisible(o.id, false);
    this.setVisible(id, true);
  }

  snapshot(): Record<string, boolean> {
    return Object.fromEntries(this.parts.map((p) => [p.id, p.visible]));
  }

  restore(s: Record<string, boolean>): void {
    for (const [id, v] of Object.entries(s)) this.setVisible(id, v);
  }
}

// ---------------------------------------------------------------- expressions

/** What a face driver writes to: a preset or morph name and a weight. */
export interface ExpressionSink {
  setValue(name: string, weight: number): void;
}

/**
 * VRM presets on a plain model through the rig expression table: each
 * preset resolves once to morphs, and every mesh that carries a morph name
 * joins, so a face split from its lashes blinks as one. Weights set during
 * a frame add up and clamp to 1 when `apply` runs.
 */
export class ExpressionRig implements ExpressionSink {
  readonly found: Partial<Record<VrmExpression, ResolvedExpression>>;
  private readonly targets = new Map<string, { mesh: Mesh; index: number }[]>();
  private readonly values = new Map<string, number>();

  constructor(root: Object3D) {
    root.traverse((o) => {
      const m = o as Mesh;
      const dict = m.isMesh ? m.morphTargetDictionary : undefined;
      if (!dict) return;
      for (const [name, index] of Object.entries(dict)) {
        const list = this.targets.get(name) ?? [];
        list.push({ mesh: m, index });
        this.targets.set(name, list);
      }
    });
    this.found = resolveExpressions(this.targets.keys());
  }

  get morphNames(): string[] {
    return [...this.targets.keys()];
  }

  /** Sets a VRM preset, or a raw morph name when no preset has that name. */
  setValue(name: string, weight: number): void {
    this.values.set(name, Math.max(0, Math.min(1, weight)));
  }

  getValue(name: string): number {
    return this.values.get(name) ?? 0;
  }

  reset(): void {
    this.values.clear();
  }

  /** Writes the frame's weights into morph influences. */
  apply(): void {
    const sum = new Map<string, number>();
    for (const [name, w] of this.values) {
      const preset = this.found[name as VrmExpression];
      if (preset) for (const b of preset.binds) sum.set(b.morph, (sum.get(b.morph) ?? 0) + b.weight * w);
      else if (this.targets.has(name)) sum.set(name, (sum.get(name) ?? 0) + w);
    }
    for (const [name, list] of this.targets) {
      const w = Math.min(1, sum.get(name) ?? 0);
      for (const t of list) if (t.mesh.morphTargetInfluences) t.mesh.morphTargetInfluences[t.index] = w;
    }
  }
}

// ---------------------------------------------------------------- first person

/**
 * Hides the head for a first person render by scaling the head bone to
 * 0.001 for that render only, then restores it. Hair, hats and glasses
 * parented or skinned to the head go with it; the body still casts its
 * shadow in the other renders.
 */
export class HeadHider {
  private saved = new Vector3(1, 1, 1);
  private hidden = false;

  constructor(
    readonly head: Object3D,
    readonly scale = 0.001,
  ) {}

  hide(): void {
    if (this.hidden) return;
    this.saved.copy(this.head.scale);
    this.head.scale.setScalar(this.scale);
    this.head.updateMatrixWorld(true);
    this.hidden = true;
  }

  restore(): void {
    if (!this.hidden) return;
    this.head.scale.copy(this.saved);
    this.head.updateMatrixWorld(true);
    this.hidden = false;
  }

  /** Runs `draw` with the head hidden and restores it even when `draw` throws. */
  during<T>(draw: () => T): T {
    this.hide();
    try {
      return draw();
    } finally {
      this.restore();
    }
  }

  /** One render of `scene` from `camera` without the head. */
  render(renderer: { render(scene: Scene, camera: Camera): void }, scene: Scene, camera: Camera): void {
    this.during(() => renderer.render(scene, camera));
  }
}

/** World bounds of the posed skeleton plus a margin, for camera framing; skinned bounds stay at rest size. */
export function posedBounds(bones: Partial<Record<HumanBone, Object3D>>, margin = 0.12): Box3 {
  const box = new Box3();
  const v = new Vector3();
  for (const o of Object.values(bones)) if (o) box.expandByPoint(o.getWorldPosition(v));
  return box.expandByScalar(margin);
}

// ---------------------------------------------------------------- loading

export type AvatarSource = string | URL | ArrayBuffer | ArrayBufferView | Blob;

/** What `/vrm` hands to `loadAvatar` so VRM files load through @pixiv/three-vrm. */
export interface VrmHook {
  register(loader: GLTFLoader): void;
  /** Returns null when the file carried no VRM after all. */
  finish(gltf: GLTF): VrmResult | null;
}

export interface VrmResult {
  root: Object3D;
  bones: Partial<Record<HumanBone, Object3D>>;
  expressions: ExpressionSink;
  update(dt: number): void;
  meta: unknown;
  vrm: unknown;
}

export interface LoadOptions {
  /** File name, used to sniff when the bytes say nothing and to clean texture names. */
  name?: string;
  /** Resource path for relative references. */
  path?: string;
  manager?: LoadingManager;
  /** From `@hackbuild/avatar/vrm`; without it a VRM loads as plain glTF. */
  vrm?: VrmHook;
  repair?: RepairOptions | false;
  normalize?: NormalizeOptions;
}

export interface Avatar {
  format: AvatarFormat;
  /** Rig family the mapper saw: mixamo, unreal (UAL), vroid and so on. */
  dialect: string;
  root: Object3D;
  bones: Partial<Record<HumanBone, Object3D>>;
  humanoid: Humanoid | null;
  wardrobe: Wardrobe;
  expressions: ExpressionSink & Partial<Pick<ExpressionRig, "apply" | "reset" | "found">>;
  head: HeadHider | null;
  animations: AnimationClip[];
  repair: RepairReport | null;
  vrm: VrmResult | null;
  warnings: string[];
  /** Call once per frame after the pose is written. */
  update(dt: number): void;
}

async function bytesOf(src: AvatarSource): Promise<Uint8Array> {
  if (src instanceof ArrayBuffer) return new Uint8Array(src);
  if (ArrayBuffer.isView(src)) return new Uint8Array(src.buffer, src.byteOffset, src.byteLength);
  if (typeof Blob !== "undefined" && src instanceof Blob) return new Uint8Array(await src.arrayBuffer());
  const res = await fetch(src as string | URL);
  if (!res.ok) throw new Error(`avatar: fetch failed with ${res.status} for ${String(src)}.`);
  return new Uint8Array(await res.arrayBuffer());
}

const own = (b: Uint8Array): ArrayBuffer => (b.byteOffset === 0 && b.byteLength === b.buffer.byteLength ? (b.buffer as ArrayBuffer) : (b.slice().buffer as ArrayBuffer));

/**
 * Loads a character from a URL, bytes or a dropped File: VRM through the
 * `/vrm` hook when given, glTF and GLB (Mixamo, UAL, generic) and FBX
 * through the three.js loaders. Non VRM models are repaired and wrapped
 * into the normalized humanoid space. Needs the rig wasm: `await load()`.
 */
export async function loadAvatar(src: AvatarSource, opts: LoadOptions = {}): Promise<Avatar> {
  const name = opts.name ?? (typeof src === "string" || src instanceof URL ? String(src) : typeof File !== "undefined" && src instanceof File ? src.name : "");
  const bytes = await bytesOf(src);
  const format = sniffFormat(bytes, name);
  const warnings: string[] = [];
  const path = opts.path ?? (typeof src === "string" ? src.replace(/[^/]*$/, "") : "");
  let model: Object3D;
  let animations: AnimationClip[] = [];
  let vrm: VrmResult | null = null;
  if (format === "fbx") {
    model = new FBXLoader(opts.manager).parse(own(bytes), path);
    animations = (model as Object3D & { animations: AnimationClip[] }).animations ?? [];
  } else if (format === "glb" || format === "gltf" || format === "vrm") {
    const loader = new GLTFLoader(opts.manager);
    if (format === "vrm") {
      if (opts.vrm) opts.vrm.register(loader);
      else warnings.push("vrm loaded as plain gltf. pass vrmHook() from @hackbuild/avatar/vrm for spring bones and expressions.");
    }
    const gltf = await loader.parseAsync(own(bytes), path);
    animations = gltf.animations;
    model = gltf.scene;
    if (format === "vrm" && opts.vrm) vrm = opts.vrm.finish(gltf);
  } else {
    throw new Error(`avatar: ${format === "vrma" ? "a vrma file is an animation. load it with a clip loader." : "unknown model format."}`);
  }
  const repair = opts.repair === false ? null : repairMaterials(vrm ? vrm.root : model, opts.repair ?? {});
  let humanoid: Humanoid | null = null;
  let bones: Partial<Record<HumanBone, Object3D>>;
  let root: Object3D;
  let dialect = "vrm";
  let expressions: Avatar["expressions"];
  if (vrm) {
    root = vrm.root;
    bones = vrm.bones;
    expressions = vrm.expressions;
  } else {
    humanoid = normalizeHumanoid(model, opts.normalize ?? {});
    root = humanoid.root;
    bones = humanoid.bones;
    dialect = humanoid.report.dialect;
    if (humanoid.rest.aPose) warnings.push("arms were in an a pose and were lifted to a t pose.");
    if (humanoid.rest.units === "unknown") warnings.push("model units are unknown and it was not scaled. check its size.");
    else if (humanoid.rest.units !== "meters") warnings.push(`model was in ${humanoid.rest.units} and was scaled to meters.`);
    expressions = new ExpressionRig(model);
  }
  const wardrobe = Wardrobe.from(root);
  const head = bones.head ? new HeadHider(bones.head) : null;
  return {
    format,
    dialect,
    root,
    bones,
    humanoid,
    wardrobe,
    expressions,
    head,
    animations,
    repair,
    vrm,
    warnings,
    update(dt: number) {
      if (vrm) vrm.update(dt);
      else expressions.apply?.();
    },
  };
}

