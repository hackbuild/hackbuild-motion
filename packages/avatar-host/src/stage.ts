// The avatar stage: a three.js renderer that sizes to its container, an
// orbit camera that follows the posed body, plain lights, the body frame
// order, and the stage loop with its pause rules. Loads go through the
// ticketed host, so fast switching never shows a stale body. Events carry
// what the stage chrome needs: loaded with the capability list, failed with
// copy for the person, frame stats, the loop state and a lost context.
import { Box3, Color, DirectionalLight, HemisphereLight, type Light, type Mesh, PCFSoftShadowMap, PerspectiveCamera, Scene, SRGBColorSpace, TOUCH, Vector2, Vector3, WebGLRenderer } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { seededRng, type Rng } from "@hackbuild/organic";
import { type Avatar, posedBounds } from "@hackbuild/avatar/three";
import { AvatarHost } from "./host.js";
import { StageLoop, type PauseReason } from "./loop.js";
import { type BodySource, type DroppedFile, sourceFromFiles, sourceFromUrl } from "./source.js";
import { bodyError } from "./errors.js";
import { Body, type BodyCaps, type BodyOptions } from "./body.js";
import { FollowCamera, type FollowOptions } from "./follow.js";
import { type BodyLoadOptions, bodyAdapters } from "./load.js";
import { type PlaceholderOptions, placeholderBody } from "./placeholder.js";
import { EnvironmentSlot, type EnvironmentRequest, stagePixelRatio } from "./environment.js";
import type { LoadedEnvironment } from "@hackbuild/environment/three";

/** The line a stage shows when the browser drops its 3D context. */
export const LOST_COPY = "the 3d view was lost. press to restore.";

/** Canvas, random source, pixel ratio, background, environment and body load options of an `AvatarStage`. */
export interface StageOptions extends BodyLoadOptions {
  /** A canvas to draw on; by default the stage makes one and appends it to the container. */
  canvas?: HTMLCanvasElement;
  /** Seeded randomness for gaze and blinks. Default seededRng("avatar-host"). */
  rng?: Rng;
  /** Device pixels per CSS pixel, at most. Default 2 (proposed); a lit scene caps it at 1.5 (vendor). */
  maxPixelRatio?: number;
  /** Scene background; null leaves the canvas transparent. Default null. */
  background?: number | null;
  /** The plain lights; false when the page brings its own. Default true. */
  lights?: boolean;
  follow?: FollowOptions;
  body?: Omit<BodyOptions, "rng">;
  /** Seconds between stats events. Default 1. */
  statsEvery?: number;
  /** A button with the restore line over a lost context. Default true. */
  restoreButton?: boolean;
  /** A scene to show from the start, as `setEnvironment` takes it. */
  environment?: EnvironmentRequest | string;
}

/** Frames per second, frame count, draw calls, triangles and buffer size of a stage. */
export interface StageStats {
  /** Frames per second over the last window (measured from the loop clock). */
  fps: number;
  frames: number;
  /** Draw calls and triangles of the last frame (three.js renderer info). */
  calls: number;
  triangles: number;
  /** Drawing buffer size in device pixels. */
  width: number;
  height: number;
  pixelRatio: number;
}

/** What a stage reports: a body loaded or failed, stats, loop state, and the 3D context lost or restored. */
export type StageEvent =
  | { type: "loaded"; body: Body; name: string; caps: BodyCaps; warnings: string[]; placeholder: boolean }
  | { type: "failed"; message: string; cause: unknown }
  | { type: "stats"; stats: StageStats }
  | { type: "state"; running: boolean; reasons: PauseReason[] }
  | { type: "lost" }
  | { type: "restored" };

type Of<K extends StageEvent["type"]> = Extract<StageEvent, { type: K }>;

/** Pointer moves count as attention for this long, seconds (vendor). */
const POINTER_WINDOW = 2;

