import { characterStage, avatarDrop, type CharacterStageEvent } from "@hackbuild/motion-views/vanilla";
import { auto, check, finish, result, sleep, status } from "../shared/ui.js";
import { codeVoice } from "../shared/clips.js";
import { kvRows, panel, stageRackPage } from "../shared/views.js";

const r = result("character-stage");
const page = stageRackPage(
  [
    { id: "now", label: "now" },
    { id: "body", label: "body" },
    { id: "view", label: "view" },
  ],
  "the character",
  "the body is the stand-in built in code, and its voice a hum written in code, timed per word as a speech engine times it. drop a .vrm, .glb or .fbx on the stage, or in the body tab, to change the body.",
);
const vrm = () => import("@hackbuild/avatar/vrm").then((m) => m.vrmHook());
const HELLO = "hello. drop a vrm, glb or fbx on me and i will wear it.";
// say hello speaks real audio with word timings, as a speech engine hands them over
const view = characterStage(page.stage, { vrm, hello: () => ({ text: HELLO, ...codeVoice(HELLO) }) });

// the inset: the line he says while he says it, as the original's note on the stage
const head = document.createElement("div");
head.className = "hb-panel-hd-inst";
head.textContent = "he says";
const line = document.createElement("p");
view.inset.classList.add("hb-panel");

const now = panel(page.panes.now!, "what he is doing");
const nowRows = document.createElement("div");
now.append(nowRows);
const bodyPanel = panel(page.panes.body!, "this body");
const bodyRows = document.createElement("div");
bodyPanel.append(bodyRows);
const dropPanel = panel(page.panes.body!, "wear another");
const drop = avatarDrop(dropPanel, { vrm, label: "pick a file" });
drop.on((e) => {
  if (e.type === "picked") void view.show(e.files);
});

const viewPanel = panel(page.panes.view!, "the shot");
const viewRows = document.createElement("div");
viewPanel.append(viewRows);
const standin = document.createElement("button");
standin.className = "hb-btn";
standin.type = "button";
standin.textContent = "back to the stand-in";
standin.addEventListener("click", () => view.showPlaceholder());
viewPanel.append(standin);

let fps = 0;
view.stage.on("stats", (e) => {
  fps = e.stats.fps;
  draw();
});
const bodyFacts = { name: "none", bones: 0, mouth: "no", blink: "no", gaze: "no", clips: 0 };
function draw(): void {
  kvRows(nowRows, { doing: view.doing, gaze: view.body?.gazeOn ? "on you" : "off", "frames a second": Math.round(fps) });
  kvRows(bodyRows, { name: bodyFacts.name, bones: bodyFacts.bones, "lips move": bodyFacts.mouth, blinks: bodyFacts.blink, "eyes follow": bodyFacts.gaze, "clips inside": bodyFacts.clips });
  kvRows(viewRows, { framing: view.framing === "bust" ? "head and shoulders" : "full body", "turn the view": "drag on the stage" });
}
view.on((e: CharacterStageEvent) => {
  if (e.type === "loaded") {
    Object.assign(bodyFacts, { name: e.placeholder ? "the stand-in" : e.name, bones: e.caps.bones, mouth: e.caps.mouth ? "yes" : "no", blink: e.caps.blink ? "yes" : "no", gaze: e.caps.gaze ? "yes" : "no", clips: e.caps.clips.length });
    status(e.placeholder ? "the stand-in is on stage." : `${e.name} is on stage.${e.warnings.length ? ` ${e.warnings.join(" ")}` : ""}`, e.warnings.length ? "warn" : "ok");
  }
  if (e.type === "failed") status(e.message, "bad");
  if (e.type === "verb" && e.id === "say") {
    line.textContent = HELLO;
    view.inset.append(head, line);
  }
  if (e.type === "doing" && e.word !== "talking") view.inset.replaceChildren();
  draw();
});
draw();

// the check the smoke reads: one pass per thing the stage promises
if (auto) {
  try {
    await sleep(400);
    const body = view.body;
    check(r, "stage: the stand-in is on stage", body ? "pass" : "fail");
    const shot = await view.stage.snapshot();
    check(r, "stage: a frame is drawn", shot && shot.size > 2000 ? "pass" : "fail", shot ? `${shot.size} bytes` : "no frame");
    r.numbers["frame png bytes (measured)"] = shot?.size ?? 0;
    const d0 = view.stage.follow.distance();
    view.frame("full");
    const d1 = view.stage.follow.distance();
    check(r, "framing: full body stands further back than the bust", d1 > d0 * 1.1 ? "pass" : "fail", `${d0.toFixed(2)} m to ${d1.toFixed(2)} m`);
    r.numbers["bust distance m (measured)"] = +d0.toFixed(3);
    r.numbers["full distance m (measured)"] = +d1.toFixed(3);
    view.frame("bust");
    // the audio level the stage hands the lips, recorded on its way in
    const lip = view.body!.lip;
    const setLevel = lip.setLevel.bind(lip);
    let peak = 0;
    lip.setLevel = (level, bands) => {
      peak = Math.max(peak, level);
      setLevel(level, bands);
    };
    (document.querySelector('[data-verb="say"]') as HTMLButtonElement).click();
    await sleep(1500);
    check(r, "speech: say hello plays audio with its word timings", view.speechSource === "words" && view.doing === "talking" && view.body?.moving() ? "pass" : "fail", `${view.speechSource}, ${view.doing}`);
    check(r, "speech: the audio level reaches the lips", peak > 0.01 ? "pass" : "fail", `peak ${peak.toFixed(3)}`);
    r.numbers["speech peak level (measured)"] = +peak.toFixed(3);
    for (let i = 0; i < 40 && view.doing === "talking"; i++) await sleep(250);
    check(r, "speech: he goes quiet when the audio ends", view.doing === "idle" ? "pass" : "fail", view.doing);
    peak = 0;
    const spoken = view.say({ audio: codeVoice("one two three").audio });
    await sleep(500);
    check(r, "speech: audio with no timings moves the lips by its level", view.speechSource === "audio level" && peak > 0.01 ? "pass" : "fail", `${view.speechSource}, peak ${peak.toFixed(3)}`);
    await spoken;
    const said = view.say("one two three");
    await sleep(100);
    check(r, "speech: text alone falls back to estimated timings", view.speechSource === "estimate" && view.doing === "talking" ? "pass" : "fail", `${view.speechSource}`);
    await said;
    (document.querySelector('[data-verb="wave"]') as HTMLButtonElement).click();
    await sleep(400);
    const w = view.body?.player.layerWeight("upper") ?? 0;
    check(r, "verbs: wave plays on the upper body", w > 0.5 && view.doing === "wave" ? "pass" : "fail", `upper weight ${w.toFixed(2)}`);
    const y0 = view.body?.avatar.root.rotation.y ?? 0;
    view.turn();
    const y1 = view.body?.avatar.root.rotation.y ?? 0;
    check(r, "turn around: the body turns half a circle", Math.abs(y1 - y0 - Math.PI) < 1e-6 ? "pass" : "fail");
    view.turn();
    const failed = Object.values(r.checks).some((c) => c.status === "fail");
    finish(r, failed ? "fail" : "pass", failed ? "a check failed" : "");
  } catch (e) {
    finish(r, "fail", String(e));
  }
}
