// check-examples: serves _site on localhost, opens each example page with
// ?auto in a headful system Chrome on the real GPU (no SwiftShader), waits
// for the page's window.__hb result, and writes screenshots and results to
// .local/ (gitignored). Pages that need a microphone, a camera or a person
// report "not run" with the reason.
// HB_LOCAL_DIR serves a folder of the owner's local files at /local/ for
// this run only (never in _site, never published); a page's localQuery in
// pages.json is added to its URL when it is set.
// Usage: node tools/check-examples.mjs [page...]   (HB_CHROME overrides the browser)
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import puppeteer from "puppeteer-core";

const root = resolve(import.meta.dirname, "..");
const siteDir = join(root, "_site");
const site = JSON.parse(readFileSync(join(root, "examples", "pages.json"), "utf8"));
const only = process.argv.slice(2);
const pages = site.pages.filter((p) => !only.length || only.includes(p.name));
const shots = join(root, ".local", "shots");
mkdirSync(shots, { recursive: true });
if (!existsSync(join(siteDir, "index.html"))) throw new Error("check-examples: run node tools/build-examples.mjs first");

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm", ".png": "image/png" };
const server = createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path.endsWith("/")) path += "index.html";
  const local = process.env.HB_LOCAL_DIR && path.startsWith("/local/") ? resolve(process.env.HB_LOCAL_DIR) : null;
  const dir = local ?? siteDir;
  const file = join(dir, local ? path.slice("/local".length) : path);
  if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404).end("not found");
    return;
  }
  res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://localhost:${server.address().port}`;

// one headful run at a time across the sibling repos, so two runs never share the GPU
const lock = join(tmpdir(), "hackbuild-browser-check.lock");
for (let i = 0; ; i++) {
  try {
    mkdirSync(lock);
    break;
  } catch {
    if (i % 30 === 0) console.log("check-examples: waiting for another browser check run to finish");
    await new Promise((r) => setTimeout(r, 2000));
  }
}
const release = () => rmSync(lock, { recursive: true, force: true });
process.on("exit", release);
process.on("SIGINT", () => process.exit(130));

const chrome = process.env.HB_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: false,
  args: ["--autoplay-policy=no-user-gesture-required", "--window-size=1280,900"],
  defaultViewport: { width: 1280, height: 860 },
});
const version = await browser.version();
const results = [];
const probe = await browser.newPage();
await probe.goto(`${base}/`);
const gpu = await probe.evaluate(async () => {
  const gl = document.createElement("canvas").getContext("webgl2");
  const ext = gl?.getExtension("WEBGL_debug_renderer_info");
  const out = { webgl: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown", webgpu: null };
  if (navigator.gpu) {
    const a = await navigator.gpu.requestAdapter();
    if (a) out.webgpu = { vendor: a.info.vendor, architecture: a.info.architecture, device: a.info.device, description: a.info.description, shaderF16: a.features.has("shader-f16") };
  }
  return out;
});
const indexLinks = await probe.$$eval("#pages a", (as) => as.map((a) => a.getAttribute("href")));
await probe.close();
console.log(`chrome ${version}; webgl ${gpu.webgl}; webgpu ${JSON.stringify(gpu.webgpu)}`);

for (const p of pages) {
  const page = await browser.newPage();
  const log = [];
  page.on("pageerror", (e) => log.push(`pageerror: ${String(e.message ?? e).slice(0, 300)}`));
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warn") log.push(`${m.type()}: ${m.text().slice(0, 300)}`);
  });
  const t0 = Date.now();
  let r;
  try {
    const extra = process.env.HB_LOCAL_DIR && p.localQuery ? `&${p.localQuery}` : "";
    await page.goto(`${base}/${p.name}/?auto${extra}`, { waitUntil: "load", timeout: 60_000 });
    const loadMs = Date.now() - t0;
    await page.waitForFunction(() => window.__hb?.done === true, { timeout: (p.timeoutS ?? 60) * 1000, polling: 250 });
    r = await page.evaluate(() => window.__hb);
    r.numbers["page load ms (measured)"] = loadMs;
  } catch (e) {
    r = (await page.evaluate(() => window.__hb).catch(() => null)) ?? { page: p.name, numbers: {}, notes: [] };
    r.status = "fail";
    r.reason = `harness: ${String(e.message).split("\n")[0]}`;
  }
  r.wallMs = Date.now() - t0;
  r.log = log;
  await page.screenshot({ path: join(shots, `${p.name}.png`) }).catch(() => {});
  results.push(r);
  console.log(`${p.name}: ${r.status}${r.reason ? ` (${r.reason})` : ""} ${JSON.stringify(r.numbers)}`);
  for (const [k, c] of Object.entries(r.checks ?? {})) console.log(`  check ${k}: ${c.status} ${c.reason}`);
  for (const n of r.notes ?? []) console.log(`  note: ${n}`);
  for (const l of log.slice(0, 8)) console.log(`  ${l}`);
  await page.close();
}
await browser.close();
server.close();

const missing = site.pages.map((p) => `./${p.name}/`).filter((h) => !indexLinks.includes(h));
const report = { date: new Date().toISOString(), chrome: version, gpu, indexMissing: missing, results };
const prev = existsSync(join(root, ".local", "checks.json")) ? JSON.parse(readFileSync(join(root, ".local", "checks.json"), "utf8")) : null;
if (prev && only.length) report.results = [...prev.results.filter((x) => !only.includes(x.page)), ...results];
writeFileSync(join(root, ".local", "checks.json"), JSON.stringify(report, null, 1));
const count = (s) => report.results.filter((x) => x.status === s).length;
console.log(`index lists ${indexLinks.length} pages${missing.length ? `, missing ${missing.join(" ")}` : ""}`);
console.log(`pass ${count("pass")}, fail ${count("fail")}, not run ${count("not run")}`);
