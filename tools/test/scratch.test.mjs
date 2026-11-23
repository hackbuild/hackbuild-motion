// RULES: each package owns its scratch objects. A three.js vector, quaternion,
// matrix or euler made at module scope is shared by every caller of that
// module and gets overwritten across systems, so none may exist in
// packages/*/src; make them per call or per instance.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "..", "packages");

test("no module scope three.js scratch objects in package sources", () => {
  const hits = [];
  for (const pkg of readdirSync(root)) {
    let files = [];
    try {
      files = readdirSync(join(root, pkg, "src")).filter((f) => f.endsWith(".ts"));
    } catch {
      continue;
    }
    for (const f of files) {
      readFileSync(join(root, pkg, "src", f), "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/^(export )?(const|let|var) \w+ = new (Vector[234]|Quaternion|Matrix[34]|Euler)\b/.test(line)) hits.push(`${pkg}/src/${f}:${i + 1}`);
        });
    }
  }
  assert.deepEqual(hits, []);
});
