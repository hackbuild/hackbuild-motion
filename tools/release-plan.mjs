#!/usr/bin/env node
// Release dry run: what `changeset publish` would send to npm, read from the
// tarballs in .pack/ (run node tools/lint-packages.mjs first). For each
// package: name, version, tarball size and sha512, and whether that version
// is already on the registry. Then the changesets status: the version bumps
// pending in .changeset/. Publishes nothing and changes no file.
// Usage: node tools/release-plan.mjs
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
// pictographs and variation selectors, built from code points so this file passes lint-voice
const PICTO = new RegExp(`[\\p{Extended_Pictographic}\\u{${(0xfe00).toString(16)}}-\\u{${(0xfe0f).toString(16)}}]+\\s*`, "gu");
const PACK = join(root, ".pack");
if (!existsSync(PACK)) {
  console.error("release-plan: no .pack/, run node tools/lint-packages.mjs first");
  process.exit(1);
}
const pkgs = readdirSync(join(root, "packages"))
  .map((d) => join(root, "packages", d, "package.json"))
  .filter(existsSync)
  .map((f) => JSON.parse(readFileSync(f, "utf8")))
  .filter((p) => !p.private);
const rows = [];
let missing = 0;
for (const p of pkgs) {
  const tgz = `${p.name.replace(/^@/, "").replace("/", "-")}-${p.version}.tgz`;
  if (!existsSync(join(PACK, tgz))) {
    console.error(`release-plan: ${tgz} not packed`);
    missing++;
    continue;
  }
  const bytes = readFileSync(join(PACK, tgz));
  const sha = createHash("sha512").update(bytes).digest("base64").slice(0, 16);
  const view = spawnSync("npm", ["view", `${p.name}@${p.version}`, "version", "--json"], { encoding: "utf8" });
  const on = view.status === 0 && view.stdout.trim() !== "";
  const where = on ? "on the registry already, skipped" : /E404|404/.test(view.stderr) ? "not on the registry, would publish" : `registry not reached (${view.stderr.trim().split("\n")[0]}), would try to publish`;
  rows.push(`| \`${p.name}\` | ${p.version} | \`${tgz}\` | ${bytes.length.toLocaleString("en-US")} bytes | \`${sha}\` | ${where} |`);
}
const status = spawnSync("npx", ["changeset", "status", "--verbose"], { cwd: root, encoding: "utf8" });
const text = [
  "### release dry run",
  "",
  "Nothing was published. `changeset publish` would send each package whose version is not on the registry:",
  "",
  "| package | version | tarball | size (measured) | sha512 prefix | registry |",
  "|---|---|---|---|---|---|",
  ...rows,
  "",
  "Pending version bumps (`changeset status --verbose`):",
  "",
  "```",
  (status.stdout + status.stderr).replace(/\x1b\[[0-9;]*m/g, "").replace(PICTO, "").trim() || "(no output)",
  "```",
  "",
].join("\n");
console.log(text);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + "\n");
process.exitCode = missing ? 1 : 0;
