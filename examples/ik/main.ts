import { load } from "@hackbuild/ik";
import { FootLock, lookAtChain, solveChain, solveTwoBone } from "@hackbuild/ik/three";
import * as THREE from "three";
import { bonesByName, humanoidRig, stage, sticks } from "../shared/scene.js";
import { $, FrameTimer, auto, check, finish, readout, result, sleep, status, fixture } from "../shared/ui.js";

const r = result("ik");
fixture("the arm, legs and chain are a rig built in code. no model file.");
$("#controls").innerHTML = `
<label class="hb-ctl">chain <select class="hb-select" id="method"><option>fabrik</option><option>ccd</option></select></label>
<label class="hb-check"><input id="look" type="checkbox" checked> head looks at the ball</label>
<label class="hb-check"><input id="lock" type="checkbox" checked> foot lock</label>
<label class="hb-ctl">ball speed <input class="hb-range" id="rate" type="range" min="0" max="2" step="0.05" value="1"></label>`;
const method = $("#method") as HTMLSelectElement;
const look = $("#look") as HTMLInputElement;
const lockOn = $("#lock") as HTMLInputElement;
const rate = $("#rate") as HTMLInputElement;

status("loading the ik wasm.");
await load();
const { renderer, scene, camera } = stage([0, 0.9, 0], 3);
const human = humanoidRig();
const b = bonesByName(human);
sticks(human, 0.015);
scene.add(human);

// a seven bone tentacle beside the figure for fabrik and ccd
const chain: THREE.Bone[] = [];
let parent: THREE.Object3D = scene;
for (let i = 0; i < 7; i++) {
  const bone = new THREE.Bone();
  bone.position.set(i === 0 ? -0.9 : 0, i === 0 ? 0 : 0.2, 0);
  parent.add(bone);
  chain.push(bone);
  parent = bone;
}
sticks(chain[0]!, 0.02);

const ball = (c: number) => new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), new THREE.MeshStandardMaterial({ color: c }));
const armBall = ball(0x2f9e44);
const chainBall = ball(0x9c36b5);
const footMark = ball(0xe03131);
scene.add(armBall, chainBall, footMark);
const lock = new FootLock();
const footTarget = new THREE.Vector3();
const shoulder = new THREE.Vector3();
const hand = new THREE.Vector3();
const timer = new FrameTimer();
let armErr = 0;
let chainErr = 0;
let lockedSlide = 0;
let lockedFrames = 0;
let prevLocked: THREE.Vector3 | null = null;
let t = 0;
let last = performance.now();
let prevYaw = 0;
status("the green ball pulls the left arm (two bone), the purple ball the tentacle, the red mark is the locked foot.", "ok");

function frame(now: number) {
  timer.tick(now);
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  t += dt * Number(rate.value);
  timer.time(() => {
    armBall.position.set(0.45 + 0.2 * Math.sin(0.7 * t), 1.3 + 0.25 * Math.sin(1.1 * t), 0.3 + 0.25 * Math.cos(0.9 * t));
    chainBall.position.set(-0.9 + 0.5 * Math.sin(0.8 * t), 0.9 + 0.3 * Math.cos(1.3 * t), 0.4 * Math.sin(0.5 * t));
    human.updateMatrixWorld(true);
    solveTwoBone(b.leftUpperArm!, b.leftLowerArm!, b.leftHand!, armBall.position, new THREE.Vector3(0, -0.4, -1));
    b.leftUpperArm!.getWorldPosition(shoulder);
    b.leftHand!.getWorldPosition(hand);
    if (shoulder.distanceTo(armBall.position) < 0.5) armErr = Math.max(armErr, hand.distanceTo(armBall.position));
    chainErr = solveChain(chain, chainBall.position, { method: method.value as "fabrik" | "ccd", iterations: 12 });
    if (look.checked) prevYaw = lookAtChain([b.neck!, b.head!], [0.4, 0.6], armBall.position, new THREE.Quaternion(), undefined, 1, prevYaw).yaw;
    // the right foot steps forward and back; contact is high on the back half of the cycle
    const ph = (t * 0.8) % 1;
    const swing = ph < 0.4;
    footTarget.set(-0.09, swing ? 0.08 + 0.08 * Math.sin((ph / 0.4) * Math.PI) : 0.08, 0.25 * Math.cos(ph * Math.PI * 2));
    const contact = swing ? 0 : 1;
    if (lockOn.checked) lock.update(dt, footTarget, contact);
    footMark.position.copy(footTarget);
    solveTwoBone(b.rightUpperLeg!, b.rightLowerLeg!, b.rightFoot!, footTarget, new THREE.Vector3(0, 0, 1));
    // the drift is measured on the solved foot, not on the lock's stored target
    human.updateMatrixWorld(true);
    const solved = b.rightFoot!.getWorldPosition(new THREE.Vector3());
    if (lockOn.checked && lock.locked) {
      if (prevLocked) lockedSlide = Math.max(lockedSlide, prevLocked.distanceTo(solved));
      prevLocked = solved;
      lockedFrames++;
    } else prevLocked = null;
  });
  renderer.render(scene, camera);
  if (Math.floor(now / 250) !== Math.floor((now - 17) / 250)) {
    const s = timer.stats();
    readout({
      "arm end error mm, worst while in reach (measured)": armErr * 1000,
      "chain end error mm (measured)": chainErr * 1000,
      "foot locked": lock.locked ? "yes" : "no",
      "locked foot drift mm, worst, solved foot (measured)": lockedSlide * 1000,
      "fps p50 (measured)": s.fpsP50,
      "ik work ms p95 (measured)": s.workMsP95,
    });
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (auto) {
  await sleep(1000);
  timer.reset();
  armErr = 0;
  lockedSlide = 0;
  await sleep(6000);
  Object.assign(r.numbers, timer.numbers(), {
    "arm end error mm worst (measured)": Math.round(armErr * 1e5) / 100,
    "chain end error mm last (measured)": Math.round(chainErr * 1e5) / 100,
    "locked foot drift mm worst, solved foot (measured)": Math.round(lockedSlide * 1e5) / 100,
    "locked frames (measured)": lockedFrames,
  });
  const ok = armErr < 1e-3 && lockedSlide < 1e-3 && lockedFrames > 0 && r.notes.length === 0;
  check(r, "ik: two bone, fabrik, look at and foot lock at real frame rate", ok ? "pass" : "fail", ok ? "" : `arm ${(armErr * 1000).toFixed(2)} mm, lock drift ${(lockedSlide * 1000).toFixed(2)} mm, locked frames ${lockedFrames}`);
  finish(r, ok ? "pass" : "fail");
}
