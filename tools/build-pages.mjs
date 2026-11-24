// canonical copy: hackbuild-browser-ai/tools/build-pages.mjs. hackbuild-motion and hackbuild-agents carry byte equal copies; edit here, copy over, and tools/test/build-pages.test.mjs fails while a sibling copy differs.
//
// build-pages: the page builder of the three library sites. It reads
// examples/pages.json and bundles examples/<page>/main.ts for every page into
// two outputs.
//
// Hosted, in <outDir>/ (default _site/): ES modules with lazy chunks, each
// page at <page>/index.html with its script at <page>/main.js, the index at
// index.html. It needs http (GitHub Pages or any local server): Chrome blocks
// module scripts on a file:// origin. tools/check-examples.mjs drives these
// pages with ?auto.
//
// Single, in <outDir>/single/: one HTML per page, <page>.html, with its
// script inlined as one module bundle (dynamic imports of local code folded
// in, remote ones left as they are) and every stylesheet inlined, fonts
// included. These open from file:// with no server.
//
// Both outputs take hackbuild.css, tokens.css and fonts-inline.css from the
// vendored hackbuild-ui tarball (tools/vendor, installed by npm ci) and
// examples/shared/ui.css. The packages resolve through the workspace, so
// `npm run build` runs first. No weights or model files are copied: pages
// take a URL or a dropped file.
// Usage: node tools/build-pages.mjs [outDir] [--hosted | --single]
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { build, rolldown } from "rolldown";

const root = resolve(import.meta.dirname, "..");
const ex = join(root, "examples");
const args = process.argv.slice(2);
const out = resolve(root, args.find((a) => !a.startsWith("--")) ?? "_site");
const want = { hosted: !args.includes("--single"), single: !args.includes("--hosted") };
const site = JSON.parse(readFileSync(join(ex, "pages.json"), "utf8"));
const minify = process.env.HB_MINIFY !== "0";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const hbui = join(root, "node_modules", "@virgilvox", "hackbuild-ui");
const hbStyles = join(hbui, "dist", "styles");
// the mark, verbatim, reversed for the ink header
const mark = readFileSync(join(hbui, "assets", "brand", "hackbuild-mark-reversed.svg"), "utf8")
  .replace(/<title>[^<]*<\/title>\s*/, "")
  .replace("<svg ", '<svg class="hb-logo" aria-hidden="true" ')
  .replace(/ role="img" aria-label="[^"]*"/, "")
  .trim();
// pages.json "icon" is an svg; without one the page links an empty icon, so no page asks the server for /favicon.ico
const icon = site.icon ? "data:image/svg+xml," + encodeURIComponent(site.icon) : "data:,";

const entries = {};
for (const p of site.pages) {
  const entry = join(ex, p.name, "main.ts");
  if (!existsSync(entry)) throw new Error(`build-pages: ${p.name} has no main.ts`);
  entries[p.name] = entry;
}

// The "how this works" fold of design 1.3: packages/<name>/how.ts renders
// here on the package page, and pages.json gains the fold only pages. Item
// 6.1 fills this slot; until a how.ts exists every page renders no fold.
const fold = (_page) => "";

// links differ per output: hosted pages sit in folders, single pages are files side by side
const LINKS = {
  hosted: { home: "../", page: (n) => `./${n}/` },
  single: { home: "./index.html", page: (n) => `./${n}.html` },
};

