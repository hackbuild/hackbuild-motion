// The views as custom elements, for a plain HTML page as the originals are.
// Nothing is defined on import: call defineMotionViews() once. Each element
// dispatches its view's events as DOM events of the same type with the
// event as detail, and keeps the view's handle on `.handle`.
//
//   <hb-character-stage name="moheeb" framing="bust"><div slot="inset">..</div></hb-character-stage>
//   <hb-avatar-drop go></hb-avatar-drop>
//   <hb-clip-strip></hb-clip-strip>   (set .items from script)
import { type CharacterStageHandle, type CharacterStageOptions, type Framing, characterStage } from "./character-stage.js";
import { type AvatarDropHandle, type AvatarDropOptions, avatarDrop } from "./avatar-drop.js";
import { type ClipStripHandle, type StripItem, clipStrip } from "./clip-strip.js";

/** Options `defineMotionViews` shares with every element it defines. */
export interface MotionViewsOptions {
  /** Options every hb-character-stage shares: the vrm hook, lights, follow. */
  stage?: CharacterStageOptions;
  /** Options every hb-avatar-drop shares: the vrm hook. */
  drop?: AvatarDropOptions;
}

/** The hb-character-stage element, with its view handle once connected. */
export interface CharacterStageElement extends HTMLElement {
  readonly handle: CharacterStageHandle | null;
}
/** The hb-avatar-drop element, with its view handle once connected. */
export interface AvatarDropElement extends HTMLElement {
  readonly handle: AvatarDropHandle | null;
}
/** The hb-clip-strip element, with its view handle and the items and picked clip as properties. */
export interface ClipStripElement extends HTMLElement {
  readonly handle: ClipStripHandle | null;
  items: readonly StripItem[];
  current: string | null;
}

const relay = (target: HTMLElement) => (e: { type: string }) => target.dispatchEvent(new CustomEvent(e.type, { detail: e }));

/** Defines hb-character-stage, hb-avatar-drop and hb-clip-strip once. */
export function defineMotionViews(opts: MotionViewsOptions = {}): void {
  if (!customElements.get("hb-character-stage")) {
    class Stage extends HTMLElement implements CharacterStageElement {
      static observedAttributes = ["src", "framing"];
      handle: CharacterStageHandle | null = null;
      private off: (() => void) | null = null;
      connectedCallback(): void {
        if (this.handle) return;
        const slotted = [...this.children].filter((c) => c.getAttribute("slot") === "inset");
        const framing = this.getAttribute("framing");
        const o: CharacterStageOptions = { ...opts.stage, drop: !this.hasAttribute("no-drop") };
        const name = this.getAttribute("name");
        const src = this.getAttribute("src");
        if (name) o.name = name;
        if (src) o.src = src;
        if (framing === "bust" || framing === "full") o.framing = framing;
        this.handle = characterStage(this, o);
        this.handle.inset.append(...slotted);
        this.off = this.handle.on(relay(this));
      }
      disconnectedCallback(): void {
        this.off?.();
        this.handle?.dispose();
        this.handle = null;
      }
      attributeChangedCallback(name: string, was: string | null, now: string | null): void {
        if (!this.handle || was === now) return;
        if (name === "src") {
          if (now) void this.handle.show(now);
          else this.handle.showPlaceholder();
        } else if (now === "bust" || now === "full") this.handle.frame(now as Framing);
      }
    }
    customElements.define("hb-character-stage", Stage);
  }
  if (!customElements.get("hb-avatar-drop")) {
    class Drop extends HTMLElement implements AvatarDropElement {
      handle: AvatarDropHandle | null = null;
      private off: (() => void) | null = null;
      connectedCallback(): void {
        if (this.handle) return;
        if (!this.style.display) this.style.display = "block";
        const o: AvatarDropOptions = { ...opts.drop, go: this.hasAttribute("go") };
        const label = this.getAttribute("label");
        if (label) o.label = label;
        this.handle = avatarDrop(this, o);
        this.off = this.handle.on(relay(this));
      }
      disconnectedCallback(): void {
        this.off?.();
        this.handle?.dispose();
        this.handle = null;
      }
    }
    customElements.define("hb-avatar-drop", Drop);
  }
  if (!customElements.get("hb-clip-strip")) {
    class Strip extends HTMLElement implements ClipStripElement {
      handle: ClipStripHandle | null = null;
      private off: (() => void) | null = null;
      private pending: readonly StripItem[] = [];
      private picked: string | null = null;
      get items(): readonly StripItem[] {
        return this.pending;
      }
      set items(v: readonly StripItem[]) {
        this.pending = v;
        this.handle?.setItems(v, this.picked);
      }
      get current(): string | null {
        return this.handle?.current?.id ?? this.picked;
      }
      set current(id: string | null) {
        this.picked = id;
        if (id) this.handle?.pick(id);
      }
      connectedCallback(): void {
        if (this.handle) return;
        // the strip and its play button join the parent row, as the verb row lays them out
        if (!this.style.display) this.style.display = "contents";
        this.handle = clipStrip(this, { items: this.pending, current: this.picked, go: !this.hasAttribute("no-go") });
        this.off = this.handle.on(relay(this));
      }
      disconnectedCallback(): void {
        this.off?.();
        this.handle?.dispose();
        this.handle = null;
      }
    }
    customElements.define("hb-clip-strip", Strip);
  }
}
