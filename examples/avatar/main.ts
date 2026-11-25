import { load } from "@hackbuild/avatar";
import { type Avatar, loadAvatar } from "@hackbuild/avatar/three";
import { vrmHook } from "@hackbuild/avatar/vrm";
import * as THREE from "three";
import { stage } from "../shared/scene.js";
import { $, FrameTimer, auto, check, finish, loadWeight, mb, onDrop, params, readout, result, sleep, status, attr } from "../shared/ui.js";

const r = result("avatar");
// Quaternius Universal Animation Library, standard pack: CC0 1.0. A mirror on
// GitHub pinned to one commit; the pack's home is quaternius.com.
const UAL = "https://raw.githubusercontent.com/IAFahim/quaternius.universalAnimationLibrary.standard/8456155dbae7eb861f553a2341871ccae633c857/UAL1_Standard.fbx";
$("#controls").innerHTML = `
<label class="hb-ctl is-wide">model url <input class="hb-input" id="url" type="url" inputmode="url" autocomplete="off" spellcheck="false" value="${attr(params.get("url") ?? UAL)}"></label>
<div class="hb-dropzone" id="drop"><span>or drop a .vrm, .glb or .fbx here, or tap to pick one</span> <input id="file" type="file" accept=".vrm,.glb,.gltf,.fbx" aria-label="pick a .vrm, .glb or .fbx model"></div>
<button class="hb-btn" id="go">load</button>
<label class="hb-ctl">clip <select class="hb-select" id="clip" disabled></select></label>
<label class="hb-check"><input id="fp" type="checkbox"> first person view (head hidden)</label>`;
const lic = document.createElement("p");
lic.className = "pg-note";
lic.textContent = "the default model is the quaternius universal animation library mannequin, cc0 1.0, 24.9 MB (vendor). any model you load stays in this tab.";
$("#controls").prepend(lic);
const clipSel = $("#clip") as HTMLSelectElement;
const fp = $("#fp") as HTMLInputElement;

await load();
const { renderer, scene, camera, controls } = stage([0, 1, 0], 3);
const fpCam = new THREE.PerspectiveCamera(70, 16 / 9, 0.02, 100);
let avatar: Avatar | null = null;
let mixer: THREE.AnimationMixer | null = null;
const timer = new FrameTimer();
let loadMs = 0;

async function open(src: string | File) {
  ($("#go") as HTMLButtonElement).disabled = true;
  if (avatar) scene.remove(avatar.root);
  const name = typeof src === "string" ? decodeURIComponent(src.split("/").pop() ?? "model") : src.name;
  const t0 = performance.now();
  const w = await loadWeight(src, { label: name, licence: "", sha256: "" }, (n, total) => status(`${name}: ${mb(n)} of ${total ? mb(total) : "unknown"}.`));
  status(`parsing ${name}.`);
  avatar = await loadAvatar(w.bytes, { name, vrm: vrmHook() });
  loadMs = performance.now() - t0;
  scene.add(avatar.root);
  mixer = new THREE.AnimationMixer(avatar.root);
  clipSel.replaceChildren(...avatar.animations.map((a, i) => new Option(a.name || `clip ${i}`, String(i))));
  clipSel.disabled = !avatar.animations.length;
  const walk = avatar.animations.findIndex((a) => /walk/i.test(a.name));
  if (walk >= 0) clipSel.value = String(walk);
  play();
  frameView();
  const warn = avatar.warnings.length ? ` ${avatar.warnings.join(" ")}` : "";
  status(`${name}: ${avatar.format}${avatar.dialect ? ` (${avatar.dialect})` : ""}, ${Object.keys(avatar.bones).length} humanoid bones, ${avatar.animations.length} clips.${warn}`, avatar.warnings.length ? "warn" : "ok");
  ($("#go") as HTMLButtonElement).disabled = false;
  return w;
}
function play() {
  if (!avatar || !mixer) return;
  mixer.stopAllAction();
  const a = avatar.animations[Number(clipSel.value)];
  if (a) mixer.clipAction(a).play();
}
clipSel.addEventListener("change", play);

// a narrow viewport frames the face: the camera sits in front of the head
// (+Z forward) at face distance; a wider one keeps the stage's whole body view
const host = renderer.domElement.parentElement!;
const wideCam = camera.position.clone();
const wideTarget = controls.target.clone();
const narrow = () => host.clientWidth < 641;
let framedNarrow: boolean | null = null;
function frameView() {
  framedNarrow = narrow();
  const headBone = avatar?.bones.head;
  if (!avatar || !headBone) return;
  avatar.root.updateMatrixWorld(true);
  const h = headBone.getWorldPosition(new THREE.Vector3());
  if (framedNarrow) {
    controls.target.set(h.x, h.y + 0.05, h.z);
    camera.position.set(h.x + 0.12, h.y + 0.1, h.z + 0.75);
  } else {
    controls.target.copy(wideTarget);
    camera.position.copy(wideCam);
  }
  controls.update();
}
new ResizeObserver(() => {
  if (framedNarrow !== null && framedNarrow !== narrow()) frameView();
}).observe(host);
$("#go").addEventListener("click", () => open(($("#url") as HTMLInputElement).value.trim()).catch((e) => status(`could not load: ${(e as Error).message}`, "bad")));
onDrop($("#drop"), ([f]) => f && open(f).catch((e) => status(`could not load ${f.name}: ${(e as Error).message}`, "bad")), $("#file") as HTMLInputElement);
if (!auto) status("press load for the cc0 mannequin, or drop your own model.");

