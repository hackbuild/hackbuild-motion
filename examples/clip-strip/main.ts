import { animationClipOf, characterStage, clipStrip, clipsFromPack, gestureClip, GESTURES, type StripItem } from "@hackbuild/motion-views/vanilla";
import { bakeClips, load as loadBake, sampleClip, type ClipPack, type ClipReport, type SourceClip } from "@hackbuild/bake";
import { RetargetRig, analyzeMotion, load as loadRetarget, parseBvh } from "@hackbuild/retarget";
import { skeletonFromObject3D, toAnimationClip } from "@hackbuild/retarget/three";
import type { Clip } from "@hackbuild/presence";
import { walkBvh } from "../shared/clips.js";
import { auto, check, finish, result, sleep, status } from "../shared/ui.js";
import { kvRows, panel, stageRackPage } from "../shared/views.js";

const r = result("clip-strip");
const page = stageRackPage(
  [
    { id: "clip", label: "clip" },
    { id: "pack", label: "pack" },
    { id: "source", label: "source" },
  ],
  "the clips",
  "a walk written in code as bvh on another rig, retargeted onto the stand-in, and four gestures written in code, all baked into one clip pack and read back.",
);
const stage = characterStage(page.stage, { framing: "full", verbs: [] });
const clipRows = document.createElement("div");
panel(page.panes.clip!, "the picked clip").append(clipRows);
const packRows = document.createElement("div");
panel(page.panes.pack!, "the clip pack").append(packRows);
const sourceRows = document.createElement("div");
panel(page.panes.source!, "where the walk came from").append(sourceRows);
status("loading the retarget and bake wasm.");

await Promise.all([loadRetarget(), loadBake()]);
const body = stage.body!;
const names = body.names as string[];

// the walk: bvh in centimeters with other bone names, onto this body
const t0 = performance.now();
// two whole strides at 0.9 a second, so the loop closes
const bvh = parseBvh(walkBvh(2 / 0.9));
const src = new RetargetRig(bvh.skeleton, { unit: 0.01 });
const motion = src.toHumanoid(bvh.clip, { settle: true });
const findings = analyzeMotion(motion);
const scene = skeletonFromObject3D(body.avatar.root);
const dst = new RetargetRig(scene.skeleton);
const walk = body.clipOf(toAnimationClip(dst.bind(motion), scene, "walk"), true)!;
const retargetMs = performance.now() - t0;
src.dispose();
dst.dispose();
kvRows(sourceRows, { file: "bvh written in code", units: "centimeters", "bones in the file": bvh.skeleton.names.length, "found to be": findings.tags.join(", ") || "no tags", "retarget took": `${Math.round(retargetMs)} ms` });

// the gestures over the rest pose, and a walk cut short so its loop does not close
const rest = new Float32Array(names.length * 4);
body.bones.forEach((b, i) => b.quaternion.toArray(rest, i * 4));
const sources: Clip[] = [walk, ...GESTURES.map((g) => gestureClip(g, names, rest)).filter((c): c is Clip => !!c)];
const cut: Clip = { ...walk, name: "walk, cut short", frames: Math.round(walk.frames * 0.7), rotations: walk.rotations.slice(0, Math.round(walk.frames * 0.7) * names.length * 4) };
sources.splice(1, 0, cut);

// bake: every clip into one pack over this body's bones, then read back
const parents = body.bones.map((b) => {
  let p = b.parent;
  while (p && !body.bones.includes(p)) p = p.parent;
  return p ? body.bones.indexOf(p) : -1;
});
const restPos = body.bones.map((b) => b.position.toArray() as [number, number, number]);
const baked = bakeClips({
  fps: 30,
  skeleton: { roles: names, parents, rest: restPos },
  clips: sources.map((c): SourceClip => ({ name: c.name, loop: c.loop, q: c.rotations })),
});
const pack: ClipPack = baked.pack;
const report: ClipReport[] = baked.report;
kvRows(packRows, { clips: Object.keys(pack.clips).length, bones: pack.roles.length, "frames a second": pack.fps, "pack size": `${Math.round(baked.bytes.length / 1000)} kb`, "worst bone error": `${Math.max(...report.map((x) => x.maxAngleErrorDeg)).toFixed(2)} degrees` });

