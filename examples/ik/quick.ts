import { DEFAULT_LOOK_LIMITS, load, lookAngles, twoBone, type Vec3 } from "@hackbuild/ik";

// the wasm core is inlined; load() also takes a URL or bytes
await load();

// a left leg in meters, +Y up, +Z forward: hip, knee, ankle
const hip: Vec3 = [0.1, 0.9, 0];
const knee: Vec3 = [0.1, 0.5, 0];
const ankle: Vec3 = [0.1, 0.1, 0];
// put the foot on a step 20 cm up and 15 cm ahead, knee bending forward
const leg = twoBone(hip, knee, ankle, [0.1, 0.3, 0.15], [0, 0, 1]);
console.log("knee", leg.mid, "foot reached", leg.reached);

// head at 1.6 m facing +Z (identity frame) looking at a point up and to the left
const look = lookAngles([0, 0, 0, 1], [0, 1.6, 0], [1, 1.9, 1], DEFAULT_LOOK_LIMITS);
console.log(`yaw ${look.yaw.toFixed(2)} rad, pitch ${look.pitch.toFixed(2)} rad, clamped ${look.clamped}`);
