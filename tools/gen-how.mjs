#!/usr/bin/env node
// gen-how: writes the skeleton of packages/<name>/how.ts, the one source of
// the "how this works" fold (design D8) that the package page and the suite
// both render. From package.json it takes the name and the description; from
// the README the first ts block as the code sample. The paragraphs under
// `how` start as the README's first paragraph and are rewritten by hand, so
// an existing how.ts is never overwritten. It also lists how.ts in the
// package `files`. tsconfig.how.json typechecks the result.
// Usage: node tools/gen-how.mjs [package...]
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const repo = "hackbuild-motion";
const site = `https://hackbuild.github.io/${repo}/`;
const source = `https://github.com/hackbuild/${repo}`;
const only = process.argv.slice(2);

const tpl = (s) => "`" + s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${") + "`";
const lower = (s) => s.replace(/\s+/g, " ").trim().replace(/\.$/, "").toLowerCase() + ".";

for (const dir of readdirSync(join(root, "packages"))) {
  const pkgDir = join(root, "packages", dir);
  if (!existsSync(join(pkgDir, "package.json"))) continue;
  if (only.length && !only.includes(dir)) continue;
  const pkgPath = join(pkgDir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  if (!pkg.files.includes("how.ts")) {
    pkg.files.push("how.ts");
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  }
  const out = join(pkgDir, "how.ts");
  if (existsSync(out)) continue;
  const readme = readFileSync(join(pkgDir, "README.md"), "utf8");
  const code = (readme.match(/```ts\n([\s\S]*?)```/) ?? [, ""])[1].trimEnd();
  const first = readme.split(/\n\n/).find((b) => b.trim() && !b.startsWith("#")) ?? "";
  const body =
    `// how this works: the fold on the package page and in the suite. Kept out of\n` +
    `// the runtime entry; tsconfig.how.json typechecks it. Text from the README.\n` +
    `export interface How {\n  /** one line: what the package is */\n  what: string;\n  /** short paragraphs: how it works */\n  how: string[];\n` +
    `  packages: string[];\n  /** the install line once the packages are on npm */\n  install: string;\n  /** the line that works today */\n  today?: string;\n` +
    `  code: string;\n  lang?: string;\n  links: { page?: string; source?: string };\n}\n\n` +
    `const how: How = {\n` +
    `  what: ${JSON.stringify(lower(pkg.description))},\n` +
    `  how: [\n    ${JSON.stringify(lower(first))},\n  ],\n` +
    `  packages: [${JSON.stringify(pkg.name)}],\n` +
    `  install: ${JSON.stringify(`npm install ${pkg.name}`)},\n` +
    `  today: ${JSON.stringify(`git clone ${source} && cd ${repo} && npm ci && npm run build && npm pack -w ${pkg.name}`)},\n` +
    `  code: ${tpl(code)},\n` +
    `  lang: "ts",\n` +
    `  links: { page: ${JSON.stringify(`${site}${dir}/`)}, source: ${JSON.stringify(`${source}/tree/main/packages/${dir}`)} },\n` +
    `};\n\nexport default how;\n`;
  writeFileSync(out, body);
  console.log(`gen-how: wrote packages/${dir}/how.ts`);
}