/** A three.js stage in a container: renderer, camera, orbit controls, follow camera, loop, environment slot and the body it shows. */
export class AvatarStage {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(30, 1, 0.05, 200);
  readonly renderer: WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  readonly controls: OrbitControls;
  readonly follow: FollowCamera;
  readonly loop: StageLoop;
  readonly lights: Light[] = [];
  /** The body on stage, or null. */
  body: Body | null = null;
  /** The lit scene around the body: `stage.environment.set("studio")`. */
  readonly environment: EnvironmentSlot;
  private scenery: LoadedEnvironment | null = null;
  private background: Color | null;
  /** Normalized pointer over the canvas, -1 to 1, for gaze. */
  readonly pointer = new Vector2();
  private pointerAt = -Infinity;
  private viewLook: Vector2 | null = null;
  private readonly host: AvatarHost<BodySource, Avatar>;
  private readonly listeners = new Map<string, Set<(e: StageEvent) => void>>();
  private readonly input = new AbortController();
  private readonly observers: { disconnect(): void }[] = [];
  private readonly ownCanvas: boolean;
  private readonly rng: Rng;
  private readonly box = new Box3();
  private readonly look = new Vector3();
  private readonly v = new Vector3();
  private restoreEl: HTMLButtonElement | null = null;
  private readonly loseExt: WEBGL_lose_context | null;
  private interacting = false;
  private startDistance = 0;
  private reduced = false;
  private statT = 0;
  private statFrames = 0;
  private disposed = false;

  constructor(
    readonly container: HTMLElement,
    private readonly opts: StageOptions = {},
  ) {
    this.rng = opts.rng ?? seededRng("avatar-host");
    this.ownCanvas = !opts.canvas;
    this.canvas = opts.canvas ?? container.ownerDocument.createElement("canvas");
    if (this.ownCanvas) {
      this.canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:none";
      container.append(this.canvas);
    }
    // no preserveDrawingBuffer: snapshot() renders and reads in one task
    this.renderer = new WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.loseExt = this.renderer.getContext().getExtension("WEBGL_lose_context");
    this.background = opts.background == null ? null : new Color(opts.background);
    this.scene.background = this.background;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.environment = new EnvironmentSlot(this);
    if (opts.lights !== false) {
      const key = new DirectionalLight(0xffffff, 3);
      key.position.set(1.2, 1.8, 2.2);
      const rim = new DirectionalLight(0xbcd0ff, 1.1);
      rim.position.set(-2, 1.2, -1.8);
      this.lights.push(key, rim, new HemisphereLight(0xffffff, 0x404048, 1.5));
      this.scene.add(...this.lights);
    }
    this.camera.position.set(0, 1.3, 3);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };
    this.controls.target.set(0, 1, 0);
    this.controls.minDistance = 0.2;
    this.controls.maxDistance = 50;
    this.follow = new FollowCamera(this.camera, this.controls.target, opts.follow);
    this.host = new AvatarHost<BodySource, Avatar>({ adapters: bodyAdapters(opts), exclusive: false, discard: (a) => a.dispose() });

