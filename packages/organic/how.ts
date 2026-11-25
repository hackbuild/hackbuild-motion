// how this works: the fold of the package page and of the suite tool. Plain data, no imports;
// shape in tools/how.d.ts, checked by tsconfig.how.json, shipped in the tarball, never imported
// by the runtime entry. Text from the README.
const how: HowDoc = {
  what: "critically damped springs, inertialization, seeded noise and samplers for procedural animation. rust core in wasm.",
  how: [
    "every spring takes a halflife in seconds, the time to close half the distance to its target, so a tuning reads the same at any frame rate. each one comes with the exact exponential and a fast rational approximation.",
    "an inertializer records the offset between the old pose and the new one at a switch and decays that offset to zero, so a clip change, a root jump or a moved ik target blends without a pop. noise and samplers take a seeded rng, so a run repeats.",
    "the core is a rust crate compiled to wasm with simd128 for banks of many springs per frame; the scalar kernel is plain typescript and runs before the wasm loads.",
  ],
  packages: ["@hackbuild/organic"],
  install: "npm install @hackbuild/organic",
  today: "git clone https://github.com/hackbuild/hackbuild-motion && cd hackbuild-motion && npm ci && npm run build && npm pack -w @hackbuild/organic",
  code: `import { load, seededRng, spring, springState, sample } from "@hackbuild/organic";
import { PoseInertializer } from "@hackbuild/organic/three";

await load(); // inlined wasm; or load(new URL("organic_bg.wasm", import.meta.url)) or load(bytes)
const rng = seededRng("rex");
const head = springState(0);
const inert = new PoseInertializer([hips, spine, neck], { positions: [hips] });

function frame(dt: number, switched: boolean) {
  spring(head, targetYaw, 0.12, dt);
  if (sample.eventInStep(0.3, dt, rng)) blink();
  writeNewPose();
  if (switched) inert.capture();
  inert.apply(dt, 0.15);
}`,
  lang: "ts",
  links: { page: "https://hackbuild.github.io/hackbuild-motion/organic/", source: "https://github.com/hackbuild/hackbuild-motion/tree/main/packages/organic" },
};

export default how;
