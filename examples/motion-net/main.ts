import { ProceduralBackend, QuadrupedGait, load as loadGait } from "@hackbuild/gait";
import {
  type BindPose,
  type CodebookFile,
  CodebookGait,
  NeuralFallback,
  QUADRUPED_LICENCE,
  codebookManifest,
  createSession,
  licenceNotice,
  readGuidance,
} from "@hackbuild/motion-net";
import * as THREE from "three";
import { parityInputs } from "../../packages/motion-net/scripts/inputs.mjs";
import { lcg, stage } from "../shared/scene.js";
import { $, FrameTimer, auto, check, finish, gpuInfo, loadWeight, mb, onDrop, params, quantile, readout, result, sleep, status, attr } from "../shared/ui.js";

const r = result("motion-net");
const UPSTREAM = "https://raw.githubusercontent.com/sweriko/ai4anim-webgpu/b539455f849f284a1e814eb11ab649eb594319dc/public";
// sha-256 of the upstream files at that commit (measured 2026-11-23)
const KNOWN = {
  json: "5953a50cd7b0ab4d37447e701bec2c58658cae1e990014591b661f077ed1019d",
  bin: "9568debf4a41da54f62d19bd7a29fbaf7dcc34c32d4ee472ab8560caefbcb372",
};
$("#controls").innerHTML = `
<label style="flex:1 1 100%">network json <input id="json" type="url" value="${attr(params.get("json") ?? `${UPSTREAM}/quadruped.json`)}"></label>
<label style="flex:1 1 100%">weights <input id="bin" type="url" value="${attr(params.get("bin") ?? `${UPSTREAM}/quadruped.bin`)}"></label>
<label style="flex:1 1 100%">bind pose json <input id="bind" type="url" placeholder="the 27 bind matrices of your dog rig" value="${attr(params.get("bind") ?? "")}"></label>
<div class="drop" id="drop">or drop quadruped.json, quadruped.bin and bind.json here <input id="files" type="file" multiple></div>
<button id="go">load (17.7 MB, CC BY-NC 4.0)</button>
<label>speed m/s <input id="speed" type="range" min="0" max="3" step="0.05" value="1" disabled></label>
<label>turn rad/s <input id="turn" type="range" min="-1.5" max="1.5" step="0.05" value="0.3" disabled></label>
<button id="stall" disabled>throttle the tab to 8 fps for 3 s</button>`;
const licence = document.createElement("p");
licence.textContent = `${licenceNotice(QUADRUPED_LICENCE)} the files load from the url you give or the files you drop; nothing is hosted here.`;
$("#controls").before(licence);
const dropped = new Map<string, File>();
onDrop($("#drop"), (fs) => {
  for (const f of fs) dropped.set(f.name.endsWith(".bin") ? "bin" : f.name.includes("bind") ? "bind" : "json", f);
  status(`dropped ${[...dropped.values()].map((f) => f.name).join(", ")}.`);
}, $("#files") as HTMLInputElement);

const speed = $("#speed") as HTMLInputElement;
const turn = $("#turn") as HTMLInputElement;
const stallBtn = $("#stall") as HTMLButtonElement;
const gpu = await gpuInfo();
status(gpu.adapter ? `webgpu adapter: ${gpu.vendor} ${gpu.architecture}. press load.` : `${gpu.reason} the network runs on the cpu path.`, gpu.adapter ? "info" : "warn");

async function text(key: "json" | "bind"): Promise<{ text: string; sha: string } | null> {
  const f = dropped.get(key);
  const url = ($(`#${key}`) as HTMLInputElement).value.trim();
  if (!f && !url) return null;
  const w = await loadWeight(f ?? url, { label: key, licence: QUADRUPED_LICENCE.licence, sha256: key === "json" && !f ? KNOWN.json : "" });
  return { text: new TextDecoder().decode(w.bytes), sha: w.sha256 };
}

