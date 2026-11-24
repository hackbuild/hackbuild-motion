// The follow camera: keeps a posed body in view as clips move it. The orbit
// target eases after the body's centre (plus where the person panned to),
// and the distance eases to fit the pose unless the person zoomed by hand.
// Movement inside a dead zone moves nothing, so idle sway and gestures stay
// put on screen. The camera pulls back as soon as a pose outgrows the view
// and comes closer only once it is clearly too far.
import { Box3, MathUtils, type PerspectiveCamera, Vector3 } from "three";

export interface FollowOptions {
  /** Ease rate per second toward a new framing. Default 3 (vendor). */
  rate?: number;
  /** Body movement under this share of its height moves nothing. Default 0.06 (vendor). */
  deadZone?: number;
  /** Comes closer only when this share too far. Default 0.12 (vendor). */
  slack?: number;
  /** Fit margin over the tight fit. Default 1.12 (vendor). */
  margin?: number;
}

export class FollowCamera {
  /** Set when the person picked a distance; fitting then leaves it alone. */
  zoomed = false;
  /** Where the person panned to, from the body's centre. */
  readonly offset = new Vector3();
  readonly rate: number;
  readonly deadZone: number;
  readonly slack: number;
  readonly margin: number;
  private readonly v1 = new Vector3();
  private readonly v2 = new Vector3();
  private readonly v3 = new Vector3();

  constructor(
    readonly camera: PerspectiveCamera,
    /** The orbit target the camera looks at (OrbitControls.target). */
    readonly target: Vector3,
    opts: FollowOptions = {},
  ) {
    this.rate = opts.rate ?? 3;
    this.deadZone = opts.deadZone ?? 0.06;
    this.slack = opts.slack ?? 0.12;
    this.margin = opts.margin ?? 1.12;
  }

  distance(): number {
    return this.camera.position.distanceTo(this.target);
  }

  /** Distance at which the box fills the view with the margin, from any side. */
  fitDistance(box: Box3): number {
    const size = box.getSize(this.v2);
    const tan = Math.tan(MathUtils.degToRad(this.camera.fov / 2));
    const wide = Math.max(size.x, size.z);
    const deep = Math.min(size.x, size.z);
    return Math.max(size.y / 2 / tan, wide / 2 / (tan * this.camera.aspect)) * this.margin + deep / 2;
  }

  /** Frames the box from the front (+Z) and forgets the person's pan and zoom. */
  frame(box: Box3): void {
    const center = box.getCenter(this.v1);
    const h = Math.max(box.getSize(this.v3).y, 0.2);
    this.offset.set(0, 0, 0);
    this.zoomed = false;
    this.target.copy(center);
    this.camera.position.set(center.x, center.y + h * 0.04, center.z + this.fitDistance(box));
    this.camera.near = Math.max(h / 100, 0.01);
    this.camera.far = h * 100;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.target);
  }

  /** After the person let go: keep their pan as an offset, and their distance when it changed. */
  released(box: Box3 | null, startDistance: number): void {
    if (Math.abs(this.distance() - startDistance) > startDistance * 0.02) this.zoomed = true;
    if (box) this.offset.copy(this.target).sub(box.getCenter(this.v1));
  }

  /** One frame of following. Returns true when the camera moved. */
  step(box: Box3, dt: number): boolean {
    const k = 1 - Math.exp(-dt * this.rate);
    const h = Math.max(box.getSize(this.v2).y, 0.5);
    const gap = this.v1.copy(box.getCenter(this.v3)).add(this.offset).sub(this.target);
    const dead = this.deadZone * h;
    let moved = false;
    if (gap.length() > dead) {
      gap.setLength((gap.length() - dead) * k);
      this.target.add(gap);
      this.camera.position.add(gap);
      moved = true;
    }
    if (this.zoomed) return moved;
    const want = this.fitDistance(box);
    const now = this.distance();
    // a pose that outgrows the view starts the pull back on this frame
    if (want > now || want < now * (1 - this.slack)) {
      this.setDistance(now + (want - now) * k);
      moved = true;
    }
    return moved;
  }

  /** factor above 1 moves closer; the distance is then the person's. */
  zoomBy(factor: number, min = 0.2, max = 50): void {
    this.setDistance(MathUtils.clamp(this.distance() / factor, min, max));
    this.zoomed = true;
  }

  private setDistance(d: number): void {
    const dir = this.v1.subVectors(this.camera.position, this.target);
    dir.setLength(d);
    this.camera.position.copy(this.target).add(dir);
  }
}
