// Clips written in code for the example pages, so a page plays motion
// before any file arrives. No asset file.

// A walk written as BVH text in code: a source rig with other names, centimeters,
// longer legs and arms down at 70 degrees, so the retarget has real work to do.
type J = [name: string, parent: number, offset: [number, number, number]];
const JOINTS: J[] = [
  ["Hips", -1, [0, 0, 0]],
  ["Spine", 0, [0, 12, 0]],
  ["Spine1", 1, [0, 16, 0]],
  ["Neck", 2, [0, 26, 0]],
  ["Head", 3, [0, 11, 0]],
  ["LeftArm", 2, [18, 22, 0]],
  ["LeftForeArm", 5, [29, 0, 0]],
  ["LeftHand", 6, [26, 0, 0]],
  ["RightArm", 2, [-18, 22, 0]],
  ["RightForeArm", 8, [-29, 0, 0]],
  ["RightHand", 9, [-26, 0, 0]],
  ["LeftUpLeg", 0, [10, -6, 0]],
  ["LeftLeg", 11, [0, -47, 0]],
  ["LeftFoot", 12, [0, -45, 0]],
  ["LeftToeBase", 13, [0, -8, 14]],
  ["RightUpLeg", 0, [-10, -6, 0]],
  ["RightLeg", 15, [0, -47, 0]],
  ["RightFoot", 16, [0, -45, 0]],
  ["RightToeBase", 17, [0, -8, 14]],
];
const HIP_Y = 106;

export function walkBvh(seconds = 2.4, fps = 30): string {
  const kids = (i: number) => JOINTS.map((j, k) => [j, k] as const).filter(([j]) => j[1] === i);
  const write = (i: number, depth: number): string => {
    const [name, parent, o] = JOINTS[i]!;
    const pad = "  ".repeat(depth);
    const ch = parent < 0 ? "CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation" : "CHANNELS 3 Zrotation Xrotation Yrotation";
    const c = kids(i);
    const body = c.length ? c.map(([, k]) => write(k, depth + 1)).join("") : `${pad}  End Site\n${pad}  {\n${pad}    OFFSET 0 6 0\n${pad}  }\n`;
    return `${pad}${parent < 0 ? "ROOT" : "JOINT"} ${name}\n${pad}{\n${pad}  OFFSET ${o.join(" ")}\n${pad}  ${ch}\n${body}${pad}}\n`;
  };
  const order: number[] = [];
  const visit = (i: number) => {
    order.push(i);
    for (const [, k] of kids(i)) visit(k);
  };
  visit(0);
  const n = Math.round(seconds * fps);
  const lines: string[] = [];
  for (let f = 0; f < n; f++) {
    const t = f / fps;
    const ph = t * 2 * Math.PI * 0.9;
    const rot: Record<string, [number, number, number]> = {};
    const s = Math.sin(ph);
    rot.LeftUpLeg = [0, -28 * s, 0];
    rot.RightUpLeg = [0, 28 * s, 0];
    rot.LeftLeg = [0, 45 * Math.max(0, Math.sin(ph + 1.4)), 0];
    rot.RightLeg = [0, 45 * Math.max(0, Math.sin(ph + 1.4 + Math.PI)), 0];
    rot.LeftFoot = [0, -10 * s, 0];
    rot.RightFoot = [0, 10 * s, 0];
    rot.LeftArm = [-70, 22 * s, 0];
    rot.RightArm = [70, -22 * s, 0];
    rot.LeftForeArm = [0, 0, -15];
    rot.RightForeArm = [0, 0, 15];
    rot.Spine = [0, 2, 4 * s];
    rot.Head = [0, -3, -3 * s];
    const vals: number[] = [];
    for (const i of order) {
      const name = JOINTS[i]![0];
      if (i === 0) vals.push(0, HIP_Y + 2.5 * Math.cos(2 * ph), t * 120, 2 * s, 0, 3 * s);
      else vals.push(...(rot[name] ?? [0, 0, 0]));
    }
    lines.push(vals.map((v) => v.toFixed(4)).join(" "));
  }
  return `HIERARCHY\n${write(0, 0)}MOTION\nFrames: ${n}\nFrame Time: ${(1 / fps).toFixed(6)}\n${lines.join("\n")}\n`;
}
