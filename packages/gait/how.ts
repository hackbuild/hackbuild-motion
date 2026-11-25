// how this works: the fold of the package page and of the suite tool. Plain data, no imports;
// shape in tools/how.d.ts, checked by tsconfig.how.json, shipped in the tarball, never imported
// by the runtime entry. Text from the README.
const how: HowDoc = {
  what: "procedural legged locomotion: froude gait choice, leg oscillators, footfall tables, posture springs, tail and ear secondary motion. rust core in wasm.",
  how: [
    "the gait is chosen from the froude number, speed squared over gravity times leg length, with a dead band so it does not flicker between walk, trot, canter and gallop. footfall tables are data, checked when loaded.",
    "each leg has a phase oscillator pulled toward its table offset. a swing predicts its landing and follows a minimum jerk curve; a stop lets swinging feet land before the body stands. foot heights come out above the ground and your ground function adds the terrain.",
    "BodyDynamics adds posture springs, pitch and roll from the four foot spots, bob, lean into turns and breathing. TailWag and Ears add secondary motion. the core is a rust crate in wasm.",
  ],
  packages: ["@hackbuild/gait"],
  install: "npm install @hackbuild/gait",
  today: "git clone https://github.com/hackbuild/hackbuild-motion && cd hackbuild-motion && npm ci && npm run build && npm pack -w @hackbuild/gait",
  code: `import { load, QuadrupedGait, BodyDynamics, TailWag } from "@hackbuild/gait";
import { measureQuadruped, driveQuadruped } from "@hackbuild/gait/three";

await load();
const rig = measureQuadruped(dog, names); // dog at the origin, facing +Z
const gait = new QuadrupedGait(rig.specs, rig.legLength, { ground: heightAt, rng });
const body = new BodyDynamics(rig.geometry, rng);
const tail = new TailWag(3, 0.06, rng);

function frame(dt: number, pose: { x: number; z: number; yaw: number }, cmd = { speed: 1.2, turnRate: 0 }) {
  const s = gait.update(dt, pose, cmd);
  const ground = gait.nominal(pose.x, pose.z, pose.yaw).map(([x, z]) => heightAt(x, z));
  const b = body.update(dt, s, cmd, ground);
  gait.setOffsets(b.legOffsets);
  driveQuadruped(rig, pose, s, b, { tail: tail.update(dt, { modeWeights: [1, 2, 1, 1, 0, 0, 0, 1], arousal: 0.4 }) });
}`,
  lang: "ts",
  links: { page: "https://hackbuild.github.io/hackbuild-motion/gait/", source: "https://github.com/hackbuild/hackbuild-motion/tree/main/packages/gait" },
};

export default how;