const clock = new THREE.Timer();
const head = new THREE.Vector3();
let headHiddenInFp = false;
function frame(now: number) {
  timer.tick(now);
  clock.update(now);
  const dt = clock.getDelta();
  timer.time(() => {
    mixer?.update(dt);
    avatar?.update(dt);
  });
  if (avatar?.head && fp.checked) {
    const h = avatar.bones.head ?? avatar.head.head;
    h.getWorldPosition(head);
    fpCam.position.copy(head).add(new THREE.Vector3(0, 0.05, 0.08));
    fpCam.lookAt(head.x, head.y, head.z + 2);
    fpCam.aspect = camera.aspect;
    fpCam.updateProjectionMatrix();
    avatar.head.during(() => {
      headHiddenInFp = avatar!.head!.head.scale.x <= avatar!.head!.scale * 1.0001 || !avatar!.head!.head.visible;
      renderer.render(scene, fpCam);
    });
  } else renderer.render(scene, camera);
  controls.update();
  if (avatar && Math.floor(now / 250) !== Math.floor((now - 17) / 250)) {
    const s = timer.stats();
    readout({
      format: `${avatar.format} ${avatar.dialect}`,
      "humanoid bones": Object.keys(avatar.bones).length,
      "missing required": avatar.humanoid?.report.missingRequired.join(" ") || "none",
      "head height m (measured)": avatar.humanoid?.headHeight ?? 0,
      "load ms (measured)": loadMs,
      "fps p50 (measured)": s.fpsP50,
      "mixer and avatar work ms p95 (measured)": s.workMsP95,
    });
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (auto) {
  try {
    const w = await open(($("#url") as HTMLInputElement).value.trim());
    const a = avatar!;
    r.numbers["download ms (measured)"] = Math.round(w.ms);
    r.numbers["load to scene ms (measured)"] = Math.round(loadMs);
    r.numbers["model bytes (measured)"] = w.bytes.byteLength;
    r.numbers["humanoid bones (measured)"] = Object.keys(a.bones).length;
    r.notes.push(`sha-256 ${w.sha256}`, ...a.warnings);
    // arms after normalization, at rest: the upper arm should point along x (T pose)
    (mixer as THREE.AnimationMixer | null)?.stopAllAction();
    a.root.updateMatrixWorld(true);
    const dir = (b?: THREE.Object3D, c?: THREE.Object3D) => (b && c ? c.getWorldPosition(new THREE.Vector3()).sub(b.getWorldPosition(new THREE.Vector3())).normalize() : null);
    const la = dir(a.bones.leftUpperArm, a.bones.leftLowerArm);
    const droop = la ? (Math.asin(-la.y) * 180) / Math.PI : Number.NaN;
    r.numbers["left upper arm below horizontal deg after normalize (measured)"] = Math.round(droop * 100) / 100;
    let skinned = 0;
    a.root.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned++;
    });
    r.numbers["skinned meshes (measured)"] = skinned;
    check(r, "avatar: an FBX loaded from a real file", a.format === "fbx" && Object.keys(a.bones).length >= 15 ? "pass" : "fail", `${a.format}, ${Object.keys(a.bones).length} humanoid bones, ${a.animations.length} clips`);
    check(r, "avatar: skinned meshes after the A pose to T pose arm lift (UAL)", Math.abs(droop) < 5 && skinned > 0 ? "pass" : "fail", `left upper arm ${droop.toFixed(1)} deg below horizontal, ${skinned} skinned meshes (the deformation itself needs a person looking)`);
    check(r, "avatar: the same lift on real Mixamo and VRoid files", "not run", "no cc0 or mit mixamo or vroid file to fetch");
    check(r, "avatar: cutout materials on hair and lashes", "not run", "the cc0 mannequin has no hair or lashes");
    play();
    await sleep(1500);
    timer.reset();
    await sleep(4000);
    Object.assign(r.numbers, timer.numbers("third person "));
    fp.checked = true;
    await sleep(1500);
    const shot = renderer.domElement.toDataURL("image/png").length;
    check(r, "avatar: the head hider in a first person camera", a.head && headHiddenInFp ? "pass" : "fail", a.head ? `head scaled away during the first person draw: ${headHiddenInFp}; frame ${shot} png chars (whether it looks right needs a person)` : "no head hider");
    fp.checked = false;
    finish(r, Object.values(r.checks).some((c) => c.status === "fail") ? "fail" : "pass");
  } catch (e) {
    r.notes.push(String((e as Error).stack ?? e));
    finish(r, "fail", String((e as Error).message));
  }
}
