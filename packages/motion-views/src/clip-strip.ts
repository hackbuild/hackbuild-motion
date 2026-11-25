// ClipStrip: a strip of clips with a still of each, as the tour player's
// chapter bar and episode cards show their parts. Press a still to pick a
// clip; the one play button plays or stops the picked clip. Stills come
// from the item, or are drawn on a clay figure by the avatar-host thumb
// queue from the clip itself, one at a time in the background.
import type { AnimationClip } from "three";
import { button, el } from "./dom.js";
import { type ClipItem, clipMeta, nextClip } from "./clips.js";

/** A clip in the strip; `animation` lets the strip draw its still. */
export interface StripItem extends ClipItem {
  animation?: () => AnimationClip | Promise<AnimationClip>;
}

export interface ClipStripOptions {
  items?: readonly StripItem[];
  /** The picked clip; default the first. */
  current?: string | null;
  /** Labels under each still, in a grid for a rack pane. Default false: one row of stills. */
  grid?: boolean;
  /** The play button is the one pink action of the screen. Default true. */
  go?: boolean;
  /** Accessible name of the strip. */
  label?: string;
  /** Draw missing stills from `animation`. Default true. */
  thumbs?: boolean;
}

export type ClipStripEvent =
  | { type: "pick"; item: StripItem }
  | { type: "play"; item: StripItem }
  | { type: "stop"; item: StripItem }
  | { type: "thumb"; id: string; ok: boolean };

export interface ClipStripHandle {
  readonly current: StripItem | null;
  readonly playing: boolean;
  setItems(items: readonly StripItem[], current?: string | null): void;
  pick(id: string): void;
  /** The play state as the page knows it: true while the picked clip plays. */
  setPlaying(on: boolean): void;
  /** Resolves when every still asked for so far is drawn or has failed. */
  thumbsIdle(): Promise<void>;
  on(fn: (e: ClipStripEvent) => void): () => void;
  dispose(): void;
}

const initial = (name: string) => name.replace(/[^a-z0-9 ]/gi, " ").trim().split(/\s+/)[0]?.slice(0, 5) ?? "clip";

/** Mounts a clip strip into `host`. */
export function clipStrip(host: HTMLElement, opts: ClipStripOptions = {}): ClipStripHandle {
  const doc = host.ownerDocument;
  const list = el(doc, "ul", "hb-hist-list", { "aria-label": opts.label ?? "clips" });
  const playBtn = button(doc, "play", opts.go !== false, { "data-play": "" });
  const root = el(doc, "div", `hb-hist${opts.grid ? " is-grid" : ""}`, {}, [list, playBtn]);
  host.append(root);

  const listeners = new Set<(e: ClipStripEvent) => void>();
  const emit = (e: ClipStripEvent) => {
    for (const f of listeners) f(e);
  };
  let items: readonly StripItem[] = [];
  let current: string | null = null;
  let playing = false;
  const urls = new Map<string, string>();
  const failed = new Set<string>();
  let queue: Promise<{ want(jobs: { id: string; clip: () => AnimationClip | Promise<AnimationClip> }[], urgent?: boolean): void; idle(): Promise<void>; destroy(): void }> | null = null;
  let disposed = false;

  const thumbSrc = (it: StripItem): string => {
    if (typeof it.thumb === "string") return it.thumb;
    const have = urls.get(it.id);
    if (have) return have;
    if (it.thumb instanceof Blob) {
      const u = URL.createObjectURL(it.thumb);
      urls.set(it.id, u);
      return u;
    }
    return "";
  };

  function render(): void {
    list.replaceChildren(
      ...items.map((it) => {
        const src = thumbSrc(it);
        const meta = clipMeta(it);
        const thumb = el(doc, "button", "hb-hist-thumb", { type: "button", "data-id": it.id, title: it.warn ? `${it.name}, ${meta}. ${it.warn}` : `${it.name}, ${meta}`, "aria-label": `pick ${it.name}, ${meta}`, "aria-current": it.id === current ? "true" : null }, [
          src ? el(doc, "img", "", { src, alt: "", loading: "lazy" }) : el(doc, "span", "hb-hist-tx", {}, [initial(it.name)]),
        ]);
        const kids: Node[] = [thumb];
        if (opts.grid) kids.push(el(doc, "span", "hb-hist-cap", {}, [el(doc, "span", "hb-hist-label", {}, [it.name]), el(doc, "span", "hb-hist-meta", {}, [it.warn ? `${meta}. ${it.warn}` : meta])]));
        return el(doc, "li", `hb-hist-item${it.id === current ? " is-current" : ""}`, {}, kids);
      }),
    );
    const cur = items.find((i) => i.id === current);
    playBtn.hidden = !cur;
    playBtn.textContent = playing ? "stop" : cur ? `play ${cur.name}` : "play";
  }

  function wantThumbs(): void {
    if (opts.thumbs === false) return;
    const jobs = items.filter((i) => !i.thumb && i.animation && !urls.has(i.id) && !failed.has(i.id)).map((i) => ({ id: i.id, clip: i.animation! }));
    if (!jobs.length) return;
    queue ??= import("@hackbuild/avatar-host/thumbs").then(({ clipThumbs }) =>
      clipThumbs({
        save: async (id, png) => {
          if (disposed) return;
          urls.set(id, URL.createObjectURL(png));
          render();
          emit({ type: "thumb", id, ok: true });
        },
        failed: (id) => {
          failed.add(id);
          emit({ type: "thumb", id, ok: false });
        },
      }),
    );
    void queue.then((q) => q.want(jobs));
  }

  function setItems(next: readonly StripItem[], cur?: string | null): void {
    items = next;
    const keep = cur !== undefined ? cur : current;
    current = keep && items.some((i) => i.id === keep) ? keep : (items[0]?.id ?? null);
    playing = false;
    render();
    wantThumbs();
  }

  function pick(id: string): void {
    const it = items.find((i) => i.id === id);
    if (!it) return;
    const was = current;
    current = id;
    render();
    list.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)?.focus();
    if (was !== id || !playing) emit({ type: "pick", item: it });
  }

  const ac = new AbortController();
  list.addEventListener(
    "click",
    (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-id]");
      if (b) pick(b.dataset.id!);
    },
    { signal: ac.signal },
  );
  list.addEventListener(
    "keydown",
    (e) => {
      const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      const id = nextClip(items, current, step);
      if (id) pick(id);
    },
    { signal: ac.signal },
  );
  playBtn.addEventListener(
    "click",
    () => {
      const it = items.find((i) => i.id === current);
      if (!it) return;
      playing = !playing;
      render();
      emit({ type: playing ? "play" : "stop", item: it });
    },
    { signal: ac.signal },
  );

  setItems(opts.items ?? [], opts.current ?? null);

  return {
    get current() {
      return items.find((i) => i.id === current) ?? null;
    },
    get playing() {
      return playing;
    },
    setItems,
    pick,
    setPlaying(on) {
      if (playing === on) return;
      playing = on;
      render();
    },
    async thumbsIdle() {
      if (queue) await (await queue).idle();
    },
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    dispose() {
      disposed = true;
      ac.abort();
      void queue?.then((q) => q.destroy());
      for (const u of urls.values()) URL.revokeObjectURL(u);
      urls.clear();
      listeners.clear();
      root.remove();
    },
  };
}
