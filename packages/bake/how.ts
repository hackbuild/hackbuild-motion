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
  what: "glb optimize with texture hooks, clip bake into compact packs with error, seam and contact reports, and an asset lock file with licence and sha-256. rust core in wasm, plus a native command line tool.",
  how: [
    "one rust crate builds both the hackbuild-bake command line tool and the wasm module this package loads, so a bake in node, in a page and on the command line gives the same bytes.",
    "optimizeModel welds duplicate vertices, simplifies when you ask for a ratio under 1, reorders for the vertex cache and drops unused data. it decodes no images; a resize hook gets each texture with its role and size and returns the new bytes. compressed files are refused with the reason.",
    "bakeClips samples clips into a compact pack with error, seam and foot contact reports. writeLock writes assets.lock.json with each file's sha-256, source, licence and size budget.",
  ],
  packages: ["@hackbuild/bake"],
  install: "npm install @hackbuild/bake",
  today: "git clone https://github.com/hackbuild/hackbuild-motion && cd hackbuild-motion && npm ci && npm run build && npm pack -w @hackbuild/bake",
  code: `import { load, optimizeModel, bakeClips, writeLock, lockEntry } from "@hackbuild/bake";

await load();
const { glb, report } = await optimizeModel(bytes, {
  ratio: 0.5,
  textures: { baseColor: 1024, normal: 512 },
  resize: async (t) => (t.width && t.width > t.maxSize ? { bytes: await shrink(t.data, t.maxSize), mime: "image/webp" } : null),
});
const { bytes: pack, report: clips } = bakeClips({ fps: 30, skeleton, clips, contacts: { feet: ["leftFoot", "rightFoot"], height: 0.12, speed: 0.45, minFrames: 2 } });
const lock = writeLock([lockEntry("dog.glb", glb, "Meshy export", "owner"), lockEntry("ual.hbcp", pack, "Quaternius UAL", "CC0-1.0", 400_000)]);`,
  lang: "ts",
  links: { page: "https://hackbuild.github.io/hackbuild-motion/bake/", source: "https://github.com/hackbuild/hackbuild-motion/tree/main/packages/bake" },
};

export default how;
