import { BONES, PARENTS, PAWS, Predictor, QuadrupedHost, STYLES, UPSTREAM, WEIGHT_LICENCE, loadWeights, type LoadOptions, type StyleLabel, type Weights } from "@hackbuild/motion-net";
import * as THREE from "three";
import { stage } from "../shared/scene.js";
import { $, FrameTimer, auto, check, finish, mb, onDrop, params, quantile, readout, result, sleep, status } from "../shared/ui.js";
import { mountHow } from "../shared/how.js";
import how from "../../packages/motion-net/how";

const r = result("motion-net");
check(r, "motion-net: the how this works fold", mountHow(how) ? "pass" : "fail");
// from 1024 px the controls sit in a column beside the view (ui.css, pg-side),
// so the whole view fits a 1280 by 720 screen; a phone keeps view first, controls below
document.body.classList.add("pg-side");
$("#controls").innerHTML = `
<p class="pg-note" id="licence"></p>
<details class="hb-fold" id="source" open><summary>weights: urls or files</summary><div>
<label class="hb-ctl is-wide">manifest url <input class="hb-input" id="murl" type="url" inputmode="url" autocomplete="off" spellcheck="false"></label>
<label class="hb-ctl is-wide">weights url <input class="hb-input" id="burl" type="url" inputmode="url" autocomplete="off" spellcheck="false"></label>
<button class="hb-btn hb-btn-2" id="upstream">fill in the published weights (cc by-nc 4.0, non-commercial use only)</button>
<button class="hb-btn" id="fetch">download and load</button>
<div class="hb-dropzone" id="drop"><span>or drop quadruped.json and quadruped.bin here, or tap to pick both</span> <input id="files" type="file" multiple accept=".json,.bin" aria-label="pick quadruped.json and quadruped.bin"></div>
</div></details>
<label class="hb-ctl">speed m/s <input class="hb-range" id="speed" type="range" min="0" max="3.5" step="0.05" value="1"><span class="hb-readout" id="speedv">1.00</span></label>
<label class="hb-ctl">turn rad/s <input class="hb-range" id="turn" type="range" min="-1.5" max="1.5" step="0.05" value="0"><span class="hb-readout" id="turnv">0.00</span></label>
<label class="hb-ctl">style <select class="hb-select" id="style"><option value="auto">auto by speed</option>${STYLES.map((s) => `<option>${s}</option>`).join("")}</select></label>
<label class="hb-check"><input id="wander" type="checkbox"> wander (changes speed and turn every 2 s)</label>
<label class="hb-check"><input id="noworker" type="checkbox"> run the network in the page (no worker)</label>`;
$("#licence").textContent = `${WEIGHT_LICENCE} nothing downloads until you press the button or drop the files. the weights are about ${mb(UPSTREAM.binBytes)}.`;
const murl = $("#murl") as HTMLInputElement;
const burl = $("#burl") as HTMLInputElement;
// url parameters go into value properties, never into markup. the fields
// start empty: the examples use cc0 or mit assets, so the cc by-nc weights
// are filled in only by the button that names their licence
murl.value = params.get("manifest") ?? "";
burl.value = params.get("bin") ?? "";
$("#upstream").addEventListener("click", () => {
  murl.value = UPSTREAM.manifest;
  burl.value = UPSTREAM.bin;
  status(`${WEIGHT_LICENCE} press download and load to fetch them.`, "warn");
});
const speed = $("#speed") as HTMLInputElement;
const turn = $("#turn") as HTMLInputElement;
const style = $("#style") as HTMLSelectElement;
const wander = $("#wander") as HTMLInputElement;
const noworker = $("#noworker") as HTMLInputElement;
for (const [i, o] of [[speed, "#speedv"], [turn, "#turnv"]] as const) i.addEventListener("input", () => ($(o).textContent = Number(i.value).toFixed(2)));
status("no weights loaded. the page has no network until you load them.", "warn");

