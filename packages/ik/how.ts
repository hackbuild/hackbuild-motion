// how this works: the fold of the package page and of the suite tool. Plain data, no imports;
// shape in tools/how.d.ts, checked by tsconfig.how.json, shipped in the tarball, never imported
// by the runtime entry. Text from the README.
const how: HowDoc = {
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
