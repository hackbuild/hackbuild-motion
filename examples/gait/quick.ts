import { load, QuadrupedGait, type LegSpec } from "@hackbuild/gait";

await load(); // the wasm core is inlined; load() also takes a URL or bytes

// four legs (LF RF LH RH) in the body frame, meters: x to the left, z forward
const legs: LegSpec[] = [
  { x: 0.09, z: 0.22, toe: 0.02, front: true },
  { x: -0.09, z: 0.22, toe: 0.02, front: true },
  { x: 0.09, z: -0.2, toe: 0.02, front: false },
  { x: -0.09, z: -0.2, toe: 0.02, front: false },
];
let seed = 1;
const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647; // any seeded () => number
const gait = new QuadrupedGait(legs, 0.42, { rng });

// walk forward at 1.2 m/s for 2 seconds at 60 frames per second
const pose = { x: 0, z: 0, yaw: 0 };
for (let frame = 0; frame < 120; frame++) {
  pose.z += 1.2 / 60;
  const s = gait.update(1 / 60, pose, { speed: 1.2, turnRate: 0 });
  const main = Object.entries(s.weights).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (frame % 30 === 29) console.log(`${main}, froude ${s.froude.toFixed(2)}, feet down ${s.feet.filter((f) => f.stance).length}`);
}
