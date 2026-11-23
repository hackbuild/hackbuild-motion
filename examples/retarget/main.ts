import { RetargetRig, analyzeMotion, load, parseBvh, parseVmd, type Clip, type Skeleton } from "@hackbuild/retarget";
import { skeletonFromObject3D, toAnimationClip } from "@hackbuild/retarget/three";
import * as THREE from "three";
import { humanoidRig, stage, sticks } from "../shared/scene.js";
import { $, FrameTimer, auto, check, finish, onDrop, readout, result, sleep, status } from "../shared/ui.js";

const r = result("retarget");
$("#controls").innerHTML = `
<div class="drop" id="drop">drop a .bvh or .vmd clip here, or <input id="file" type="file" accept=".bvh,.vmd"></div>
<label><input id="src" type="checkbox" checked> show the source skeleton</label>`;
const showSrc = $("#src") as HTMLInputElement;

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

function walkBvh(seconds = 2.4, fps = 30): string {
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

/** Bones for a parsed skeleton, so the source plays beside the target. */
function objectFromSkeleton(sk: Skeleton): THREE.Group {
  const root = new THREE.Group();
  const nodes: THREE.Bone[] = [];
  sk.names.forEach((name, i) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(sk.restT[i * 3]!, sk.restT[i * 3 + 1]!, sk.restT[i * 3 + 2]!);
    b.quaternion.set(sk.restR[i * 4]!, sk.restR[i * 4 + 1]!, sk.restR[i * 4 + 2]!, sk.restR[i * 4 + 3]!);
    nodes.push(b);
    (sk.parents[i]! < 0 ? root : nodes[sk.parents[i]!]!).add(b);
  });
  return root;
}

status("loading the retarget wasm.");
await load();
const { renderer, scene, camera, controls } = stage([0, 0.9, 1], 3.2);
const target = humanoidRig();
sticks(target, 0.015);
scene.add(target);
const targetScene = skeletonFromObject3D(target);
const targetRig = new RetargetRig(targetScene.skeleton);
const mixer = new THREE.AnimationMixer(target);
let srcMixer: THREE.AnimationMixer | null = null;
let srcRoot: THREE.Object3D | null = null;
let findings = "";
const timer = new FrameTimer();
const toe = new THREE.Vector3();
let minToe = Infinity;
let retargetMs = 0;

function play(skeleton: Skeleton, clip: Clip, unit: number, label: string) {
  const t0 = performance.now();
  const src = new RetargetRig(skeleton, { unit });
  const motion = src.toHumanoid(clip, { settle: true });
  const f = analyzeMotion(motion);
  const bound = targetRig.bind(motion);
  const anim = toAnimationClip(bound, targetScene, label);
  retargetMs = performance.now() - t0;
  mixer.stopAllAction();
  mixer.clipAction(anim).play();
  findings = `${f.tags.join(", ") || "no tags"}; ${f.duration.toFixed(2)} s${f.looping ? ", loops" : ""}`;
  if (srcRoot) scene.remove(srcRoot);
  srcRoot = objectFromSkeleton(skeleton);
  srcRoot.scale.setScalar(unit);
  srcRoot.position.x = -1;
  sticks(srcRoot, 0.015 / unit);
  scene.add(srcRoot);
  const srcScene = skeletonFromObject3D(srcRoot);
  srcMixer = new THREE.AnimationMixer(srcRoot);
  srcMixer.clipAction(toAnimationClip(clip, srcScene, `${label} source`)).play();
  src.dispose();
  minToe = Infinity;
  return f;
}

const bvh = parseBvh(walkBvh());
const first = play(bvh.skeleton, bvh.clip, 0.01, "walk");
status("a walk written in code as bvh (left, centimeters, other bone names) retargeted onto the normalized humanoid (right).", "ok");

onDrop(
  $("#drop"),
  async ([file]) => {
    if (!file) return;
    try {
      if (file.name.toLowerCase().endsWith(".vmd")) {
        const vmd = parseVmd(new Uint8Array(await file.arrayBuffer()));
        status(`read ${file.name}: ${Object.keys(vmd).join(", ")}. vmd needs a pmx rig to bind; this page plays bvh only.`, "warn");
        return;
      }
      const p = parseBvh(await file.text());
      const ys = [...p.skeleton.restT].filter((_, i) => i % 3 === 1);
      const unit = Math.max(...ys.map(Math.abs)) > 5 ? 0.01 : 1;
      play(p.skeleton, p.clip, unit, file.name);
      status(`${file.name} retargeted. units read as ${unit === 1 ? "meters" : "centimeters"} (inferred from offsets).`, "ok");
    } catch (e) {
      status(`could not read ${file.name}: ${(e as Error).message}`, "bad");
    }
  },
  $("#file") as HTMLInputElement,
);

const clock = new THREE.Clock();
function frame(now: number) {
  timer.tick(now);
  const dt = clock.getDelta();
  timer.time(() => {
    mixer.update(dt);
    srcMixer?.update(dt);
  });
  if (srcRoot) srcRoot.visible = showSrc.checked;
  target.updateMatrixWorld(true);
  for (const n of ["leftToes", "rightToes"]) minToe = Math.min(minToe, target.getObjectByName(n)!.getWorldPosition(toe).y);
  const hips = target.getObjectByName("hips")!.getWorldPosition(new THREE.Vector3());
  controls.target.lerp(new THREE.Vector3(hips.x - 0.5, 0.9, hips.z), 0.1);
  controls.update();
  renderer.render(scene, camera);
  if (Math.floor(now / 250) !== Math.floor((now - 17) / 250)) {
    const s = timer.stats();
    readout({
      findings,
      "retarget ms (measured)": retargetMs,
      "lowest toe y mm (measured)": minToe * 1000,
      "fps p50 (measured)": s.fpsP50,
      "mixer work ms p95 (measured)": s.workMsP95,
    });
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (auto) {
  await sleep(1000);
  timer.reset();
  minToe = Infinity;
  await sleep(5000);
  Object.assign(r.numbers, timer.numbers(), {
    "retarget ms (measured)": Math.round(retargetMs * 100) / 100,
    "lowest toe y mm (measured)": Math.round(minToe * 1e5) / 100,
    tags: first.tags.join(" "),
  });
  // the walk written in code has no foot contact fix, so toes may dip a little; inferred bound 30 mm either side
  const ok = first.tags.includes("walk") && Math.abs(minToe) < 0.03 && r.notes.length === 0;
  check(r, "retarget: bvh walk onto the normalized humanoid, tagged walk, lowest toe within 30 mm of the floor", ok ? "pass" : "fail", ok ? "" : `tags ${first.tags.join(" ")}, lowest toe ${(minToe * 1000).toFixed(1)} mm`);
  finish(r, ok ? "pass" : "fail");
}
