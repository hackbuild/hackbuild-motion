#!/usr/bin/env node
// CI job packages: pack every public workspace package into .pack/ and
// check the tarball the registry would get. The same tool in each sibling
// hackbuild library repository; run npm run build first.
//   files     LICENSE, README.md and package.json present; every other path
//             on the allowlist below and none on the deny list.
//   manifest  ESM, MIT, sideEffects false, types first in every exports
//             condition, unpkg and jsdelivr on the single file build.
//   imports   every bare import in the shipped js and d.ts is a dependency
//             or a peer; dependencies are @hackbuild packages only, so
//             three.js and every runtime is a peer.
//   publint   on the tarball; errors and warnings fail, suggestions print.
//   attw      on the tarball, profile esm-only; exports that are plain files
//             (wasm, iife, a node bundle) are excluded, they carry no types.
//   size      gzip level 9 of the main entry bundled with its imports
//             external, of each wasm and of the single file build, against
//             tools/size-budget.json; more than MARGIN over or under fails.
//             --update-budget rewrites the budget and each README "Size
//             budget" section from the same numbers.
// Usage: node tools/lint-packages.mjs [--update-budget] [package...]
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { publint } from "publint";
import { formatMessage } from "publint/utils";
import { rolldown } from "rolldown";

const root = resolve(import.meta.dirname, "..");
const BUDGET = join(root, "tools", "size-budget.json");
const PACK = join(root, ".pack");
export const MARGIN = 0.05;
export const ALLOW = [/^(package\.json|README\.md|LICENSE|THIRD-PARTY-NOTICES\.txt|CHANGELOG\.md|how\.ts)$/, /^dist\/.+\.(js|mjs|d\.ts|wasm)$/, /^wasm\/[^/]+\.wasm$/, /^bin\/[^/]+\.m?js$/];
export const DENY = [/(^|\/)(test|tests|__tests__|fixtures?|src)\//, /\.test\./, /\.tsbuildinfo$/, /\.map$/, /(^|\/)\./];
const REQUIRED = ["package.json", "README.md", "LICENSE"];

const update = process.argv.includes("--update-budget");
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
let failed = 0;
const fail = (msg) => {
  failed += 1;
  console.error(`lint-packages: ${msg}`);
};
const fmt = (n) => n.toLocaleString("en-US");

/** Tarball paths, without the leading package/, that break the allowlist. */
export function fileFails(paths) {
  const out = [];
  for (const r of REQUIRED) if (!paths.includes(r)) out.push(`${r} missing from the tarball`);
  for (const p of paths) {
    if (DENY.some((d) => d.test(p))) out.push(`${p} is on the deny list`);
    else if (!ALLOW.some((a) => a.test(p))) out.push(`${p} is outside the files allowlist`);
  }
  return out;
}

/** Every exports condition object lists types first. */
export function typesFirstFails(exp, at = "exports") {
  if (!exp || typeof exp !== "object") return [];
  const keys = Object.keys(exp);
  const out = [];
  if (keys.includes("types") && keys[0] !== "types") out.push(`${at}: types is key ${keys.indexOf("types") + 1}, legal is first`);
  if (keys.includes("import") && !keys.includes("types") && !keys.some((k) => k.startsWith("."))) out.push(`${at}: import without types`);
  for (const k of keys) out.push(...typesFirstFails(exp[k], `${at}["${k}"]`));
  return out;
}

const SPEC = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']([^"'\n]+)["']/g;
/** The package names a module imports by bare specifier. */
export function bareImports(code) {
  const out = new Set();
  for (const m of code.matchAll(SPEC)) {
    const s = m[1];
    if (/^(\.|\/|node:|https?:|data:|blob:)/.test(s) || !/^[@a-z]/.test(s)) continue;
    const parts = s.split("/");
    out.add(s.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]);
  }
  return out;
}

