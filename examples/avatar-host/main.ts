import { type BodyCaps, type StageEvent, type AvatarHostElement, type Body, defineAvatarHost } from "@hackbuild/avatar-host/three";
import { bodyError, droppedFiles } from "@hackbuild/avatar-host";
import type { Clip } from "@hackbuild/presence";
import * as THREE from "three";
import { $, auto, check, finish, onDrop, readout, result, sleep, status } from "../shared/ui.js";

const r = result("avatar-host");
$("#controls").innerHTML = `
<p class="pg-note">the placeholder is built in code. a model you drop stays in this tab; nothing is uploaded.</p>
<div class="hb-dropzone" id="drop"><span>drop a .vrm, .glb or .fbx with its textures, or tap to pick files</span> <input id="file" type="file" multiple accept=".vrm,.glb,.gltf,.fbx,.png,.jpg,.jpeg,.tga,.bin" aria-label="pick a .vrm, .glb or .fbx model and its textures"></div>
<button class="hb-btn" id="wave">wave</button>
<button class="hb-btn" id="fit">fit</button>
<button class="hb-btn" id="closer" aria-label="zoom in">closer</button>
<button class="hb-btn" id="farther" aria-label="zoom out">farther</button>
<button class="hb-btn" id="pause">pause</button>
<button class="hb-btn" id="doll">back to placeholder</button>`;

defineAvatarHost("hb-avatar-host", {
  background: 0xf5f0e6,
  vrm: () => import("@hackbuild/avatar/vrm").then((m) => m.vrmHook()),
});
const viewport = $("#stage");
viewport.classList.add("is-orbit");
const el = document.createElement("hb-avatar-host") as AvatarHostElement;
viewport.append(el);
const stage = el.stage!;

let caps: BodyCaps | null = null;
let placeholder = true;
let stats: Extract<StageEvent, { type: "stats" }>["stats"] | null = null;
const describe = (c: BodyCaps) =>
  [`${c.bones} humanoid bones`, c.clips.length ? `${c.clips.length} clips` : "no clips", c.expressions.length ? `${c.expressions.length} expressions` : "no expressions", c.mouth ? "a mouth rig" : "no mouth rig: lip sync is off", c.gaze ? "gaze on" : "gaze off: the head does not rest upright"].join(", ");
el.addEventListener("loaded", (e) => {
  const d = (e as CustomEvent<Extract<StageEvent, { type: "loaded" }>>).detail;
  caps = d.caps;
  placeholder = d.placeholder;
  const warn = d.warnings.length ? ` ${d.warnings.join(" ")}` : "";
  status(d.placeholder ? "no body loaded. this is the placeholder. drop a glb or vrm here." : `${d.name}: ${describe(d.caps)}.${warn}`, d.warnings.length ? "warn" : "ok");
});
el.addEventListener("failed", (e) => status((e as CustomEvent<Extract<StageEvent, { type: "failed" }>>).detail.message, "bad"));
el.addEventListener("stats", (e) => {
  stats = (e as CustomEvent<Extract<StageEvent, { type: "stats" }>>).detail.stats;
  draw();
});
el.addEventListener("state", () => draw());
const latest = () => stats;
function draw() {
  readout({
    loop: stage.loop.isRunning ? "running" : `stopped (${stage.loop.why.join(", ") || "nothing moves"})`,
    "fps (measured)": stats ? stats.fps : 0,
    "draw calls": stats?.calls ?? 0,
    "buffer px": stats ? `${stats.width} by ${stats.height}` : "none",
    "pixel ratio": stats?.pixelRatio ?? 0,
    body: placeholder ? "placeholder" : caps ? describe(caps) : "none",
  });
}

// a wave on the right arm, built here over the body's own bone order
function wave(body: Body): Clip {
  const n = body.bones.length;
  const frames = 61;
  const rotations = new Float32Array(frames * n * 4);
  const upper = body.names.indexOf("rightUpperArm");
  const lower = body.names.indexOf("rightLowerArm");
  const q = new THREE.Quaternion();
  const z = new THREE.Vector3(0, 0, 1);
  const y = new THREE.Vector3(0, 1, 0);
  for (let f = 0; f < frames; f++) {
    const t = f / (frames - 1);
    const lift = Math.sin(Math.PI * t);
    for (let b = 0; b < n; b++) {
      body.bones[b]!.quaternion.toArray(rotations, (f * n + b) * 4);
      if (b === upper) q.setFromAxisAngle(z, -1.2 * lift).toArray(rotations, (f * n + b) * 4);
      if (b === lower) q.setFromAxisAngle(y, lift * (0.9 + 0.35 * Math.sin(t * Math.PI * 8))).toArray(rotations, (f * n + b) * 4);
    }
  }
  return { name: "wave", fps: 30, frames, bones: n, loop: false, rotations };
}

