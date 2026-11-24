// The body surface of a hosted character and its frame order. Each frame:
// the clip player writes every bone (idle, then the body and upper layers),
// the head level lifts a glaring mocap head, the pose goes onto the bones,
// gaze turns neck, head and eyes and blinks the lids, the mouth follows its
// timeline or level, the face driver writes moods, clip face tracks, lids
// and mouth in one pass, then the avatar steps its own update (VRM springs
// and expressions, or the morph rig). With no idle clip the base layer is
// the rest stance, arms relaxed at the sides.
import type { AnimationClip, Object3D } from "three";
import { Quaternion, Vector3 } from "three";
import type { Rng } from "@hackbuild/organic";
import { type Clip, ClipPlayer, Face, GazeController, type GazeMode, HeadLevel, type PlayOptions, type Layer, RESTING_FACE } from "@hackbuild/presence";
import { type GazeRig, applyGaze, applyPose, clipFromThree, restStanceFromThree } from "@hackbuild/presence/three";
import { LipSync, type MouthTarget, drive } from "@hackbuild/lipsync";
import { HUMAN_BONES, type HumanBone } from "@hackbuild/rig/bones";
import type { Avatar, Part } from "@hackbuild/avatar/three";

export interface BodyOptions {
  rng: Rng;
  /** Gaze on neck, head and eyes. auto turns it on when the head's rest frame is upright and facing +Z. Default auto. */
  gaze?: boolean | "auto";
  /** Lift a head that clips hold low. Default on when gaze is on. */
  levelHead?: boolean;
  /** Which face channels the mouth writes. Default picked from the face's names. */
  mouth?: MouthTarget;
  /** Base layer: "relaxed" lowers the arms to the sides, "rest" keeps the loaded rest pose. Default relaxed. */
  stance?: "relaxed" | "rest";
  /** Weights a quiet face rests at; false for a neutral face. Default RESTING_FACE (a slight smile). */
  restingFace?: Readonly<Record<string, number>> | false;
}

/** What a loaded body can do, for the capability note under the stage. */
export interface BodyCaps {
  bones: number;
  expressions: string[];
  clips: string[];
  parts: number;
  mouth: boolean;
  blink: boolean;
  gaze: boolean;
}

const UPPER = /^(spine|chest|upperChest|neck|head|left|right)(?!.*(Leg|Foot|Toes))/;
// the rest frame is upright and faces +Z within about 10 degrees (proposed)
const aligned = (o: Object3D | undefined): boolean => !o || o.getWorldQuaternion(new Quaternion()).angleTo(new Quaternion()) < 0.17;

interface VrmLike {
  expressionManager?: { expressions?: { expressionName: string }[] };
  lookAt?: { yaw: number; pitch: number; target?: unknown };
}

export class Body {
  readonly names: HumanBone[] = [];
  readonly bones: Object3D[] = [];
  readonly player: ClipPlayer;
  readonly gaze: GazeController | null;
  readonly lip = new LipSync();
  /** The face driver every expression weight goes through. */
  readonly face: Face;
  readonly caps: BodyCaps;
  readonly mouth: MouthTarget;
  /** Turn gaze off and on without a new body. */
  gazeOn: boolean;
  private readonly level: HeadLevel | null;
  private readonly head: number;
  private readonly rig: GazeRig | null;
  private readonly vrmLook: VrmLike["lookAt"] | null;
  private readonly converted = new WeakMap<AnimationClip, Clip>();
  private speaking = false;
  private readonly eye = new Vector3();
  private readonly tmp = new Vector3();
  private readonly q = new Quaternion();

  constructor(
    readonly avatar: Avatar,
    opts: BodyOptions,
  ) {
    for (const name of HUMAN_BONES) {
      const b = avatar.bones[name];
      if (b) {
        this.names.push(name);
        this.bones.push(b);
      }
    }
    avatar.root.updateMatrixWorld(true);
    let rest: Clip;
    if (opts.stance === "rest") {
      rest = { name: "rest", fps: 30, frames: 2, bones: this.bones.length, loop: true, rotations: new Float32Array(this.bones.length * 8) };
      this.bones.forEach((b, i) => {
        b.quaternion.toArray(rest.rotations, i * 4);
        b.quaternion.toArray(rest.rotations, (this.bones.length + i) * 4);
      });
    } else rest = restStanceFromThree(this.bones, this.names, avatar.root);
    this.face = new Face(avatar.expressions, { resting: opts.restingFace === false ? {} : (opts.restingFace ?? RESTING_FACE) });
    const upper: number[] = [];
    this.names.forEach((n, i) => UPPER.test(n) && upper.push(i));
    this.player = new ClipPlayer({ idle: rest, upperBones: upper });
    const head = avatar.bones.head;
    const vrm = (avatar.vrm?.vrm ?? null) as VrmLike | null;
    const upright = !!head && (!!vrm || (aligned(head) && aligned(avatar.bones.neck)));
    const gaze = opts.gaze ?? "auto";
    this.gazeOn = gaze === "auto" ? upright : gaze && !!head;
    this.gaze = head ? new GazeController({ rng: opts.rng }) : null;
    this.vrmLook = vrm?.lookAt ?? null;
    this.rig = head
      ? {
          head,
          neck: avatar.bones.neck ?? null,
          // eye bones that do not rest upright would spin; three-vrm drives VRM eyes through its look at
          leftEye: !this.vrmLook && aligned(avatar.bones.leftEye) ? (avatar.bones.leftEye ?? null) : null,
          rightEye: !this.vrmLook && aligned(avatar.bones.rightEye) ? (avatar.bones.rightEye ?? null) : null,
        }
      : null;
    this.head = this.names.indexOf("head");
    this.level = (opts.levelHead ?? this.gazeOn) && this.head >= 0 ? new HeadLevel() : null;
    const expressions = this.expressionNames();
    const morphs = avatar.expressions.found ? Object.keys(avatar.expressions.found) : [];
    const raw = (avatar.expressions as { morphNames?: string[] }).morphNames ?? [];
    this.mouth = opts.mouth ?? (expressions.includes("aa") ? "vrm" : raw.some((m) => /^viseme_/.test(m)) ? "oculus" : raw.includes("jawOpen") ? "arkit" : "vrm");
    this.caps = {
      bones: this.bones.length,
      expressions,
      clips: avatar.animations.map((a, i) => a.name || `clip ${i}`),
      parts: avatar.wardrobe.parts.length,
      mouth: expressions.includes("aa") || raw.some((m) => /^viseme_/.test(m)) || raw.includes("jawOpen"),
      blink: expressions.includes("blink") || morphs.includes("blink"),
      gaze: this.gazeOn,
    };
  }