/** A tar reader for the npm tarball: path to bytes, package/ stripped. */
function untar(gz) {
  const buf = gunzipSync(gz);
  const files = new Map();
  for (let o = 0; o + 512 <= buf.length; ) {
    const name = buf.toString("utf8", o, o + 100).replace(/\0.*$/s, "");
    if (!name) break;
    const prefix = buf.toString("utf8", o + 345, o + 500).replace(/\0.*$/s, "");
    const size = parseInt(buf.toString("utf8", o + 124, o + 136).replace(/\0.*$/s, "").trim() || "0", 8);
    const type = buf[o + 156];
    const path = (prefix ? `${prefix}/${name}` : name).replace(/^package\//, "");
    if (type === 0 || type === 48) files.set(path, buf.subarray(o + 512, o + 512 + size));
    o += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

const gz = (bytes) => gzipSync(bytes, { level: 9 }).length;

async function bundledMain(dir, entry) {
  const bundle = await rolldown({ input: join(dir, entry), external: (id) => !/^(\.|\/|[A-Za-z]:)/.test(id) || id.startsWith("node:"), logLevel: "silent" });
  const { output } = await bundle.generate({ format: "esm", codeSplitting: false });
  await bundle.close();
  return Buffer.from(output.map((c) => c.code ?? "").join("\n"));
}

const singleFile = (pkg) => (pkg.unpkg ?? (typeof pkg.exports?.["./iife"] === "string" ? pkg.exports["./iife"] : undefined))?.replace(/^\.\//, "");

export function workspaces() {
  return readdirSync(join(root, "packages"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    .filter((d) => existsSync(join(root, "packages", d, "package.json")))
    .map((d) => ({ dir: join(root, "packages", d), rel: `packages/${d}`, pkg: JSON.parse(readFileSync(join(root, "packages", d, "package.json"), "utf8")) }))
    .filter((w) => !w.pkg.private && (!only.length || only.includes(w.pkg.name) || only.includes(w.rel.slice(9))));
}

async function main() {
  const licence = readFileSync(join(root, "LICENSE"), "utf8");
  const budget = existsSync(BUDGET) ? JSON.parse(readFileSync(BUDGET, "utf8")) : { packages: {} };
  const measured = {};
  if (!only.length) rmSync(PACK, { recursive: true, force: true });
  mkdirSync(PACK, { recursive: true });
  for (const { dir, rel, pkg } of workspaces()) {
    const name = pkg.name;
    const [info] = JSON.parse(execFileSync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", PACK], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }));
    const tgz = join(PACK, info.filename);
    const files = untar(readFileSync(tgz));
    const paths = [...files.keys()];
    console.log(`lint-packages: ${name}@${pkg.version} ${info.filename}, ${paths.length} files, ${fmt(info.size)} bytes packed (measured)`);

    for (const f of fileFails(paths)) fail(`${name}: ${f}`);
    if (files.has("LICENSE") && files.get("LICENSE").toString("utf8") !== licence) fail(`${name}: LICENSE differs from the repository LICENSE`);
    if (pkg.type !== "module") fail(`${name}: type is ${pkg.type}, legal is module`);
    if (pkg.license !== "MIT") fail(`${name}: license is ${pkg.license}, legal is MIT`);
    if (pkg.sideEffects !== false) fail(`${name}: sideEffects is ${JSON.stringify(pkg.sideEffects)}, legal is false`);
    if (pkg.main || pkg.module || pkg.require) fail(`${name}: main, module or require field set, legal is exports only`);
    for (const f of typesFirstFails(pkg.exports)) fail(`${name}: ${f}`);
    const single = singleFile(pkg);
    if (single) {
      if (pkg.unpkg?.replace(/^\.\//, "") !== single || pkg.jsdelivr?.replace(/^\.\//, "") !== single) fail(`${name}: unpkg and jsdelivr must both name ${single}`);
      if (!files.has(single)) fail(`${name}: single file build ${single} is not in the tarball`);
    }

    const deps = Object.keys(pkg.dependencies ?? {});
    const peers = Object.keys(pkg.peerDependencies ?? {});
    for (const d of deps) if (!d.startsWith("@hackbuild/")) fail(`${name}: dependency ${d}, legal is a peer (only @hackbuild packages are dependencies)`);
    const used = new Set();
    for (const [p, bytes] of files) if (/\.(m?js|d\.ts)$/.test(p) && !/\.iife\.js$|^dist\/single\/|\.bundle\.mjs$/.test(p)) for (const s of bareImports(bytes.toString("utf8"))) used.add(s);
    for (const s of used) {
      const types = s.startsWith("@types/") ? s.slice(7).replace(/^(.+)__/, "@$1/") : null;
      if (!deps.includes(s) && !peers.includes(s) && !(types && peers.includes(types))) fail(`${name}: imports ${s}, which is neither a dependency nor a peer`);
    }

    const pub = await publint({ level: "suggestion", pack: { tarball: new Uint8Array(readFileSync(tgz)).buffer } });
    for (const m of pub.messages) {
      const line = `${name}: publint ${m.type}: ${formatMessage(m, pkg)}`;
      // an iife is a classic script for a script tag or a CDN URL; publint reads it as CJS in a module package
      if (m.code === "FILE_INVALID_FORMAT" && /\.iife\.js\b/.test(line)) console.log(`lint-packages: ${line} (allowed: classic script, loaded by a script tag)`);
      else if (m.type === "suggestion") console.log(`lint-packages: ${line}`);
      else fail(line);
    }

    const plain = Object.entries(pkg.exports ?? {}).filter(([, v]) => typeof v === "string").map(([k]) => k);
    const attw = spawnSync(join(root, "node_modules", ".bin", "attw"), [tgz, "--profile", "esm-only", "--format", "table-flipped", "--no-color", ...(plain.length ? ["--exclude-entrypoints", ...plain] : [])], { encoding: "utf8" });
    if (attw.status !== 0) fail(`${name}: attw exit ${attw.status}\n${attw.stdout}${attw.stderr}`);

    const rows = {};
    const mainEntry = pkg.exports?.["."]?.import?.replace(/^\.\//, "");
    if (!mainEntry || !files.has(mainEntry)) fail(`${name}: main entry ${mainEntry} is not in the tarball`);
    else rows[`main: ${mainEntry} bundled`] = gz(await bundledMain(dir, mainEntry));
    for (const p of paths.filter((x) => x.endsWith(".wasm")).sort()) rows[p] = gz(files.get(p));
    if (single && files.has(single)) rows[single] = gz(files.get(single));
    measured[name] = { dir: rel, rows };
  }

  if (update) {
    if (failed) fail("budget not written while a check fails");
    else {
      const date = new Date().toLocaleDateString("sv");
      const next = { about: `gzip level 9 bytes (measured) per published file; CI fails when a file moves more than ${MARGIN * 100} percent from its row. Rewrite with node tools/lint-packages.mjs --update-budget after a reviewed change.`, measured: date, margin: MARGIN, packages: { ...budget.packages } };
      for (const [name, m] of Object.entries(measured)) next.packages[name] = m.rows;
      writeFileSync(BUDGET, JSON.stringify(next, null, 2) + "\n");
      for (const m of Object.values(measured)) writeReadme(join(root, m.dir, "README.md"), m.rows, date);
      console.log(`lint-packages: wrote tools/size-budget.json and ${Object.keys(measured).length} README size tables`);
    }
  } else {
    for (const [name, m] of Object.entries(measured)) {
      const want = budget.packages[name];
      if (!want) {
        fail(`${name}: no row in tools/size-budget.json. fix: node tools/lint-packages.mjs --update-budget`);
        continue;
      }
      for (const k of new Set([...Object.keys(want), ...Object.keys(m.rows)])) {
        const was = want[k];
        const now = m.rows[k];
        if (was === undefined || now === undefined) fail(`${name}: ${k} is ${now === undefined ? "gone from the tarball" : "new"}. fix: node tools/lint-packages.mjs --update-budget`);
        else if (now > was * (1 + MARGIN)) fail(`${name}: ${k} is ${fmt(now)} bytes gzip (measured), budget ${fmt(was)} plus ${MARGIN * 100} percent`);
        else if (now < was * (1 - MARGIN)) fail(`${name}: ${k} is ${fmt(now)} bytes gzip (measured), more than ${MARGIN * 100} percent under ${fmt(was)}. fix: node tools/lint-packages.mjs --update-budget`);
        else console.log(`lint-packages: ${name} ${k} ${fmt(now)} bytes gzip (measured), budget ${fmt(was)}`);
      }
      const readme = join(root, m.dir, "README.md");
      const text = readFileSync(readme, "utf8");
      if (sizeSection(text)?.trim() !== sizeTable(want, budget.measured).trim()) fail(`${name}: README Size budget section differs from tools/size-budget.json. fix: node tools/lint-packages.mjs --update-budget`);
    }
  }
  console.log(`lint-packages: ${Object.keys(measured).length} packages, ${failed} failures, tarballs in .pack/`);
  process.exitCode = failed ? 1 : 0;
}

export function sizeTable(rows, date) {
  const lines = Object.entries(rows).map(([k, v]) => {
    const label = k.startsWith("main: ") ? `\`${k.slice(6, -8)}\` (main entry, imports external)` : k.endsWith(".wasm") ? `\`${k}\`` : `\`${k}\` (single file build)`;
    return `| ${label} | ${fmt(v)} bytes | ${fmt(Math.floor(v * (1 + MARGIN)))} bytes |`;
  });
  return [
    "## Size budget",
    "",
    "| file | gzip (measured) | ceiling |",
    "|---|---|---|",
    ...lines,
    "",
    `Measured ${date} by \`node tools/lint-packages.mjs\` (gzip level 9) from the packed`,
    `tarball. Generated from \`tools/size-budget.json\`; CI fails when a file moves more than`,
    `${MARGIN * 100} percent from its row.`,
    "",
    "",
  ].join("\n");
}

function sizeSection(text) {
  const at = text.indexOf("\n## Size budget\n");
  if (at < 0) return null;
  const end = text.indexOf("\n## ", at + 1);
  return text.slice(at + 1, end < 0 ? undefined : end + 1);
}

function writeReadme(path, rows, date) {
  const text = readFileSync(path, "utf8");
  const table = sizeTable(rows, date);
  const old = sizeSection(text);
  let next;
  if (old !== null) next = text.replace(old, text.endsWith(old) ? `${table.trimEnd()}\n` : table);
  else {
    const lic = text.search(/\n## Licen[cs]e\n/);
    next = lic < 0 ? `${text.trimEnd()}\n\n${table.trimEnd()}\n` : `${text.slice(0, lic + 1)}${table}${text.slice(lic + 1)}`;
  }
  writeFileSync(path, next);
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) await main();
