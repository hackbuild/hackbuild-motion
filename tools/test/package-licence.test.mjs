// Every package tarball carries the MIT licence text: LICENSE sits in the
// package folder, equals the root file, and is listed in `files`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "..");
const licence = readFileSync(join(root, "LICENSE"), "utf8");

for (const pkg of readdirSync(join(root, "packages"))) {
  test(`${pkg} ships the licence`, () => {
    const dir = join(root, "packages", pkg);
    const meta = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    assert.ok(meta.files.includes("LICENSE"), "LICENSE missing from files");
    assert.equal(readFileSync(join(dir, "LICENSE"), "utf8"), licence);
  });
}
