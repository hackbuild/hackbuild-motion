import { ClipSet, MotionMatcher, load } from "@hackbuild/motion-match";
import * as THREE from "three";
import { stage } from "../shared/scene.js";
import { $, FrameTimer, auto, check, finish, quantile, readout, result, sleep, status, fixture } from "../shared/ui.js";

const r = result("motion-match");
fixture("the clip database is synthetic gait clips built by the package: stand, walk, jog, run, turns, starts and stops. matching over real capture clips is a separate check.");
$("#controls").innerHTML = `
<label class="hb-ctl">speed m/s <input class="hb-range" id="speed" type="range" min="0" max="3.5" step="0.05" value="1.2"></label>
<label class="hb-ctl">turn rad/s <input class="hb-range" id="turn" type="range" min="-1.5" max="1.5" step="0.05" value="0"></label>
<label class="hb-check"><input id="wander" type="checkbox" checked> wander (changes speed and turn every 2 s)</label>`;
const speed = $("#speed") as HTMLInputElement;
const turn = $("#turn") as HTMLInputElement;
const wander = $("#wander") as HTMLInputElement;

status("loading the motion-match wasm and building the clip database.");
await load();
const t0 = performance.now();
const set = new ClipSet(30);
for (const g of [
  { speed: 0, strides: 4, looped: true },
  { speed: 0.6, strides: 4, looped: true },
  { speed: 1.3, strides: 4, looped: true },
  { speed: 2.4, strides: 4, looped: true },
  { speed: 3.4, strides: 4, looped: true },
  { speed: 1.2, turnRate: 0.9, strides: 4, looped: true },
  { speed: 1.2, turnRate: -0.9, strides: 4, looped: true },
  { speed: 0, turnRate: 1.2, strides: 3, looped: true },
  { speed: 0, turnRate: -1.2, strides: 3, looped: true },
  { speed: 0, speedEnd: 1.3, strides: 3 },
  { speed: 1.3, speedEnd: 0, strides: 3 },
  { speed: 1.3, speedEnd: 3.4, strides: 4 },
  { speed: 3.4, speedEnd: 1.3, strides: 4 },
])
  set.addSynthetic(g);
const mm = new MotionMatcher(set, { capabilities: { turnInPlace: true } });
const buildMs = performance.now() - t0;

const { renderer, scene, camera, controls } = stage([0, 0.6, 0], 3);
const mat = (c: number) => new THREE.MeshStandardMaterial({ color: c });
const hips = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), mat(0x3a6ea5));
const feet = [0, 1].map(() => new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.22), mat(0xc8742c)));
const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 0.5, 0x2f9e44);
const legGeo = new THREE.BufferGeometry();
const legPos = new Float32Array(12);
legGeo.setAttribute("position", new THREE.BufferAttribute(legPos, 3));
const legLines = new THREE.LineSegments(legGeo, new THREE.LineBasicMaterial({ color: 0x888888 }));
legLines.frustumCulled = false;
scene.add(hips, ...feet, arrow, legLines);
const trail = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 0.03, color: 0x9c36b5 }));
const trailPos = new Float32Array(600 * 3);
trail.geometry.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
trail.frustumCulled = false;
scene.add(trail);
let trailN = 0;

const timer = new FrameTimer();
const slides: number[] = [];
let prevFeet: THREE.Vector3[] | null = null;
let prevContacts: boolean[] = [];
let transitions0 = 0;
let elapsed = 0;
let last = performance.now();
let nextWander = 0;
const toWorld = (root: { x: number; z: number; yaw: number }, p: [number, number, number]) =>
  new THREE.Vector3(p[0], p[1], p[2]).applyAxisAngle(new THREE.Vector3(0, 1, 0), root.yaw).add(new THREE.Vector3(root.x, 0, root.z));
status("the matcher picks frames from the database to follow your speed and turn.", "ok");

