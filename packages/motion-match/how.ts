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
