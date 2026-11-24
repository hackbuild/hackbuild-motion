#!/usr/bin/env node
// Writes the vitest json report to the CI job summary: counts, then every
// test that did not run, named, so a suite skipped for a missing fixture or
// browser shows up as skipped and never reads as a pass.
// Usage: node tools/test-summary.mjs <vitest-report.json>
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const file = process.argv[2];
const out = [];
if (!file || !existsSync(file)) {
  out.push(`### tests`, "", `no vitest report at ${file}: the suite did not run.`, "");
  process.exitCode = 1;
} else {
  const r = JSON.parse(readFileSync(file, "utf8"));
  const root = resolve(import.meta.dirname, "..");
  const notRun = [];
  for (const f of r.testResults ?? []) {
    for (const a of f.assertionResults ?? []) {
      if (a.status !== "passed" && a.status !== "failed") notRun.push(`| ${a.status === "pending" ? "skipped" : a.status} | \`${relative(root, f.name)}\` | ${[...(a.ancestorTitles ?? []), a.title].join(" > ").replace(/\|/g, "/")} |`);
    }
  }
  out.push(
    "### tests",
    "",
    `${r.numTotalTests} tests: ${r.numPassedTests} passed, ${r.numFailedTests} failed, ${r.numPendingTests} skipped, ${r.numTodoTests ?? 0} todo (measured, vitest json report).`,
    "",
  );
  if (notRun.length) out.push("Not run, so not a pass:", "", "| status | file | test |", "|---|---|---|", ...notRun, "");
  else out.push("Every collected test ran.", "");
}
const text = out.join("\n");
console.log(text);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + "\n");
