// Every package carries the fold source of design D8: packages/<name>/how.ts,
// listed in `files`, out of the runtime entry, its page link on the site.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "..");
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]));

for (const pkg of readdirSync(join(root, "packages"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
  test(`${pkg} ships how.ts`, () => {
    const dir = join(root, "packages", pkg);
    const meta = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    assert.ok(existsSync(join(dir, "how.ts")), "how.ts missing");
    assert.ok(meta.files.includes("how.ts"), "how.ts missing from files");
    const how = readFileSync(join(dir, "how.ts"), "utf8");
    assert.ok(how.includes(`packages: [${JSON.stringify(meta.name)}`), "packages does not name the package");
    assert.ok(how.includes(`page: "https://hackbuild.github.io/hackbuild-motion/${pkg}/"`), "page link is not the site page");
    for (const f of walk(join(dir, "src"))) assert.doesNotMatch(readFileSync(f, "utf8"), /["'](\.\.\/)+how(\.js|\.ts)?["']/, `${f} imports how.ts`);
  });
}