const head = (title, styles) =>
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<title>${esc(title)}</title>\n` +
  `${styles}\n<link rel="icon" href="${icon}">\n</head>\n`;
const header = (title) => `<header class="hb-header">${mark}<h1>${title}</h1></header>`;
const footer = `<footer class="hb-shell pg-foot"><p>${esc(site.footer)}</p></footer>`;

const pageHtml = (p, styles, links, script) => {
  const stage = p.stage === false ? "" : `<div class="hb-viewport" id="stage"></div>\n`;
  return (
    head(`${p.name}, ${site.repo}`, styles) +
    `<body class="hb hb-halftone">\n${header(`<a href="${links.home}">${esc(site.repo)}</a><span>.</span><span class="hb-suffix">${esc(p.name)}</span>`)}\n` +
    // the stage sits before the controls in the markup, so a phone shows the view above the fold; from 641 px ui.css moves the controls up under the header
    `<div class="hb-shell pg-top">\n<p class="pg-what">${esc(p.what)}</p>\n${stage}</div>\n` +
    `<div class="hb-bar" id="controls"></div>\n` +
    `<main class="hb-shell pg-main">\n<div class="hb-status" id="status" role="status"></div>\n<div class="hb-readouts" id="readout"></div>\n${fold(p)}</main>\n` +
    `${footer}\n${script}\n</body>\n</html>\n`
  );
};

const indexHtml = (styles, links) => {
  const items = site.pages.map((p) => `<li class="hb-row"><a href="${links.page(p.name)}">${esc(p.name)}</a><span>${esc(p.what)}</span></li>`).join("\n");
  return (
    head(site.repo, styles) +
    `<body class="hb hb-halftone">\n${header(`${esc(site.repo)}<span>.</span><span class="hb-suffix">examples</span>`)}\n` +
    `<main class="hb-shell pg-main">\n<p class="pg-what">${esc(site.intro)}</p>\n<ul class="hb-list pg-pages" id="pages">\n${items}\n</ul>\n<p class="pg-what"><a class="hb-link" href="${esc(site.source)}">source</a></p>\n</main>\n${footer}\n</body>\n</html>\n`
  );
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
writeFileSync(join(out, ".nojekyll"), "");

if (want.hosted) {
  mkdirSync(join(out, "shared", "hb"), { recursive: true });
  cpSync(join(ex, "shared", "ui.css"), join(out, "shared", "ui.css"));
  for (const f of ["hackbuild.css", "tokens.css", "fonts-inline.css"]) cpSync(join(hbStyles, f), join(out, "shared", "hb", f));
  await build({
    input: entries,
    output: { dir: out, format: "esm", entryFileNames: "[name]/main.js", chunkFileNames: "chunks/[name]-[hash].js", minify },
    logLevel: "warn",
  });
  const styles = (up) => `<link rel="stylesheet" href="${up}shared/hb/fonts-inline.css">\n<link rel="stylesheet" href="${up}shared/hb/hackbuild.css">\n<link rel="stylesheet" href="${up}shared/ui.css">`;
  for (const p of site.pages) {
    writeFileSync(join(out, p.name, "index.html"), pageHtml(p, styles("../"), LINKS.hosted, `<script type="module" src="./main.js"></script>`));
  }
  writeFileSync(join(out, "index.html"), indexHtml(styles("./"), LINKS.hosted));
  console.log(`build-pages: hosted, ${site.pages.length} pages into ${out.slice(root.length + 1) || out}`);
}

if (want.single) {
  const dir = join(out, "single");
  mkdirSync(dir, { recursive: true });
  const read = (f) => readFileSync(f, "utf8");
  // hackbuild.css pulls tokens.css with an @import, which has no file to reach here, so the tokens go in its place
  const hb = read(join(hbStyles, "hackbuild.css")).replace(/@import\s+["']\.\/tokens\.css["'];?/, () => read(join(hbStyles, "tokens.css")));
  if (/@import/.test(hb)) throw new Error("build-pages: hackbuild.css has an @import the single output cannot follow");
  const styles = [read(join(hbStyles, "fonts-inline.css")), hb, read(join(ex, "shared", "ui.css"))].map((css) => `<style>\n${css.replace(/<\/style/gi, "<\\/style")}\n</style>`).join("\n");
  for (const p of site.pages) {
    const bundle = await rolldown({ input: entries[p.name], logLevel: "warn" });
    const { output } = await bundle.generate({ format: "esm", codeSplitting: false, minify });
    await bundle.close();
    const chunks = output.filter((o) => o.type === "chunk");
    if (chunks.length !== 1) throw new Error(`build-pages: ${p.name} bundled to ${chunks.length} chunks, want 1`);
    // an inline module script runs from file://: nothing is fetched, so the null origin never blocks it
    const code = chunks[0].code.replace(/<\/script/gi, "<\\/script");
    writeFileSync(join(dir, `${p.name}.html`), pageHtml(p, styles, LINKS.single, `<script type="module">\n${code}\n</script>`));
  }
  writeFileSync(join(dir, "index.html"), indexHtml(styles, LINKS.single));
  console.log(`build-pages: single, ${site.pages.length} pages into ${dir.slice(root.length + 1) || dir}`);
}
