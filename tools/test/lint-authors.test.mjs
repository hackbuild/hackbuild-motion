import { test } from "node:test";
import assert from "node:assert/strict";
import { cargoFails, changelogFails, OWNER, packageFails } from "../lint-authors.mjs";

test("package.json: the owner passes, an ai author or contributor fails", () => {
  assert.deepEqual(packageFails("p/package.json", JSON.stringify({ author: OWNER })), []);
  assert.equal(packageFails("p/package.json", JSON.stringify({ author: "Claude <noreply@anthropic.com>" })).length, 1);
  assert.equal(packageFails("p/package.json", JSON.stringify({ author: OWNER, contributors: ["Copilot"] })).length, 1);
  assert.equal(packageFails("p/package.json", JSON.stringify({ author: "Someone Else" })).length, 1);
});

test("Cargo.toml authors and changelog lines", () => {
  assert.deepEqual(cargoFails("c/Cargo.toml", `[package]\nauthors = ["${OWNER}"]\n`), []);
  assert.equal(cargoFails("c/Cargo.toml", `[package]\nauthors = ["ChatGPT"]\n`).length, 1);
  assert.deepEqual(cargoFails("c/Cargo.toml", `[package]\nauthors.workspace = true\n`), []);
  assert.equal(cargoFails("c/Cargo.toml", `[package]\nname = "x"\n`).length, 1);
  assert.equal(cargoFails("Cargo.toml", `[workspace.package]\nlicense = "MIT"\n`).length, 1);
  assert.equal(cargoFails("c/Cargo.toml", `[package]\nauthors = []\n`).length, 1);
  assert.equal(changelogFails("CHANGELOG.md", "- fix\nCo-Authored-By: x\n").length, 1);
  assert.equal(changelogFails("CHANGELOG.md", "- generated with a tool\n").length, 1);
  assert.deepEqual(changelogFails("CHANGELOG.md", "- memory: drop vectors\n"), []);
});
