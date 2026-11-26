#!/usr/bin/env node
// check-readme: every package README follows one template. The same tool in
// each hackbuild library repository; the repository specific parts are the
// SITE, SUITE and SHORT constants below.
//
//   template  H1 is the package name, then one line saying what it does,
//             then the badge line (npm version, licence, gzip size from
//             tools/size-budget.json, types), then these H2 sections in this
//             order. Optional ones may be left out; no other H2 is allowed.
//   quick     examples/<pkg>/quick.ts exists and the first ts block under
//             "Quick start" is that file, byte for byte after trimming;
//             npm run typecheck compiles it (examples/tsconfig.json).
//   install   "Install" holds npm install @hackbuild/<pkg>.
//   api       "API overview" links into docs/api/<pkg>/.
//   text      no "not on npm" text, no internal design ids.
//   links     every relative link resolves to a file in the repository and,
//             with an anchor, to a heading or id in that file; links into
//             the Pages site name a page the site builds.
//   model     a README with "Models and weights" has one "Browser status: "
//             paragraph under the badges.
//   quick     also: every package quick.ts imports is a dependency or named
//             in "Install"; no empty File or Blob; no licence constant.
//   prose     no internal provenance (also in the package.json description
//             and the generated API reference), no number labels outside
//             tables, no dated log lines.
// A deprecated package (SHORT) needs the H1, the line, the badges, "Install"
// and "Changelog and licences", and a link to the package that replaces it.
// Usage: node tools/check-readme.mjs [--fix-badges] [package...]
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
export const SCOPE = "@hackbuild";
export const SITE = "https://hackbuild.github.io/hackbuild-motion/";
export const SUITE = "https://hackbuild.github.io/hackbuild-suite/";
/** Deprecated packages and the package that replaces each. */
export const SHORT = {};

/** [heading, required] in order. */
export const SECTIONS = [
  ["What it does", true],
  ["Install", true],
  ["Quick start", true],
  ["Live example", true],
  ["Concepts", true],
  ["API overview", true],
  ["Models and weights", false],
  ["Browser support", true],
  ["Errors and troubleshooting", true],
  ["Works with", true],
  ["Changelog and licences", true],
  // the two parts after the template: RULES.md requires the first, tools/lint-packages.mjs writes the second
  ["What is verified, and what is not", true],
  ["Size budget", false],
];

/** Internal provenance that has no place in published text. */
export const PROVENANCE = /\bearlier (builds?|tools?|transcription|captioner|live|relief|scan|bench)\b|\bas earlier builds\b|\bfrom earlier builds\b/i;
/** A number label in prose; labels belong in tables. */
const PROSE_LABEL = /\((measured|vendor|computed|inferred)\b|\b(measured|vendor|computed|inferred)\)/;
/** The lead paragraph a model package carries under its badges. */
export const STATUS = /^Browser status: /;

const DESIGN_IDS = [
  [/\bP-[A-Z][A-Z0-9]*(-\d+)?\b/, "a pattern id"],
  [/\b(item|phase|row) [A-Z]?\d+(\.\d+)?\b/i, "an item or phase number"],
  [/§\s?\d/, "a design section number"],
  [/\bD\d{1,2}\b/, "a design decision id"],
  [/suite-design|REBUILD-PLAN|ui-harvest|ui-gap/, "an internal design file"],
];

const kb = (n) => `${(n / 1000).toFixed(1)} kB`;

/** The badge line of a package, from its manifest and tools/size-budget.json. */
export function badges(name) {
  const full = `${SCOPE}/${name}`;
  const budget = JSON.parse(readFileSync(join(root, "tools", "size-budget.json"), "utf8"));
  const rows = budget.packages[full] ?? {};
  const main = Object.entries(rows).find(([k]) => k.startsWith("main: "))?.[1];
  const enc = (s) => encodeURIComponent(s).replace(/-/g, "--");
  return [
    `[![npm](https://img.shields.io/npm/v/${full})](https://www.npmjs.com/package/${full})`,
    `[![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE)`,
    main ? `![gzip ${kb(main)} measured](https://img.shields.io/badge/gzip-${enc(kb(main))}-blue)` : null,
    `![types included](https://img.shields.io/badge/types-included-blue)`,
  ].filter(Boolean).join(" ");
}

/** GitHub style heading slug. */
export function slug(text) {
  return text.trim().toLowerCase().replace(/<[^>]+>/g, "").replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
}

/** Anchors a markdown file offers: heading slugs (with -1, -2 for repeats) and explicit ids. */
export function anchors(md) {
  const out = new Set();
  const seen = new Map();
  for (const line of stripFences(md).split("\n")) {
    const h = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) {
      const s = slug(h[1]);
      const n = seen.get(s) ?? 0;
      seen.set(s, n + 1);
      out.add(n ? `${s}-${n}` : s);
    }
    for (const m of line.matchAll(/<a (?:id|name)="([^"]+)"/g)) out.add(m[1]);
  }
  return out;
}

