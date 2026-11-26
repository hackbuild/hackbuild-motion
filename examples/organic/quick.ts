import { load, sample, seededRng, spring, springState } from "@hackbuild/organic";

// the wasm core is inlined; load() also takes a URL or bytes
await load();

// one seed gives the same motion in Node, in tests and in the browser
const rng = seededRng("rex");
const head = springState(0);
let goal = 0.6;

// 2 seconds at 60 frames per second
for (let frame = 0; frame < 120; frame++) {
  const dt = 1 / 60;
  // about one glance a second, to a random new angle
  if (sample.eventInStep(1, dt, rng)) goal = sample.gauss(rng) * 0.5;
  // critically damped: half way to the goal in 0.12 s, no overshoot
  const yaw = spring(head, goal, 0.12, dt);
  if (frame % 30 === 0) console.log(`frame ${frame}: head yaw ${yaw.toFixed(3)} rad`);
}
