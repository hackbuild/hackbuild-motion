// AvatarDrop: drop or pick an avatar file and read, before anything uses
// it, what it is: a still of the body, its name, the size line, the
// licence the file states and the rig check in plain words. The file loads
// once through @hackbuild/avatar-host into the normalized humanoid, is
// checked as a stage body would be, drawn, and freed; the files go out on
// the `picked` event so a stage can wear them.
import type { Mesh, Object3D } from "three";
import { seededRng } from "@hackbuild/organic";
import { sniffFormat } from "@hackbuild/avatar";
import type { VrmHook } from "@hackbuild/avatar/three";
import { type DroppedFile, bodyError, sourceFromFiles } from "@hackbuild/avatar-host";
import { Body, type BodyCaps, type BodyLoadOptions, loadBody } from "@hackbuild/avatar-host/three";
import { dropRoutes } from "@virgilvox/hackbuild-ui/vanilla";
import { button, el, statusLine, urlSlot } from "./dom.js";
import { Still } from "./thumb.js";
import { type LicenceMeta, type RigCheck, type RigLine, licenceLine, rigCheck, sizeLine } from "./words.js";

export interface AvatarReport {
  name: string;
  format: string;
  bytes: number;
  files: number;
  triangles: number;
  caps: BodyCaps;
  check: RigCheck;
  licence: RigLine;
  size: string;
  /** The still, a PNG, or null when there is no webgl. */
  thumb: Blob | null;
}

export interface AvatarDropOptions extends BodyLoadOptions {
  /** The pick button is the one pink action of the screen. Default false. */
  go?: boolean;
  /** The pick button's words. */
  label?: string;
  /** The line in the empty zone. */
  hint?: string;
}

export type AvatarDropEvent =
  | { type: "picked"; files: readonly DroppedFile[] }
  | { type: "checked"; report: AvatarReport; files: readonly DroppedFile[] }
  | { type: "failed"; message: string }
  /** The card was pressed: wear this avatar. */
  | { type: "use"; report: AvatarReport; files: readonly DroppedFile[] };

export interface AvatarDropHandle {
  readonly report: AvatarReport | null;
  /** Reads files as a drop would. Resolves to the report, or null when the files held no body it could read. */
  take(files: readonly DroppedFile[]): Promise<AvatarReport | null>;
  /** Opens the file picker. */
  pick(): void;
  on(fn: (e: AvatarDropEvent) => void): () => void;
  dispose(): void;
}

const ACCEPT = ".vrm,.glb,.gltf,.fbx,.png,.jpg,.jpeg,.tga,.bin";

function triangles(root: Object3D): number {
  let n = 0;
  root.traverse((o) => {
    const g = (o as Mesh).isMesh ? (o as Mesh).geometry : null;
    if (!g) return;
    n += Math.floor((g.index ? g.index.count : (g.getAttribute("position")?.count ?? 0)) / 3);
  });
  return n;
}

