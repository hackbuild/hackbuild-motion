import { analyzeRest, load, mapRig, referenceRest, resolveExpressions } from "@hackbuild/rig";

// the wasm core is inlined; load() also takes a URL or bytes
await load();

// a Mixamo style skeleton as name and parent pairs, as you would read it from a glTF
const names = ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand", "RightShoulder", "RightArm", "RightForeArm", "RightHand", "LeftUpLeg", "LeftLeg", "LeftFoot", "RightUpLeg", "RightLeg", "RightFoot"];
const parent = [-1, 0, 1, 2, 3, 4, 3, 6, 7, 8, 3, 10, 11, 12, 0, 14, 15, 0, 17, 18];
const report = mapRig(names.map((n, i) => ({ name: `mixamorig:${n}`, parent: parent[i] ?? null })));
console.log(report.dialect, `coverage ${report.coverage}`, "missing", report.missingRequired, "left forearm is node", report.byBone.leftLowerArm);

// rest pose analysis: facing, units, floor and T pose fixes (here the 1.70 m reference)
const rest = analyzeRest(referenceRest());
console.log(rest?.units, `head at ${rest?.height.toFixed(2)}`, `A pose ${rest?.aPose}`);

// which morphs make each VRM expression on a Ready Player Me style head
const face = resolveExpressions(["viseme_aa", "viseme_O", "eyeBlinkLeft", "eyeBlinkRight", "mouthSmile"]);
console.log(face.aa?.binds, face.blink?.source);