async function run() {
  ($("#go") as HTMLButtonElement).disabled = true;
  const t0 = performance.now();
  status("loading the network json.");
  const jf = await text("json");
  if (!jf) throw new Error("no network json. give a url or drop quadruped.json.");
  const file = JSON.parse(jf.text) as CodebookFile;
  const binFile = dropped.get("bin");
  const binUrl = ($("#bin") as HTMLInputElement).value.trim();
  const w = await loadWeight(binFile ?? binUrl, { label: "quadruped weights", licence: QUADRUPED_LICENCE.licence, sha256: binFile ? "" : KNOWN.bin }, (n, total) =>
    status(`weights ${mb(n)} of ${total ? mb(total) : "unknown"}.`),
  );
  r.numbers["weights download and sha-256 ms (measured)"] = Math.round(w.ms);
  r.numbers["weights bytes (measured)"] = w.bytes.byteLength;
  r.notes.push(`weights sha-256 ${w.sha256}${w.sha256 === KNOWN.bin ? " matches upstream" : " (not the upstream file)"}`);
  status(`weights loaded, sha-256 ${w.sha256.slice(0, 12)}. ${licenceNotice(QUADRUPED_LICENCE)}`);
  const manifest = codebookManifest(file, QUADRUPED_LICENCE, w.sha256);

  // check 1: webgpu against the cpu f32 path on the seeded parity inputs
  const inputs = parityInputs(file.model.input_dim) as Float32Array[];
  const cpu = await createSession(manifest, w.bytes.slice(0), { prefer: ["wasm-simd"], accum: "f32", worker: true });
  r.numbers["cpu session where"] = cpu.where;
  if (gpu.adapter) {
    const g = await createSession(manifest, w.bytes.slice(0), { prefer: ["webgpu"] });
    let worst = 0;
    const gms: number[] = [];
    const cms: number[] = [];
    for (let rep = 0; rep < 5; rep++)
      for (const x of inputs) {
        const a = await g.run(x);
        gms.push(g.lastMs);
        const b = await cpu.run(x);
        cms.push(cpu.lastMs);
        for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i]! - b[i]!));
      }
    r.numbers["webgpu vs cpu f32 max abs diff (measured)"] = Number(worst.toExponential(3));
    r.numbers["webgpu run ms p50, 16 frames (measured)"] = Math.round(quantile(gms, 0.5) * 100) / 100;
    r.numbers["cpu worker run ms p50, 16 frames (measured)"] = Math.round(quantile(cms, 0.5) * 100) / 100;
    check(r, "motion-net: webgpu outputs within 1e-4 of the cpu f32 path, time per run", worst < 1e-4 ? "pass" : "fail", `max abs diff ${worst.toExponential(2)}`);
    g.dispose();
  } else check(r, "motion-net: webgpu outputs within 1e-4 of the cpu f32 path, time per run", "not run", gpu.reason);
  check(r, "motion-net: blob worker session over http", cpu.where === "worker" ? "pass" : "fail", `session ran in the ${cpu.where}`);
  check(r, "motion-net: blob worker from file:// and the in page fallback", "not run", "the harness serves over http; file:// and a page that refuses blob workers need their own run");
  cpu.dispose();

  const bf = await text("bind");
  if (!bf) {
    status("no bind pose. give the url of your dog rig's bind.json (27 bind matrices) or drop it to drive the network.", "warn");
    for (const c of ["gait on a dog rig at 60 hz", "handover on a stall", "turn in place"]) check(r, `motion-net: ${c}`, "not run", "no bind pose given");
    return;
  }
  const bind = JSON.parse(bf.text) as BindPose;
  status("starting the network gait.");
  await loadGait();
  const session = await createSession(manifest, w.bytes.slice(0), { onNotice: (line) => r.notes.push(line) });
  const neural = new CodebookGait(session, { file, bind, guidance: readGuidance(file, w.bytes) });
  const legs = [
    { x: 0.09, z: 0.25, toe: 0.02, front: true },
    { x: -0.09, z: 0.25, toe: 0.02, front: true },
    { x: 0.09, z: -0.2, toe: 0.02, front: false },
    { x: -0.09, z: -0.2, toe: 0.02, front: false },
  ];
  const cpg = new ProceduralBackend(new QuadrupedGait(legs, 0.38, { rng: lcg(3) }));
  const switches: string[] = [];
  const fb = new NeuralFallback(neural, cpg, { onSwitch: (to, why) => switches.push(`${to}: ${why}`) });
  r.numbers["neural backend"] = `${session.backend} in the ${session.where}`;
  r.numbers["first load to running ms (measured)"] = Math.round(performance.now() - t0);
  speed.disabled = turn.disabled = stallBtn.disabled = false;
  // contact sites: the ik chain targets in the upstream file (hand and foot sites)
  const chains = (file.skeleton as { ik_chains?: { target: number }[] }).ik_chains ?? [];
  drive(neural, fb, chains.map((c) => c.target), switches);
}