// a dog of simple shapes: a sphere per joint, a stick from each joint to its parent
const { renderer, scene, camera, controls } = stage([0, 0.35, 0], 2.2);
const jointMat = new THREE.MeshStandardMaterial({ color: 0x3a6ea5 });
const pawMats = [0, 1, 2, 3].map(() => new THREE.MeshStandardMaterial({ color: 0xc8742c }));
const joints = BONES.map((_, i) => {
  const paw = [10, 15, 19, 23].indexOf(i);
  const m = new THREE.Mesh(new THREE.SphereGeometry(paw >= 0 ? 0.025 : 0.018, 12, 8), paw >= 0 ? pawMats[paw]! : jointMat);
  scene.add(m);
  return m;
});
const stickPos = new Float32Array(BONES.length * 6);
const stickGeo = new THREE.BufferGeometry();
stickGeo.setAttribute("position", new THREE.BufferAttribute(stickPos, 3));
const sticks = new THREE.LineSegments(stickGeo, new THREE.LineBasicMaterial({ color: 0x888888 }));
sticks.frustumCulled = false;
scene.add(sticks);
const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 0.4, 0x2f9e44);
scene.add(arrow);

let host: QuadrupedHost | null = null;
let predictor: Predictor | null = null;
let weights: Weights | null = null;

async function start(manifest: string | File, bin: string | File): Promise<void> {
  ($("#fetch") as HTMLButtonElement).disabled = true;
  try {
    status("loading the weights.");
    const opts: LoadOptions = {
      manifest,
      bin,
      onLicence: (t) => status(t),
      onProgress: (l, t) => status(`downloading weights: ${mb(l)}${t ? ` of ${mb(t)}` : ""}.`),
    };
    // the known hash belongs to the upstream copy; another url or a dropped file is checked by format only
    if (bin === UPSTREAM.bin) opts.sha256 = UPSTREAM.binSha256;
    weights = await loadWeights(opts);
    predictor?.dispose();
    predictor = await Predictor.create(weights, { worker: noworker.checked ? false : "auto" });
    host = new QuadrupedHost(predictor, weights.styles);
    const where = predictor.mode === "worker" ? "in a worker" : `in the page (${predictor.fallbackReason ?? "by choice"})`;
    status(`network loaded, running ${where}. ${WEIGHT_LICENCE}`, "ok");
    // the source fold closes once weights run; it opens again from its summary
    ($("#source") as HTMLDetailsElement).open = false;
  } catch (e) {
    status(`${(e as Error).message}. nothing was loaded.`, "bad");
    r.notes.push(`load: ${(e as Error).message}`);
  } finally {
    ($("#fetch") as HTMLButtonElement).disabled = false;
  }
}

$("#fetch").addEventListener("click", () => {
  if (!murl.value || !burl.value) status("no urls. enter both, drop the files, or fill in the published weights first.", "warn");
  else void start(murl.value, burl.value);
});
onDrop(
  $("#drop"),
  (files) => {
    const m = files.find((f) => f.name.endsWith(".json"));
    const b = files.find((f) => f.name.endsWith(".bin"));
    if (!m || !b) return status("drop both files: the .json manifest and the .bin weights.", "bad");
    void start(m, b);
  },
  $("#files") as HTMLInputElement,
);

const timer = new FrameTimer();
const slide: number[] = [];
const rawSlide: number[] = [];
const speeds: { want: number; got: number }[] = [];
let last = performance.now();
let elapsed = 0;
let nextWander = 0;

