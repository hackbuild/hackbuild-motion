// Writes test/golden/quadruped-legacy.json: the outputs of the legacy CPU
// inference (a file the owner keeps outside this repository) for the seeded
// parity inputs. The file holds network outputs, so it is gitignored.
// Usage: node scripts/make-golden.mjs <legacy-infer.cjs> <dir with quadruped.json and quadruped.bin>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { parityInputs } from "./inputs.mjs";

const [legacy, dir] = process.argv.slice(2);
if (!legacy || !dir) {
  console.error("usage: node scripts/make-golden.mjs <legacy-infer.cjs> <weights dir>");
  process.exit(2);
}
const { nnInferHost } = createRequire(import.meta.url)(resolve(legacy));
const meta = JSON.parse(readFileSync(join(dir, "quadruped.json"), "utf8"));
const file = readFileSync(join(dir, "quadruped.bin"));
const bin = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
const outs = [];
let ready = false;
const host = nnInferHost((m) => {
  if (m.t === "ready") ready = true;
  else if (m.t === "error") throw new Error(m.msg);
  else if (m.t === "out") outs.push({ ms: m.ms, out: Array.from(m.out) });
});
host({ t: "load", meta, bin });
if (!ready) throw new Error("legacy host did not load");
const inputs = parityInputs(meta.model.input_dim);
inputs.forEach((x, id) => host({ t: "run", id, x }));
const here = resolve(import.meta.dirname, "..", "test", "golden");
mkdirSync(here, { recursive: true });
writeFileSync(join(here, "quadruped-legacy.json"), JSON.stringify({ cases: outs.length, outputs: outs.map((o) => o.out) }));
console.log(`make-golden: ${outs.length} cases, legacy ${outs.map((o) => o.ms.toFixed(0)).join(" ")} ms (measured)`);
