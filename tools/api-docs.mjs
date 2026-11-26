#!/usr/bin/env node
// api-docs: the API reference of every package. TypeDoc with the markdown
// plugin writes docs/api/<pkg>/ (committed, linked from each README and
// rendered on the Pages site) and .local/api/<pkg>.json (the TypeDoc JSON
// that tools/llms.mjs reads). Entry points are the package's exports map
// mapped back to src; wasm files and inline base64 entries carry no API.
//
// Validation: every exported symbol needs a TSDoc comment. A symbol without
// one is printed and fails the run, so CI catches it.
//
// TypeDoc needs the TypeScript 6 compiler API and the workspace builds with
// TypeScript 7, so TypeDoc has its own install in tools/typedoc
// (npm ci --prefix tools/typedoc). The packages resolve each other through
// their dist types, so npm run build runs first.
// Usage: node tools/api-docs.mjs [--check] [package...]
//   --check  write to a temporary folder and fail when docs/api differs
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const check = args.includes("--check");
const only = args.filter((a) => !a.startsWith("--"));
const req = createRequire(join(root, "tools", "typedoc", "package.json"));
if (!existsSync(join(root, "tools", "typedoc", "node_modules"))) {
  console.error("api-docs: tools/typedoc has no install. fix: npm ci --prefix tools/typedoc");
  process.exit(1);
}
const td = await import(pathToFileURL(req.resolve("typedoc")).href);
const plugin = req.resolve("typedoc-plugin-markdown");

/** Package folder names in packages/, sorted. */
export function packageNames() {
  return readdirSync(join(root, "packages")).filter((n) => existsSync(join(root, "packages", n, "package.json"))).sort();
}

/** The src entry points of a package from its exports map: subpath to src file. */
export function entryPoints(name) {
  const pkg = JSON.parse(readFileSync(join(root, "packages", name, "package.json"), "utf8"));
  const out = {};
  for (const [k, v] of Object.entries(pkg.exports ?? {})) {
    const file = typeof v === "string" ? v : v.import;
    if (!file?.endsWith(".js") || k === "./inline") continue;
    const src = join(root, "packages", name, file.replace(/^\.\/dist\//, "src/").replace(/\.js$/, ".ts"));
    if (existsSync(src)) out[k] = src;
  }
  return out;
}

/** Top level exports of every entry point that carry no summary, as "entry: name". */
export function undocumented(project) {
  const modules = project.children?.some((c) => c.kindOf(td.ReflectionKind.Module)) ? project.children.filter((c) => c.kindOf(td.ReflectionKind.Module)) : [project];
  const has = (r) => Boolean(r?.comment?.summary?.some((p) => p.text.trim()));
  const out = [];
  for (const m of modules) {
    for (const c of m.children ?? []) {
      if (c.kindOf(td.ReflectionKind.Reference)) continue;
      const sigs = c.signatures ?? [];
      if (!has(c) && !sigs.some(has) && !has(c.getSignature)) out.push(`${m === project ? "." : m.name}: ${c.name}`);
    }
  }
  return out;
}

const apiRoot = join(root, "docs", "api");
const jsonRoot = join(root, ".local", "api");
const outRoot = check ? mkdtempSync(join(tmpdir(), "hb-api-")) : apiRoot;
mkdirSync(jsonRoot, { recursive: true });
let failed = 0;

for (const name of only.length ? only : packageNames()) {
  const entries = entryPoints(name);
  const out = join(outRoot, name);
  rmSync(out, { recursive: true, force: true });
  const app = await td.Application.bootstrapWithPlugins({
    entryPoints: Object.values(entries),
    tsconfig: join(root, "packages", name, "tsconfig.json"),
    plugin: [plugin],
    out,
    name: `@hackbuild/${name}`,
    readme: "none",
    excludePrivate: true,
    excludeInternal: true,
    excludeExternals: true,
    disableSources: true,
    gitRevision: "main",
    hideGenerator: true,
    logLevel: "Warn",
    skipErrorChecking: true,
    validation: { notExported: false, invalidLink: true, notDocumented: false },
    // markdown plugin
    outputFileStrategy: "modules",
    entryFileName: "README.md",
    hidePageHeader: true,
    hideBreadcrumbs: true,
    useCodeBlocks: true,
    parametersFormat: "table",
    interfacePropertiesFormat: "table",
    classPropertiesFormat: "table",
    typeDeclarationFormat: "table",
    propertyMembersFormat: "table",
    sanitizeComments: true,
  });
  const project = await app.convert();
  if (!project) {
    failed += 1;
    console.error(`api-docs: ${name}: TypeDoc could not convert the package`);
    continue;
  }
  app.validate(project);
  const missing = undocumented(project);
  for (const m of missing) console.error(`api-docs: ${name}: ${m} has no TSDoc comment`);
  const problems = missing.length + app.logger.warningCount + app.logger.errorCount;
  if (problems) {
    failed += 1;
    console.error(`api-docs: ${name}: ${missing.length} exports with no TSDoc comment, ${app.logger.warningCount + app.logger.errorCount} TypeDoc warnings or errors`);
  }
  await app.generateOutputs(project);
  await app.generateJson(project, join(jsonRoot, `${name}.json`));
  // TypeDoc's markdown ends with its own footer line at most; keep the files byte stable
  console.log(`api-docs: ${name}: ${Object.keys(entries).length} entry points, docs/api/${name}/`);
}

if (check) {
  const diff = (a, b) => {
    const list = (d) => (existsSync(d) ? readdirSync(d, { recursive: true }).filter((f) => f.endsWith(".md")).sort() : []);
    const fa = list(a);
    const fb = list(b);
    const bad = new Set([...fa.filter((f) => !fb.includes(f)), ...fb.filter((f) => !fa.includes(f))]);
    for (const f of fa) if (fb.includes(f) && readFileSync(join(a, f), "utf8") !== readFileSync(join(b, f), "utf8")) bad.add(f);
    return [...bad];
  };
  for (const name of only.length ? only : packageNames()) {
    const d = diff(join(outRoot, name), join(apiRoot, name));
    if (d.length) {
      failed += 1;
      console.error(`api-docs: docs/api/${name} is stale (${d.slice(0, 5).join(", ")}). fix: node tools/api-docs.mjs`);
    }
  }
  rmSync(outRoot, { recursive: true, force: true });
}
console.log(`api-docs: ${failed} failures${check ? " (check)" : ""}, json in ${relative(root, jsonRoot)}/`);
process.exitCode = failed ? 1 : 0;
