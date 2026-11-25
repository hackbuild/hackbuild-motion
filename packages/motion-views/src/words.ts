// The plain words the views show: what a dropped avatar can do, its size
// and its licence, and a clip's length. Pure functions over plain data, so
// they run in Node and the tests read them without a browser.

/** What a loaded body can do, as @hackbuild/avatar-host reports it in BodyCaps. */
export interface RigFacts {
  /** Humanoid bones the mapper found, by VRM 1.0 name. */
  bones: readonly string[];
  /** Expression names the face carries. */
  expressions: readonly string[];
  /** Clip names inside the file. */
  clips: readonly string[];
  mouth: boolean;
  blink: boolean;
  gaze: boolean;
  /** Load warnings from the avatar package, already in plain words. */
  warnings?: readonly string[];
}

export type RigTone = "ok" | "warn" | "bad";

/** One line of the rig check: what works or what does not, and why. */
export interface RigLine {
  tone: RigTone;
  text: string;
}

export interface RigCheck {
  tone: RigTone;
  /** The headline: "ready to act", "ready, with limits", "cannot act". */
  head: string;
  lines: RigLine[];
}

const LEGS = ["leftUpperLeg", "leftLowerLeg", "leftFoot", "rightUpperLeg", "rightLowerLeg", "rightFoot"];
const ARMS = ["leftUpperArm", "leftLowerArm", "leftHand", "rightUpperArm", "rightLowerArm", "rightHand"];
const FINGER = /(Thumb|Index|Middle|Ring|Little)/;

/** The rig check in plain words, worst first. */
export function rigCheck(f: RigFacts): RigCheck {
  const has = new Set(f.bones);
  const lines: RigLine[] = [];
  const bad = (text: string) => lines.push({ tone: "bad", text });
  const warn = (text: string) => lines.push({ tone: "warn", text });
  const ok = (text: string) => lines.push({ tone: "ok", text });
  if (!has.has("hips")) bad("no hips bone. nothing on the stage can move this body.");
  if (!has.has("head")) bad("no head bone. it cannot look at you or nod.");
  const legs = LEGS.filter((b) => !has.has(b));
  if (legs.length) warn(legs.length === LEGS.length ? "no leg bones. it stands still and cannot walk." : "a leg is missing bones. walks will look wrong.");
  const arms = ARMS.filter((b) => !has.has(b));
  if (arms.length) warn(arms.length === ARMS.length ? "no arm bones. it cannot wave or point." : "an arm is missing bones. gestures on that side do nothing.");
  if (!f.mouth) warn("no mouth shapes. the lips stay still while it talks.");
  if (!f.blink) warn("no blink shape. the eyes stay open.");
  if (has.has("head") && !f.gaze) warn("the head does not rest upright, so it will not follow you with its eyes.");
  for (const w of f.warnings ?? []) warn(w);
  if (!lines.some((l) => l.tone === "bad")) {
    const fingers = f.bones.some((b) => FINGER.test(b));
    ok(`${f.bones.length} bones mapped${fingers ? ", fingers too" : ""}.`);
    if (f.mouth) ok("the lips follow speech.");
    if (f.clips.length) ok(`${f.clips.length} ${f.clips.length === 1 ? "clip" : "clips"} inside the file.`);
  }
  const tone: RigTone = lines.some((l) => l.tone === "bad") ? "bad" : lines.some((l) => l.tone === "warn") ? "warn" : "ok";
  const order: Record<RigTone, number> = { bad: 0, warn: 1, ok: 2 };
  lines.sort((a, b) => order[a.tone] - order[b.tone]);
  return { tone, head: tone === "ok" ? "ready to act" : tone === "warn" ? "ready, with limits" : "cannot act", lines };
}

/** Bytes as "820 kb" or "12.4 mb". */
export function bytesWord(n: number): string {
  if (!(n >= 0)) return "size unknown";
  if (n < 1000) return `${n} bytes`;
  if (n < 1e6) return `${Math.round(n / 1000)} kb`;
  const mb = n / 1e6;
  return `${mb < 100 ? mb.toFixed(1) : Math.round(mb)} mb`;
}

/** Thousands as "38 k". */
const countWord = (n: number): string => (n < 1000 ? String(n) : `${n < 10000 ? (n / 1000).toFixed(1) : Math.round(n / 1000)} k`);

export interface SizeFacts {
  /** Every file of the drop, model and textures. */
  bytes: number;
  /** vrm, glb, gltf or fbx. */
  format: string;
  files?: number;
  triangles?: number;
}

/** The size line: "12.4 mb vrm, 3 files, 38 k triangles". */
export function sizeLine(s: SizeFacts): string {
  const parts = [`${bytesWord(s.bytes)} ${s.format}`];
  if (s.files && s.files > 1) parts.push(`${s.files} files`);
  if (s.triangles !== undefined) parts.push(`${countWord(s.triangles)} triangles`);
  return parts.join(", ");
}

/** VRM metadata fields the licence line reads (VRM 1.0 and 0.x). */
export interface LicenceMeta {
  metaVersion?: string;
  licenseName?: string;
  licenseUrl?: string;
  allowRedistribution?: boolean;
  modification?: string;
  commercialUsage?: string;
  otherLicenseUrl?: string;
}

/** The licence line. A file with no metadata says so instead of guessing. */
export function licenceLine(format: string, meta: LicenceMeta | null | undefined): RigLine {
  if (format !== "vrm" || !meta) return { tone: "warn", text: "no licence in the file. use it only if you made it or have the right to." };
  const v1 = meta.metaVersion === "1" || meta.allowRedistribution !== undefined || meta.modification !== undefined;
  if (v1) {
    const name = meta.licenseUrl ? meta.licenseUrl.replace(/^https?:\/\//, "").replace(/\/$/, "") : "vrm 1.0 licence";
    const share = meta.allowRedistribution === true ? "may be shared" : "may not be shared";
    const edit = meta.modification === "prohibited" ? ", no edits" : meta.modification === "allowModificationRedistribution" ? ", edits may be shared" : "";
    const sell = meta.commercialUsage && meta.commercialUsage !== "personalNonProfit" ? "" : ", personal use only";
    return { tone: meta.allowRedistribution === true ? "ok" : "warn", text: `${name}: ${share}${edit}${sell}.` };
  }
  const lic = meta.licenseName ?? "";
  if (!lic) return { tone: "warn", text: "the vrm names no licence. use it only if you have the right to." };
  if (lic === "Redistribution_Prohibited") return { tone: "warn", text: "the licence forbids sharing this avatar." };
  if (lic === "Other") return { tone: "warn", text: `a custom licence${meta.otherLicenseUrl ? ` at ${meta.otherLicenseUrl}` : ""}. read it before you share.` };
  return { tone: "ok", text: `${lic.replace(/_/g, " ").toLowerCase()}.` };
}

/** A clip's length: "2.4 s", "0.5 s", "1 min 12 s". */
export function secondsWord(s: number): string {
  if (!(s >= 0)) return "length unknown";
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${Math.round(s - m * 60)} s`;
}