/** The text with fenced code blocks blanked, so headings and links inside code do not count. */
export function stripFences(md) {
  return md.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, (b) => b.replace(/[^\n]/g, " "));
}

/** H2 sections: [{ title, body }] with the text before the first H2 as lead. */
export function sections(md) {
  const plain = stripFences(md);
  const out = [];
  const re = /^## (.+)$/gm;
  let m;
  const marks = [];
  while ((m = re.exec(plain))) marks.push({ title: m[1].trim(), at: m.index, start: m.index + m[0].length });
  const lead = md.slice(0, marks[0]?.at ?? md.length);
  for (let i = 0; i < marks.length; i++) out.push({ title: marks[i].title, body: md.slice(marks[i].start, marks[i + 1]?.at ?? md.length) });
  return { lead, list: out };
}

/** The first fenced block of a language in a text, without its fences. */
export function firstBlock(text, langs = ["ts", "typescript", "js"]) {
  for (const m of text.matchAll(/^```(\w*)[^\n]*\n([\s\S]*?)^```\s*$/gm)) if (langs.includes(m[1])) return m[2];
  return null;
}

/** Problems of one README, as strings. */
export function checkReadme(name, md, { pages = new Set() } = {}) {
  const out = [];
  const full = `${SCOPE}/${name}`;
  const short = SHORT[name];
  const lines = md.split("\n");
  if (lines[0] !== `# ${full}`) out.push(`first line is ${JSON.stringify(lines[0])}, legal is "# ${full}"`);
  const { lead, list } = sections(md);
  const leadParas = lead.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (!leadParas[1] || leadParas[1].startsWith("[![") || leadParas[1].startsWith("#")) out.push("no one line description after the title");
  else if (leadParas[1].split("\n").length > 3) out.push("the description after the title runs past three lines; keep it to one sentence");
  if (leadParas[2] !== badges(name)) out.push(`badge line differs from the generated one. fix: node tools/check-readme.mjs --fix-badges ${name}`);
  const models = /^## Models and weights$/m.test(stripFences(md));
  const extra = leadParas.slice(3);
  if (models && !(extra.length === 1 && STATUS.test(extra[0]))) out.push(`a model package needs one "Browser status: " paragraph under the badges, saying plainly which model runs a real browser has verified, or that none has`);
  if (!models && extra.length) out.push(`text between the badges and "What it does": only a model package carries a "Browser status: " paragraph there`);
  const titles = list.map((s) => s.title);
  const known = SECTIONS.map(([t]) => t);
  for (const t of titles) if (!known.includes(t)) out.push(`H2 "${t}" is not in the template`);
  const order = titles.filter((t) => known.includes(t)).map((t) => known.indexOf(t));
  for (let i = 1; i < order.length; i++) if (order[i] <= order[i - 1]) out.push(`H2 "${known[order[i]]}" is out of order or repeated`);
  const need = short ? ["Install", "Changelog and licences"] : SECTIONS.filter(([, r]) => r).map(([t]) => t);
  for (const t of need) if (!titles.includes(t)) out.push(`H2 "${t}" is missing`);
  const body = (t) => list.find((s) => s.title === t)?.body ?? "";

  if (!new RegExp(`npm install [^\\n]*${full.replace("/", "\\/")}\\b`).test(body("Install")) && !short) out.push(`"Install" has no npm install ${full}`);
  if (short && !md.includes(`../${short}/README.md`)) out.push(`deprecated: no link to ../${short}/README.md`);
  const quickFile = join(root, "examples", name, "quick.ts");
  if (!short || titles.includes("Quick start")) {
    if (!existsSync(quickFile)) out.push(`examples/${name}/quick.ts is missing`);
    else {
      const block = firstBlock(body("Quick start"));
      const want = readFileSync(quickFile, "utf8");
      if (block === null) out.push(`"Quick start" has no ts block`);
      else if (block.trim() !== want.trim()) out.push(`"Quick start" block differs from examples/${name}/quick.ts`);
      const n = want.trim().split("\n").length;
      if (n < 5 || n > 25) out.push(`examples/${name}/quick.ts is ${n} lines, keep it to 10 to 20`);
    }
  }
  if (existsSync(quickFile)) {
    const quick = readFileSync(quickFile, "utf8");
    const pkg = JSON.parse(readFileSync(join(root, "packages", name, "package.json"), "utf8"));
    const deps = new Set([full, ...Object.keys(pkg.dependencies ?? {})]);
    const install = body("Install");
    for (const dep of quickImports(quick)) if (!deps.has(dep) && !install.includes(dep)) out.push(`quick.ts imports ${dep}; "Install" must name it or it must be a dependency`);
    if (/new (File|Blob)\(\s*\[\s*\]/.test(quick)) out.push("quick.ts builds an empty File or Blob; take input from a file input, a fetch of a sample or the microphone");
    const lit = /licence(For)?\s*:\s*(\([^)]*\)\s*=>\s*)?["'`]|licenceFor\s*:[^\n]*\?\s*["']/.exec(quick);
    if (lit) out.push(`quick.ts states a licence as a constant (${lit[0]}); take it from the model record`);
  }
  if (!short && !body("API overview").includes(`../../docs/api/${name}/`)) out.push(`"API overview" has no link into ../../docs/api/${name}/`);

  const prose = stripFences(md);
  if (/not (yet )?on npm|unpublished/i.test(md)) out.push(`says the package is not on npm`);
  for (const [re, what] of DESIGN_IDS) {
    const m = re.exec(prose);
    if (m) out.push(`names ${what}: ${JSON.stringify(m[0])}`);
  }
  for (const p of linkProblems(join(root, "packages", name), prose, pages)) out.push(p);
  const words = proseLines(md, ["Size budget"]);
  const prov = PROVENANCE.exec(words);
  if (prov) out.push(`names internal provenance: ${JSON.stringify(prov[0])}`);
  const label = PROSE_LABEL.exec(words);
  if (label) out.push(`a number label in prose: ${JSON.stringify(label[0])}; put labelled numbers in a table`);
  const dated = /^\s*[-*] \d{4}-\d{2}-\d{2}\b.*$/m.exec(words);
  if (dated) out.push(`a dated log line in prose: ${JSON.stringify(dated[0].trim().slice(0, 60))}; put checks in a table`);
  return out;
}

/** Package names a module imports, type imports included. */
export function quickImports(code) {
  const out = new Set();
  for (const m of code.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"'.][^"']*)["']/g)) {
    const parts = m[1].split("/");
    out.add(m[1].startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]);
  }
  return out;
}

