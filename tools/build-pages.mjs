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
//
// The "how this works" fold of design 1.3 comes from packages/<name>/how.ts
// (shape in tools/how.d.ts): a page renders the fold of every package in its
// "packages" list (default, the package named like the page), and every
// package with a how.ts that no page covers gets a fold only page. The code
// blocks of the fold take copy and wrap from hackbuild-ui/vanilla.
// "open the full tool" links into the suite only when SUITE_URL is set at
// build time, with the route from pages.json "suite" (package name to hash
// route); empty by default, so no page links a site that is not up.
// Usage: [SUITE_URL=https://...] node tools/build-pages.mjs [outDir] [--hosted | --single]
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

const suiteUrl = (process.env.SUITE_URL ?? "").trim().replace(/\/?$/, "/");
const suiteHref = (names) => {
  if (suiteUrl === "/") return "";
  const route = names.map((n) => site.suite?.[n]).find(Boolean);
  return route ? suiteUrl + route : "";
};

// how.ts files: bundled one at a time (plain data, no imports) and read back as a module
const HOW_KEYS = { packages: "array", what: "string", how: "array", install: "string", code: "string", links: "object" };
async function readHow(file) {
  const bundle = await rolldown({ input: file, logLevel: "warn" });
  const { output } = await bundle.generate({ format: "esm" });
  await bundle.close();
  const how = (await import("data:text/javascript;base64," + Buffer.from(output[0].code).toString("base64"))).default;
  for (const [k, t] of Object.entries(HOW_KEYS)) {
    if (t === "array" ? !Array.isArray(how?.[k]) : typeof how?.[k] !== t) throw new Error(`build-pages: ${file} needs ${k} as ${t}`);
  }
  return how;
}
const hows = new Map();
const pkgDir = join(root, "packages");
for (const n of existsSync(pkgDir) ? readdirSync(pkgDir).sort() : []) {
  const f = join(pkgDir, n, "how.ts");
  if (existsSync(f)) hows.set(n, await readHow(f));
}

// the demo pages, then a fold only page per package that no page covers
const covers = (p) => p.packages ?? [p.name];
const covered = new Set(site.pages.flatMap(covers));
const pages = [
  ...site.pages.map((p) => ({ ...p, kind: "demo" })),
  ...[...hows].filter(([n]) => !covered.has(n)).map(([n, h]) => ({ name: n, what: h.what, stage: false, kind: "fold" })),
];

const entries = {};
for (const p of pages) {
  const entry = join(ex, p.name, "main.ts");
  if (p.kind === "demo" && !existsSync(entry)) throw new Error(`build-pages: ${p.name} has no main.ts`);
  entries[p.name] = `\0page:${p.name}`;
}
// each page entry is the page script, if any, plus the fold's code block behaviour
const vanilla = join(hbui, "dist", "vanilla.js");
const pageModule = (name) =>
  (existsSync(join(ex, name, "main.ts")) ? `import ${JSON.stringify(join(ex, name, "main.ts"))};\n` : "") +
  `import { codeBlock } from ${JSON.stringify(vanilla)};\n` +
  `for (const el of document.querySelectorAll(".hb-how .hb-codeblock")) codeBlock(el, { wrap: el.classList.contains("is-wrap") });\n`;
const pagePlugin = {
  name: "build-pages-entry",
  resolveId: (id) => (id.startsWith("\0page:") ? id : null),
  load: (id) => (id.startsWith("\0page:") ? pageModule(id.slice(6)) : null),
};

