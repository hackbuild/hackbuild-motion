// build-examples: bundles examples/<page>/main.ts for every page in
// examples/pages.json into _site/, writes each page's html shell and the
// index from the same list, and copies examples/shared/ui.css. The
// packages resolve through the workspace, so `npm run build` runs first.
// No weights or model files are copied: pages take a URL or a dropped file.
// Usage: node tools/build-examples.mjs [outDir]
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { build } from "rolldown";

const root = resolve(import.meta.dirname, "..");
const ex = join(root, "examples");
const out = resolve(root, process.argv[2] ?? "_site");
const site = JSON.parse(readFileSync(join(ex, "pages.json"), "utf8"));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "shared"), { recursive: true });
cpSync(join(ex, "shared", "ui.css"), join(out, "shared", "ui.css"));
writeFileSync(join(out, ".nojekyll"), "");

const input = {};
for (const p of site.pages) {
  const entry = join(ex, p.name, "main.ts");
  if (!existsSync(entry)) throw new Error(`build-examples: ${p.name} has no main.ts`);
  input[p.name] = entry;
}
await build({
  input,
  output: { dir: out, format: "esm", entryFileNames: "[name]/main.js", chunkFileNames: "chunks/[name]-[hash].js", minify: process.env.HB_MINIFY !== "0" },
  logLevel: "warn",
});

const head = (title, css) =>
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${esc(title)}</title>\n<link rel="stylesheet" href="${css}">\n</head>\n`;
const footer = `<footer><p>${esc(site.footer)}</p></footer>`;

for (const p of site.pages) {
  mkdirSync(join(out, p.name), { recursive: true });
  const stage = p.stage === false ? "" : `<div class="stage" id="stage"></div>\n`;
  writeFileSync(
    join(out, p.name, "index.html"),
    head(`${p.name}, ${site.repo}`, "../shared/ui.css") +
      `<body>\n<header><h1><a href="../">${esc(site.repo)}</a> / ${esc(p.name)}</h1><p>${esc(p.what)}</p></header>\n` +
      `<main>\n${stage}<div class="controls" id="controls"></div>\n<div class="status" id="status" role="status"></div>\n<div class="readout" id="readout"></div>\n</main>\n` +
      `${footer}\n<script type="module" src="./main.js"></script>\n</body>\n</html>\n`,
  );
}

const items = site.pages.map((p) => `<li><a href="./${p.name}/">${esc(p.name)}</a> <span>${esc(p.what)}</span></li>`).join("\n");
writeFileSync(
  join(out, "index.html"),
  head(site.repo, "./shared/ui.css") +
    `<body>\n<header><h1>${esc(site.repo)} examples</h1><p>${esc(site.intro)}</p></header>\n` +
    `<main>\n<ul class="pages" id="pages">\n${items}\n</ul>\n<p><a href="${esc(site.source)}">source</a></p>\n</main>\n${footer}\n</body>\n</html>\n`,
);
console.log(`build-examples: ${site.pages.length} pages into ${out.slice(root.length + 1) || out}`);
