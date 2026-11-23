// build-examples: bundles examples/<page>/main.ts for every page in
// examples/pages.json into _site/, writes each page's html shell and the
// index from the same list, and copies examples/shared/ui.css with the
// hackbuild-ui class layer and its inlined fonts (the vendored tarball in
// tools/vendor), so every page opens from file:// and offline. The
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
const hbui = join(root, "node_modules", "@virgilvox", "hackbuild-ui");
for (const f of ["hackbuild.css", "tokens.css", "fonts-inline.css"]) cpSync(join(hbui, "dist", "styles", f), join(out, "shared", "hb", f));
// the mark, verbatim, reversed for the ink header
const mark = readFileSync(join(hbui, "assets", "brand", "hackbuild-mark-reversed.svg"), "utf8")
  .replace(/<title>[^<]*<\/title>\s*/, "")
  .replace("<svg ", '<svg class="hb-logo" aria-hidden="true" ')
  .replace(/ role="img" aria-label="[^"]*"/, "")
  .trim();
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

const head = (title, up) =>
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<title>${esc(title)}</title>\n` +
  `<link rel="stylesheet" href="${up}shared/hb/fonts-inline.css">\n<link rel="stylesheet" href="${up}shared/hb/hackbuild.css">\n<link rel="stylesheet" href="${up}shared/ui.css">\n<link rel="icon" href="data:,">\n</head>\n`;
const header = (title) => `<header class="hb-header">${mark}<h1>${title}</h1></header>`;
const footer = `<footer class="hb-shell pg-foot"><p>${esc(site.footer)}</p></footer>`;

for (const p of site.pages) {
  mkdirSync(join(out, p.name), { recursive: true });
  const stage = p.stage === false ? "" : `<div class="hb-viewport" id="stage"></div>\n`;
  writeFileSync(
    join(out, p.name, "index.html"),
    head(`${p.name}, ${site.repo}`, "../") +
      `<body class="hb hb-halftone">\n${header(`<a href="../">${esc(site.repo)}</a><span>.</span><span class="hb-suffix">${esc(p.name)}</span>`)}\n` +
      // the stage sits before the controls in the markup, so a phone shows the view above the fold; from 641 px ui.css moves the controls up under the header
      `<div class="hb-shell pg-top">\n<p class="pg-what">${esc(p.what)}</p>\n${stage}</div>\n` +
      `<div class="hb-bar" id="controls"></div>\n` +
      `<main class="hb-shell pg-main">\n<div class="hb-status" id="status" role="status"></div>\n<div class="hb-readouts" id="readout"></div>\n</main>\n` +
      `${footer}\n<script type="module" src="./main.js"></script>\n</body>\n</html>\n`,
  );
}

const items = site.pages.map((p) => `<li class="hb-row"><a href="./${p.name}/">${esc(p.name)}</a><span>${esc(p.what)}</span></li>`).join("\n");
writeFileSync(
  join(out, "index.html"),
  head(site.repo, "./") +
    `<body class="hb hb-halftone">\n${header(`${esc(site.repo)}<span>.</span><span class="hb-suffix">examples</span>`)}\n` +
    `<main class="hb-shell pg-main">\n<p class="pg-what">${esc(site.intro)}</p>\n<ul class="hb-list pg-pages" id="pages">\n${items}\n</ul>\n<p class="pg-what"><a class="hb-link" href="${esc(site.source)}">source</a></p>\n</main>\n${footer}\n</body>\n</html>\n`,
);
console.log(`build-examples: ${site.pages.length} pages into ${out.slice(root.length + 1) || out}`);
