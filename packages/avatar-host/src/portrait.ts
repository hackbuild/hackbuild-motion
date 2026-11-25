// Still previews with three.js. One renderer draws synchronously into its
// own canvas, so it works in a background tab with no animation frames,
// and one instance serves every item, so the page holds one extra WebGL
// context. Clip previews pose one plain figure in a single flat clay
// colour, so every preview looks alike whichever character is loaded,
// at the clip's most telling frame: the sampled frame furthest from rest
// by the limbs and trunk. Avatar previews draw the loaded character at
// rest with its own materials. Both are seen from a little to the
// figure's left and above, orthographic, so every preview has the same
// scale cues.
import {
  AnimationMixer,
  Box3,
  type AnimationClip,
  Color,
  DirectionalLight,
  HemisphereLight,
  type Material,
  MathUtils,
  type Mesh,
  MeshStandardMaterial,
  type Object3D,
  OrthographicCamera,
  PropertyBinding,
  Quaternion,
  SRGBColorSpace,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import type { HumanBone } from "@hackbuild/rig/bones";
import { type Avatar, type VrmHook, disposeObject, posedBounds } from "@hackbuild/avatar/three";
import { placeholderBody } from "./placeholder.js";
import { type BodyLoadOptions, loadBody } from "./load.js";
import type { BodySource } from "./source.js";
import type { ThumbRenderer } from "./thumb-queue.js";

const YAW = MathUtils.degToRad(24);
const PITCH = MathUtils.degToRad(10);
const MARGIN = 1.06;
/** Frames tried when looking for the most telling one. */
export const SAMPLES = 24;
/** Bones that judge a frame; fingers would outvote them by count. */
export const MEASURED: readonly HumanBone[] = ["spine", "chest", "neck", "head", "leftShoulder", "leftUpperArm", "leftLowerArm", "rightShoulder", "rightUpperArm", "rightLowerArm", "leftUpperLeg", "leftLowerLeg", "rightUpperLeg", "rightLowerLeg"];

export interface PortraitOptions {
  /** Image width in pixels. Default 192. */
  width?: number;
  /** Image height in pixels. Default the width. */
  height?: number;
  /** A canvas to draw into; default a new one. */
  canvas?: HTMLCanvasElement;
}

const v = new Vector3();

/** One renderer, scene, lights and camera, and the framing both portraits share. */
class Shot {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new OrthographicCamera();

  constructor(opts: PortraitOptions) {
    const w = opts.width ?? 192;
    const h = opts.height ?? w;
    this.canvas = opts.canvas ?? document.createElement("canvas");
    this.renderer = new WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    const key = new DirectionalLight(0xffffff, 2.6);
    key.position.set(1.6, 2.6, 2.4);
    const rim = new DirectionalLight(0xffffff, 1.4);
    rim.position.set(-2, 1.4, -2);
    this.scene.add(key, rim, new HemisphereLight(0xffffff, 0x303038, 1.3));
  }

  get lost(): boolean {
    return this.renderer.getContext().isContextLost();
  }

  /** Fits `box` into the image, centred, and draws it as a PNG. */
  draw(box: Box3): Promise<Blob | null> {
    frameBox(this.camera, box, this.canvas.width / Math.max(1, this.canvas.height));
    this.renderer.render(this.scene, this.camera);
    return new Promise((ok) => this.canvas.toBlob(ok, "image/png"));
  }

  dispose(): void {
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

/** Points an orthographic camera at `box` from the portrait angle and fits it, `aspect` width over height. */
export function frameBox(cam: OrthographicCamera, box: Box3, aspect = 1): void {
  const center = box.getCenter(new Vector3());
  const reach = Math.max(1e-3, box.getSize(v).length() * 2);
  const dir = new Vector3(Math.sin(YAW) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(YAW) * Math.cos(PITCH));
  cam.position.copy(center).addScaledVector(dir, reach);
  cam.lookAt(center);
  cam.updateMatrixWorld(true);
  const lo = new Vector3(Infinity, Infinity, Infinity);
  const hi = new Vector3(-Infinity, -Infinity, -Infinity);
  const { min, max } = box;
  for (let i = 0; i < 8; i++) {
    v.set(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z).applyMatrix4(cam.matrixWorldInverse);
    lo.min(v);
    hi.max(v);
  }
  const halfH = (Math.max(hi.y - lo.y, (hi.x - lo.x) / aspect) / 2) * MARGIN;
  const halfW = halfH * aspect;
  const cx = (lo.x + hi.x) / 2;
  const cy = (lo.y + hi.y) / 2;
  Object.assign(cam, { left: cx - halfW, right: cx + halfW, top: cy + halfH, bottom: cy - halfH, near: 0.01, far: reach * 3 });
  cam.updateProjectionMatrix();
}

/** Rest transforms of a figure's bones, to return to between clips. */
interface Rest {
  node: Object3D;
  q: Quaternion;
  p: Vector3;
}

const restOf = (figure: Avatar): Rest[] => {
  const out: Rest[] = [];
  figure.root.traverse((node) => out.push({ node, q: node.quaternion.clone(), p: node.position.clone() }));
  return out;
};

const reset = (rest: readonly Rest[]): void => {
  for (const r of rest) {
    r.node.quaternion.copy(r.q);
    r.node.position.copy(r.p);
  }
};

/**
 * The time of the clip's most telling frame on `figure`: for a held pose
 * or a clip under 0.05 s its end, else the sampled frame between 10 and 90
 * percent whose measured bones turn furthest from their rest rotation
 * (the ends are where most clips stand near rest). Leaves the figure posed
 * at that time; the caller resets it.
 */
export function tellingTime(figure: Avatar, clip: AnimationClip, hold = false, samples = SAMPLES): number {
  const mixer = new AnimationMixer(figure.root);
  mixer.clipAction(clip).play();
  const d = clip.duration;
  const times = hold || d < 0.05 ? [d] : Array.from({ length: samples }, (_, i) => d * (0.1 + (0.8 * i) / Math.max(1, samples - 1)));
  let best = times[0]!;
  if (times.length > 1) {
    const bones = MEASURED.map((b) => figure.bones[b]).filter((n): n is Object3D => !!n);
    const rest = bones.map((n) => n.quaternion.clone());
    let bestScore = -1;
    for (const t of times) {
      mixer.setTime(t);
      let score = 0;
      bones.forEach((n, i) => (score += n.quaternion.angleTo(rest[i]!)));
      if (score > bestScore) [best, bestScore] = [t, score];
    }
  }
  mixer.setTime(best);
  // stopping the mixer puts the bones back, so the pose is kept by hand
  const posed = restOf(figure);
  mixer.stopAllAction();
  mixer.uncacheRoot(figure.root);
  reset(posed);
  return best;
}

/** One clip to preview: its id, the clip in normalized bone names, and whether it is a held pose. */
export interface ClipThumbJob {
  id: string;
  clip(): AnimationClip | Promise<AnimationClip>;
  /** A pose: show its last frame. */
  hold?: boolean;
}

export interface ClipPortraitOptions extends PortraitOptions {
  /** Clay colour. Default a warm grey. */
  color?: string | number;
  /** The figure; default the built in placeholder body. Its materials are replaced by the clay. */
  figure?: () => Avatar | Promise<Avatar>;
}

function clay(root: Object3D, material: Material): void {
  const old = new Set<Material>();
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) if (m !== material) old.add(m);
    mesh.material = material;
  });
  for (const m of old) {
    for (const val of Object.values(m)) if (val && (val as { isTexture?: boolean }).isTexture) (val as { dispose(): void }).dispose();
    m.dispose();
  }
}

