// The stage loop rules, without three.js: one animation loop per stage,
// stopped while any pause reason holds (the page hidden, the host off
// screen or at zero size, the route inactive, a sheet covering it, a lost
// context, or a pause by hand). It restarts on the reverse event and draws
// one frame at once, so a stage is never blank on return. The first delta
// after a stop is one fixed step, so time does not jump on resume. Under
// reduced motion the loop runs only while something moves (a clip the
// person started, the camera under a finger) and otherwise draws on change.

/** Why a stage loop is stopped: hidden, off screen, inactive, covered, context lost or paused. */
export type PauseReason = "hidden" | "offscreen" | "inactive" | "covered" | "lost" | "paused";

/** The one call of WebGLRenderer the loop needs. */
export interface LoopDriver {
  setAnimationLoop(cb: ((time: number) => void) | null): void;
}

/** The renderer driver, the frame call, the busy test and timing options of a `StageLoop`. */
export interface StageLoopOptions {
  driver: LoopDriver;
  /** One frame: `dt` in seconds, `time` the loop clock in seconds (the sum of deltas). */
  frame(dt: number, time: number): void;
  /** True while something moves; under reduced motion the loop stops once this is false. */
  busy?(): boolean;
  /** Seconds of the first delta after a stop. Default 1 / 60 (proposed, one 60 Hz frame). */
  fixedStep?: number;
  /** Longest delta in seconds, for a stalled main thread. Default 0.1 (proposed). */
  maxStep?: number;
  /** Called when the loop starts or stops, with the reasons that hold. */
  onState?(running: boolean, reasons: PauseReason[]): void;
}

/** The render loop of a stage: runs frames on the renderer's animation loop and stops while the page is hidden, off screen, covered, lost or paused. */
export class StageLoop {
  /** Frames drawn since the loop was made. */
  frames = 0;
  /** The loop clock in seconds: the sum of every delta handed to `frame`. */
  time = 0;
  private readonly reasons = new Set<PauseReason>();
  private reduced = false;
  private running = false;
  private last: number | null = null;
  private pending = true;
  private disposed = false;
  private readonly fixed: number;
  private readonly max: number;

  constructor(private readonly opts: StageLoopOptions) {
    this.fixed = opts.fixedStep ?? 1 / 60;
    this.max = opts.maxStep ?? 0.1;
  }

  get paused(): boolean {
    return this.reasons.size > 0;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** The reasons that hold now. */
  get why(): PauseReason[] {
    return [...this.reasons];
  }

  get reducedMotion(): boolean {
    return this.reduced;
  }

  set reducedMotion(on: boolean) {
    this.reduced = on;
    this.pending = true;
    this.sync();
  }

  /** Sets or clears one pause reason. */
  hold(reason: PauseReason, on: boolean): void {
    if (on === this.reasons.has(reason)) return;
    if (on) this.reasons.add(reason);
    else {
      this.reasons.delete(reason);
      // a return draws one frame at once, also under reduced motion
      this.pending = true;
    }
    this.sync();
  }

  pause(reason: PauseReason = "paused"): void {
    this.hold(reason, true);
  }

  resume(reason: PauseReason = "paused"): void {
    this.hold(reason, false);
  }

  /** Something changed: draw at least one more frame. */
  invalidate(): void {
    this.pending = true;
    this.sync();
  }

  /** Recomputes whether the loop should run; call after `busy` turns true. */
  sync(): void {
    if (this.disposed) return;
    const want = this.reasons.size === 0 && (!this.reduced || this.pending || (this.opts.busy?.() ?? false));
    if (want === this.running) return;
    this.running = want;
    if (want) this.opts.driver.setAnimationLoop(this.tick);
    else {
      this.opts.driver.setAnimationLoop(null);
      this.last = null;
    }
    this.opts.onState?.(want, this.why);
  }

  private readonly tick = (now: number): void => {
    const dt = this.last === null ? this.fixed : Math.min(this.max, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.pending = false;
    this.time += dt;
    this.frames++;
    this.opts.frame(dt, this.time);
    if (this.reduced) this.sync();
  };

  dispose(): void {
    if (this.running) this.opts.driver.setAnimationLoop(null);
    this.running = false;
    this.disposed = true;
  }
}
