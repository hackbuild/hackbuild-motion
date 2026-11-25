// how this works: the fold of the package page and of the suite tool. Plain data, no imports;
// shape in tools/how.d.ts, checked by tsconfig.how.json, shipped in the tarball, never imported
// by the runtime entry. Text from the README.
const how: HowDoc = {
  what: "classic motion matching over a clip database: normalized trajectory and foot features, bounding box search, inertialized transitions. rust core in wasm.",
  how: [
    "motion matching picks, every tenth of a second, the frame in a clip database whose future trajectory, facing and foot motion best match what you ask for. written from the published descriptions (clavet 2016, holden, bollo 2016).",
    "features are taken in the root space of each frame and normalized per group, then weighted. the search is brute force or a two level bounding box search that returns the same frame and cost.",
    "the controller jumps only when the best frame beats the current one by a margin, and inertializes every jump with the organic inertializer, so the pose never pops. the core is a rust crate in wasm.",
  ],
  packages: ["@hackbuild/motion-match"],
  install: "npm install @hackbuild/motion-match",
  today: "git clone https://github.com/hackbuild/hackbuild-motion && cd hackbuild-motion && npm ci && npm run build && npm pack -w @hackbuild/motion-match",
  code: `import { load, ClipSet, MotionMatcher } from "@hackbuild/motion-match";

await load();
const clips = new ClipSet(30);
for (const c of myClips) clips.add(c); // { looped, root, rotations, hips, feet, contacts }
const mm = new MotionMatcher(clips, { capabilities: { turnInPlace: true } });

function frame(dt: number, cmd = { speed: 1.2, turnRate: 0 }) {
  const root = mm.update(dt, cmd);          // x z yaw speed turnRate
  const pose = mm.pose();                   // rotations, hips, feet in the root frame
  const motor = mm.motorState();            // source "motion-match", phase, contacts
}`,
  lang: "ts",
  links: { page: "https://hackbuild.github.io/hackbuild-motion/motion-match/", source: "https://github.com/hackbuild/hackbuild-motion/tree/main/packages/motion-match" },
};

export default how;
