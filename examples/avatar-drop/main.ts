import { avatarDrop, characterStage } from "@hackbuild/motion-views/vanilla";
import { placeholderBody } from "@hackbuild/avatar-host/three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { auto, check, finish, result, sleep, status } from "../shared/ui.js";
import { kvRows, panel, stageRackPage } from "../shared/views.js";

const r = result("avatar-drop");
const page = stageRackPage(
  [
    { id: "check", label: "check" },
    { id: "files", label: "files" },
    { id: "body", label: "body" },
  ],
  "the avatar",
  "nothing is uploaded. try the stand-in to see a check without a file of your own.",
);
const vrm = () => import("@hackbuild/avatar/vrm").then((m) => m.vrmHook());
const stage = characterStage(page.stage, { vrm, framing: "full", verbs: [{ id: "pick", label: "pick an avatar", go: true }, { id: "standin", label: "try the stand-in" }] });
const dropPanel = panel(page.panes.check!, "drop an avatar");
const drop = avatarDrop(dropPanel, { vrm });
const filesRows = document.createElement("div");
panel(page.panes.files!, "what you dropped").append(filesRows);
const bodyRows = document.createElement("div");
panel(page.panes.body!, "on stage").append(bodyRows);
kvRows(filesRows, { files: "none yet" });

// the stand-in, written out as a .glb in the page, so the check reads a real file
async function standIn(): Promise<File> {
  const body = placeholderBody();
  const out = (await new GLTFExporter().parseAsync(body.root, { binary: true })) as ArrayBuffer;
  body.dispose();
  return new File([out], "stand-in.glb", { type: "model/gltf-binary" });
}

drop.on((e) => {
  if (e.type === "picked") {
    void stage.show(e.files);
    kvRows(filesRows, Object.fromEntries(e.files.map((f) => [f.name, `${Math.max(1, Math.round(f.size / 1000))} kb`])));
    status("reading the file.", "info");
  }
  if (e.type === "checked") {
    status(`${e.report.name}: ${e.report.check.head}.`, e.report.check.tone === "bad" ? "bad" : e.report.check.tone);
  }
  if (e.type === "failed") status(e.message, "bad");
});
stage.on((e) => {
  if (e.type === "verb" && e.id === "pick") drop.pick();
  if (e.type === "verb" && e.id === "standin") void standIn().then((f) => drop.take([f]));
  if (e.type === "loaded") kvRows(bodyRows, { name: e.placeholder ? "the stand-in" : e.name, bones: e.caps.bones, "lips move": e.caps.mouth ? "yes" : "no", blinks: e.caps.blink ? "yes" : "no" });
  if (e.type === "failed") status(e.message, "bad");
});

if (auto) {
  try {
    const file = await standIn();
    check(r, "stand-in: written as a glb in the page", file.size > 1000 ? "pass" : "fail", `${file.size} bytes`);
    r.numbers["stand-in glb bytes (measured)"] = file.size;
    const rep = await drop.take([file]);
    check(r, "drop: the file loads and the rig check runs", rep ? "pass" : "fail", rep ? rep.check.head : "no report");
    if (rep) {
      r.numbers["bones mapped (measured)"] = rep.caps.bones;
      r.notes.push(`check: ${rep.check.lines.map((l) => l.text).join(" ")}`, `licence: ${rep.licence.text}`, `size: ${rep.size}`);
      check(r, "drop: the rig check maps hips and head", rep.check.tone !== "bad" ? "pass" : "fail", rep.check.lines.map((l) => l.text).join(" "));
      check(r, "drop: a still is drawn", rep.thumb && rep.thumb.size > 500 ? "pass" : "fail", rep.thumb ? `${rep.thumb.size} bytes` : "no still");
      check(r, "drop: the licence line says the glb names none", /no licence/.test(rep.licence.text) ? "pass" : "fail", rep.licence.text);
    }
    const bad = await drop.take([new File(["not a model"], "notes.txt")]);
    const words = document.querySelector('[role="status"] .hb-status.is-err')?.textContent ?? "";
    check(r, "drop: a file that is no model says so in plain words", !bad && words.length > 10 ? "pass" : "fail", words);
    await sleep(300);
    const failed = Object.values(r.checks).some((c) => c.status === "fail");
    finish(r, failed ? "fail" : "pass", failed ? "a check failed" : "");
  } catch (e) {
    finish(r, "fail", String(e));
  }
}
