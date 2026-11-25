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
  what: "two bone ik with pole, fabrik, ccd, clamped look at, hand frame and finger curl, foot contact locking. rust core in wasm.",
  how: [
    "the solvers work on joint positions and return world space rotation deltas, so the same code drives a three.js skeleton, a raw bone array or a test.",
    "twoBone is the analytic arm and leg solve with a pole direction and soft reach. fabrik with cone and hinge limits and ccd with a step cap handle longer chains. lookAngles spreads a clamped yaw and pitch over spine, neck and head, keeps its side when a target crosses behind, and hands the rest to body turning.",
    "foot locking holds a planted foot while its contact stays above a threshold and releases it over an exponential of 0.06 s (the default). the core is a rust crate in wasm; the three.js adapter is under /three.",
  ],
  packages: ["@hackbuild/ik"],
  install: "npm install @hackbuild/ik",
  today: "git clone https://github.com/hackbuild/hackbuild-motion && cd hackbuild-motion && npm ci && npm run build && npm pack -w @hackbuild/ik",
  code: `import { load } from "@hackbuild/ik";
import { solveTwoBone, lookAtChain, FootLock } from "@hackbuild/ik/three";

await load();
const lock = new FootLock();
function frame(dt: number) {
  lock.update(dt, footTarget, contact); // holds the foot while contact > 0.55
  solveTwoBone(bones.leftUpperLeg, bones.leftLowerLeg, bones.leftFoot, footTarget, kneeForward);
  lookAtChain([bones.neck, bones.head], [0.4, 0.6], camera.position, body.quaternion);
}`,
  lang: "ts",
  links: { page: "https://hackbuild.github.io/hackbuild-motion/ik/", source: "https://github.com/hackbuild/hackbuild-motion/tree/main/packages/ik" },
};

export default how;