/** Clip previews on one clay figure. */
export class ClipPortrait implements ThumbRenderer<ClipThumbJob> {
  private readonly rest: Rest[];
  private readonly material: MeshStandardMaterial;

  private constructor(
    readonly figure: Avatar,
    private readonly shot: Shot,
    color: string | number,
  ) {
    this.material = new MeshStandardMaterial({ name: "clay", color: new Color(color), roughness: 0.8, metalness: 0 });
    clay(figure.root, this.material);
    figure.root.traverse((o) => (o.frustumCulled = false));
    shot.scene.add(figure.root);
    this.rest = restOf(figure);
  }

  static async create(opts: ClipPortraitOptions = {}): Promise<ClipPortrait> {
    const figure = await (opts.figure ?? (() => placeholderBody()))();
    return new ClipPortrait(figure, new Shot(opts), opts.color ?? 0xc9c1b3);
  }

  get lost(): boolean {
    return this.shot.lost;
  }

  async draw(job: ClipThumbJob): Promise<Blob | null> {
    const clip = await job.clip();
    const bound = clip.tracks.some((t) => this.figure.root.getObjectByName(PropertyBinding.parseTrackName(t.name).nodeName));
    if (!bound) throw new Error("the clip moves no bone of this figure.");
    reset(this.rest);
    tellingTime(this.figure, clip, job.hold ?? false);
    this.figure.update(0);
    this.figure.root.updateMatrixWorld(true);
    const image = await this.shot.draw(posedBounds(this.figure.bones, 0.12));
    reset(this.rest);
    return image;
  }

  dispose(): void {
    this.figure.dispose();
    this.material.dispose();
    this.shot.dispose();
  }
}

/** One avatar to preview. The queue calls `release` on the source once its load settles. */
export interface AvatarThumbJob {
  id: string;
  source: BodySource;
}

export interface AvatarPortraitOptions extends PortraitOptions, BodyLoadOptions {}

/** Avatar previews: each character loads, is drawn at rest with its own materials, and is freed. */
export class AvatarPortrait implements ThumbRenderer<AvatarThumbJob> {
  private hook: Promise<VrmHook | null> | null = null;

  private constructor(
    private readonly shot: Shot,
    private readonly opts: AvatarPortraitOptions,
  ) {}

  static create(opts: AvatarPortraitOptions = {}): AvatarPortrait {
    return new AvatarPortrait(new Shot({ width: 240, height: 320, ...opts }), opts);
  }

  get lost(): boolean {
    return this.shot.lost;
  }

  async draw(job: AvatarThumbJob): Promise<Blob | null> {
    const src = job.source;
    let hook: VrmHook | null = null;
    if (src.kind === "vrm" && this.opts.vrm) hook = await (this.hook ??= this.opts.vrm());
    let avatar: Avatar | null = null;
    try {
      avatar = await loadBody(src, hook, this.opts);
      avatar.root.traverse((o) => (o.frustumCulled = false));
      this.shot.scene.add(avatar.root);
      avatar.update(0);
      avatar.root.updateMatrixWorld(true);
      const box = new Box3().setFromObject(avatar.root);
      return await this.shot.draw(box.isEmpty() ? posedBounds(avatar.bones) : box);
    } finally {
      src.release?.();
      if (avatar) avatar.dispose();
    }
  }

  dispose(): void {
    for (const o of [...this.shot.scene.children]) if (!(o as DirectionalLight).isLight) disposeObject(o);
    this.shot.dispose();
  }
}
