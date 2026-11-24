// Failure copy for the stage chrome: lowercase, terse, names the failure
// and what to do. The raw error stays with the event as its cause.

const RULES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/missing required bones: ([^.]+)/, (m) => `this model has no humanoid rig the stage can map. missing bones: ${m[1]}.`],
  [/rest analysis needs/, () => "the rig was found but its rest pose could not be read. it needs hips, head and both arms."],
  [/vrma file is an animation/, () => "a vrma file is an animation. load it as a clip, then drop a body."],
  [/unknown model format/, () => "this file is not a model the stage reads. drop a .vrm, .glb, .gltf or .fbx."],
  [/fetch failed with (\d+)/, (m) => `the model did not download (http ${m[1]}). check the url.`],
  [/failed to fetch|networkerror|load failed/i, () => "the model did not download. check the url and that its server allows this page."],
  [/webgl|creating webgl|context/i, () => "no webgl here. the 3d view cannot start on this device."],
  [/no adapter for (\w+) files/, (m) => `${m[1]} files are not read here. drop a .vrm, .glb, .gltf or .fbx.`],
];

/** Copy for the person from a load or start failure. Copy this package already wrote passes through. */
export function bodyError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  for (const [re, copy] of RULES) {
    const m = raw.match(re);
    if (m) return copy(m);
  }
  // messages this package throws are already written for the person
  if (/^[a-z0-9 .,:()'/-]+$/.test(raw) && raw.endsWith(".")) return raw;
  return "the model did not load. its file may be damaged or of a kind the stage does not read.";
}