/** Mounts the drop card into `host`. */
export function avatarDrop(host: HTMLElement, opts: AvatarDropOptions = {}): AvatarDropHandle {
  const doc = host.ownerDocument;
  const input = el(doc, "input", "", { type: "file", multiple: true, accept: ACCEPT, hidden: true, "aria-label": "pick an avatar file" });
  const pickBtn = button(doc, opts.label ?? "pick a file", opts.go === true, { "data-pick": "" });
  const zone = el(doc, "div", "hb-dropzone", {}, [el(doc, "span", "", {}, [opts.hint ?? "drop a .vrm, .glb or .fbx here, with its textures"]), pickBtn, input]);
  // the card is hackbuild-ui's avatar card: still, name, size line, rig line; pressing it uses the avatar
  const thumbBox = el(doc, "span", "hb-avcard-thumb");
  const nameEl = el(doc, "span", "hb-avcard-name");
  const sizeEl = el(doc, "span", "hb-avcard-meta");
  const rigEl = el(doc, "span", "hb-avcard-rig");
  const head = el(doc, "button", "hb-avcard", { type: "button", hidden: true, "aria-pressed": "false" }, [thumbBox, el(doc, "span", "hb-avcard-body", {}, [nameEl, sizeEl, rigEl])]);
  const lines = el(doc, "div", "", { role: "status", "aria-live": "polite" });
  host.append(zone, head, lines);

  const listeners = new Set<(e: AvatarDropEvent) => void>();
  const emit = (e: AvatarDropEvent) => {
    for (const f of listeners) f(e);
  };
  const still = new Still(doc);
  const thumbUrl = urlSlot();
  let report: AvatarReport | null = null;
  let lastFiles: readonly DroppedFile[] | null = null;
  let ticket = 0;
  let hook: Promise<VrmHook> | null = null;

  async function take(files: readonly DroppedFile[]): Promise<AvatarReport | null> {
    const mine = ++ticket;
    emit({ type: "picked", files });
    lines.replaceChildren(statusLine(doc, "reading the file.", "busy"));
    let body: Body | null = null;
    try {
      const src = sourceFromFiles(files);
      const model = files.find((f) => f.name === src.name || (f.webkitRelativePath ?? "").endsWith(src.name)) ?? files[0]!;
      const format = sniffFormat(new Uint8Array(await model.slice(0, 64 * 1024).arrayBuffer()), model.name);
      const vrm = src.kind === "vrm" && opts.vrm ? await (hook ??= opts.vrm()) : null;
      const avatar = await loadBody(src, vrm, opts);
      src.release?.();
      if (mine !== ticket) {
        avatar.dispose();
        return null;
      }
      body = new Body(avatar, { rng: seededRng("avatar-drop") });
      const bytes = files.reduce((s, f) => s + f.size, 0);
      const tris = triangles(avatar.root);
      avatar.update(0);
      const thumb = await still.draw(avatar.root);
      const check = rigCheck({ bones: body.names, expressions: body.caps.expressions, clips: body.caps.clips, mouth: body.caps.mouth, blink: body.caps.blink, gaze: body.caps.gaze, warnings: avatar.warnings });
      const r: AvatarReport = {
        name: src.name.replace(/\.[^.]+$/, ""),
        format: format === "unknown" ? src.kind : format,
        bytes,
        files: files.length,
        triangles: tris,
        caps: body.caps,
        check,
        licence: licenceLine(format, (avatar.vrm?.meta ?? null) as LicenceMeta | null),
        size: sizeLine({ bytes, format: format === "unknown" ? src.kind : format, files: files.length, triangles: tris }),
        thumb,
      };
      if (mine !== ticket) return null;
      report = r;
      lastFiles = files;
      head.setAttribute("aria-pressed", "false");
      head.classList.remove("is-on");
      draw(r);
      emit({ type: "checked", report: r, files });
      return r;
    } catch (e) {
      if (mine !== ticket) return null;
      const message = bodyError(e);
      lines.replaceChildren(statusLine(doc, message, "bad"));
      emit({ type: "failed", message });
      return null;
    } finally {
      body?.dispose();
    }
  }

  function draw(r: AvatarReport): void {
    head.hidden = false;
    const src = thumbUrl(r.thumb);
    thumbBox.replaceChildren(src ? el(doc, "img", "", { src, alt: "" }) : el(doc, "span", "", { "aria-hidden": "true" }, [r.name.slice(0, 1)]));
    nameEl.textContent = r.name;
    sizeEl.textContent = r.size;
    const worst = r.check.lines.find((l) => l.tone !== "ok");
    rigEl.textContent = worst ? `${r.check.head}: ${worst.text}` : `${r.check.head}, ${r.caps.bones} bones`;
    rigEl.className = `hb-avcard-rig ${r.check.tone === "bad" ? "is-bad" : "is-ok"}`;
    head.setAttribute("aria-label", `use ${r.name}, ${r.size}`);
    const tone = (t: RigLine["tone"]) => (t === "bad" ? "bad" : t === "warn" ? "warn" : "ok");
    lines.replaceChildren(
      ...r.check.lines.filter((l) => l !== worst).map((l) => statusLine(doc, l.text, tone(l.tone))),
      statusLine(doc, r.licence.text, tone(r.licence.tone)),
    );
    pickBtn.textContent = "pick another";
  }

  const ac = new AbortController();
  pickBtn.addEventListener("click", () => input.click(), { signal: ac.signal });
  head.addEventListener(
    "click",
    () => {
      if (!report || !lastFiles) return;
      head.setAttribute("aria-pressed", "true");
      head.classList.add("is-on");
      emit({ type: "use", report, files: lastFiles });
    },
    { signal: ac.signal },
  );
  input.addEventListener(
    "change",
    () => {
      const list = [...(input.files ?? [])];
      input.value = "";
      if (list.length) void take(list);
    },
    { signal: ac.signal },
  );
  const drop = dropRoutes(zone, [{ name: "avatar", accept: () => true, on: (files) => void take(files) }], { overlay: zone });

  return {
    get report() {
      return report;
    },
    take,
    pick: () => input.click(),
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    dispose() {
      ticket++;
      ac.abort();
      drop.dispose();
      still.dispose();
      thumbUrl(null);
      listeners.clear();
      zone.remove();
      head.remove();
      lines.remove();
    },
  };
}
