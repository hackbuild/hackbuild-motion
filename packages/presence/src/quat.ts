// Quaternion helpers on flat arrays, x y z w, for the clip player.

/** A flat array of quaternions, x y z w. */
export type QuatArray = Float32Array | Float64Array | number[];

/** Shortest arc slerp of q[a..a+4] and r[b..b+4] into out[o..o+4]. */
export function slerpInto(q: QuatArray, a: number, r: QuatArray, b: number, t: number, out: QuatArray, o: number): void {
  const ax = q[a]!, ay = q[a + 1]!, az = q[a + 2]!, aw = q[a + 3]!;
  let bx = r[b]!, by = r[b + 1]!, bz = r[b + 2]!, bw = r[b + 3]!;
  let d = ax * bx + ay * by + az * bz + aw * bw;
  if (d < 0) {
    d = -d;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  let s0: number;
  let s1: number;
  if (d > 0.9995) {
    s0 = 1 - t;
    s1 = t;
  } else {
    const th = Math.acos(Math.min(1, d));
    const sn = Math.sin(th);
    s0 = Math.sin((1 - t) * th) / sn;
    s1 = Math.sin(t * th) / sn;
  }
  let x = s0 * ax + s1 * bx;
  let y = s0 * ay + s1 * by;
  let z = s0 * az + s1 * bz;
  let w = s0 * aw + s1 * bw;
  const n = Math.hypot(x, y, z, w) || 1;
  x /= n;
  y /= n;
  z /= n;
  w /= n;
  out[o] = x;
  out[o + 1] = y;
  out[o + 2] = z;
  out[o + 3] = w;
}

/** Angle in radians between two unit quaternions. */
export function quatAngle(q: QuatArray, a: number, r: QuatArray, b: number): number {
  const d = Math.abs(q[a]! * r[b]! + q[a + 1]! * r[b + 1]! + q[a + 2]! * r[b + 2]! + q[a + 3]! * r[b + 3]!);
  return 2 * Math.acos(Math.min(1, d));
}

/** Pitch about +X of a unit quaternion, radians, positive when +Z tips up. */
export function quatPitch(q: QuatArray, a: number): number {
  const x = q[a]!, y = q[a + 1]!, z = q[a + 2]!, w = q[a + 3]!;
  // rotated +Z axis
  const fy = 2 * (y * z - w * x);
  const fx = 2 * (x * z + w * y);
  const fz = 1 - 2 * (x * x + y * y);
  return Math.atan2(fy, Math.hypot(fx, fz));
}