function frame(now: number) {
  timer.tick(now);
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  elapsed += dt;
  if (wander.checked && elapsed > nextWander) {
    nextWander = elapsed + 2;
    // a fixed cycle so runs repeat: stand, walk, run, turn, turn in place
    const k = Math.floor(elapsed / 2) % 6;
    speed.value = String([1.2, 3.2, 0.6, 0, 1.4, 0][k]);
    turn.value = String([0, 0.3, -0.9, 1.2, 0.8, 0][k]);
  }
  const root = timer.time(() => mm.update(dt, { speed: Number(speed.value), turnRate: Number(turn.value) }));
  const pose = mm.pose();
  const motor = mm.motorState();
  const h = toWorld(root, pose.hips);
  hips.position.copy(h);
  const fw = pose.feet.map((f) => toWorld(root, f));
  fw.forEach((p, i) => {
    feet[i]!.position.copy(p);
    feet[i]!.rotation.y = root.yaw;
    legPos.set([h.x, h.y, h.z, p.x, p.y, p.z], i * 6);
  });
  legGeo.attributes.position!.needsUpdate = true;
  if (prevFeet) fw.forEach((p, i) => {
    if (motor.contacts[i] && prevContacts[i]) slides.push(Math.hypot(p.x - prevFeet![i]!.x, p.z - prevFeet![i]!.z));
  });
  prevFeet = fw;
  prevContacts = [...motor.contacts];
  arrow.position.set(root.x, 0.02, root.z);
  arrow.setDirection(new THREE.Vector3(Math.sin(root.yaw), 0, Math.cos(root.yaw)));
  trailPos.set([root.x, 0.01, root.z], (trailN++ % 600) * 3);
  trail.geometry.setDrawRange(0, Math.min(trailN, 600));
  trail.geometry.attributes.position!.needsUpdate = true;
  controls.target.lerp(new THREE.Vector3(root.x, 0.6, root.z), 0.08);
  camera.position.add(new THREE.Vector3(root.x, 0.6, root.z).sub(controls.target).multiplyScalar(0.08));
  controls.update();
  renderer.render(scene, camera);
  if (Math.floor(now / 250) !== Math.floor((now - 17) / 250)) {
    const s = timer.stats();
    readout({
      "clip, frame": `${mm.last.clip}, ${mm.last.frame}`,
      "match cost (computed)": mm.last.cost,
      transitions: mm.last.transitions,
      "contact foot slide mm per frame p95 (measured)": quantile(slides, 0.95) * 1000,
      "database build ms (measured)": buildMs,
      "fps p50 (measured)": s.fpsP50,
      "matcher work ms p95 (measured)": s.workMsP95,
    });
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (auto) {
  await sleep(1000);
  timer.reset();
  slides.length = 0;
  transitions0 = mm.last.transitions;
  await sleep(12000);
  const p95 = quantile(slides, 0.95);
  Object.assign(r.numbers, timer.numbers(), {
    "database build ms (measured)": Math.round(buildMs * 100) / 100,
    "transitions in 12 s (measured)": mm.last.transitions - transitions0,
    "contact foot slide mm per frame p95 (measured)": Math.round(p95 * 1e5) / 100,
    "contact foot slide mm per frame max (measured)": Math.round(quantile(slides, 1) * 1e5) / 100,
  });
  // bounds: the Rust test's worst planted slide (50 mm per frame) and a 10 mm p95; nothing locks feet here
  const max = quantile(slides, 1);
  const ok = r.notes.length === 0 && p95 < 0.01 && max < 0.05;
  check(r, "motion-match: synthetic clip database at real frame rate", ok ? "pass" : "fail", `transitions ${mm.last.transitions - transitions0} in 12 s, slide p95 ${(p95 * 1000).toFixed(2)} mm per frame (bound 10), max ${(max * 1000).toFixed(2)} mm (bound 50)`);
  check(r, "motion-match: matching over real CC0 UAL clips on a humanoid", "not run", "no adapter from a UAL clip to the matcher's clip input in the page yet; the clips load on the avatar page");
  finish(r, ok ? "pass" : "fail");
}
