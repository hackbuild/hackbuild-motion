// The scene level loader: a body source to a loaded Avatar in the
// normalized humanoid space, through @hackbuild/avatar. Dropped files reach
// the model's texture references through the source's resolver, and the
// load waits for every texture the loader started, so the source's object
// URLs can be freed when it resolves. The rig wasm loads once, on the first
// body.
import { LoadingManager } from "three";
import { load as loadRig } from "@hackbuild/avatar";
import { type Avatar, type NormalizeOptions, type RepairOptions, type VrmHook, loadAvatar } from "@hackbuild/avatar/three";
import type { Adapter } from "./host.js";
import type { BodyKind, BodySource } from "./source.js";

export interface BodyLoadOptions {
  /** The VRM hook, imported on the first .vrm: `() => import("@hackbuild/avatar/vrm").then((m) => m.vrmHook())`. Without it a VRM loads as plain glTF. */
  vrm?: () => Promise<VrmHook>;
  normalize?: NormalizeOptions;
  repair?: RepairOptions | false;
}

let rig: Promise<unknown> | null = null;
/** The rig wasm, once per page; a failed load is tried again next time. */
export function rigReady(): Promise<unknown> {
  if (!rig) {
    rig = loadRig();
    rig.catch(() => (rig = null));
  }
  return rig;
}

/** A manager that sends references through `resolve` and can wait for every item it started. */
export function trackingManager(resolve?: (ref: string) => string | null): { manager: LoadingManager; settled(): Promise<void> } {
  const manager = new LoadingManager();
  let pending = 0;
  let wake: (() => void) | null = null;
  const start = manager.itemStart.bind(manager);
  const end = manager.itemEnd.bind(manager);
  manager.itemStart = (url: string) => {
    pending++;
    start(url);
  };
  manager.itemEnd = (url: string) => {
    pending = Math.max(0, pending - 1);
    end(url);
    if (pending === 0) wake?.();
  };
  if (resolve) manager.setURLModifier((url) => (/^(blob|data):/.test(url) ? url : (resolve(url) ?? url)));
  return {
    manager,
    settled: () => (pending === 0 ? Promise.resolve() : new Promise<void>((ok) => (wake = ok))),
  };
}

/** Loads one body source. */
export async function loadBody(src: BodySource, hook: VrmHook | null, opts: BodyLoadOptions = {}): Promise<Avatar> {
  await rigReady();
  const { manager, settled } = trackingManager(src.resolve?.bind(src));
  const avatar = await loadAvatar(src.data, {
    name: src.name,
    manager,
    ...(hook ? { vrm: hook } : {}),
    ...(opts.normalize ? { normalize: opts.normalize } : {}),
    ...(opts.repair !== undefined ? { repair: opts.repair } : {}),
  });
  await settled();
  if (src.misses?.length) avatar.warnings.push(`${src.misses.length} referenced files were not in the drop: ${src.misses.slice(0, 3).join(", ")}${src.misses.length > 3 ? " and more" : ""}.`);
  return avatar;
}

/** The adapters a stage hosts: VRM with its hook imported on first use, the other kinds over the rig mapper. */
export function bodyAdapters(opts: BodyLoadOptions = {}): Record<BodyKind, Adapter<BodySource, Avatar, VrmHook | null>> {
  const plain: Adapter<BodySource, Avatar, VrmHook | null> = {
    key: "rig",
    create: async () => {
      await rigReady();
      return null;
    },
    load: (_r, src) => loadBody(src, null, opts),
  };
  return {
    vrm: {
      key: "vrm",
      create: async () => (opts.vrm ? opts.vrm() : null),
      load: (hook, src) => loadBody(src, hook, opts),
    },
    glb: plain,
    gltf: plain,
    fbx: plain,
  };
}
