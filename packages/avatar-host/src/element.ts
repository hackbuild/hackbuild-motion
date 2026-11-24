// hb-avatar-host: the stage as a custom element for vanilla pages and for
// the slot of a Vue stage part. Attributes: src (a model URL; the
// placeholder body shows without one), environment (a scene id, studio
// needs no file), paused, inactive, covered. Stage
// events are dispatched as DOM events of the same name (loaded, failed,
// stats, state, lost, restored) with the stage event as detail. The class
// is made when `defineAvatarHost` runs, so importing this module defines
// nothing and runs in a worker or in Node.
import { AvatarStage, type StageEvent, type StageOptions } from "./stage.js";
import type { DroppedFile } from "./source.js";

export interface AvatarHostElement extends HTMLElement {
  readonly stage: AvatarStage | null;
  /** Shows dropped or picked files; resolves when the load settles. */
  showFiles(files: readonly DroppedFile[]): Promise<void>;
}

const EVENTS: StageEvent["type"][] = ["loaded", "failed", "stats", "state", "lost", "restored"];

/** Defines the element once under `tag`, with stage options every instance shares. Returns its class. */
export function defineAvatarHost(tag = "hb-avatar-host", options: StageOptions = {}): CustomElementConstructor {
  const known = customElements.get(tag);
  if (known) return known;
  class Element extends HTMLElement implements AvatarHostElement {
    static observedAttributes = ["src", "environment", "paused", "inactive", "covered"];
    stage: AvatarStage | null = null;
    private offs: (() => void)[] = [];

    connectedCallback(): void {
      if (this.stage) return;
      if (!this.style.display) this.style.display = "block";
      const stage = new AvatarStage(this, options);
      this.stage = stage;
      for (const type of EVENTS) this.offs.push(stage.on(type, (e) => this.dispatchEvent(new CustomEvent(type, { detail: e }))));
      this.sync();
      const env = this.getAttribute("environment");
      if (env) void stage.showEnvironment(env);
      const src = this.getAttribute("src");
      if (src) void stage.show(src);
      else stage.showPlaceholder();
    }

    disconnectedCallback(): void {
      for (const off of this.offs) off();
      this.offs = [];
      this.stage?.dispose();
      this.stage = null;
    }

    attributeChangedCallback(name: string, was: string | null, now: string | null): void {
      if (!this.stage || was === now) return;
      if (name === "src") {
        if (now) void this.stage.show(now);
        else this.stage.showPlaceholder();
      } else if (name === "environment") void this.stage.showEnvironment(now || null);
      else this.sync();
    }

    async showFiles(files: readonly DroppedFile[]): Promise<void> {
      await this.stage?.show(files);
    }

    private sync(): void {
      const s = this.stage;
      if (!s) return;
      if (this.hasAttribute("paused")) s.pause();
      else s.play();
      s.setActive(!this.hasAttribute("inactive"));
      s.setCovered(this.hasAttribute("covered"));
    }
  }
  customElements.define(tag, Element);
  return Element;
}
