// The ticketed loader behind a stage. Loads are numbered; only the latest
// one is shown, however they finish. One runtime per adapter key is made on
// first use and kept (the import for a format happens once); a failed
// create is forgotten, so the next show tries again. With `exclusive` the
// runtimes of other keys are destroyed when the key changes. A source's
// `release` runs once, whether its load wins, loses or throws.

/** The least a host source carries: its kind and an optional release call. */
export interface HostSource {
  kind: string;
  release?(): void;
}

/** Loads one kind of source: makes a runtime once, loads sources into it, and may destroy it. */
export interface Adapter<S extends HostSource, T, R = unknown> {
  /** Runtimes are shared by adapters with the same key. Default: the kind. */
  key?: string;
  create(): Promise<R>;
  load(runtime: R, source: S): Promise<T>;
  destroy?(runtime: R): void;
}

/** The adapters by kind, the exclusive switch and the discard call of an `AvatarHost`. */
export interface AvatarHostOptions<S extends HostSource, T> {
  /** By kind. Each adapter carries its own runtime type; the host only passes it back. */
  adapters: Partial<Record<string, Adapter<S, T, unknown>>>;
  /** Destroy the runtimes of other keys on a switch (one stage). Without it they stay for reuse. */
  exclusive?: boolean;
  /** Frees a result that lost to a later show and is never shown. */
  discard?(result: T): void;
}

interface Slot {
  key: string;
  runtime: Promise<unknown>;
  destroy: ((runtime: unknown) => void) | undefined;
}

/** Shows one source at a time through adapters: each show takes a ticket, a load that a later show overtook is discarded, and runtimes are shared or destroyed by key. */
export class AvatarHost<S extends HostSource, T> {
  private readonly slots = new Map<string, Slot>();
  private ticket = 0;
  private shown: T | null = null;

  constructor(private readonly opts: AvatarHostOptions<S, T>) {}

  /** The result of the latest show that finished and was not superseded. */
  get current(): T | null {
    return this.shown;
  }

  /** Runtime keys alive now. */
  get runtimes(): string[] {
    return [...this.slots.keys()];
  }

  /**
   * Resolves to the loaded result, or null when a later show superseded this
   * one; a superseded load's result is discarded and its error dropped.
   */
  async show(source: S | Promise<S>): Promise<T | null> {
    const mine = ++this.ticket;
    let src: S | null = null;
    try {
      src = await source;
      if (mine !== this.ticket) return null;
      const adapter = this.opts.adapters[src.kind];
      if (!adapter) throw new Error(`no adapter for ${src.kind} files.`);
      const runtime = await this.runtimeFor(adapter.key ?? src.kind, adapter);
      if (mine !== this.ticket) return null;
      const result = await adapter.load(runtime, src);
      if (mine !== this.ticket) {
        this.opts.discard?.(result);
        return null;
      }
      this.shown = result;
      return result;
    } catch (e) {
      if (mine !== this.ticket) return null;
      throw e;
    } finally {
      src?.release?.();
    }
  }

  /** Supersedes any load in flight and destroys every runtime. */
  destroy(): void {
    this.ticket++;
    this.shown = null;
    for (const key of [...this.slots.keys()]) this.drop(key);
  }

  private runtimeFor(key: string, adapter: Adapter<S, T, unknown>): Promise<unknown> {
    if (this.opts.exclusive) for (const k of this.slots.keys()) if (k !== key) this.drop(k);
    let slot = this.slots.get(key);
    if (!slot) {
      const runtime = adapter.create();
      slot = { key, runtime, destroy: adapter.destroy?.bind(adapter) };
      const mine = slot;
      runtime.catch(() => {
        if (this.slots.get(key) === mine) this.slots.delete(key);
      });
      this.slots.set(key, slot);
    }
    return slot.runtime;
  }

  private drop(key: string): void {
    const slot = this.slots.get(key);
    this.slots.delete(key);
    if (slot) void slot.runtime.then((r) => slot.destroy?.(r), () => undefined);
  }
}
