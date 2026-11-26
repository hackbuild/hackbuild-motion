// three.js adapter: offset inertialization over a list of bones.
import type { Bone, Object3D } from "three";
import { assertReady } from "./load.js";
import { Inertializer } from "./wasm/organic.js";

/** Options of `PoseInertializer`. */
export interface PoseInertializerOptions {
  /** Objects whose `position` is inertialized too, such as the hips or root. */
  positions?: Object3D[];
  /** Use the fast exp approximation. Default false. */
  fast?: boolean;
}

/**
 * Call `capture()` at a transition, then `apply(dt, halflife)` every frame
 * after the new pose has been written to the bones.
 */
export class PoseInertializer {
  private readonly bones: (Bone | Object3D)[];
  private readonly positions: Object3D[];
  private readonly core: Inertializer;
  private readonly rot: Float64Array;
  private readonly pos: Float64Array;

  constructor(bones: (Bone | Object3D | null | undefined)[], opts: PoseInertializerOptions = {}) {
    assertReady("@hackbuild/organic");
    this.bones = bones.filter((b): b is Bone | Object3D => !!b);
    this.positions = opts.positions ?? [];
    this.core = new Inertializer(this.bones.length, this.positions.length);
    if (opts.fast) this.core.setFast(true);
    this.rot = new Float64Array(this.bones.length * 4);
    this.pos = new Float64Array(this.positions.length * 3);
  }

  capture(): void {
    this.core.capture();
  }

  get active(): boolean {
    return this.core.active();
  }

  apply(dt: number, halflife: number): void {
    const { rot, pos } = this;
    this.bones.forEach((b, i) => {
      const q = b.quaternion;
      rot[i * 4] = q.x;
      rot[i * 4 + 1] = q.y;
      rot[i * 4 + 2] = q.z;
      rot[i * 4 + 3] = q.w;
    });
    this.positions.forEach((o, i) => {
      pos[i * 3] = o.position.x;
      pos[i * 3 + 1] = o.position.y;
      pos[i * 3 + 2] = o.position.z;
    });
    this.core.apply(rot, pos, dt, halflife);
    this.bones.forEach((b, i) => b.quaternion.set(rot[i * 4]!, rot[i * 4 + 1]!, rot[i * 4 + 2]!, rot[i * 4 + 3]!));
    this.positions.forEach((o, i) => o.position.set(pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!));
  }

  dispose(): void {
    this.core.free();
  }
}
