import { existsSync } from "node:fs";

// paths to a local copy of the cc by-nc weights; never committed
export const WEIGHTS_BIN = process.env.HB_MOTION_NET_BIN ?? "";
export const WEIGHTS_MANIFEST = process.env.HB_MOTION_NET_MANIFEST ?? "";
export const haveWeights = WEIGHTS_BIN !== "" && WEIGHTS_MANIFEST !== "" && existsSync(WEIGHTS_BIN) && existsSync(WEIGHTS_MANIFEST);
if (!haveWeights) console.warn("motion-net: HB_MOTION_NET_BIN and HB_MOTION_NET_MANIFEST unset, the tests on the published weights are skipped (not run)");
