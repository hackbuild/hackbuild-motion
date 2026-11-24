#!/usr/bin/env node
// CI job browser: every single file build (*.iife.js) in every packed
// tarball loads from a file:// page in headless Chrome with no network, sets
// its global, and throws nothing. A build that reads the THREE page global
// gets the devDependency three.js, bundled to a classic script here, loaded
// first; when three is not installed such a build is listed as not run,
// never as a pass. Run node tools/lint-packages.mjs first (it fills .pack/).
// Fails when no Chrome is found: this job exists to run in one.
// Usage: node tools/check-browser.mjs   (HB_CHROME overrides the browser)
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import puppeteer from "puppeteer-core";
import { rolldown } from "rolldown";

const root = resolve(import.meta.dirname, "..");
const PACK = join(root, ".pack");
const CANDIDATES = [process.env.HB_CHROME, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
const chrome = CANDIDATES.find((p) => p && existsSync(p));
if (!chrome) {
  console.error("check-browser: no chrome found, set HB_CHROME");
  process.exit(1);
}
if (!existsSync(PACK)) {
  console.error("check-browser: no .pack/, run node tools/lint-packages.mjs first");
  process.exit(1);
}

function untar(gz) {
  const buf = gunzipSync(gz);
  const files = new Map();
  for (let o = 0; o + 512 <= buf.length; ) {
    const name = buf.toString("utf8", o, o + 100).replace(/\0.*$/s, "");
    if (!name) break;
    const prefix = buf.toString("utf8", o + 345, o + 500).replace(/\0.*$/s, "");
    const size = parseInt(buf.toString("utf8", o + 124, o + 136).replace(/\0.*$/s, "").trim() || "0", 8);
    if (buf[o + 156] === 0 || buf[o + 156] === 48) files.set((prefix ? `${prefix}/${name}` : name).replace(/^package\//, ""), buf.subarray(o + 512, o + 512 + size));
    o += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

const work = mkdtempSync(join(tmpdir(), "hb-browser-"));
// three.js as the classic script a page would load before a three adapter
let threeShim = null;
try {
  const bundle = await rolldown({ input: join(root, "node_modules", "three", "build", "three.module.js"), logLevel: "silent" });
  const { output } = await bundle.generate({ format: "iife", name: "THREE", codeSplitting: false });
  await bundle.close();
  threeShim = join(work, "three.iife.js");
  writeFileSync(threeShim, output[0].code);
} catch {
  console.log("check-browser: three is not installed, builds that read THREE are not run");
}
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox", "--allow-file-access-from-files"] });
const rows = [];
let failed = 0;
try {
  for (const tgz of readdirSync(PACK).filter((f) => f.endsWith(".tgz")).sort()) {
    const files = untar(readFileSync(join(PACK, tgz)));
    for (const [path, bytes] of files) {
      if (!path.endsWith(".iife.js")) continue;
      const src = bytes.toString("utf8");
      const global = /^(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=/m.exec(src)?.[1];
      const dir = join(work, tgz.replace(/\.tgz$/, ""), path.replace(/[^/]+$/, ""));
      mkdirSync(dir, { recursive: true });
      const file = path.split("/").pop();
      writeFileSync(join(dir, file), bytes);
      const wantsThree = /\bTHREE\b/.test(src);
      const pre = wantsThree && threeShim ? `<script src="${pathToFileURL(threeShim).href}"></script>` : "";
      writeFileSync(join(dir, `${file}.html`), `<!doctype html><meta charset="utf-8">${pre}<script src="./${file}"></script>`);
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e.message ?? e) + (process.env.HB_DEBUG ? ` at ${e.stack}` : "")));
      await page.setRequestInterception(true);
      page.on("request", (r) => (r.url().startsWith("file:") || r.url().startsWith("data:") ? r.continue() : (errors.push(`network request ${r.url()}`), r.abort())));
      await page.goto(pathToFileURL(join(dir, `${file}.html`)).href, { waitUntil: "load" });
      const keys = global ? await page.evaluate((g) => (window[g] && typeof window[g] === "object" ? Object.keys(window[g]).length : -1), global) : -1;
      await page.close();
      const needs = errors.find((e) => /THREE is not defined|reading '[^']+'\) of undefined.*THREE/.test(e));
      let status;
      if (needs && !threeShim) status = "not run: needs a THREE page global";
      else if (errors.length) {
        status = `fail: ${errors.join("; ")}`;
        failed++;
      } else if (keys <= 0) {
        status = `fail: global ${global ?? "(none found)"} not set`;
        failed++;
      } else status = `pass: ${global} with ${keys} exports${wantsThree && threeShim ? ", three.js loaded first" : ""}`;
      rows.push(`| \`${tgz}\` | \`${path}\` | ${status} |`);
      console.log(`check-browser: ${tgz} ${path} ${status}`);
    }
  }
} finally {
  await browser.close();
  rmSync(work, { recursive: true, force: true });
}
const text = ["### single file builds from file://", "", `headless ${chrome}, no network (measured).`, "", "| tarball | file | result |", "|---|---|---|", ...rows, ""].join("\n");
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + "\n");
console.log(`check-browser: ${rows.length} builds, ${failed} failures`);
process.exitCode = failed || !rows.length ? 1 : 0;