function frame(now: number) {
  timer.tick(now);
  const dt = (now - last) / 1000;
  last = now;
  if (host) {
    elapsed += Math.max(0, dt);
    if (wander.checked && elapsed > nextWander) {
      nextWander = elapsed + 2;
      const k = Math.floor(elapsed / 2) % 6;
      speed.value = String([1, 2.4, 0.6, 0, 1.6, 0][k]);
      turn.value = String([0, 0.3, -0.8, 1.2, 0.6, 0][k]);
    }
    const want = Number(speed.value);
    const root = timer.time(() => host!.update(dt, { speed: want, turnRate: Number(turn.value), style: style.value as StyleLabel | "auto" }));
    speeds.push({ want, got: root.speed });
    host.paws.forEach((p, i) => {
      if (p.stance && host!.rawFootSlide[i]! > 0) {
        slide.push(host!.footSlide[i]!);
        rawSlide.push(host!.rawFootSlide[i]!);
      }
      pawMats[i]!.color.setHex(p.stance ? 0xc8742c : 0x9aa0a6);
    });
    const P = host.positions;
    BONES.forEach((_, b) => {
      joints[b]!.position.set(P[b * 3]!, P[b * 3 + 1]!, P[b * 3 + 2]!);
      const q = PARENTS[b]!;
      const a = q < 0 ? b : q;
      stickPos.set([P[a * 3]!, P[a * 3 + 1]!, P[a * 3 + 2]!, P[b * 3]!, P[b * 3 + 1]!, P[b * 3 + 2]!], b * 6);
    });
    stickGeo.attributes.position!.needsUpdate = true;
    arrow.position.set(root.x, 0.02, root.z);
    arrow.setDirection(new THREE.Vector3(Math.sin(root.yaw), 0, Math.cos(root.yaw)));
    controls.target.lerp(new THREE.Vector3(root.x, 0.35, root.z), 0.08);
    camera.position.add(new THREE.Vector3(root.x, 0.35, root.z).sub(controls.target).multiplyScalar(0.08));
    controls.update();
  }
  renderer.render(scene, camera);
  if (host && Math.floor(now / 250) !== Math.floor((now - 17) / 250)) {
    const s = timer.stats();
    const m = host.motorState();
    if (slide.length > 2400) slide.splice(0, slide.length - 2400), rawSlide.splice(0, rawSlide.length - 2400);
    readout({
      style: host.style,
      engine: predictor?.mode ?? "none",
      "root speed m/s (measured)": Math.hypot(host.rootVelocity.x, host.rootVelocity.z),
      "turn rate rad/s (measured)": host.rootVelocity.turnRate,
      contacts: host.paws.map((p, i) => `${PAWS[i]} ${p.contact.toFixed(2)}`).join(", "),
      "stride hz, duty (measured)": `${m.strideFrequency.toFixed(2)}, ${m.duty.toFixed(2)}`,
      "foot slide mm per frame p95, pinned (measured)": quantile(slide, 0.95) * 1000,
      "foot slide mm per frame p95, network paws (measured)": quantile(rawSlide, 0.95) * 1000,
      "prediction latency ms, wall clock (measured)": host.latencyMs,
      "network ms per run (measured)": host.evalMs,
      "fps p50 (measured)": s.fpsP50,
    });
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (auto && (!murl.value || !burl.value)) {
  check(r, "motion-net: published weights load and run", "not run", "no manifest and bin parameters; the page never fetches the cc by-nc weights on its own");
  finish(r, "not run", "no weights given");
} else if (auto) {
  // the harness passes a local copy through the manifest and bin parameters
  await start(murl.value, burl.value);
  // start() assigns host; read it through a widened type
  const live = host as QuadrupedHost | null;
  if (!live) {
    check(r, "motion-net: published weights load and run", "not run", "the weights could not be fetched");
    finish(r, "not run", "no weights");
  } else {
    wander.checked = true;
    await sleep(3000);
    timer.reset();
    slide.length = 0;
    rawSlide.length = 0;
    speeds.length = 0;
    await sleep(12000);
    const p95 = quantile(slide, 0.95);
    Object.assign(r.numbers, timer.numbers(), {
      "engine (measured)": predictor!.mode,
      "foot slide mm per frame p95, pinned (measured)": Math.round(p95 * 1e5) / 100,
      "foot slide mm per frame p95, network paws (measured)": Math.round(quantile(rawSlide, 0.95) * 1e5) / 100,
      "prediction latency ms, wall clock (measured)": Math.round(live.latencyMs * 10) / 10,
      "network ms per run (measured)": Math.round(live.evalMs * 100) / 100,
    });
    check(r, "motion-net: quadruped host on the published weights at real frame rate", r.notes.length === 0 && p95 < 0.01 ? "pass" : "fail", `pinned slide p95 ${(p95 * 1000).toFixed(2)} mm per frame, engine ${predictor!.mode}`);
    finish(r, r.notes.length === 0 ? "pass" : "fail");
  }
}
