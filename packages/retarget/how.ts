// how this works: the fold of the package page and of the suite tool. Plain data, no imports;
// shape in tools/how.d.ts, checked by tsconfig.how.json, shipped in the tarball, never imported
// by the runtime entry. Text from the README.
const how: HowDoc = {
  what: "humanoid motion interchange format, clip retargeting between any rigs, bvh, vmd, vpd, vrma and unity clip readers, motion analysis that tags clips. rust core in wasm.",
  how: [
    "motion moves between rigs through the normalized humanoid space. a clip becomes a HumanoidMotion: local rotations per vrm bone and hip travel in multiples of hip height, so one motion fits a child and a tall adult.",
    "RetargetRig maps a skeleton with @hackbuild/rig, measures its facing, units and floor, and aligns each bone's rest to the reference t pose. an a pose source, a -z facing or centimeters make no difference to the result.",
    "readers cover bvh, vmd, vpd, vrma and unity clips. analyzeMotion tags a clip (walk, run, idle and others), and packMotion writes a compact binary form. the core is a rust crate in wasm.",
  ],
  packages: ["@hackbuild/retarget"],
  install: "npm install @hackbuild/retarget",
  today: "git clone https://github.com/hackbuild/hackbuild-motion && cd hackbuild-motion && npm ci && npm run build && npm pack -w @hackbuild/retarget",
  code: `import { load, parseBvh, RetargetRig, analyzeMotion } from "@hackbuild/retarget";
import { retargetAnimation, skeletonFromObject3D, toAnimationClip } from "@hackbuild/retarget/three";

await load();
const clip = retargetAnimation(mixamoGltf.animations[0], mixamoGltf.scene, avatar.scene);
mixer.clipAction(clip).play();

const bvh = parseBvh(await (await fetch("walk.bvh")).text());
const motion = new RetargetRig(bvh.skeleton).toHumanoid(bvh.clip, { settle: true });
analyzeMotion(motion).tags; // ["walk"]
const target = skeletonFromObject3D(avatar.scene);
const onAvatar = toAnimationClip(new RetargetRig(target.skeleton).bind(motion), target, "walk");`,
  lang: "ts",
  links: { page: "https://hackbuild.github.io/hackbuild-motion/retarget/", source: "https://github.com/hackbuild/hackbuild-motion/tree/main/packages/retarget" },
};

export default how;
