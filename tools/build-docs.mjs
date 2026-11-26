#!/usr/bin/env node
// build-docs: the docs half of the Pages site, written into a site that
// tools/build-pages.mjs already built (default _site/). It adds
//
//   docs/index.html                getting started (docs/getting-started.md)
//   docs/concepts.html             concepts (docs/concepts.md)
//   docs/<pkg>/index.html          the package README
//   docs/<pkg>/api/*.html          the API reference (docs/api/<pkg>/*.md)
//   docs/<pkg>/llms.md, quick.ts   the agent file and the quick start
//   llms.txt, llms-full.txt        at the site root (docs/llms*.txt)
//
// and a docs line on the site index. Markdown is rendered with markdown-it
// into the hackbuild-ui class layer the demo pages use (hb-prose, hb-table,
// hb-codeblock); headings get GitHub style ids so README anchors hold.
// markdown-it comes from the TypeDoc install: npm ci --prefix tools/typedoc.
// Usage: node tools/build-docs.mjs [siteDir]
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { SITE, slug } from "./check-readme.mjs";

const root = resolve(import.meta.dirname, "..");
const out = resolve(root, process.argv[2] ?? "_site");
if (!existsSync(join(out, "index.html"))) {
  console.error(`build-docs: ${out} has no index.html. run node tools/build-pages.mjs first`);
  process.exit(1);
}
const req = createRequire(join(root, "tools", "typedoc", "package.json"));
const MarkdownIt = req("markdown-it");
const site = JSON.parse(readFileSync(join(root, "examples", "pages.json"), "utf8"));
const GH = `https://github.com/hackbuild/${site.repo}/blob/main/`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const names = readdirSync(join(root, "packages")).filter((n) => existsSync(join(root, "packages", n, "package.json"))).sort();
const hbui = join(root, "node_modules", "@virgilvox", "hackbuild-ui");
const mark = readFileSync(join(hbui, "assets", "brand", "hackbuild-mark-reversed.svg"), "utf8")
  .replace(/<title>[^<]*<\/title>\s*/, "")
  .replace("<svg ", '<svg class="hb-logo" aria-hidden="true" ')
  .replace(/ role="img" aria-label="[^"]*"/, "")
  .trim();

/** A markdown renderer whose links go through `link(href)`. */
function renderer(link) {
  const md = new MarkdownIt({ html: true, linkify: false });
  const seen = new Map();
  md.core.ruler.push("hb_ids", (state) => {
    for (let i = 0; i < state.tokens.length; i++) {
      const t = state.tokens[i];
      if (t.type !== "heading_open") continue;
      const text = state.tokens[i + 1].children.map((c) => c.content).join("");
      const s = slug(text);
      const n = seen.get(s) ?? 0;
      seen.set(s, n + 1);
      t.attrSet("id", n ? `${s}-${n}` : s);
    }
  });
  md.renderer.rules.table_open = () => '<div class="hb-scroll-x"><table class="hb-table">\n';
  md.renderer.rules.table_close = () => "</table></div>\n";
  md.renderer.rules.code_inline = (tokens, i) => `<code class="hb-code">${esc(tokens[i].content)}</code>`;
  md.renderer.rules.fence = (tokens, i) => {
    const lang = tokens[i].info.trim().split(/\s+/)[0] || "text";
    return `<div class="hb-codeblock"><div class="hb-codeblock-head"><span class="hb-codeblock-lang">${esc(lang)}</span></div><pre tabindex="0"><code>${esc(tokens[i].content)}</code></pre></div>\n`;
  };
  md.renderer.rules.code_block = md.renderer.rules.fence;
  const open = md.renderer.rules.link_open ?? ((tokens, i, o, e, self) => self.renderToken(tokens, i, o));
  md.renderer.rules.link_open = (tokens, i, o, e, self) => {
    const t = tokens[i];
    t.attrSet("href", link(t.attrGet("href") ?? ""));
    t.attrJoin("class", "hb-link");
    return open(tokens, i, o, e, self);
  };
  // badges are images of numbers that live in the README on npm; the page states the same facts in text
  md.renderer.rules.image = (tokens, i) => `<span class="hb-code">${esc(tokens[i].content || tokens[i].attrGet("alt") || "")}</span>`;
  return md;
}

