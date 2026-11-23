import { BodyDynamics, Ears, GAIT_NAMES, QuadrupedGait, TailWag, WAG_MODES, load } from "@hackbuild/gait";
import { driveQuadruped, measureQuadruped } from "@hackbuild/gait/three";
import * as THREE from "three";
import { DOG_NAMES, TOES, dogRig, lcg, stage, sticks } from "../shared/scene.js";
import { $, FrameTimer, auto, check, finish, readout, result, sleep, status } from "../shared/ui.js";

const r = result("gait");
$("#controls").innerHTML = `
<label>speed m/s <input id="speed" type="range" min="0" max="3" step="0.05" value="0.8"><span id="speedv">0.80</span></label>
<label>turn rad/s <input id="turn" type="range" min="-1.5" max="1.5" step="0.05" value="0.4"><span id="turnv">0.40</span></label>
<label>tail <select id="wag">${WAG_MODES.map((m, i) => `<option value="${i}"${i === 1 ? " selected" : ""}>${m}</option>`).join("")}</select></label>
<label>sit <input id="sit" type="range" min="0" max="1" step="0.05" value="0"></label>`;
const speed = $("#speed") as HTMLInputElement;
const turn = $("#turn") as HTMLInputElement;
const wag = $("#wag") as HTMLSelectElement;
const sit = $("#sit") as HTMLInputElement;
for (const [i, o] of [[speed, "#speedv"], [turn, "#turnv"]] as const) i.addEventListener("input", () => ($(o).textContent = Number(i.value).toFixed(2)));

status("loading the gait wasm.");
await load();
const { renderer, scene, camera, controls } = stage([0, 0.3, 0], 1.6);
const dog = dogRig();
const rig = measureQuadruped(dog, DOG_NAMES);
sticks(dog);
scene.add(dog);
const rng = lcg(7);
const gait = new QuadrupedGait(rig.specs, rig.legLength, { rng });
const body = new BodyDynamics(rig.geometry, rng);
const tail = new TailWag(3, 0.06, rng);
const ears = new Ears();
const pose = { x: 0, z: 0, yaw: 0 };
gait.reset(0, 0, 0);
const toes = TOES.map((n) => dog.getObjectByName(n)!);
const timer = new FrameTimer();
let slide = 0;
let unreached = 0;
let legFrames = 0;
let prev: THREE.Vector3[] | null = null;
let prevStance: boolean[] = [];
let last = performance.now();
status("the dog walks on the procedural gait. drag to orbit.", "ok");

function frame(now: number) {
  timer.tick(now);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const cmd = { speed: Number(speed.value), turnRate: Number(turn.value), posture: { sit: Number(sit.value) } };
  const s = timer.time(() => {
    pose.yaw += cmd.turnRate * dt;
    pose.x += Math.sin(pose.yaw) * cmd.speed * dt;
    pose.z += Math.cos(pose.yaw) * cmd.speed * dt;
    const s = gait.update(dt, pose, cmd);
    const b = body.update(dt, s, cmd, [0, 0, 0, 0]);
    gait.setOffsets(b.legOffsets);
    const w = WAG_MODES.map((_, i) => (i === Number(wag.value) ? 1 : 0));
    const missed = driveQuadruped(rig, pose, s, b, { tail: tail.update(dt, { modeWeights: w, arousal: 0.5, turnRate: cmd.turnRate }), ears: ears.update(dt, 0.6, 0, cmd.turnRate) });
    unreached += missed.length;
    legFrames += 4;
    return s;
  });
  const p = toes.map((t) => t.getWorldPosition(new THREE.Vector3()));
  if (prev) p.forEach((v, i) => {
    if (prevStance[i] && s.feet[i]!.stance) slide = Math.max(slide, v.distanceTo(prev![i]!));
  });
  prev = p;
  prevStance = s.feet.map((f) => f.stance);
  controls.target.lerp(new THREE.Vector3(pose.x, 0.3, pose.z), 0.1);
  camera.position.add(new THREE.Vector3(pose.x, 0.3, pose.z).sub(controls.target).multiplyScalar(0.1));
  controls.update();
  renderer.render(scene, camera);
  const name = GAIT_NAMES.reduce((a, g) => (s.weights[g] > s.weights[a] ? g : a), "walk");
  if (Math.round(now / 250) !== Math.round((now - 16) / 250)) {
    const st = timer.stats();
    readout({
      gait: s.standing ? "standing" : name,
      "froude (computed)": s.froude,
      "stride hz (computed)": s.frequency,
      "duty (computed)": s.duty,
      "planted toe slide mm, worst (measured)": slide * 1000,
      "legs out of reach (measured)": `${unreached} of ${legFrames}`,
      "fps p50 (measured)": st.fpsP50,
      "gait work ms p95 (measured)": st.workMsP95,
    });
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (auto) {
  await sleep(1000);
  timer.reset();
  slide = 0;
  await sleep(6000);
  Object.assign(r.numbers, timer.numbers(), { "planted toe slide mm worst (measured)": Math.round(slide * 1e5) / 100, "legs out of reach (measured)": unreached, "leg frames (measured)": legFrames });
  const ok = slide < 1e-3 && r.notes.length === 0;
  check(r, "gait: procedural dog walk at real frame rate, planted toes hold", ok ? "pass" : "fail", ok ? "" : `slide ${(slide * 1000).toFixed(2)} mm`);
  finish(r, ok ? "pass" : "fail");
}