function drive(neural: CodebookGait, fb: NeuralFallback, sites: number[], switches: string[]) {
  const { renderer, scene, camera, controls } = stage([0, 0.3, 0], 2.2);
  const n = neural.boneNames.length;
  const joints = Array.from({ length: n }, () => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3a6ea5 }));
    scene.add(m);
    return m;
  });
  const lineGeo = new THREE.BufferGeometry();
  const linePos = new Float32Array(n * 6);
  lineGeo.setAttribute("position", new THREE.BufferAttribute(linePos, 3));
  const bonesLines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0xc8742c }));
  // the positions move every frame; the bounds computed at zero would cull the lines
  bonesLines.frustumCulled = false;
  scene.add(bonesLines);
  const timer = new FrameTimer();
  let cmd = { speed: Number(speed.value), turnRate: Number(turn.value) };
  let scripted: { speed: number; turnRate: number } | null = null;
  const slides: number[] = [];
  let jump = 0;
  let prev: Float64Array | null = null;
  let prevRoot = { x: 0, z: 0 };
  let prevContact: boolean[] = [];
  let last = performance.now();
  // a throttled tab: each frame blocks 120 ms for 3 s, so frames run long and predictions go stale
  let throttleUntil = 0;
  stallBtn.onclick = () => {
    throttleUntil = performance.now() + 3000;
  };
  const metrics = {
    reset() {
      slides.length = 0;
      jump = 0;
      timer.reset();
    },
  };
  function frame(now: number) {
    if (now < throttleUntil) {
      const t = performance.now();
      while (performance.now() - t < 120);
    }
    timer.tick(now);
    const dt = Math.max(0, Math.min(0.25, (now - last) / 1000));
    last = now;
    cmd = scripted ?? { speed: Number(speed.value), turnRate: Number(turn.value) };
    const root = timer.time(() => fb.update(dt, cmd));
    const p = neural.pose();
    const h = neural.health();
    for (let i = 0; i < n; i++) {
      joints[i]!.position.set(p.positions[i * 3]!, p.positions[i * 3 + 1]!, p.positions[i * 3 + 2]!);
      const par = neural.parents[i]!;
      linePos.set(par >= 0 ? [p.positions[par * 3]!, p.positions[par * 3 + 1]!, p.positions[par * 3 + 2]!, p.positions[i * 3]!, p.positions[i * 3 + 1]!, p.positions[i * 3 + 2]!] : [0, 0, 0, 0, 0, 0], i * 6);
    }
    lineGeo.attributes.position!.needsUpdate = true;
    const contact = sites.map((_, k) => p.contacts[k]! > 0.667);
    if (prev && fb.active === "neural" && h.ok) {
      sites.forEach((s, k) => {
        if (contact[k] && prevContact[k]) slides.push(Math.hypot(p.positions[s * 3]! - prev![s * 3]!, p.positions[s * 3 + 2]! - prev![s * 3 + 2]!));
      });
      const dr = Math.hypot(root.x - prevRoot.x, root.z - prevRoot.z);
      for (let i = 0; i < n; i++) jump = Math.max(jump, Math.hypot(p.positions[i * 3]! - prev[i * 3]!, p.positions[i * 3 + 1]! - prev[i * 3 + 1]!, p.positions[i * 3 + 2]! - prev[i * 3 + 2]!) - dr);
    }
    prev = Float64Array.from(p.positions);
    prevRoot = { x: root.x, z: root.z };
    prevContact = contact;
    controls.target.lerp(new THREE.Vector3(root.x, 0.3, root.z), 0.1);
    camera.position.add(new THREE.Vector3(root.x, 0.3, root.z).sub(controls.target).multiplyScalar(0.1));
    controls.update();
    renderer.render(scene, camera);
    if (Math.floor(now / 250) !== Math.floor((now - 17) / 250)) {
      const s = timer.stats();
      readout({
        source: fb.active,
        guidance: neural.guidance,
        health: h.ok ? "ok" : h.reason,
        "stale s (measured)": h.staleSeconds,
        "inference ms (measured)": h.inferenceMs,
        "contact foot slide mm p95 (measured)": quantile(slides, 0.95) * 1000,
        "worst joint jump past the root mm (measured)": jump * 1000,
        "fps p50 (measured)": s.fpsP50,
        "host work ms p95 (measured)": s.workMsP95,
      });
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  status("the network drives the dog. the throttle button makes frames run long so the gait hands over to the procedural one.", "ok");

  if (!auto) return;
  void (async () => {
    scripted = { speed: 1, turnRate: 0.3 };
    await sleep(2500);
    metrics.reset();
    const inf: number[] = [];
    for (let k = 0; k < 24; k++) {
      await sleep(250);
      inf.push(neural.health().inferenceMs);
    }
    const slideP95 = quantile(slides, 0.95);
    const slideMax = quantile(slides, 1);
    Object.assign(r.numbers, timer.numbers(), {
      "inference ms p50 (measured)": Math.round(quantile(inf, 0.5) * 100) / 100,
      "contact foot slide mm per frame p95 (measured)": Math.round(slideP95 * 1e5) / 100,
      "contact foot slide mm per frame max (measured)": Math.round(slideMax * 1e5) / 100,
      "worst joint jump past the root mm (measured)": Math.round(jump * 1e5) / 100,
    });
    // inferred bounds: a planted foot moving under 5 mm a frame reads as held at 60 Hz
    const held = slideP95 < 0.005;
    check(r, "motion-net: gait on a dog rig at 60 hz, feet hold while fresh, no pop", "not run", `measured only, nobody looked: slide p95 ${(slideP95 * 1000).toFixed(2)} mm, max ${(slideMax * 1000).toFixed(2)} mm, jump ${(jump * 1000).toFixed(1)} mm${held ? "" : " (over the 5 mm inferred bound)"}`);
    // stall: block the main thread so predictions go stale
    const before = switches.length;
    stallBtn.click();
    await sleep(3500);
    const handed = switches.slice(before).find((s) => s.startsWith("procedural"));
    await sleep(3500);
    const back = switches.slice(before).find((s) => s.startsWith("neural"));
    r.notes.push(...switches.slice(before));
    check(r, "motion-net: neural to procedural handover on a stall and back after 2 s", handed && back ? "pass" : "fail", `${handed ?? "no handover"}; ${back ?? "no return"} (switch timing only; the inertialized bones need a person looking)`);
    // turn in place
    scripted = { speed: 0, turnRate: 1.2 };
    await sleep(1500);
    const a = { ...neural.root };
    await sleep(3000);
    const b = { ...neural.root };
    const travel = Math.hypot(b.x - a.x, b.z - a.z);
    const turned = Math.abs(b.yaw - a.yaw);
    r.numbers["turn in place root travel m over 3 s (measured)"] = Math.round(travel * 1000) / 1000;
    r.numbers["turn in place yaw rad over 3 s (measured)"] = Math.round(turned * 1000) / 1000;
    check(r, "motion-net: turn in place on the real network", travel < 0.25 && turned > 1 ? "pass" : "fail", `root travel ${travel.toFixed(3)} m, yaw ${turned.toFixed(2)} rad (whether it steps around needs a person looking)`);
    finish(r, Object.values(r.checks).some((c) => c.status === "fail") ? "fail" : "pass");
  })();
}

$("#go").addEventListener("click", () => run().catch((e) => {
  status(String((e as Error).message), "bad");
  r.notes.push(String(e));
  finish(r, "fail", String((e as Error).message));
}));
if (auto)
  await run()
    .then(() => {
      if (!(params.get("bind") || dropped.has("bind"))) finish(r, Object.values(r.checks).some((c) => c.status === "fail") ? "fail" : "pass");
    })
    .catch((e) => {
      r.notes.push(String(e));
      finish(r, "fail", String((e as Error).message));
    });
