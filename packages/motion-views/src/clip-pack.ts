// A clip pack: mocap clips baked offline onto one rig, as the dog
// simulator ships for its person (anims.json: roles, fps, and per clip the
// local rotations of each role bone as int16 base64). This turns a pack
// into presence clips over a body's own bone order, so the stage can play
// the pack's idle, talking idle and actions with the clip player's fades.
import type { Clip } from "@hackbuild/presence";

/** The pack file: role names, frame rate and the clips. */
export interface ClipPack {
  roles: readonly string[];
  fps: number;
  clips: Record<string, { dur: number; n: number; loop: boolean; q: string; p?: string }>;
}

// pack role to the humanoid bone name the body uses
const ROLE: Record<string, string> = {
  hips: "hips", spine: "spine", chest: "chest", upperChest: "upperChest", neck: "neck", head: "head",
  shoulderL: "leftShoulder", upperArmL: "leftUpperArm", lowerArmL: "leftLowerArm", handL: "leftHand",
  shoulderR: "rightShoulder", upperArmR: "rightUpperArm", lowerArmR: "rightLowerArm", handR: "rightHand",
  upperLegL: "leftUpperLeg", lowerLegL: "leftLowerLeg", footL: "leftFoot",
  upperLegR: "rightUpperLeg", lowerLegR: "rightLowerLeg", footR: "rightFoot",
};

function int16(b64: string): Int16Array {
  const s = atob(b64);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return new Int16Array(u.buffer);
}

/** How many of the pack's roles land on one of `names`. */
export function packCoverage(pack: ClipPack, names: readonly string[]): number {
  return pack.roles.filter((r) => ROLE[r] && names.includes(ROLE[r]!)).length;
}

/**
 * The pack's clips as presence clips over `names` (the body's bone order).
 * `base` holds bones times 4 local rotations for the bones the pack does
 * not move (fingers, eyes), usually the pose when the body loaded.
 */
export function packClips(pack: ClipPack, names: readonly string[], base: ArrayLike<number>): Record<string, Clip> {
  const R = pack.roles.length;
  const n = names.length;
  const slot = pack.roles.map((r) => (ROLE[r] ? names.indexOf(ROLE[r]!) : -1));
  const out: Record<string, Clip> = {};
  for (const [name, c] of Object.entries(pack.clips)) {
    const q = int16(c.q);
    const frames = c.n;
    const rotations = new Float32Array(frames * n * 4);
    for (let f = 0; f < frames; f++) {
      rotations.set(Array.prototype.slice.call(base, 0, n * 4) as number[], f * n * 4);
      for (let r = 0; r < R; r++) {
        const i = slot[r]!;
        if (i < 0) continue;
        const a = (f * R + r) * 4;
        let x = q[a]! / 32767, y = q[a + 1]! / 32767, z = q[a + 2]! / 32767, w = q[a + 3]! / 32767;
        const len = Math.hypot(x, y, z, w) || 1;
        x /= len; y /= len; z /= len; w /= len;
        rotations.set([x, y, z, w], (f * n + i) * 4);
      }
    }
    out[name] = { name, fps: pack.fps, frames, bones: n, loop: c.loop, rotations };
  }
  return out;
}
