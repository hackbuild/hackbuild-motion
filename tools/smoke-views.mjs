// smoke-views: one headless smoke per motion view. Serves _site, opens the
// character-stage, avatar-drop and clip-strip pages with ?auto in headless
// system Chrome (a throwaway profile, deleted after), waits for the page's
// window.__hb result and prints each check. Model and weight hosts are
// blocked; the pages use the stand-in built in code and clips written in
// code only. Exit 1 on any failed check.
// Usage: node tools/smoke-views.mjs [page...]   (HB_CHROME overrides the browser)
import { createReadStream, existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import puppeteer from "puppeteer-core";

const root = resolve(import.meta.dirname, "..");
const site = join(root, "_site");
const PAGES = ["character-stage", "avatar-drop", "clip-strip"];
const only = process.argv.slice(2);
const pages = only.length ? PAGES.filter((p) => only.includes(p)) : PAGES;
if (!existsSync(join(site, "index.html"))) throw new Error("smoke-views: run node tools/build-pages.mjs first");

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm", ".png": "image/png", ".svg": "image/svg+xml" };
const server = createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path.endsWith("/")) path += "index.html";
  const file = join(site, path);
  if (!file.startsWith(site + sep) || !existsSync(file) || statSync(file).isDirectory()) return void res.writeHead(404).end();
  res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const HOSTS = ["huggingface.co", "*.huggingface.co", "hf.co", "*.hf.co", "raw.githubusercontent.com", "objects.githubusercontent.com"];
const profile = mkdtempSync(join(tmpdir(), "smoke-views-"));
const browser = await puppeteer.launch({
  executablePath: process.env.HB_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  userDataDir: profile,
  args: ["--no-first-run", "--window-size=1280,800", `--host-resolver-rules=${HOSTS.map((h) => `MAP ${h} ~NOTFOUND`).join(", ")}`],
});
let failed = 0;
try {
  for (const name of pages) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    const t0 = Date.now();
    await page.goto(`${base}/${name}/?auto`, { waitUntil: "load" });
    let r = null;
    try {
      await page.waitForFunction(() => window.__hb?.done === true, { timeout: 120000, polling: 250 });
      r = await page.evaluate(() => window.__hb);
    } catch {
      r = await page.evaluate(() => window.__hb ?? null);
    }
    const s = ((Date.now() - t0) / 1000).toFixed(1);
    const status = r?.done ? r.status : "timeout";
    if (status !== "pass") failed++;
    console.log(`${name}: ${status} in ${s} s (measured)${r?.reason ? `, ${r.reason}` : ""}`);
    for (const [id, c] of Object.entries(r?.checks ?? {})) console.log(`  ${c.status.padEnd(7)} ${id}${c.reason ? ` (${c.reason})` : ""}`);
    for (const [k, v] of Object.entries(r?.numbers ?? {})) console.log(`  ${k}: ${v}`);
    for (const n of r?.notes ?? []) console.log(`  note: ${n}`);
    for (const e of errors) console.log(`  page error: ${e}`);
    await page.close();
  }
} finally {
  await browser.close();
  rmSync(profile, { recursive: true, force: true });
  server.close();
}
process.exit(failed ? 1 : 0);
