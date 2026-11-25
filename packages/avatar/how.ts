// how this works: the fold of the package page and of the suite tool. Plain data, no imports;
// shape in tools/how.d.ts, checked by tsconfig.how.json, shipped in the tarball, never imported
// by the runtime entry. Text from the README.
const how: HowDoc = {
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
