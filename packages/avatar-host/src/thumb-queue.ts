// The thumbnail queue: still previews drawn in the background, one at a
// time, on one renderer the queue builds on first need. Callers say which
// items they want; urgent ones (on screen, just added) jump the queue. An
// item is tried once per session. Between items the queue rests at least
// as long as the last render took, inside a floor and a ceiling, so
// drawing uses at most about half of the main thread; in a hidden tab,
// where timers crawl, it yields one task instead. A renderer whose GPU
// context was lost is rebuilt before the next item. Once the queue is
// empty the renderer lingers, so items scrolled into view soon after do
// not rebuild it, and is then disposed. No three.js here: the renderer is
// injected, the three.js portraits are in portrait.ts.

/** Counts for a progress line: items done of items asked for in this run. */
export interface ThumbProgress {
  active: boolean;
  done: number;
  total: number;
}

/** Draws one item to an image. */
export interface ThumbRenderer<J> {
  /** True once the GPU context is gone; the queue builds a new renderer. */
  readonly lost: boolean;
  /** The image, or null when the render gave none. Throws with a reason the queue reports. */
  draw(job: J): Promise<Blob | null>;
  dispose(): void;
}

/** The renderer factory, the save call, the failure and progress calls of a `ThumbQueue`. */
export interface ThumbQueueOptions<J> {
  /** Builds the renderer, on first need and after a lost context. Null or a throw ends the run. */
  renderer(): Promise<ThumbRenderer<J> | null>;
  /** Keeps a drawn image, for instance in a blob store by content hash. */
  save(id: string, image: Blob): Promise<void>;
  /** An item that gave no image, and why. It is not tried again this session. */
  failed?(id: string, reason: string): void;
  onProgress?(p: ThumbProgress): void;
  /** How long the renderer is kept once the queue is empty, ms. Default 20000 (vendor). */
  lingerMs?: number;
  /** Rest between items, ms: at least this. Default 40 (vendor). */
  minRestMs?: number;
  /** Rest between items, ms: at most this. Default 400 (vendor). */
  maxRestMs?: number;
  /** Clock in ms; default `performance.now`. */
  now?(): number;
  /** True while the page is hidden; default reads `document.visibilityState`. */
  hidden?(): boolean;
}

const reasonOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Draws previews one at a time in the background, saves each image and remembers failures, paced so the page stays responsive. */
export class ThumbQueue<J extends { id: string }> {
  private readonly state: ThumbProgress = { active: false, done: 0, total: 0 };
  private readonly queue: J[] = [];
  private readonly seen = new Set<string>();
  private current: Promise<ThumbRenderer<J> | null> | null = null;
  private running: Promise<void> | null = null;
  private stopped = false;
  private linger: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly opts: ThumbQueueOptions<J>) {}

  get progress(): ThumbProgress {
    return { ...this.state };
  }

  /** Ids waiting, next first. */
  get waiting(): string[] {
    return this.queue.map((j) => j.id);
  }

  /** True while a renderer is built or lingering. */
  get holding(): boolean {
    return this.current !== null;
  }

  /** Resolves when the current run has drained. */
  idle(): Promise<void> {
    return this.running ?? Promise.resolve();
  }

  /** Asks for previews. Items seen this session are skipped; `urgent` puts these first, waiting ones included. */
  want(jobs: readonly J[], urgent = false): void {
    if (urgent) {
      const ids = new Set(jobs.map((j) => j.id));
      const waiting = this.queue.filter((j) => ids.has(j.id));
      if (waiting.length) {
        for (let i = this.queue.length - 1; i >= 0; i--) if (ids.has(this.queue[i]!.id)) this.queue.splice(i, 1);
        this.queue.unshift(...waiting);
      }
    }
    const fresh: J[] = [];
    for (const j of jobs)
      if (!this.seen.has(j.id)) {
        this.seen.add(j.id);
        fresh.push(j);
      }
    if (!fresh.length) return;
    if (urgent) this.queue.unshift(...fresh);
    else this.queue.push(...fresh);
    if (!this.running) this.state.done = this.state.total = 0;
    this.state.total += fresh.length;
    this.stopped = false;
    this.running ??= this.drain().finally(() => (this.running = null));
  }

  /** Stops, forgets what was seen and frees the renderer. */
  destroy(): void {
    this.stopped = true;
    this.queue.length = 0;
    this.seen.clear();
    if (this.linger) clearTimeout(this.linger);
    this.linger = null;
    this.teardown();
  }

  private report(): void {
    this.opts.onProgress?.({ ...this.state });
  }

  private async drain(): Promise<void> {
    if (this.linger) clearTimeout(this.linger);
    this.linger = null;
    const now = this.opts.now ?? (() => performance.now());
    this.state.active = true;
    this.report();
    while (this.queue.length && !this.stopped) {
      const started = now();
      const r = await this.renderer();
      if (!r.renderer) {
        const reason = r.reason ?? "no figure to draw on.";
        for (const j of this.queue.splice(0)) this.opts.failed?.(j.id, reason);
        break;
      }
      const job = this.queue.shift()!;
      await this.render(r.renderer, job);
      this.state.done++;
      this.report();
      if (this.queue.length && !this.stopped) await this.rest(Math.min(this.opts.maxRestMs ?? 400, Math.max(this.opts.minRestMs ?? 40, now() - started)));
    }
    this.state.active = false;
    this.report();
    if (!this.stopped) this.linger = setTimeout(() => !this.running && this.teardown(), this.opts.lingerMs ?? 20_000);
  }

  private async renderer(): Promise<{ renderer: ThumbRenderer<J> | null; reason?: string }> {
    const had = await this.current;
    if (had?.lost) this.teardown();
    let reason: string | undefined;
    this.current ??= this.opts.renderer().catch((e: unknown) => {
      reason = reasonOf(e);
      return null;
    });
    const renderer = await this.current;
    if (!renderer) this.current = null;
    return reason === undefined ? { renderer } : { renderer, reason };
  }

  private async render(r: ThumbRenderer<J>, job: J): Promise<void> {
    try {
      const image = await r.draw(job);
      if (image) await this.opts.save(job.id, image);
      else this.opts.failed?.(job.id, "the render gave no image.");
    } catch (e) {
      this.opts.failed?.(job.id, reasonOf(e));
    }
  }

  private rest(ms: number): Promise<void> {
    const hidden = this.opts.hidden ?? (() => typeof document !== "undefined" && document.visibilityState === "hidden");
    if (hidden() && typeof MessageChannel !== "undefined") {
      return new Promise((ok) => {
        const ch = new MessageChannel();
        ch.port1.onmessage = () => {
          ch.port1.close();
          ok();
        };
        ch.port2.postMessage(null);
      });
    }
    return new Promise((ok) => setTimeout(() => (typeof requestIdleCallback === "function" ? requestIdleCallback(() => ok(), { timeout: 1000 }) : ok()), ms));
  }

  private teardown(): void {
    const p = this.current;
    this.current = null;
    void p?.then((r) => r?.dispose());
  }
}
