// build-pages.mjs is kept in hackbuild-browser-ai and copied byte for byte
// into hackbuild-motion and hackbuild-agents. This test is the same file in
// all three repos: it fails while a sibling checkout next to this one holds
// a copy that differs. A sibling that is not checked out (CI) is skipped.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "..", "..");
const REPOS = ["hackbuild-browser-ai", "hackbuild-motion", "hackbuild-agents"];
const FILE = join("tools", "build-pages.mjs");
const mine = readFileSync(join(root, FILE));

test("build-pages names its canonical copy on the first line", () => {
  assert.match(mine.toString("utf8").split("\n")[0], /^\/\/ canonical copy: hackbuild-browser-ai\/tools\/build-pages\.mjs\./);
});

for (const repo of REPOS.filter((r) => r !== basename(root))) {
  const other = join(root, "..", repo, FILE);
  test(`build-pages equals the copy in ${repo}`, { skip: existsSync(other) ? false : `${repo} is not checked out next to this repo` }, () => {
    assert.ok(readFileSync(other).equals(mine), `${repo}/${FILE} differs; copy hackbuild-browser-ai/${FILE} over it`);
  });
}