// prose of how.ts: `code spans` become code, the rest is escaped text
const prose = (s) => esc(s).replace(/`([^`]+)`/g, '<code class="hb-code">$1</code>');
const codeBlockHtml = (code, lang, label, wrap) =>
  `<div class="hb-codeblock${wrap ? " is-wrap" : ""}"><div class="hb-codeblock-head"><span class="hb-codeblock-lang">${esc(lang)}</span>` +
  (wrap ? "" : `<button type="button" class="hb-codeblock-btn" data-wrap aria-pressed="false">wrap</button>`) +
  `<button type="button" class="hb-codeblock-btn" data-copy><span data-label aria-live="polite">copy</span></button></div>` +
  `<pre aria-label="${esc(label)}"><code>${esc(code)}</code></pre></div>`;

// The class layer of HbHow (hackbuild-ui): the fold at the foot of a package page
const foldHtml = (p) => {
  const list = covers(p).filter((n) => hows.has(n));
  if (!list.length) return "";
  return list
    .map((n) => {
      const h = hows.get(n);
      const self = list.length === 1 || p.kind === "fold";
      const links = [h.links.page && p.name !== n ? `<a class="hb-link" href="${esc(h.links.page)}">package page</a>` : "", h.links.source ? `<a class="hb-link" href="${esc(h.links.source)}">source</a>` : ""].filter(Boolean);
      return (
        `<details class="hb-fold hb-how"${p.kind === "fold" ? " open" : ""}>\n<summary><span class="hb-fold-sum">${self ? "how this works" : `how ${esc(n)} works`}</span></summary>\n<div>\n` +
        (p.kind === "fold" ? "" : `<div><span class="hb-how-k">what</span><p>${prose(h.what)}</p></div>\n`) +
        (h.how.length ? `<div><span class="hb-how-k">how it works</span>${h.how.map((t) => `<p>${prose(t)}</p>`).join("")}</div>\n` : "") +
        `<div class="hb-how-pkgs"><span class="hb-how-k">packages</span>${h.packages.map((x) => `<code class="hb-code">${esc(x)}</code>`).join(" ")}</div>\n` +
        `<div class="hb-how-install"><span class="hb-how-k">install</span>${codeBlockHtml(h.install, "sh", "install line", true)}` +
        `</div>\n<div class="hb-how-code"><span class="hb-how-k">code</span>${codeBlockHtml(h.code, h.lang ?? "ts", "minimal code", false)}</div>\n` +
        (links.length ? `<div class="hb-how-links">${links.join("")}</div>\n` : "") +
        `</div>\n</details>\n`
      );
    })
    .join("");
};

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
  const tool = suiteHref(covers(p));
  const open = tool ? `<p class="pg-what"><a class="hb-link" href="${esc(tool)}">open the full tool</a></p>\n` : "";
  const demo = p.kind === "demo";
  return (
    head(`${p.name}, ${site.repo}`, styles) +
    `<body class="hb hb-halftone">\n${header(`<a href="${links.home}">${esc(site.repo)}</a><span>.</span><span class="hb-suffix">${esc(p.name)}</span>`)}\n` +
    // the stage sits before the controls in the markup, so a phone shows the view above the fold; from 641 px ui.css moves the controls up under the header
    `<div class="hb-shell pg-top">\n<p class="pg-what">${demo ? esc(p.what) : prose(p.what)}</p>\n${open}${stage}</div>\n` +
    (demo ? `<div class="hb-bar" id="controls"></div>\n` : "") +
    `<main class="hb-shell pg-main">\n` +
    (demo ? `<div class="hb-status" id="status" role="status"></div>\n<div class="hb-readouts" id="readout"></div>\n` : "") +
    `${foldHtml(p)}</main>\n` +
    `${footer}\n${script}\n</body>\n</html>\n`
  );
};

const indexHtml = (styles, links) => {
  const row = (p) => `<li class="hb-row"><a href="${links.page(p.name)}">${esc(p.name)}</a><span>${esc(p.what.replace(/`/g, "").replace(/^(.*?\.)\s.*$/, "$1"))}</span></li>`;
  const folds = pages.filter((p) => p.kind === "fold");
  const items =
    pages.filter((p) => p.kind === "demo").map(row).join("\n") +
    (folds.length ? `\n</ul>\n<p class="pg-what">packages with no demo: how each works, its install line and its code.</p>\n<ul class="hb-list pg-pages" id="folds">\n${folds.map(row).join("\n")}` : "");
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
    plugins: [pagePlugin],
    output: { dir: out, format: "esm", entryFileNames: "[name]/main.js", chunkFileNames: "chunks/[name]-[hash].js", minify },
    logLevel: "warn",
  });
  const styles = (up) => `<link rel="stylesheet" href="${up}shared/hb/fonts-inline.css">\n<link rel="stylesheet" href="${up}shared/hb/hackbuild.css">\n<link rel="stylesheet" href="${up}shared/ui.css">`;
  for (const p of pages) {
    writeFileSync(join(out, p.name, "index.html"), pageHtml(p, styles("../"), LINKS.hosted, `<script type="module" src="./main.js"></script>`));
  }
  writeFileSync(join(out, "index.html"), indexHtml(styles("./"), LINKS.hosted));
  console.log(`build-pages: hosted, ${pages.length} pages into ${out.slice(root.length + 1) || out}`);
}

if (want.single) {
  const dir = join(out, "single");
  mkdirSync(dir, { recursive: true });
  const read = (f) => readFileSync(f, "utf8");
  // hackbuild.css pulls tokens.css with an @import, which has no file to reach here, so the tokens go in its place
  const hb = read(join(hbStyles, "hackbuild.css")).replace(/@import\s+["']\.\/tokens\.css["'];?/, () => read(join(hbStyles, "tokens.css")));
  if (/@import/.test(hb)) throw new Error("build-pages: hackbuild.css has an @import the single output cannot follow");
  const styles = [read(join(hbStyles, "fonts-inline.css")), hb, read(join(ex, "shared", "ui.css"))].map((css) => `<style>\n${css.replace(/<\/style/gi, "<\\/style")}\n</style>`).join("\n");
  for (const p of pages) {
    const bundle = await rolldown({ input: entries[p.name], plugins: [pagePlugin], logLevel: "warn" });
    const { output } = await bundle.generate({ format: "esm", codeSplitting: false, minify });
    await bundle.close();
    const chunks = output.filter((o) => o.type === "chunk");
    if (chunks.length !== 1) throw new Error(`build-pages: ${p.name} bundled to ${chunks.length} chunks, want 1`);
    // an inline module script runs from file://: nothing is fetched, so the null origin never blocks it
    const code = chunks[0].code.replace(/<\/script/gi, "<\\/script");
    writeFileSync(join(dir, `${p.name}.html`), pageHtml(p, styles, LINKS.single, `<script type="module">\n${code}\n</script>`));
  }
  writeFileSync(join(dir, "index.html"), indexHtml(styles, LINKS.single));
  console.log(`build-pages: single, ${pages.length} pages into ${dir.slice(root.length + 1) || dir}`);
}