    this.loop = new StageLoop({
      driver: this.renderer,
      frame: (dt, t) => this.frame(dt, t),
      busy: () => this.interacting || (this.body?.moving() ?? false),
      onState: (running, reasons) => this.emit({ type: "state", running, reasons }),
    });
    this.wireInput();
    this.wireObservers();
    this.resize();
    if (opts.environment) void this.showEnvironment(opts.environment);
  }

  /** Subscribes to one event type; returns the unsubscribe. */
  on<K extends StageEvent["type"]>(type: K, fn: (e: Of<K>) => void): () => void {
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, (set = new Set()));
    const f = fn as (e: StageEvent) => void;
    set.add(f);
    return () => set.delete(f);
  }

  private emit(e: StageEvent): void {
    for (const f of this.listeners.get(e.type) ?? []) f(e);
  }

  // ------------------------------------------------------------- bodies

  /**
   * Shows a body from a source, a URL, or dropped files. Resolves to the
   * body, or null when a later show superseded it or it failed; a failure
   * emits `failed` with copy for the person and keeps the current body.
   */
  async show(source: BodySource | string | readonly DroppedFile[] | Promise<BodySource>): Promise<Body | null> {
    let src: BodySource | Promise<BodySource>;
    try {
      src = typeof source === "string" ? sourceFromUrl(source) : Array.isArray(source) ? sourceFromFiles(source as readonly DroppedFile[]) : (source as BodySource | Promise<BodySource>);
    } catch (e) {
      this.emit({ type: "failed", message: bodyError(e), cause: e });
      return null;
    }
    try {
      const avatar = await this.host.show(src);
      if (!avatar || this.disposed) return null;
      const name = (await src).name;
      return this.mount(avatar, name.replace(/\.[^.]+$/, ""), false);
    } catch (e) {
      this.emit({ type: "failed", message: bodyError(e), cause: e });
      return null;
    }
  }

  /** Shows the placeholder body and supersedes any load in flight. */
  showPlaceholder(opts: PlaceholderOptions = {}): Body {
    void this.host.show(Promise.reject(new Error("superseded"))).catch(() => undefined);
    return this.mount(placeholderBody(opts), "placeholder", true);
  }

  /** Shows an Avatar loaded elsewhere; the stage owns it from here and disposes it on the next swap. */
  showAvatar(avatar: Avatar, name = avatar.root.name || "body"): Body {
    return this.mount(avatar, name, false);
  }

  /**
   * Shows a lit scene by preset id or request, or the plain stage for null.
   * Resolves true when that scene shows; a missing file emits `failed` with the
   * environment copy and keeps the current scene.
   */
  async showEnvironment(req: EnvironmentRequest | string | null): Promise<boolean> {
    try {
      await this.environment.set(req);
      const id = req === null ? null : typeof req === "string" ? req : typeof req.preset === "string" ? req.preset : req.preset.id;
      return this.environment.current === id;
    } catch (e) {
      this.emit({ type: "failed", message: e instanceof Error ? e.message : String(e), cause: e });
      return false;
    }
  }

  /** The swap the environment slot calls: old scene out first, new one in, shadows and lights to match. */
  setEnvironment(env: LoadedEnvironment | null): void {
    if (this.disposed) {
      env?.dispose();
      return;
    }
    this.scenery?.dispose();
    this.scenery = env;
    if (env) env.attach();
    else this.scene.background = this.background;
    const shadows = !!env?.shadows;
    this.renderer.shadowMap.enabled = shadows;
    for (const l of this.lights) l.visible = !env;
    if (this.body) this.castShadows(this.body.avatar.root, shadows);
    // materials compile again with or without shadow maps
    this.scene.traverse((o) => {
      const m = (o as Mesh).material;
      if (m) for (const x of Array.isArray(m) ? m : [m]) x.needsUpdate = true;
    });
    this.resize();
  }

  private castShadows(root: { traverse(f: (o: { castShadow: boolean }) => void): void }, on: boolean): void {
    root.traverse((o) => (o.castShadow = on));
  }

  private mount(avatar: Avatar, name: string, placeholder: boolean): Body {
    this.unmount();
    avatar.root.traverse((o) => (o.frustumCulled = false));
    this.castShadows(avatar.root, !!this.scenery?.shadows);
    this.scene.add(avatar.root);
    const body = new Body(avatar, { rng: this.rng, ...this.opts.body });
    this.body = body;
    avatar.root.updateMatrixWorld(true);
    this.follow.frame(posedBounds(avatar.bones));
    this.controls.update();
    this.loop.invalidate();
    this.emit({ type: "loaded", body, name, caps: body.caps, warnings: avatar.warnings, placeholder });
    return body;
  }

  private unmount(): void {
    if (!this.body) return;
    this.body.dispose();
    this.body = null;
  }

  // ------------------------------------------------------------- view surface

  /** Starts the loop after a pause by hand. */
  play(): void {
    this.loop.resume("paused");
  }

  /** Stops the loop by hand; other reasons still apply after play(). */
  pause(): void {
    this.loop.pause("paused");
  }

  /** The tool's route is (in)active. */
  setActive(on: boolean): void {
    this.loop.hold("inactive", !on);
  }

  /** A sheet or a modal covers the stage fully. */
  setCovered(on: boolean): void {
    this.loop.hold("covered", on);
  }

  /** Turns the follow camera on or off. Off, the camera stays put until the person moves it or `resetView` frames the body. */
  setFollow(on: boolean): void {
    this.follow.follow = on;
    this.loop.invalidate();
  }

  /** factor above 1 moves closer. */
  zoomBy(factor: number): void {
    this.follow.zoomBy(factor, this.controls.minDistance, this.controls.maxDistance);
    this.controls.update();
    this.loop.invalidate();
  }

  /** Frames the body again and forgets the person's pan and zoom. */
  resetView(): void {
    if (!this.body) return;
    this.body.avatar.root.updateMatrixWorld(true);
    this.follow.frame(posedBounds(this.body.avatar.bones));
    this.controls.update();
    this.loop.invalidate();
  }

  /** Gaze at a point in view coordinates (-1 to 1, +y up), or null to hand gaze back to the pointer and camera. */
  lookAtView(p: { x: number; y: number } | null): void {
    this.viewLook = p ? (this.viewLook ?? new Vector2()).set(p.x, p.y) : null;
  }

  resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const ratio = stagePixelRatio(globalThis.devicePixelRatio || 1, this.opts.maxPixelRatio ?? 2, this.scenery !== null);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(Math.max(1, w), Math.max(1, h), false);
    this.camera.aspect = Math.max(w, 1) / Math.max(h, 1);
    this.camera.updateProjectionMatrix();
    this.loop.hold("offscreen", w === 0 || h === 0 || this.offscreen);
    this.loop.invalidate();
  }

  /** One frame rendered now and read in the same task, as a PNG. */
  snapshot(type = "image/png"): Promise<Blob | null> {
    // step first: a hidden tab runs no frames, and the body would still be at rest
    this.frame(0, this.loop.time);
    return new Promise((ok) => this.canvas.toBlob((b) => ok(b), type));
  }

  /** After a lost context: asks the browser for the context back. A loss the browser caused comes back by itself when it can. */
  restore(): void {
    // the extension is taken while the context lives: a lost context hands out none
    this.loseExt?.restoreContext();
  }

  // ------------------------------------------------------------- frame

  private frame(dt: number, t: number): void {
    const body = this.body;
    if (body) {
      body.update(dt, this.gazeTarget(body, t), this.reduced, t);
      if (!this.interacting) {
        body.avatar.root.updateMatrixWorld(true);
        this.box.copy(posedBounds(body.avatar.bones));
        this.follow.step(this.box, dt);
      }
    }
    this.controls.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.stats(dt);
  }

  // what the eyes follow: a point the page set, else the pointer while it
  // moves over the stage, else the viewer
  private gazeTarget(body: Body, t: number): Vector3 {
    const view = this.viewLook ?? (t - this.pointerAt < POINTER_WINDOW ? this.pointer : null);
    if (!view) return this.camera.getWorldPosition(this.look);
    const eye = body.eyePosition(this.v);
    const d = this.camera.position.distanceTo(eye);
    this.look.set(view.x, view.y, 0.5).unproject(this.camera).sub(this.camera.position).setLength(d);
    return this.look.add(this.camera.position);
  }

  private stats(dt: number): void {
    this.statT += dt;
    this.statFrames++;
    const every = this.opts.statsEvery ?? 1;
    if (this.statT < every) return;
    const size = this.renderer.getDrawingBufferSize(new Vector2());
    const info = this.renderer.info.render;
    this.emit({
      type: "stats",
      stats: { fps: this.statFrames / this.statT, frames: this.loop.frames, calls: info.calls, triangles: info.triangles, width: size.x, height: size.y, pixelRatio: this.renderer.getPixelRatio() },
    });
    this.statT = 0;
    this.statFrames = 0;
  }

  // ------------------------------------------------------------- wiring

  private offscreen = false;

  private wireInput(): void {
    const signal = this.input.signal;
    this.canvas.addEventListener(
      "pointermove",
      (e) => {
        const r = this.canvas.getBoundingClientRect();
        const clamp = (x: number) => Math.max(-1, Math.min(1, x));
        this.pointer.set(clamp(((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1), clamp(-(((e.clientY - r.top) / Math.max(1, r.height)) * 2 - 1)));
        this.pointerAt = this.loop.time;
      },
      { signal },
    );
    this.canvas.addEventListener("pointerleave", () => (this.pointerAt = -Infinity), { signal });
    this.canvas.addEventListener("dblclick", () => this.resetView(), { signal });
    this.controls.addEventListener("start", () => {
      this.interacting = true;
      this.startDistance = this.follow.distance();
      this.loop.sync();
    });
    this.controls.addEventListener("end", () => {
      this.interacting = false;
      const body = this.body;
      if (body) body.avatar.root.updateMatrixWorld(true);
      this.follow.released(body ? posedBounds(body.avatar.bones) : null, this.startDistance);
      this.loop.invalidate();
    });
    this.controls.addEventListener("change", () => this.loop.invalidate());
    this.canvas.addEventListener(
      "webglcontextlost",
      () => {
        this.loop.hold("lost", true);
        this.showRestore(true);
        this.emit({ type: "lost" });
      },
      { signal },
    );
    this.canvas.addEventListener(
      "webglcontextrestored",
      () => {
        this.showRestore(false);
        this.loop.hold("lost", false);
        this.emit({ type: "restored" });
      },
      { signal },
    );
  }

  private wireObservers(): void {
    const doc = this.container.ownerDocument;
    const win = doc.defaultView;
    const signal = this.input.signal;
    doc.addEventListener("visibilitychange", () => this.loop.hold("hidden", doc.hidden), { signal });
    this.loop.hold("hidden", doc.hidden);
    if (win && "ResizeObserver" in win) {
      const ro = new win.ResizeObserver(() => this.resize());
      ro.observe(this.container);
      this.observers.push(ro);
    }
    if (win && "IntersectionObserver" in win) {
      const io = new win.IntersectionObserver((entries) => {
        const e = entries[entries.length - 1];
        if (!e) return;
        this.offscreen = !e.isIntersecting || e.boundingClientRect.width === 0 || e.boundingClientRect.height === 0;
        this.loop.hold("offscreen", this.offscreen || this.container.clientWidth === 0 || this.container.clientHeight === 0);
      });
      io.observe(this.container);
      this.observers.push(io);
    }
    const mq = win?.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (mq) {
      const apply = () => {
        this.reduced = mq.matches;
        this.controls.enableDamping = !mq.matches;
        this.loop.reducedMotion = mq.matches;
      };
      mq.addEventListener("change", apply, { signal });
      apply();
    } else this.controls.enableDamping = true;
  }

  private showRestore(on: boolean): void {
    if (this.opts.restoreButton === false) return;
    if (on && !this.restoreEl) {
      const doc = this.container.ownerDocument;
      const b = doc.createElement("button");
      b.type = "button";
      b.className = "hb-btn hb-stage-restore";
      b.textContent = LOST_COPY;
      b.style.cssText = "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);max-width:calc(100% - 32px)";
      b.addEventListener("click", () => this.restore());
      if (doc.defaultView?.getComputedStyle(this.container).position === "static") this.container.style.position = "relative";
      this.container.append(b);
      this.restoreEl = b;
    } else if (!on && this.restoreEl) {
      this.restoreEl.remove();
      this.restoreEl = null;
    }
  }

  /** Stops the loop, frees the body, the renderer and its context, and removes what the stage added. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loop.dispose();
    this.host.destroy();
    this.input.abort();
    for (const o of this.observers) o.disconnect();
    this.unmount();
    this.environment.cancel();
    this.scenery?.dispose();
    this.scenery = null;
    this.controls.dispose();
    this.renderer.dispose();
    this.loseExt?.loseContext();
    this.restoreEl?.remove();
    if (this.ownCanvas) this.canvas.remove();
    this.listeners.clear();
  }
}
