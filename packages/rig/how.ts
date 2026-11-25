// how this works: the fold on the package page and in the suite. Kept out of
// the runtime entry; tsconfig.how.json typechecks it. Text from the README.
export interface How {
  /** one line: what the package is */
  what: string;
  /** short paragraphs: how it works */
  how: string[];
  packages: string[];
  /** the install line once the packages are on npm */
  install: string;
  /** the line that works today */
  today?: string;
  code: string;
  lang?: string;
  links: { page?: string; source?: string };
}

const how: How = {
  what: "humanoid bone name mapper without per rig tables, limb chains, rest pose analysis, and the expression and viseme table. rust core in wasm.",
  how: [
    "every package in this repository works in one normalized humanoid space: vrm 1.0 bone names, t pose, +z forward, meters, feet at y = 0. this package gets a rig there.",
    "mapRig splits each bone name into a side, body part words and a number, scores the candidates and picks the 55 vrm bones with no per rig table. the report lists missing required bones, helper bones and a guess at the dialect (mixamo, vroid, mmd and others).",
    "analyzeRest measures facing, units and floor from the rest pose, and the three.js adapter applies the fix. limbChains gives the chain model for non humanoids: legs, tail, ears, spine, neck and head, each with a root, a tip and a pole.",
  ],
  packages: ["@hackbuild/rig"],
  install: "npm install @hackbuild/rig",
  today: "git clone https://github.com/hackbuild/hackbuild-motion && cd hackbuild-motion && npm ci && npm run build && npm pack -w @hackbuild/rig",
  code: `import { load, mapRig, resolveExpressions } from "@hackbuild/rig";
import { mapObject3D, restOf, applyRestFix } from "@hackbuild/rig/three";

await load(); // inlined wasm; or a URL or bytes
const { report, bones } = mapObject3D(gltf.scene);
if (report.missingRequired.length) console.warn("not a humanoid:", report.missingRequired);
const rest = restOf(bones);
if (rest) applyRestFix(gltf.scene, bones, rest); // faces +Z, meters, feet on y = 0, T pose arms

const face = resolveExpressions(morphNamesOf(gltf.scene));
face.aa?.binds; // [{ morph: "viseme_aa", weight: 1 }] on a Ready Player Me style head`,
  lang: "ts",
  links: { page: "https://hackbuild.github.io/hackbuild-motion/rig/", source: "https://github.com/hackbuild/hackbuild-motion/tree/main/packages/rig" },
};

export default how;
