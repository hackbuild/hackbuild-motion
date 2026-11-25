// CharacterStage: a character on a lit stage, staged as the original twin
// page stages it. The avatar-host stage draws the body with its idle,
// gaze, blinks and lips; this view adds the corner plate (name, then what
// the body is doing), turn around and framing (bust or full body) at the
// top right, the verb row at the foot, an inset slot at the top left, and
// drop to replace the body. It writes into a `.hb-lay-stage` host, so it
// sits in the stage and rack layout of hackbuild-ui as it is.
import { Box3, type AnimationClip, Vector3 } from "three";
import type { Clip, PlayOptions } from "@hackbuild/presence";
import { estimateWords } from "@hackbuild/lipsync";
import { posedBounds } from "@hackbuild/avatar/three";
import type { BodySource, DroppedFile } from "@hackbuild/avatar-host";
import { AvatarStage, type Body, type BodyCaps, type StageOptions } from "@hackbuild/avatar-host/three";
import { dropRoutes } from "@virgilvox/hackbuild-ui/vanilla";
import { button, el, iconButton, part } from "./dom.js";
import { type Gesture, GESTURES, gestureClip } from "./gestures.js";

export type Framing = "bust" | "full";

/** One verb on the stage. `go` makes it the one pink action; give it to one verb at most. */
export interface Verb {
  id: string;
  label: string;
  go?: boolean;
}

/** The verbs a stage shows by default: say hello is the next thing to do. */
export const DEFAULT_VERBS: readonly Verb[] = [
  { id: "say", label: "say hello", go: true },
  { id: "wave", label: "wave" },
  { id: "nod", label: "nod" },
  { id: "look", label: "look around" },
];

export interface CharacterStageOptions extends StageOptions {
  /** The name on the corner plate. Default the body's name. */
  name?: string;
  /** A model URL to show; the placeholder body shows until it loads, and without one. */
  src?: string;
  verbs?: readonly Verb[];
  /** Bust is the original's opening shot. Default bust. */
  framing?: Framing;
  /** Take files dropped on the stage. Default true. */
  drop?: boolean;
  /** What say hello says. */
  hello?: string;
}

export type CharacterStageEvent =
  | { type: "loaded"; name: string; caps: BodyCaps; warnings: string[]; placeholder: boolean }
  | { type: "failed"; message: string }
  | { type: "doing"; word: string }
  | { type: "verb"; id: string }
  | { type: "framing"; framing: Framing };

export interface CharacterStageHandle {
  readonly stage: AvatarStage;
  readonly body: Body | null;
  /** The inset slot, top left: put an eye view or a caption card in it. Hidden while empty. */
  readonly inset: HTMLElement;
  readonly verbsEl: HTMLElement;
  readonly subject: HTMLElement;
  /** What the body is doing, as the corner plate says it. */
  readonly doing: string;
  readonly framing: Framing;
  show(source: string | BodySource | readonly DroppedFile[]): Promise<Body | null>;
  showPlaceholder(): void;
  /** The mouth follows the words on estimated timings; resolves when they end. */
  say(text: string, seconds?: number): Promise<void>;
  gesture(id: Gesture): boolean;
  /** Plays a clip on the body; the corner plate shows its name. Returns the ticket, -1 when it cannot play. */
  play(clip: Clip | AnimationClip | string, opts?: PlayOptions): number;
  stop(): void;
  turn(): void;
  frame(mode: Framing): void;
  setVerbs(verbs: readonly Verb[]): void;
  on(fn: (e: CharacterStageEvent) => void): () => void;
  dispose(): void;
}

const HELLO = "hello. drop a vrm, glb or fbx on me and i will wear it.";

