// The rest stance: arms relaxed at the sides instead of the T pose, the
// base layer when a body has no idle clip. Turns are about the body's +Z
// (forward) axis in the normalized humanoid space, so a left arm that
// points +X swings down toward -Y (values vendor).
import type { Clip } from "./clip.js";

/** Radians about the body's forward axis, per bone. */
export const RELAXED: Readonly<Record<string, number>> = {
  leftUpperArm: -1.18,
  rightUpperArm: 1.18,
  leftLowerArm: -0.08,
  rightLowerArm: 0.08,
};

/**
 * A two frame loop of the rest stance over `names`, for bones whose rest
 * frames line up with the body (VRM normalized bones, the placeholder).
 * `rest` holds local rest rotations (names.length * 4); default identity.
 * Bones with other rest frames go through `restStanceFromThree`.
 */
export function restStance(names: readonly string[], rest?: ArrayLike<number>): Clip {
  const n = names.length;
  const rotations = new Float32Array(n * 8);
  names.forEach((name, i) => {
    let [x, y, z, w] = rest ? [rest[i * 4]!, rest[i * 4 + 1]!, rest[i * 4 + 2]!, rest[i * 4 + 3]!] : [0, 0, 0, 1];
    const a = RELAXED[name];
    if (a !== undefined) {
      // about +Z premultiplied: dz * rest
      const s = Math.sin(a / 2);
      const c = Math.cos(a / 2);
      [x, y, z, w] = [c * x - s * y, c * y + s * x, c * z + s * w, c * w - s * z];
    }
    rotations.set([x, y, z, w], i * 4);
    rotations.set([x, y, z, w], (n + i) * 4);
  });
  return { name: "rest stance", fps: 30, frames: 2, bones: n, loop: true, rotations };
}
