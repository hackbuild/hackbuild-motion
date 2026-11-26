import { analyzeMotion, load, packMotion, parseBvh, RetargetRig } from "@hackbuild/retarget";

await load();
// pick any BVH file: its bones map onto the normalized humanoid by name
const input = document.body.appendChild(document.createElement("input"));
input.type = "file";
input.accept = ".bvh";
input.onchange = async () => {
  const file = input.files?.[0];
  if (!file) return;
  const { skeleton, clip } = parseBvh(await file.text());
  const rig = new RetargetRig(skeleton); // meters per unit is guessed from the rest height
  const motion = rig.toHumanoid(clip, { settle: true });
  const found = analyzeMotion(motion);
  console.log(found.duration.toFixed(2), "s,", found.tags.join(" "), packMotion(motion).byteLength, "bytes packed");
  rig.dispose();
};
