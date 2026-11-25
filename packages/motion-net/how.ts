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
  what: "runtime and quadruped gait host for a categorical codebook matching motion network. loads external cc by-nc 4.0 weights at run time. rust core on wasm simd128, worker with an in-page fallback.",
  how: [
    "a runtime for the published categorical codebook matching network (starke et al., siggraph 2024) and a host that turns its output into a walking quadruped. this code is mit; it was written from a functional specification of the network and the paper.",
    "loadWeights reads a json manifest and a flat binary from a url, bytes or a file you drop, checks the sha-256 when one is known, and checks every tensor's dtype, shape and range before anything runs. a failure names the tensor.",
    "the weights are cc by-nc 4.0 and are never included in the package, its builds or the site. nothing downloads until you press load; the licence line shows on first load. inference runs on wasm simd128 in a worker, with an in page fallback.",
  ],
  packages: ["@hackbuild/motion-net"],
  install: "npm install @hackbuild/motion-net",
  today: "git clone https://github.com/hackbuild/hackbuild-motion && cd hackbuild-motion && npm ci && npm run build && npm pack -w @hackbuild/motion-net",
  code: `import { Predictor, QuadrupedHost, UPSTREAM, loadWeights } from "@hackbuild/motion-net";

const weights = await loadWeights({ manifest: UPSTREAM.manifest, bin: UPSTREAM.bin, sha256: UPSTREAM.binSha256 });
const predictor = await Predictor.create(weights);
const dog = new QuadrupedHost(predictor, weights.styles);
// each frame
const root = dog.update(dt, { speed: 1.2, turnRate: 0.3 });
dog.positions; // 27 x 3, world, meters
dog.rotations; // 27 x 4 quaternions`,
  lang: "ts",
  links: { page: "https://hackbuild.github.io/hackbuild-motion/motion-net/", source: "https://github.com/hackbuild/hackbuild-motion/tree/main/packages/motion-net" },
};

export default how;