/** A link in a file at repository path `from` (a folder), as seen from a page at site path `at`. */
function siteLink(href, from, at) {
  if (/^(https?:|mailto:|#)/.test(href)) return href;
  const [path, hash] = href.split("#");
  const repo = new URL(path, `file:///${from}/`).pathname.slice(1);
  const h = hash ? `#${hash}` : "";
  let target = null;
  const api = /^docs\/api\/([^/]+)\/(.+)\.md$/.exec(repo);
  const rd = /^packages\/([^/]+)\/README\.md$/.exec(repo);
  if (api) target = `docs/${api[1]}/api/${api[2] === "README" ? "index" : api[2]}.html`;
  else if (rd) target = `docs/${rd[1]}/index.html`;
  else if (repo === "docs/getting-started.md") target = "docs/index.html";
  else if (repo === "docs/concepts.md") target = "docs/concepts.html";
  if (!target) return GH + repo + h;
  const up = at.split("/").slice(0, -1).map(() => "..");
  return [...up, target].join("/").replace(/(^|\/)index\.html$/, "$1") + h || "./";
}

const styles = (up) => `<link rel="stylesheet" href="${up}shared/hb/fonts-inline.css">\n<link rel="stylesheet" href="${up}shared/hb/hackbuild.css">\n<link rel="stylesheet" href="${up}shared/ui.css">`;

/** One docs page at site path `at` (for example docs/chat/api/index.html). */
function page(at, title, crumbs, nav, body) {
  const up = "../".repeat(at.split("/").length - 1);
  const trail = crumbs.map(([t, href]) => (href ? `<a href="${up}${href}">${esc(t)}</a>` : `<span class="hb-suffix">${esc(t)}</span>`)).join("<span>.</span>");
  const links = nav.map(([t, href]) => `<a class="hb-link" href="${/^https?:/.test(href) ? href : up + href}">${esc(t)}</a>`).join(" ");
  const html =
    `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<title>${esc(title)}</title>\n${styles(up)}\n<link rel="icon" href="data:,">\n</head>\n` +
    `<body class="hb hb-halftone">\n<header class="hb-header">${mark}<h1>${trail}</h1></header>\n` +
    `<main class="hb-shell pg-main">\n<p class="pg-what">${links}</p>\n<article class="hb-prose pg-doc">\n${body}</article>\n</main>\n` +
    `<footer class="hb-shell pg-foot"><p>${esc(site.footer)}</p></footer>\n</body>\n</html>\n`;
  mkdirSync(join(out, ...at.split("/").slice(0, -1)), { recursive: true });
  writeFileSync(join(out, at), html);
}

const read = (rel) => readFileSync(join(root, rel), "utf8");
// a docs page names a typechecked example file and gets its code in place
const examples = (text) => text.replace(/<!-- example: (\S+) -->/g, (_, f) => "```ts\n" + read(f).trimEnd() + "\n```");
const render = (text, fromDir, at) => renderer((href) => siteLink(href, fromDir, at)).render(text);
const topNav = [["getting started", "docs/"], ["concepts", "docs/concepts.html"], ["examples", ""], ["llms.txt", "llms.txt"], ["source", site.source]];
const home = [site.repo, ""];
let count = 0;

// getting started carries the package list, generated from each README's one line
const line = (n) => read(`packages/${n}/README.md`).split(/\n\s*\n/)[1].replace(/\s*\n\s*/g, " ").trim();
const list = names.map((n) => `| [@hackbuild/${n}](../packages/${n}/README.md) | ${line(n).replace(/\|/g, "\\|")} | [api](../docs/api/${n}/README.md) |`).join("\n");
const gs = examples(read("docs/getting-started.md")).replace("<!-- packages -->", `| package | what it does | reference |\n|---|---|---|\n${list}`);
page("docs/index.html", `docs, ${site.repo}`, [home, ["docs", null]], topNav, render(gs, "docs", "docs/index.html"));
page("docs/concepts.html", `concepts, ${site.repo}`, [home, ["docs", "docs/"], ["concepts", null]], topNav, render(examples(read("docs/concepts.md")), "docs", "docs/concepts.html"));
count += 2;

const demo = new Set([...(site.pages ?? []).map((p) => p.name), ...names.filter((n) => existsSync(join(out, n, "index.html")))]);
for (const n of names) {
  const base = `docs/${n}/`;
  const nav = [
    ["readme", base],
    ["api reference", `${base}api/`],
    ["llms.md", `${base}llms.md`],
    ...(existsSync(join(root, "examples", n, "quick.ts")) ? [["quick.ts", `${base}quick.ts`]] : []),
    ...(demo.has(n) ? [["demo page", `${n}/`]] : []),
    ["npm", `https://www.npmjs.com/package/@hackbuild/${n}`],
  ];
  const crumbs = [home, ["docs", "docs/"]];
  page(`${base}index.html`, `@hackbuild/${n}, ${site.repo}`, [...crumbs, [n, null]], nav, render(read(`packages/${n}/README.md`), `packages/${n}`, `${base}index.html`));
  count += 1;
  const apiDir = join(root, "docs", "api", n);
  for (const f of existsSync(apiDir) ? readdirSync(apiDir).filter((x) => x.endsWith(".md")) : []) {
    const at = `${base}api/${f === "README.md" ? "index" : f.slice(0, -3)}.html`;
    const label = f === "README.md" ? "api" : f.slice(0, -3);
    page(at, `${label}, @hackbuild/${n}`, [...crumbs, [n, base], ...(f === "README.md" ? [["api", null]] : [["api", `${base}api/`], [label, null]])], nav, render(read(`docs/api/${n}/${f}`), `docs/api/${n}`, at));
    count += 1;
  }
  if (existsSync(join(root, "packages", n, "llms.md"))) copyFileSync(join(root, "packages", n, "llms.md"), join(out, base, "llms.md"));
  if (existsSync(join(root, "examples", n, "quick.ts"))) copyFileSync(join(root, "examples", n, "quick.ts"), join(out, base, "quick.ts"));
}
for (const f of ["llms.txt", "llms-full.txt"]) {
  if (!existsSync(join(root, "docs", f))) throw new Error(`build-docs: docs/${f} is missing. run node tools/llms.mjs`);
  copyFileSync(join(root, "docs", f), join(out, f));
}

// the site index gets a docs line next to its source link
const idx = join(out, "index.html");
const html = readFileSync(idx, "utf8");
const at = html.indexOf('<p class="pg-what"><a class="hb-link" href="');
if (at < 0) throw new Error("build-docs: the site index has no source line to put the docs line before");
const docsLine = `<p class="pg-what">docs: <a class="hb-link" href="./docs/">getting started</a> <a class="hb-link" href="./docs/concepts.html">concepts</a> <a class="hb-link" href="./llms.txt">llms.txt</a>. each package page has its readme and api reference.</p>\n`;
if (!html.includes(docsLine)) writeFileSync(idx, html.slice(0, at) + docsLine + html.slice(at));
console.log(`build-docs: ${count} pages, ${names.length} packages, llms.txt and llms-full.txt into ${out.slice(root.length + 1) || out}, for ${SITE}`);
