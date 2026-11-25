// how this works: the fold of the package page and of the suite tool. Plain data, no imports;
// shape in tools/how.d.ts, checked by tsconfig.how.json, shipped in the tarball, never imported
// by the runtime entry. Text from the README.
const how: HowDoc = {
  what: "procedural presence for humanoids: gaze with saccades and aversion, head recruitment, blink, breath, idle scheduler, pointing, reach, throw, and a layered clip player with loop seams and idle handback.",
  how: [
    "the small layers that make a standing humanoid read as present, in plain typescript over the organic springs and samplers. no wasm.",
    "GazeController times gaze aversion per mode (listen, talk, think) after published research, adds small saccades inside a fixation, recruits the head past the eye only range, clamps the eyes to the head, and reports a body turn for targets out of reach. Blink and Breath run on seeded timing.",
    "IdleScheduler makes a postural change about every 20 s (vendor, published research) and cancels it when the body moves. pointing, reach and throw gestures are planned from published timing, and ClipPlayer layers clips with loop seams and idle handback. the three.js adapter applies the result.",
  ],
  packages: ["@hackbuild/presence"],
  install: "npm install @hackbuild/presence",
  today: "git clone https://github.com/hackbuild/hackbuild-motion && cd hackbuild-motion && npm ci && npm run build && npm pack -w @hackbuild/presence",
  code: `import { seededRng } from "@hackbuild/organic";
import { ClipPlayer, GazeController, HeadLevel, Breath } from "@hackbuild/presence";
import { applyGaze, applyPose, clipFromThree } from "@hackbuild/presence/three";

const rng = seededRng("ada");
const idle = clipFromThree(idleClip, boneNames, { loop: true });
const player = new ClipPlayer({ idle, upperBones: armIndices });
const gaze = new GazeController({ rng });
const level = new HeadLevel();

function frame(dt: number) {
  const pose = player.update(dt);
  level.apply(dt, pose, headIndex);
  applyPose(pose, bones);
  gaze.setTarget(listenerHead);
  const g = gaze.update(dt, eyePoint, bodyYaw);
  applyGaze(g, { neck, head, leftEye, rightEye });
  face.blink = g.blink;
  if (g.bodyTurn) turnBodyBy(g.bodyTurn);
}`,
  lang: "ts",
  links: { page: "https://hackbuild.github.io/hackbuild-motion/presence/", source: "https://github.com/hackbuild/hackbuild-motion/tree/main/packages/presence" },
};

export default how;