  /** Expression names the face carries: VRM presets and custom names, or presets the morph rig resolved. */
  expressionNames(): string[] {
    const vrm = (this.avatar.vrm?.vrm ?? null) as VrmLike | null;
    const list = vrm?.expressionManager?.expressions?.map((e) => e.expressionName);
    if (list) return list;
    return this.avatar.expressions.found ? Object.keys(this.avatar.expressions.found) : [];
  }

  get name(): string {
    return this.avatar.root.name || this.avatar.dialect;
  }

  get wardrobe(): Part[] {
    return this.avatar.wardrobe.parts;
  }

  /** Holds one mood, eased in by the face driver; null hands the face back to its resting weights. */
  setExpression(name: string | null, weight = 1): void {
    this.face.set(name, weight);
  }

  /** A presence clip over this body's bone order, from one of its animations (by name or object). */
  clipOf(anim: AnimationClip | string, loop?: boolean): Clip | null {
    const a = typeof anim === "string" ? this.avatar.animations.find((x) => x.name === anim) : anim;
    if (!a) return null;
    let c = this.converted.get(a);
    if (!c) {
      c = clipFromThree(
        a,
        this.bones.map((b) => b.name),
        { rest: this.bones, ...(loop === undefined ? {} : { loop }) },
      );
      this.converted.set(a, c);
    }
    return c;
  }

  /** Plays a clip; returns its ticket, or -1 when the name is not one of the body's clips. */
  play(clip: Clip | AnimationClip | string, opts: PlayOptions = {}): number {
    const c = typeof clip === "string" || !("rotations" in clip) ? this.clipOf(clip) : clip;
    if (!c) return -1;
    if (c.bones !== this.bones.length) throw new Error(`this clip has ${c.bones} bones and the body ${this.bones.length}. build it with clipOf or over body.names.`);
    return this.player.play(c, opts);
  }

  stop(layer: Layer = "body", fade?: number): void {
    this.player.stop(layer, fade);
  }

  setGazeMode(mode: GazeMode): void {
    this.gaze?.setMode(mode);
  }

  setPartVisible(id: string, on: boolean): void {
    this.avatar.wardrobe.setVisible(id, on);
  }

  /** True while a clip or a mouth moves the body by itself (reduced motion keeps drawing then). */
  moving(): boolean {
    return this.player.layerWeight("body") > 0 || this.player.layerWeight("upper") > 0 || this.speaking || this.face.settling();
  }

  /** Where the eyes sit, world space. */
  eyePosition(out: Vector3): Vector3 {
    const l = this.avatar.bones.leftEye;
    const r = this.avatar.bones.rightEye;
    if (l && r) return l.getWorldPosition(out).add(r.getWorldPosition(this.tmp)).multiplyScalar(0.5);
    const head = this.avatar.bones.head;
    if (!head) return this.avatar.root.getWorldPosition(out);
    return head.getWorldPosition(out).add(this.tmp.set(0, 0.07, 0.08));
  }

  /**
   * One frame. `look` is the gaze target in world space, null to keep the
   * last; `still` stops idle motion (gaze, blink) for reduced motion;
   * `mouthTime` is the clock the speech events were timed on.
   */
  update(dt: number, look: Vector3 | null, still: boolean, mouthTime: number): void {
    const pose = this.player.update(dt);
    if (this.level && !still) this.level.apply(dt, pose, this.head);
    applyPose(pose, this.bones);
    if (this.gazeOn && this.gaze && this.rig && !still) {
      this.avatar.root.updateMatrixWorld(true);
      if (look) this.gaze.setTarget([look.x, look.y, look.z]);
      const e = this.eyePosition(this.eye);
      const hips = this.avatar.bones.hips;
      let yaw = 0;
      if (hips) {
        const f = this.tmp.set(0, 0, 1).applyQuaternion(hips.getWorldQuaternion(this.q));
        yaw = Math.atan2(f.x, f.z);
      }
      const g = this.gaze.update(dt, [e.x, e.y, e.z], yaw);
      applyGaze(g, this.rig);
      if (this.vrmLook) {
        this.vrmLook.yaw = (g.eyeYaw * 180) / Math.PI;
        this.vrmLook.pitch = (g.eyePitch * 180) / Math.PI;
      }
      this.face.lid(g.blink);
    } else if (still) this.face.lid(0);
    const mouth = this.lip.update(mouthTime, dt);
    this.speaking = mouth.source !== "silent";
    drive(this.face.mouth, mouth, this.mouth);
    this.face.update(dt, this.player.faces);
    this.avatar.update(dt);
  }

  dispose(): void {
    this.lip.stop();
    this.avatar.dispose();
  }
}