/** Mounts a character stage into `host`, which becomes the `.hb-lay-stage`. */
export function characterStage(host: HTMLElement, opts: CharacterStageOptions = {}): CharacterStageHandle {
  const doc = host.ownerDocument;
  host.classList.add("hb-lay-stage");
  const subject = part(host, "hb-lay-subject", () => el(doc, "div", "hb-lay-subject"));
  subject.classList.add("hb-stage-lit");
  subject.dataset.ux = "subject";
  if (!subject.getAttribute("aria-label")) subject.setAttribute("aria-label", "the character");
  const inset = part(host, "hb-lay-inset", () => el(doc, "div", "hb-lay-inset"));
  inset.dataset.ux = "inset";
  const verbsEl = part(host, "hb-lay-verbs", () => el(doc, "div", "hb-lay-verbs", { role: "toolbar", "aria-label": "what he does" }));
  verbsEl.dataset.ux = "verbs";
  // the plate and the two stage tools, top right, as the original has them
  const nameEl = el(doc, "b", "", {}, [opts.name ?? ""]);
  const doingEl = el(doc, "span", "", { "aria-live": "polite" }, ["idle"]);
  const turnBtn = iconButton(doc, "flip", "turn around");
  const frameBtn = iconButton(doc, "frame", "full body", { "aria-pressed": "false" });
  const tag = el(doc, "div", "hb-stage-tag", {}, [nameEl, doingEl]);
  const tagCorner = el(doc, "div", "hb-ov hb-ov-tl");
  const corner = el(doc, "div", "hb-ov hb-ov-tr", {}, [turnBtn, frameBtn]);
  // the stage first, so its canvas sits under the plate
  const stage = new AvatarStage(subject, opts);
  subject.append(tagCorner, corner);

  const listeners = new Set<(e: CharacterStageEvent) => void>();
  const emit = (e: CharacterStageEvent) => {
    for (const f of listeners) f(e);
  };
  let framing: Framing = opts.framing ?? "bust";
  let doing = "idle";
  let doingTimer: ReturnType<typeof setTimeout> | undefined;
  const setDoing = (word: string, seconds = 0) => {
    clearTimeout(doingTimer);
    doing = word;
    doingEl.textContent = word;
    emit({ type: "doing", word });
    if (seconds > 0) doingTimer = setTimeout(() => setDoing("idle"), seconds * 1000);
  };

  // the plate sits top left as in the original; with an inset there, it moves over the tools
  const syncInset = () => {
    inset.hidden = inset.childElementCount === 0;
    if (inset.hidden) tagCorner.append(tag);
    else corner.prepend(tag);
  };
  const insetWatch = new MutationObserver(syncInset);
  insetWatch.observe(inset, { childList: true });
  syncInset();

  const offs: (() => void)[] = [];
  offs.push(
    stage.on("loaded", (e) => {
      if (!opts.name) nameEl.textContent = e.placeholder ? "stand-in" : e.name;
      applyFraming();
      setDoing("idle");
      emit({ type: "loaded", name: e.name, caps: e.caps, warnings: e.warnings, placeholder: e.placeholder });
    }),
    stage.on("failed", (e) => emit({ type: "failed", message: e.message })),
  );

  // bust: the knees to the top of the head, the original's opening shot; full: the follow camera
  function applyFraming(): void {
    const body = stage.body;
    frameBtn.setAttribute("aria-pressed", String(framing === "full"));
    frameBtn.setAttribute("aria-label", framing === "full" ? "head and shoulders" : "full body");
    frameBtn.title = frameBtn.getAttribute("aria-label")!;
    if (!body) return;
    if (framing === "full") {
      stage.setFollow(true);
      stage.resetView();
      return;
    }
    const bones = body.avatar.bones;
    body.avatar.root.updateMatrixWorld(true);
    const all = posedBounds(bones, 0.04);
    const h = Math.max(0.3, all.max.y - all.min.y);
    const knee = (bones.leftLowerLeg ?? bones.rightLowerLeg ?? bones.hips)?.getWorldPosition(new Vector3());
    const head = bones.head?.getWorldPosition(new Vector3());
    if (!knee || !head) {
      stage.setFollow(true);
      stage.resetView();
      return;
    }
    // the original's opening shot: from the knees to just over the head
    const top = Math.max(all.max.y, head.y + 0.08 * h) + 0.04 * h;
    const box = new Box3(new Vector3(head.x - 0.2 * h, knee.y, head.z - 0.1 * h), new Vector3(head.x + 0.2 * h, top, head.z + 0.1 * h));
    stage.setFollow(false);
    stage.follow.frame(box);
    stage.controls.update();
    stage.loop.invalidate();
  }

  function frame(mode: Framing): void {
    framing = mode;
    applyFraming();
    emit({ type: "framing", framing });
  }

  function turn(): void {
    const body = stage.body;
    if (!body) return;
    body.avatar.root.rotation.y += Math.PI;
    stage.loop.invalidate();
  }

  function play(clip: Clip | AnimationClip | string, o: PlayOptions = {}): number {
    const body = stage.body;
    if (!body) return -1;
    const ticket = body.play(clip, { fade: 0.15, ...o });
    if (ticket < 0) return ticket;
    const name = typeof clip === "string" ? clip : clip.name;
    const loop = o.loop ?? (typeof clip === "object" && "loop" in clip ? clip.loop : false);
    const seconds = typeof clip === "object" ? ("frames" in clip ? (clip.frames - 1) / clip.fps : clip.duration) : 0;
    setDoing(name || "a clip", loop ? 0 : seconds);
    stage.loop.sync();
    return ticket;
  }

  function stop(): void {
    stage.body?.stop("body");
    stage.body?.stop("upper");
    stage.body?.lip.stop();
    setDoing("idle");
    stage.loop.sync();
  }

  function gesture(id: Gesture): boolean {
    const body = stage.body;
    if (!body) return false;
    const base = new Float32Array(body.bones.length * 4);
    body.bones.forEach((b, i) => b.quaternion.toArray(base, i * 4));
    const clip = gestureClip(id, body.names, base);
    if (!clip) return false;
    return play(clip, { layer: id === "bow" ? "body" : "upper" }) >= 0;
  }

  async function say(text: string, seconds?: number): Promise<void> {
    const body = stage.body;
    if (!body || !text.trim()) return;
    const words = text.trim().split(/\s+/).length;
    const dur = seconds ?? Math.max(0.8, words * 0.34);
    const t0 = stage.loop.time;
    body.lip.stop();
    body.lip.push([...estimateWords(text, t0, t0 + dur), { type: "end", time: t0 + dur }]);
    body.setGazeMode("talk");
    setDoing("talking", dur);
    stage.loop.sync();
    await new Promise((ok) => setTimeout(ok, dur * 1000));
    stage.body?.setGazeMode("listen");
  }

  function look(): void {
    const body = stage.body;
    if (!body) return;
    body.setGazeMode("think");
    setDoing("looking around", 3);
    stage.loop.sync();
    setTimeout(() => stage.body?.setGazeMode("listen"), 3000);
  }

  function runVerb(id: string): void {
    emit({ type: "verb", id });
    if (id === "say") void say(opts.hello ?? HELLO);
    else if (id === "look") look();
    else if (id === "turn") turn();
    else if ((GESTURES as readonly string[]).includes(id)) gesture(id as Gesture);
  }

  function setVerbs(verbs: readonly Verb[]): void {
    verbsEl.replaceChildren(...verbs.map((v) => button(doc, v.label, v.go === true, { "data-verb": v.id })));
    verbsEl.hidden = verbs.length === 0;
  }

  const ac = new AbortController();
  verbsEl.addEventListener(
    "click",
    (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-verb]");
      if (b && verbsEl.contains(b)) runVerb(b.dataset.verb!);
    },
    { signal: ac.signal },
  );
  turnBtn.addEventListener("click", turn, { signal: ac.signal });
  frameBtn.addEventListener("click", () => frame(framing === "bust" ? "full" : "bust"), { signal: ac.signal });
  // the follow camera reframes on resize in full; bust is fixed, so it is framed again
  const ro = new ResizeObserver(() => framing === "bust" && applyFraming());
  ro.observe(subject);

  const drop =
    opts.drop === false
      ? null
      : dropRoutes(subject, [{ name: "model", accept: () => true, on: (files) => void show(files as readonly DroppedFile[]) }], { overlay: subject });

  function show(source: string | BodySource | readonly DroppedFile[]): Promise<Body | null> {
    setDoing("loading");
    return stage.show(source).then((b) => {
      if (!b) setDoing("idle");
      return b;
    });
  }

  setVerbs(opts.verbs ?? DEFAULT_VERBS);
  if (opts.src) {
    stage.showPlaceholder();
    void show(opts.src);
  } else stage.showPlaceholder();

  return {
    stage,
    get body() {
      return stage.body;
    },
    inset,
    verbsEl,
    subject,
    get doing() {
      return doing;
    },
    get framing() {
      return framing;
    },
    show,
    showPlaceholder: () => void stage.showPlaceholder(),
    say,
    gesture,
    play,
    stop,
    turn,
    frame,
    setVerbs,
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    dispose() {
      clearTimeout(doingTimer);
      ac.abort();
      ro.disconnect();
      insetWatch.disconnect();
      drop?.dispose();
      for (const off of offs) off();
      listeners.clear();
      stage.dispose();
      corner.remove();
      tagCorner.remove();
    },
  };
}
