#!/usr/bin/env node
// CI job house-rules: authorship of record carries no AI credit (CLAUDE.md
// Attribution). Reads tracked files only: every package.json author,
// contributors and maintainers, every Cargo.toml authors list, and every
// CHANGELOG*.md line. The same linter as the sibling hackbuild library
// repositories.
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { basename } from "node:path";
import { AI_IDENTITY } from "./ai-names.mjs";

export const OWNER = "Moheeb Zara <hackbuildvideo@gmail.com>";
// Same reach as .githooks/commit-msg: any -by: or -with: trailer, indented or not.
export const TRAILER = /^\s*[A-Za-z-]+-(by|with):/i;
export const GENERATED = /co-authored|generated[- ](with|by)|noreply@anthropic|ai-generated/i;

function personString(p) {
  if (typeof p === "string") return p.trim();
  if (p && typeof p === "object") return p.email ? `${p.name ?? ""} <${p.email}>`.trim() : String(p.name ?? "");
  return "";
}

export function packageFails(path, text) {
  let pkg;
  try {
    pkg = JSON.parse(text);
  } catch (err) {
    return [`${path}: not valid json, ${err.message}`];
  }
  const fails = [];
  const author = personString(pkg.author);
  if (AI_IDENTITY.test(author)) fails.push(`${path}: author names an ai tool (${author}), legal is "${OWNER}"`);
  else if (author !== OWNER) fails.push(`${path}: author is "${author}", legal is "${OWNER}"`);
  for (const key of ["contributors", "maintainers"]) {
    if (pkg[key] === undefined) continue;
    for (const p of Array.isArray(pkg[key]) ? pkg[key] : [pkg[key]]) {
      const who = typeof p === "string" ? p : JSON.stringify(p);
      if (AI_IDENTITY.test(who)) fails.push(`${path}: ${key} names an ai tool (${who}), legal is people only`);
    }
  }
  return fails;
}

export function cargoFails(path, text) {
  // a crate names the owner itself or inherits authors.workspace = true; the
  // workspace root that crates inherit from names the owner
  const m = /^authors\s*=\s*\[([^\]]*)\]/m.exec(text);
  const inherits = /^authors\.workspace\s*=\s*true\s*$/m.test(text);
  if (!m) {
    if (/^\[package\]/m.test(text) && !inherits) return [`${path}: [package] has no authors, legal is ["${OWNER}"] or authors.workspace = true`];
    if (/^\[workspace\.package\]/m.test(text)) return [`${path}: [workspace.package] has no authors, legal is ["${OWNER}"]`];
    return [];
  }
  const people = [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]);
  if (!people.length) return [`${path}: authors is empty, legal is ["${OWNER}"]`];
  return people.flatMap((who) =>
    AI_IDENTITY.test(who) ? [`${path}: authors names an ai tool (${who}), legal is people only`] : who !== OWNER ? [`${path}: author is "${who}", legal is "${OWNER}"`] : [],
  );
}

export function changelogFails(path, text) {
  const fails = [];
  text.split("\n").forEach((line, i) => {
    if (TRAILER.test(line)) fails.push(`${path}:${i + 1}: trailer line, legal is none`);
    else if (GENERATED.test(line)) fails.push(`${path}:${i + 1}: generated-with or co-author line, legal is none`);
  });
  return fails;
}

export function main() {
  const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
  const fails = [];
  for (const f of files) {
    const b = basename(f);
    if (b === "package.json") fails.push(...packageFails(f, readFileSync(f, "utf8")));
    else if (b === "Cargo.toml") fails.push(...cargoFails(f, readFileSync(f, "utf8")));
    else if (/^CHANGELOG.*\.md$/i.test(b)) fails.push(...changelogFails(f, readFileSync(f, "utf8")));
  }
  for (const x of fails) console.error(x);
  console.log(`lint-authors: ${files.length} tracked files, ${fails.length} failures`);
  return fails.length ? 1 : 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(import.meta.filename)) process.exitCode = main();
