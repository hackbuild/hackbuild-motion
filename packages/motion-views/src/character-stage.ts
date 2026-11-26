// CharacterStage: a character on a lit stage, staged as the original twin
// page stages it. The avatar-host stage draws the body with its idle,
// gaze, blinks and lips; this view adds the corner plate (name, then what
// the body is doing), turn around and framing (bust or full body) at the
// top right, the verb row at the foot, an inset slot at the top left, and
// drop to replace the body. It writes into a `.hb-lay-stage` host, so it
// sits in the stage and rack layout of hackbuild-ui as it is.
import { Box3, type AnimationClip, Vector3 } from "three";
import type { Clip, PlayOptions } from "@hackbuild/presence";
import { bandsFromSpectrum, rms } from "@hackbuild/lipsync";
import { type Speech, type SpeechSource, estimateSeconds, speechEvents } from "./speech.js";
import { posedBounds } from "@hackbuild/avatar/three";
import type { BodySource, DroppedFile } from "@hackbuild/avatar-host";
import { AvatarStage, type Body, type BodyCaps, type StageOptions } from "@hackbuild/avatar-host/three";
import { dropRoutes } from "@virgilvox/hackbuild-ui/vanilla";
import { button, el, iconButton, part } from "./dom.js";
import { type Gesture, GESTURES, gestureClip, rigGestureClip } from "./gestures.js";
import { type ClipPack, packClips, packCoverage } from "./clip-pack.js";

/** The stage shot: bust, or the full body. */
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

/** Options of `characterStage`: stage options plus name, model URL, verbs, framing, drop and the hello speech. */
export interface CharacterStageOptions extends StageOptions {
  /** The name on the corner plate. Default the body's name. */
  name?: string;
  /** A model URL to show; the placeholder body shows until it loads, and without one. */
  src?: string;
  verbs?: readonly Verb[];
  /** Bust frames from the knees to just over the head; full shows the whole body. Default bust. */
  framing?: Framing;
  /** Take files dropped on the stage. Default true. */
  drop?: boolean;
  /** What say hello says: text, real speech, or a function that makes the speech when pressed. */
  hello?: string | Speech | (() => Speech | Promise<Speech>);
  /** The context real speech plays through; default one made on the first audio. */
  audioContext?: AudioContext;
  /**
   * A clip pack baked onto the shown body's rig (its URL or the parsed
   * file): its Idle_Loop plays under everything, Idle_Talking_Loop while it
   * speaks. Ignored for bodies it does not fit (fewer than 12 bones land).
   */
  clips?: string | ClipPack;
  /** Show the name and doing plate at the top left. Default false. */
  plate?: boolean;
}

/** Events of CharacterStage: a body loaded or failed, what it is doing, a verb pressed, the framing changed. */
export type CharacterStageEvent =
  | { type: "loaded"; name: string; caps: BodyCaps; warnings: string[]; placeholder: boolean }
  | { type: "failed"; message: string }
  | { type: "doing"; word: string }
  | { type: "verb"; id: string }
  | { type: "framing"; framing: Framing };