/** A packed clip read back into a clip the body plays. */
function unpack(name: string): Clip {
  const c = pack.clips[name]!;
  const n = names.length;
  const rotations = new Float32Array(c.n * n * 4);
  const out = new Float32Array(n * 4);
  for (let f = 0; f < c.n; f++) {
    sampleClip(pack, c, f / pack.fps, out);
    rotations.set(out, f * n * 4);
  }
  return { name, fps: pack.fps, frames: c.n, bones: n, loop: c.loop, rotations };
}
const played = new Map(Object.keys(pack.clips).map((k) => [k, unpack(k)]));
const items: StripItem[] = clipsFromPack(pack, report).map((it) => ({
  ...it,
  tags: it.name === "walk" ? [...findings.tags] : it.name.startsWith("walk") ? ["walk"] : [it.name],
  animation: () => animationClipOf(played.get(it.name)!, names),
}));

stage.verbsEl.hidden = false;
const strip = clipStrip(stage.verbsEl, { items, label: "clips from the pack" });
function describe(it: StripItem): void {
  const rep = report.find((x) => x.name === it.name);
  kvRows(clipRows, {
    name: it.name,
    length: `${it.seconds.toFixed(1)} s`,
    plays: it.loop ? "in a loop" : "once",
    seam: !it.loop ? "no loop" : rep?.seamOk ? "closes" : `jumps ${Math.round(rep?.seamAngleDeg ?? 0)} degrees`,
    "packing error": `${(rep?.maxAngleErrorDeg ?? 0).toFixed(2)} degrees`,
  });
  status(it.warn ?? `${it.name} is ready to play.`, it.warn ? "warn" : "ok");
}
function playIt(it: StripItem): void {
  const c = played.get(it.name)!;
  stage.play(c, { layer: "body", loop: c.loop });
  strip.setPlaying(true);
}
strip.on((e) => {
  if (e.type === "pick") {
    describe(e.item);
    playIt(e.item);
  }
  if (e.type === "play") playIt(e.item);
  if (e.type === "stop") stage.stop();
});
describe(items[0]!);

if (auto) {
  try {
    check(r, "retarget: the bvh walk lands on the stand-in and reads as a walk", findings.tags.includes("walk") ? "pass" : "fail", findings.tags.join(" "));
    r.numbers["retarget ms (measured)"] = Math.round(retargetMs);
    check(r, "bake: every clip packs and reads back", Object.keys(pack.clips).length === sources.length ? "pass" : "fail", `${Object.keys(pack.clips).length} of ${sources.length}`);
    r.numbers["pack bytes (measured)"] = baked.bytes.length;
    const cutItem = items.find((i) => i.name === "walk, cut short");
    check(r, "bake: the cut walk is flagged at its seam", cutItem?.warn ? "pass" : "fail", cutItem?.warn ?? "no warning");
    (document.querySelector('[data-id="pack:nod"]') as HTMLButtonElement).click();
    await sleep(300);
    const w = body.player.layerWeight("body");
    check(r, "strip: a picked clip plays on the body", w > 0.5 && stage.doing === "nod" ? "pass" : "fail", `${stage.doing}, weight ${w.toFixed(2)}`);
    await Promise.race([strip.thumbsIdle(), sleep(20000)]);
    const stills = document.querySelectorAll(".hb-hist-thumb > img").length;
    check(r, "strip: a still is drawn for every clip", stills === items.length ? "pass" : "fail", `${stills} of ${items.length}`);
    const failed = Object.values(r.checks).some((c) => c.status === "fail");
    finish(r, failed ? "fail" : "pass", failed ? "a check failed" : "");
  } catch (e) {
    finish(r, "fail", String(e));
  }
}
