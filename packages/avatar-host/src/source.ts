// What a stage shows: a model by URL, bytes or a File, with a resolver for
// the files it references when it came from a drop. Textures are found by
// their path below the model's folder, then by file name anywhere in the
// drop, ignoring case (models made on Windows often differ in case).

export type BodyKind = "vrm" | "glb" | "gltf" | "fbx";

export interface BodySource {
  kind: BodyKind;
  /** The model file: a URL, bytes or a Blob (a dropped File). */
  data: string | URL | ArrayBuffer | ArrayBufferView | Blob;
  /** File name; it names the body and helps the format sniff. */
  name: string;
  /** A URL for a file the model references, or null when the drop has none. */
  resolve?(ref: string): string | null;
  /** References `resolve` could not find, for the failure copy. */
  misses?: string[];
  /** Frees the object URLs the source made; the host calls it once the load settles. */
  release?(): void;
}

/** A dropped file: a Blob with a name and, from a folder, a relative path. */
export interface DroppedFile extends Blob {
  readonly name: string;
  readonly webkitRelativePath?: string;
}

const EXT: Record<string, BodyKind> = { vrm: "vrm", glb: "glb", gltf: "gltf", fbx: "fbx" };
const extOf = (name: string): string => name.toLowerCase().replace(/[?#].*$/, "").split(".").pop() ?? "";

/** The body kind a file name says, or null. */
export function kindOf(name: string): BodyKind | null {
  return EXT[extOf(name)] ?? null;
}

/** A model by URL; the kind comes from the name, glb when it says nothing. */
export function sourceFromUrl(url: string, name = url.split("/").pop() ?? "model"): BodySource {
  return { kind: kindOf(name) ?? "glb", data: url, name: decodeURIComponent(name.replace(/[?#].*$/, "")) };
}

const pathOf = (f: DroppedFile): string => (f.webkitRelativePath || f.name).replace(/\\/g, "/").toLowerCase();
const dirOf = (p: string): string => p.slice(0, p.lastIndexOf("/") + 1);

/** Lower case, forward slashes, no leading ./ and no URL escapes. */
export function normalizeRef(ref: string): string {
  let r = ref.replace(/\\/g, "/");
  try {
    r = decodeURIComponent(r);
  } catch {
    // a stray % stays as it is
  }
  return r.replace(/^(\.\/)+/, "").toLowerCase();
}

export interface UrlFactory {
  create(b: Blob): string;
  revoke(url: string): void;
}

const browserUrls: UrlFactory = { create: (b) => URL.createObjectURL(b), revoke: (u) => URL.revokeObjectURL(u) };

// Picked in this order when a drop holds several models.
const ORDER: BodyKind[] = ["vrm", "glb", "gltf", "fbx"];

/**
 * A source from dropped or picked files: the first .vrm, .glb, .gltf or .fbx,
 * with every other file reachable through `resolve`. Throws with the copy
 * for the person when the drop holds no model the stage reads.
 */
export function sourceFromFiles(files: readonly DroppedFile[], urls: UrlFactory = browserUrls): BodySource {
  let model: DroppedFile | undefined;
  for (const k of ORDER) if ((model = files.find((f) => kindOf(f.name) === k))) break;
  if (!model) {
    const ext = files.map((f) => extOf(f.name)).find((e) => e === "pmx" || e === "pmd" || e === "vrma" || e === "bvh");
    if (ext === "pmx" || ext === "pmd") throw new Error(`this file is a ${ext}. open it with the mmd loader of the avatar package.`);
    if (ext) throw new Error(`a ${ext} file is an animation. drop a body: a .vrm, .glb, .gltf or .fbx.`);
    throw new Error("this drop has no model. drop a .vrm, .glb, .gltf or .fbx file.");
  }
  const dir = dirOf(pathOf(model));
  const byPath = new Map(files.map((f) => [pathOf(f), f]));
  const byName = new Map<string, DroppedFile>();
  for (const f of files) if (!byName.has(f.name.toLowerCase())) byName.set(f.name.toLowerCase(), f);
  const made = new Map<DroppedFile, string>();
  const misses: string[] = [];
  let released = false;
  const urlOf = (f: DroppedFile): string => {
    let u = made.get(f);
    if (!u) {
      u = urls.create(f);
      made.set(f, u);
    }
    return u;
  };
  const resolve = (ref: string): string | null => {
    const low = normalizeRef(ref);
    const f = byPath.get(dir + low) ?? byPath.get(low) ?? byName.get(low.slice(low.lastIndexOf("/") + 1));
    if (f && !released) return urlOf(f);
    misses.push(ref);
    return null;
  };
  const release = (): void => {
    if (released) return;
    released = true;
    for (const u of made.values()) urls.revoke(u);
    made.clear();
  };
  return { kind: kindOf(model.name)!, data: model, name: model.name, resolve, misses, release };
}
