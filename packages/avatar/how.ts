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
  what: "load vrm, mixamo, ual, generic glb and fbx characters into the normalized humanoid space, with material and texture repair, wardrobe slots, expressions and first person head hiding.",
  how: [
    "loadAvatar takes a url, bytes or a dropped file and sniffs the format from the content: glb, gltf, vrm, vrma and fbx. vrm goes through three-vrm when you pass vrmHook(), and loads as plain gltf with a warning otherwise.",
    "normalizeHumanoid maps the bones with @hackbuild/rig, bakes centimeter and millimeter units to meters, turns the model to face +z, stands it on y = 0 and lifts a pose arms into the t pose. a missing required bone throws with the list.",
    "repairMaterials fixes the common export faults: phong and lambert to standard materials, false transparency to cutouts, black base colors under a texture, color maps to srgb. wardrobe slots, expressions and a first person head hider sit on the result.",
  ],
  packages: ["@hackbuild/avatar"],
  install: "npm install @hackbuild/avatar",
  today: "git clone https://github.com/hackbuild/hackbuild-motion && cd hackbuild-motion && npm ci && npm run build && npm pack -w @hackbuild/avatar",
  code: `import { load } from "@hackbuild/avatar";
import { loadAvatar, managerForFiles } from "@hackbuild/avatar/three";
import { vrmHook } from "@hackbuild/avatar/vrm";

await load(); // the rig wasm
const avatar = await loadAvatar(file, { name: file.name, vrm: vrmHook() });
scene.add(avatar.root);
avatar.warnings.forEach((w) => console.info(w)); // "model was in centimeters and was scaled to meters."

avatar.wardrobe.equip(avatar.wardrobe.slot("outerwear")[0]!.id);
avatar.expressions.setValue("happy", 0.4);

function frame(dt: number) {
  avatar.update(dt); // three-vrm update, or morph weights for a plain model
  avatar.head?.render(renderer, scene, firstPersonCamera);
}`,
  lang: "ts",
  links: { page: "https://hackbuild.github.io/hackbuild-motion/avatar/", source: "https://github.com/hackbuild/hackbuild-motion/tree/main/packages/avatar" },
};

export default how;
