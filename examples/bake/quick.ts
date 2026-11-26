import { bakeClips, decodePack, load, optimizeModel, sampleClip, syntheticClips, syntheticGlb } from "@hackbuild/bake";

await load();
// stand ins made in code: a bumpy grid GLB and three clips on a leg rig
const { glb, report } = await optimizeModel(syntheticGlb(1, 48), { ratio: 0.5 });
console.log(report.trianglesIn, "to", report.trianglesOut, "triangles,", report.bytesIn, "to", glb.byteLength, "bytes");

const baked = bakeClips(syntheticClips(1));
for (const r of baked.report) console.log(r.name, r.maxAngleErrorDeg.toFixed(3), "degrees worst error, seam ok:", r.seamOk);

// a reader needs no wasm: decode the pack and sample a clip at 0.25 s
const pack = decodePack(baked.bytes);
const first = Object.values(pack.clips)[0]!;
const pose = new Float32Array(pack.roles.length * 4);
const root = sampleClip(pack, first, 0.25, pose);
console.log(first.name, root, pose.slice(0, 4));
