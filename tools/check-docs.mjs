#!/usr/bin/env node
// check-docs: the built docs load. Serves a built site (default _site/) on
// a local port, then in headless Chrome: /llms.txt and /llms-full.txt answer
// 200 in the llmstxt.org shape, and each docs page named answers 200, has a
// title, logs no error, fetches nothing that fails, and links only to files
// the site has. Run tools/build-pages.mjs and tools/build-docs.mjs first.
// Usage: node tools/check-docs.mjs [siteDir] [--pages docs/,docs/chat/,...]
//   (HB_CHROME overrides the browser)
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import puppeteer from "puppeteer-core";

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const dir = resolve(root, args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--pages") ?? "_site");
const pagesArg = args[args.indexOf("--pages") + 1];
const PAGES = args.includes("--pages") ? pagesArg.split(",") : ["docs/", "docs/concepts.html", "docs/ik/", "docs/avatar/", "docs/motion-views/", "docs/retarget/api/", "docs/avatar/api/three.html"];
const CANDIDATES = [process.env.HB_CHROME, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
const chrome = CANDIDATES.find((p) => p && existsSync(p));
if (!chrome) {
  console.error("check-docs: no chrome found, set HB_CHROME");
  process.exit(1);
}
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".txt": "text/plain; charset=utf-8", ".md": "text/markdown; charset=utf-8", ".ts": "text/plain; charset=utf-8", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const fileFor = (url) => {
  let p = join(dir, decodeURIComponent(new URL(url, "http://x/").pathname));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
  return p.startsWith(dir) && existsSync(p) ? p : null;
};
const server = createServer((req, res) => {
  const f = fileFor(req.url ?? "/");
  if (!f) return res.writeHead(404).end("missing");
  res.writeHead(200, { "content-type": TYPES[extname(f)] ?? "application/octet-stream" }).end(readFileSync(f));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;

let failed = 0;
const fail = (m) => {
  failed += 1;
  console.error(`check-docs: ${m}`);
};
const profile = mkdtempSync(join(tmpdir(), "hb-docs-"));
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, userDataDir: profile, args: ["--no-first-run", "--no-default-browser-check"] });
try {
  const txt = await browser.newPage();
  for (const f of ["llms.txt", "llms-full.txt"]) {
    const r = await txt.goto(base + f);
    const text = await r.text();
    if (r.status() !== 200) fail(`${f} answered ${r.status()}`);
    else if (!/^# \S+\n\n> .+\n/.test(text)) fail(`${f} does not open with an H1 and a blockquote`);
    else if (!/\n## Packages\n\n- \[/.test(text)) fail(`${f} has no Packages section of links`);
    else console.log(`check-docs: ${f} 200, ${text.length} chars (measured)`);
  }
  for (const p of PAGES) {
    const errors = [];
    const bad = [];
    const page = await browser.newPage();
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("response", (r) => r.status() >= 400 && bad.push(`${r.status()} ${r.url()}`));
    page.on("requestfailed", (r) => bad.push(`failed ${r.url()}`));
    const r = await page.goto(base + p, { waitUntil: "load" });
    if (r.status() !== 200) {
      fail(`${p} answered ${r.status()}`);
      continue;
    }
    const info = await page.evaluate(() => ({
      title: document.title,
      h: document.querySelector("article h1, article h2")?.textContent ?? "",
      links: [...document.querySelectorAll("a[href]")].map((a) => a.href),
      wide: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }));
    if (!info.title || !info.h) fail(`${p} has no title or heading`);
    for (const e of errors) fail(`${p} logged ${e}`);
    for (const b of bad) fail(`${p} fetched ${b}`);
    for (const l of info.links) if (l.startsWith(base) && !fileFor(l.slice(base.length - 1).split("#")[0])) fail(`${p} links ${l.slice(base.length)}, which the site does not have`);
    if (info.wide) fail(`${p} scrolls sideways at ${page.viewport()?.width ?? "default"} px`);
    console.log(`check-docs: ${p} 200, "${info.title}", ${info.links.length} links`);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
  rmSync(profile, { recursive: true, force: true });
}
console.log(`check-docs: ${PAGES.length + 2} urls, ${failed} failures`);
process.exitCode = failed ? 1 : 0;