$("#wave").addEventListener("click", () => {
  const body = stage.body;
  if (!body) return;
  if (body.names.includes("rightUpperArm")) body.play(wave(body), { fade: 0.15 });
  stage.loop.sync();
});
$("#fit").addEventListener("click", () => stage.resetView());
$("#closer").addEventListener("click", () => stage.zoomBy(1.25));
$("#farther").addEventListener("click", () => stage.zoomBy(0.8));
$("#pause").addEventListener("click", () => {
  const paused = stage.loop.why.includes("paused");
  if (paused) stage.play();
  else stage.pause();
  $("#pause").textContent = paused ? "pause" : "play";
});
$("#doll").addEventListener("click", () => stage.showPlaceholder());
const drop = $("#drop");
onDrop(drop, (files) => void el.showFiles(files), $("#file") as HTMLInputElement);
// folders dropped on the zone keep their paths, so textures beside the model resolve
drop.addEventListener(
  "drop",
  (e) => {
    const dt = e.dataTransfer;
    if (!dt || ![...dt.items].some((i) => i.webkitGetAsEntry()?.isDirectory)) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    drop.classList.remove("is-over");
    droppedFiles(dt).then((files) => el.showFiles(files), (err) => status(bodyError(err), "bad"));
  },
  { capture: true },
);
draw();

if (auto) {
  try {
    const gl = stage.renderer;
    await sleep(800);
    check(r, "avatar-host: the placeholder body on stage", stage.body && placeholder ? "pass" : "fail", `${stage.body?.bones.length ?? 0} bones, ${gl.info.render.calls} draw calls`);

    // hidden: document.hidden is overridden and the event sent, as a tab switch would
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
    const f0 = stage.loop.frames;
    await sleep(1000);
    const hiddenFrames = stage.loop.frames - f0;
    delete (document as { hidden?: boolean }).hidden;
    document.dispatchEvent(new Event("visibilitychange"));
    await sleep(300);
    const back = stage.loop.frames - f0 - hiddenFrames;
    r.numbers["frames drawn in 1 s hidden (measured)"] = hiddenFrames;
    check(r, "avatar-host: with the page hidden the loop draws 0 frames in 1 s", hiddenFrames === 0 && back > 0 ? "pass" : "fail", `${hiddenFrames} frames hidden, ${back} frames in 0.3 s after return (hidden simulated by overriding document.hidden)`);

    // 320 px host
    const was = el.style.width;
    el.style.width = "320px";
    await sleep(400);
    const cw = stage.canvas.getBoundingClientRect().width;
    const hw = el.getBoundingClientRect().width;
    const bw = stage.canvas.width;
    const pr = gl.getPixelRatio();
    r.numbers["canvas css px at a 320 px host (measured)"] = cw;
    r.numbers["drawing buffer px at a 320 px host (measured)"] = bw;
    check(r, "avatar-host: the canvas equals the host width at 320 px", Math.abs(hw - 320) < 0.5 && Math.abs(cw - hw) < 0.5 && Math.abs(bw - Math.round(320 * pr)) <= 1 ? "pass" : "fail", `canvas ${cw} css px, buffer ${bw} px at pixel ratio ${pr}`);
    el.style.width = was;
    await sleep(200);

    // swap: the old body's geometry leaves the gpu
    const g0 = gl.info.memory.geometries;
    stage.showPlaceholder();
    await sleep(300);
    stage.showPlaceholder();
    await sleep(300);
    const g1 = gl.info.memory.geometries;
    r.numbers["geometries before and after two swaps (measured)"] = `${g0} and ${g1}`;
    check(r, "avatar-host: the old body is disposed after a swap", g1 === g0 ? "pass" : "fail", `${g0} geometries before, ${g1} after two swaps`);

    // a superseded load never shows: a slow show, then the placeholder
    const slow = stage.show(new Promise((ok) => setTimeout(() => ok({ kind: "glb", data: new ArrayBuffer(4), name: "slow.glb" }), 300)));
    stage.showPlaceholder();
    check(r, "avatar-host: a superseded show resolves null", (await slow) === null && placeholder ? "pass" : "fail", "a slow show then the placeholder");

    // lost context
    const ext = gl.getContext().getExtension("WEBGL_lose_context");
    if (!ext) check(r, "avatar-host: a lost context shows the restore line and comes back", "not run", "no WEBGL_lose_context extension");
    else {
      const lost = new Promise((ok) => el.addEventListener("lost", ok, { once: true }));
      let gotRestored = false;
      const restored = new Promise((ok) => el.addEventListener("restored", () => ok((gotRestored = true)), { once: true }));
      ext.loseContext();
      await lost;
      // the browser allows a restore once the lost event has finished dispatching
      await sleep(100);
      const btn = el.querySelector<HTMLButtonElement>(".hb-stage-restore");
      const copy = btn?.textContent ?? "";
      btn?.click();
      await Promise.race([restored, sleep(3000)]);
      await sleep(300);
      const ok = copy === "the 3d view was lost. press to restore." && !el.querySelector(".hb-stage-restore") && stage.loop.isRunning;
      check(r, "avatar-host: a lost context shows the restore line and comes back", ok ? "pass" : "fail", `button "${copy}", running after restore: ${stage.loop.isRunning} (${stage.loop.why.join(" ") || "no hold"}), restored event: ${gotRestored}`);
    }

    // frame rate with a wave playing
    stage.body && stage.body.play(wave(stage.body));
    await sleep(2500);
    const last = latest();
    r.numbers["fps with a wave playing (measured)"] = Math.round((last?.fps ?? 0) * 10) / 10;
    r.numbers["draw calls, placeholder (measured)"] = last?.calls ?? 0;
    finish(r, Object.values(r.checks).some((c) => c.status === "fail") ? "fail" : "pass");
  } catch (e) {
    r.notes.push(String((e as Error).stack ?? e));
    finish(r, "fail", String((e as Error).message));
  }
}
