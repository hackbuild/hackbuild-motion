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
  what: "brightly lit scenes around a character: layouts as data, a set assembled from kit models and merged by material, image light from an hdri or the three.js room environment, a key light with a shadow and a rim light.",
  how: [
    "a scene around a character at the origin facing +z is a layout as data: a key light that casts the character's shadow, a rim light, image light from an hdri or the three.js room environment, a backdrop, an optional ground and fog, and a set built from kit models.",
    "the package bundles no hdri and no model. needsOf lists the files a preset needs and missingFor says which are absent, so a page shows a scene as off until its files are there. the studio preset needs no file.",
    "kit models in a set are merged by material, and the hdri is turned so its brightest point above the horizon sits behind the key light. the main entry has no three.js; loadEnvironment is under /three.",
  ],
  packages: ["@hackbuild/environment"],
  install: "npm install @hackbuild/environment",
  today: "git clone https://github.com/hackbuild/hackbuild-motion && cd hackbuild-motion && npm ci && npm run build && npm pack -w @hackbuild/environment",
  code: `import { loadEnvironment } from "@hackbuild/environment/three";
import { missingFor, presetOf } from "@hackbuild/environment";

const files = new Map(dropped.map((f) => [f.path, f.file])); // your own drop
const room = presetOf("room")!;
if (missingFor(room, (p) => files.has(p)).length === 0) {
  const env = await loadEnvironment(room, scene, renderer, { resolve: (p) => files.get(p) ?? null });
  env.attach();
}`,
  lang: "ts",
  links: { page: "https://hackbuild.github.io/hackbuild-motion/environment/", source: "https://github.com/hackbuild/hackbuild-motion/tree/main/packages/environment" },
};

export default how;
