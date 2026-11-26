// Format sniffing from the first bytes, the glTF JSON chunk, an FBX
// character or clip probe, and the redistribution gate for VRM metadata.

/** The file format an avatar was sniffed as. */
export type AvatarFormat = "vrm" | "vrma" | "glb" | "gltf" | "fbx" | "unknown";

const ascii = (b: Uint8Array, from: number, n: number) => String.fromCharCode(...b.subarray(from, Math.min(b.length, from + n)));

/** glTF JSON from a GLB or a .gltf text file, or null. */
export function gltfJson(bytes: Uint8Array): Record<string, unknown> | null {
  try {
    if (ascii(bytes, 0, 4) === "glTF") {
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const len = dv.getUint32(12, true);
      if (dv.getUint32(16, true) !== 0x4e4f534a) return null;
      return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + len))) as Record<string, unknown>;
    }
    const head = new TextDecoder().decode(bytes.subarray(0, 64)).trimStart();
    if (head.startsWith("{")) return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  } catch {
    return null;
  }
  return null;
}

/** Format from content; the file name breaks no ties, it only helps when the content says nothing. */
export function sniffFormat(bytes: Uint8Array, name = ""): AvatarFormat {
  if (ascii(bytes, 0, 18) === "Kaydara FBX Binary") return "fbx";
  const text = ascii(bytes, 0, 64);
  if (/^\s*; FBX/.test(text)) return "fbx";
  const json = gltfJson(bytes);
  if (json) {
    const used = (json.extensionsUsed as string[] | undefined) ?? [];
    if (used.includes("VRMC_vrm") || used.includes("VRM")) return "vrm";
    if (used.includes("VRMC_vrm_animation")) return "vrma";
    return ascii(bytes, 0, 4) === "glTF" ? "glb" : "gltf";
  }
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "vrm" || ext === "glb" || ext === "gltf" || ext === "fbx" || ext === "vrma") return ext;
  return "unknown";
}

function indexOf(hay: Uint8Array, needle: string, from = 0): number {
  const n = Array.from(needle, (c) => c.charCodeAt(0));
  outer: for (let i = from; i <= hay.length - n.length; i++) {
    for (let k = 0; k < n.length; k++) if (hay[i + k] !== n[k]) continue outer;
    return i;
  }
  return -1;
}

/** What the first 256 KB of an FBX file say: a character, a clip or unknown, and whether it holds geometry and deformers. */
export interface FbxProbe {
  kind: "character" | "clip" | "unknown";
  geometry: boolean;
  deformer: boolean;
}

/**
 * Tells a rigged character from an animation only file by reading the
 * first 256 KB: a character's Definitions section declares both Geometry
 * and Deformer object types, a clip declares neither.
 */
export function probeFbx(bytes: Uint8Array): FbxProbe {
  const head = bytes.subarray(0, 256 * 1024);
  const def = indexOf(head, "Definitions");
  if (def < 0) return { kind: "unknown", geometry: false, deformer: false };
  const end = indexOf(head, "Objects", def);
  const scope = head.subarray(def, end > def ? end : head.length);
  const geometry = indexOf(scope, "Geometry") >= 0;
  const deformer = indexOf(scope, "Deformer") >= 0;
  return { kind: geometry && deformer ? "character" : !geometry ? "clip" : "unknown", geometry, deformer };
}

/** VRM 1.0 and 0.x metadata fields the gate reads. */
export interface VrmMetaLike {
  metaVersion?: "0" | "1" | string;
  allowRedistribution?: boolean;
  modification?: "prohibited" | "allowModification" | "allowModificationRedistribution" | string;
  licenseName?: string;
  otherLicenseUrl?: string;
}

/** Whether an avatar may go into a shareable bundle, whether the user must confirm, and why not. */
export interface RedistributionVerdict {
  ok: boolean;
  needsConfirm?: boolean;
  reason?: string;
}

/**
 * Whether an avatar may go into a shareable bundle. VRM 1.0 needs
 * `allowRedistribution`, and a modified or composed avatar needs
 * `allowModificationRedistribution`. VRM 0.x must not be
 * Redistribution_Prohibited, must not be ND when modified, and `Other`
 * asks the person to confirm. Run it for every donor of a composite.
 */
export function checkRedistribution(meta: VrmMetaLike | null | undefined, opts: { modified: boolean }): RedistributionVerdict {
  if (!meta) return { ok: false, reason: "no vrm metadata. the licence is unknown." };
  const v1 = meta.metaVersion === "1" || meta.allowRedistribution !== undefined || meta.modification !== undefined;
  if (v1) {
    if (meta.allowRedistribution !== true) return { ok: false, reason: "the avatar licence does not allow redistribution." };
    if (opts.modified && meta.modification !== "allowModificationRedistribution") return { ok: false, reason: "the avatar licence does not allow sharing a modified copy." };
    return { ok: true };
  }
  const lic = meta.licenseName ?? "";
  if (!lic) return { ok: false, reason: "no licence name in the vrm metadata." };
  if (lic === "Redistribution_Prohibited") return { ok: false, reason: "the avatar licence prohibits redistribution." };
  if (opts.modified && /_ND$/.test(lic)) return { ok: false, reason: "the avatar licence forbids derivatives." };
  if (lic === "Other") return { ok: false, needsConfirm: true, reason: "the avatar uses a custom licence. read it and confirm." };
  return { ok: true };
}

/**
 * Unit guess from head over feet height in source units: the first of
 * meters, decimeters, centimeters, inches and millimeters that puts a head
 * joint (about 87 percent of stature, inferred) at 1.0 to 2.3 m stature.
 * Returns meters per source unit, or the scale to 1.6 m when none fits.
 */
export function guessUnit(headOverFeet: number): number {
  if (!(headOverFeet > 0)) return 1;
  for (const unit of [1, 0.1, 0.01, 0.0254, 0.001]) {
    const stature = (headOverFeet * unit) / 0.87;
    if (stature >= 1.0 && stature <= 2.3) return unit;
  }
  return (1.6 * 0.87) / headOverFeet;
}
