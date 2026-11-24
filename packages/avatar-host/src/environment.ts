// Which scene the stage shows around the body. `@hackbuild/environment` and
// its three.js add ons are imported on first use, so a plain backdrop never
// loads them. Requests are numbered: a slow load that a newer request
// overtook is disposed and never attached.
import type { Scene, WebGLRenderer } from "three";
import type { EnvironmentPreset } from "@hackbuild/environment";
import type { LoadedEnvironment, Resolve } from "@hackbuild/environment/three";

export interface EnvironmentTarget {
  readonly scene: Scene;
  readonly renderer: WebGLRenderer;
  /** Swaps the shown scene: disposes the old one, attaches the new one or none. */
  setEnvironment(env: LoadedEnvironment | null): void;
}

export interface EnvironmentRequest {
  /** A preset id (studio, room, cafe, outdoors) or a preset. */
  preset: string | EnvironmentPreset;
  /** Gives the files the preset needs; the studio needs none. */
  resolve?: Resolve;
}

export type EnvironmentLoader = (req: EnvironmentRequest, target: EnvironmentTarget) => Promise<LoadedEnvironment>;

const defaultLoad: EnvironmentLoader = async (req, target) => {
  const { loadEnvironment } = await import("@hackbuild/environment/three");
  return loadEnvironment(req.preset, target.scene, target.renderer, req.resolve ? { resolve: req.resolve } : {});
};

export class EnvironmentSlot {
  private ticket = 0;
  private shown: string | null = null;

  constructor(
    private readonly target: EnvironmentTarget,
    private readonly load: EnvironmentLoader = defaultLoad,
  ) {}

  /** Id of the scene showing now, or null for the plain stage. */
  get current(): string | null {
    return this.shown;
  }

  /**
   * Shows a scene, or the plain stage for null. Resolves to the scene, or
   * null when it was cleared or a later call overtook it; the same id
   * again does nothing. A load failure rejects and keeps the current scene.
   */
  async set(req: EnvironmentRequest | string | null): Promise<LoadedEnvironment | null> {
    const mine = ++this.ticket;
    const r: EnvironmentRequest | null = typeof req === "string" ? { preset: req } : req;
    const id = r ? (typeof r.preset === "string" ? r.preset : r.preset.id) : null;
    if (id === this.shown) return null;
    if (!r) {
      this.shown = null;
      this.target.setEnvironment(null);
      return null;
    }
    let env: LoadedEnvironment;
    try {
      env = await this.load(r, this.target);
    } catch (e) {
      if (mine !== this.ticket) return null;
      throw e;
    }
    if (mine !== this.ticket) {
      env.dispose();
      return null;
    }
    this.shown = id;
    this.target.setEnvironment(env);
    return env;
  }

  /** Overtakes any load in flight. */
  cancel(): void {
    this.ticket++;
  }
}

/** Device pixels per CSS pixel: at most `max`, and at most 1.5 with a lit scene (vendor). */
export function stagePixelRatio(device: number, max = 2, scene = false): number {
  return Math.min(device || 1, max, scene ? 1.5 : Infinity);
}
