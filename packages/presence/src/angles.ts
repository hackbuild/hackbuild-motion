// Angles in the normalized humanoid space: +Y up, +Z forward, yaw positive
// toward +X (a turn about +Y), pitch positive up.

export type Vec3 = readonly [number, number, number];

export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

/** Wraps to (-pi, pi]. */
export function wrapAngle(a: number): number {
  const w = a - TAU * Math.floor((a + Math.PI) / TAU);
  return w === -Math.PI ? Math.PI : w;
}

/** Yaw and pitch of the direction from `from` to `to`. */
export function yawPitch(from: Vec3, to: Vec3): [number, number] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  return [Math.atan2(dx, dz), Math.atan2(dy, Math.hypot(dx, dz))];
}

/** Unit direction for a yaw and pitch. */
export function direction(yaw: number, pitch: number): [number, number, number] {
  const c = Math.cos(pitch);
  return [Math.sin(yaw) * c, Math.sin(pitch), Math.cos(yaw) * c];
}

/**
 * Hysteresis across the atan2 seam behind the body. A relative yaw past
 * `limit` that flips sign while the previous value was also past `limit`
 * keeps the previous sign, so a target crossing directly behind does not
 * whip the head 180 degrees. The held value continues past pi; it lets go
 * once the raw yaw comes back inside `limit` on either side.
 */
export class SeamHold {
  value = 0;
  constructor(public limit = 2.2) {}
  update(raw: number): number {
    let r = wrapAngle(raw);
    const prev = this.value;
    if (Math.abs(r) > this.limit && Math.abs(prev) > this.limit && Math.sign(r) !== Math.sign(prev)) {
      r += TAU * Math.sign(prev);
    }
    this.value = r;
    return r;
  }
  reset(value = 0): void {
    this.value = value;
  }
}
