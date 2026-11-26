import { GAIT_NAMES, load, QuadrupedGait } from "@hackbuild/gait";

await load(); // the wasm core, from the package or inlined in the single file build
const legs = [
  { x: 0.09, z: 0.22, toe: 0.02, front: true },
  { x: -0.09, z: 0.22, toe: 0.02, front: true },
  { x: 0.09, z: -0.2, toe: 0.02, front: false },
  { x: -0.09, z: -0.2, toe: 0.02, front: false },
];
let seed = 1;
const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const gait = new QuadrupedGait(legs, 0.42, { rng });

const out = document.createElement("pre");
document.body.append(out);
for (const speed of [0.4, 1.2, 2.6]) {
  const s = gait.update(1 / 60, { x: 0, z: 0, yaw: 0 }, { speed, turnRate: 0 });
  const main = GAIT_NAMES.reduce((a, b) => (s.weights[b] > s.weights[a] ? b : a));
  out.textContent += `${speed} m/s: ${main}, froude ${s.froude.toFixed(2)}\n`;
}