/** Prose of a README: no fences, no table rows, no headings, and without the named sections. */
export function proseLines(md, skip = []) {
  const { list } = sections(md);
  let text = md;
  for (const s of list) if (skip.includes(s.title)) text = text.replace(s.body, "");
  return stripFences(text).split("\n").filter((l) => !/^\s*\|/.test(l) && !/^#/.test(l)).join("\n");
}

/** Links that do not resolve, for markdown at dir. */
export function linkProblems(dir, prose, pages) {
  const out = [];
  const targets = [...prose.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g), ...prose.matchAll(/\b(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
  for (const t of targets) {
    if (/^(mailto:|data:)/.test(t)) continue;
    if (t.startsWith(SITE)) {
      const first = t.slice(SITE.length).split(/[/#?]/)[0];
      if (first && !pages.has(first)) out.push(`link ${t} names no page the site builds`);
      continue;
    }
    if (/^https?:/.test(t)) continue;
    const [path, hash] = t.split("#");
    const file = path ? resolve(dir, decodeURIComponent(path)) : join(dir, "README.md");
    if (!file.startsWith(root)) out.push(`link ${t} leaves the repository`);
    else if (!existsSync(file)) out.push(`link ${t} does not resolve`);
    else if (hash && /\.md$/.test(file) && !anchors(readFileSync(file, "utf8")).has(hash)) out.push(`link ${t}: no heading or id "${hash}" in ${file.slice(root.length + 1)}`);
  }
  return out;
}

/** Page names the Pages site builds at its root. */
export function sitePages() {
  const pages = new Set(["docs", "views", "single", "llms.txt", "llms-full.txt"]);
  const site = JSON.parse(readFileSync(join(root, "examples", "pages.json"), "utf8"));
  for (const p of site.pages ?? []) pages.add(p.name);
  for (const n of readdirSync(join(root, "packages"))) if (existsSync(join(root, "packages", n, "how.ts"))) pages.add(n);
  return pages;
}

function main() {
  const args = process.argv.slice(2);
  const fix = args.includes("--fix-badges");
  const only = args.filter((a) => !a.startsWith("--"));
  const names = readdirSync(join(root, "packages")).filter((n) => existsSync(join(root, "packages", n, "package.json"))).sort();
  const pages = sitePages();
  let failed = 0;
  const list = only.length ? only : names;
  for (const name of list) {
    const file = join(root, "packages", name, "README.md");
    let md = readFileSync(file, "utf8");
    if (fix) {
      const want = badges(name);
      const next = md.replace(/^\[!\[npm\]\([^\n]*$/m, want);
      if (next !== md) writeFileSync(file, (md = next));
    }
    const problems = checkReadme(name, md, { pages });
    const desc = JSON.parse(readFileSync(join(root, "packages", name, "package.json"), "utf8")).description ?? "";
    if (PROVENANCE.test(desc)) problems.push(`package.json description names internal provenance: ${JSON.stringify(PROVENANCE.exec(desc)[0])}`);
    const apiDir = join(root, "docs", "api", name);
    for (const f of existsSync(apiDir) ? readdirSync(apiDir) : []) {
      const m = PROVENANCE.exec(readFileSync(join(apiDir, f), "utf8"));
      if (m) problems.push(`docs/api/${name}/${f} (from TSDoc) names internal provenance: ${JSON.stringify(m[0])}`);
    }
    for (const p of problems) console.error(`check-readme: ${name}: ${p}`);
    if (problems.length) failed += 1;
  }
  console.log(`check-readme: ${list.length} packages, ${failed} with problems`);
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) main();