/** The handle `characterStage` returns: show a body, speak, gesture, play clips, frame and listen. */
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
  /**
   * Speaks. Audio plays and its level moves the mouth, with the words or
   * phonemes the engine timed; text alone moves the mouth on estimated word
   * timings with no sound. Resolves when the speech ends or a newer one starts.
   */
  say(speech: string | Speech, seconds?: number): Promise<void>;
  /** Where the mouth timings of the last speech came from. */
  readonly speechSource: SpeechSource | null;
  gesture(id: Gesture): boolean;
  /**
   * Tells the stage how fast the body moves over the ground, in metres a
   * second, when the host walks it: with a clip pack loaded its walk loop
   * plays at a matching rate, and the idle comes back at 0.
   */
  move(speed: number): void;
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
  if (!opts.plate) tag.style.display = "none";
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
      packed = null;
      if (!e.placeholder) void usePack();
      emit({ type: "loaded", name: e.name, caps: e.caps, warnings: e.warnings, placeholder: e.placeholder });
    }),
    stage.on("failed", (e) => emit({ type: "failed", message: e.message })),
  );

  // the clip pack: the body's own mocap idle under everything, the talking idle while it speaks
  let packed: Record<string, Clip> | null = null;
  let packFile: Promise<ClipPack | null> | null = null;
  async function usePack(): Promise<void> {
    const body = stage.body;
    if (!opts.clips || !body) return;
    packFile ??= typeof opts.clips === "string"
      ? fetch(opts.clips).then((r) => (r.ok ? (r.json() as Promise<ClipPack>) : null)).catch(() => null)
      : Promise.resolve(opts.clips);
    const pack = await packFile;
    if (!pack || stage.body !== body || packCoverage(pack, body.names) < 12) return;
    const base = new Float32Array(body.bones.length * 4);
    body.bones.forEach((b, i) => b.quaternion.toArray(base, i * 4));
    packed = packClips(pack, body.names, base);
    idleLoop(0.4);
  }
  let walking = false;
  function move(speed: number): void {
    const walk = packed?.Walk_Loop;
    if (!walk || !stage.body) return;
    if (speed > 0.15) {
      if (!walking) stage.body.play(walk, { layer: "body", loop: true, background: true, fade: 0.25, speed: Math.min(2, Math.max(0.5, speed / 1.24)) });
      walking = true;
    } else if (walking) {
      walking = false;
      idleLoop(0.35);
    }
  }
  function idleLoop(fade: number, talking = false): void {
    const c = packed?.[talking ? "Idle_Talking_Loop" : "Idle_Loop"] ?? packed?.Idle_Loop;
    if (c && stage.body) stage.body.play(c, { layer: "body", loop: true, background: true, fade });
  }

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
    let clip = rigGestureClip(id, body.bones, body.names);
    if (!clip) {
      const base = new Float32Array(body.bones.length * 4);
      body.bones.forEach((b, i) => b.quaternion.toArray(base, i * 4));
      clip = gestureClip(id, body.names, base);
    }
    if (!clip) return false;
    return play(clip, { layer: id === "bow" ? "body" : "upper" }) >= 0;
  }

  // real speech: the audio plays through an analyser, its level and bands
  // open the mouth between the timings the engine gave; text alone is
  // spoken on estimated timings with no sound
  let speaking = 0;
  let audioCtx: AudioContext | null = opts.audioContext ?? null;
  const elementSources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();
  let stopAudio: (() => void) | null = null;
  let lastSource: SpeechSource | null = null;

  async function say(input: string | Speech, seconds?: number): Promise<void> {
    const body = stage.body;
    const sp: Speech = typeof input === "string" ? { text: input } : input;
    if (!body || (!sp.audio && !sp.text?.trim() && !sp.events?.length)) return;
    const mine = ++speaking;
    stopAudio?.();
    stopAudio = null;
    let dur = seconds ?? (sp.text ? estimateSeconds(sp.text) : 1);
    let start: (() => void) | null = null;
    let ended: Promise<void> | null = null;
    let analyser: AnalyserNode | null = null;
    if (sp.audio) {
      audioCtx ??= new AudioContext();
      const ctx = audioCtx;
      // a page with no press yet keeps the context suspended; the mouth still moves on the timings
      if (ctx.state === "suspended") await Promise.race([ctx.resume().catch(() => undefined), new Promise((ok) => setTimeout(ok, 300))]);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.connect(ctx.destination);
      const a = sp.audio;
      if (a instanceof AudioBuffer) {
        const node = ctx.createBufferSource();
        node.buffer = a;
        node.connect(analyser);
        dur = a.duration;
        ended = new Promise((ok) => (node.onended = () => ok()));
        start = () => node.start();
        stopAudio = () => {
          node.onended = null;
          try {
            node.stop();
          } catch {
            // never started
          }
          node.disconnect();
        };
      } else {
        let node = elementSources.get(a);
        if (!node) elementSources.set(a, (node = ctx.createMediaElementSource(a)));
        node.disconnect();
        node.connect(analyser);
        if (!(a.duration > 0)) await new Promise((ok) => a.addEventListener("loadedmetadata", ok, { once: true }));
        dur = Number.isFinite(a.duration) ? a.duration : dur;
        ended = new Promise((ok) => a.addEventListener("ended", () => ok(), { once: true }));
        start = () => {
          a.currentTime = 0;
          void a.play();
        };
        stopAudio = () => {
          a.pause();
          node.disconnect();
        };
      }
    }
    if (mine !== speaking || stage.body !== body) return;
    const t0 = stage.loop.time;
    const { events, source } = speechEvents(sp, t0, dur);
    lastSource = source;
    body.lip.stop();
    body.lip.push(events);
    body.setGazeMode("talk");
    setDoing("talking");
    if (!walking) idleLoop(0.5, true);
    stage.loop.sync();
    start?.();
    if (analyser && audioCtx) {
      const an = analyser;
      const rate = audioCtx.sampleRate;
      const wave = new Float32Array(an.fftSize);
      const spectrum = new Uint8Array(an.frequencyBinCount);
      const tick = () => {
        if (mine !== speaking) return;
        an.getFloatTimeDomainData(wave);
        an.getByteFrequencyData(spectrum);
        stage.body?.lip.setLevel(rms(wave), bandsFromSpectrum(spectrum, rate, an.fftSize));
        stage.loop.sync();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
    await Promise.race([ended ?? new Promise<void>(() => undefined), new Promise<void>((ok) => setTimeout(ok, dur * 1000 + (ended ? 500 : 0)))]);
    if (mine !== speaking) return;
    speaking++;
    stopAudio?.();
    stopAudio = null;
    analyser?.disconnect();
    stage.body?.lip.setLevel(0);
    stage.body?.setGazeMode("listen");
    if (!walking) idleLoop(0.6);
    if (doing === "talking") setDoing("idle");
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
    if (id === "say") {
      const h = opts.hello ?? HELLO;
      void Promise.resolve(typeof h === "function" ? h() : h).then((sp) => say(sp));
    }
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
    get speechSource() {
      return lastSource;
    },
    show,
    showPlaceholder: () => void stage.showPlaceholder(),
    say,
    gesture,
    move,
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
      speaking++;
      stopAudio?.();
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
