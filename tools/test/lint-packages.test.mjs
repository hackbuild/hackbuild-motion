// The pure rules behind tools/lint-packages.mjs: the tarball files
// allowlist, types first in exports, and the bare import scan.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bareImports, fileFails, typesFirstFails } from "../lint-packages.mjs";

const base = ["package.json", "README.md", "LICENSE"];

test("files: the required three plus dist pass, anything else fails", () => {
  assert.deepEqual(fileFails([...base, "dist/index.js", "dist/index.d.ts", "dist/wasm/x_bg.wasm", "dist/x.iife.js"]), []);
  assert.equal(fileFails(["package.json", "dist/index.js"]).length, 2);
  assert.equal(fileFails([...base, "src/index.ts"]).length, 1);
  assert.equal(fileFails([...base, "dist/test/a.test.js"]).length, 1);
  assert.equal(fileFails([...base, "dist/index.js.map"]).length, 1);
  assert.equal(fileFails([...base, "dist/wasm/.gitignore"]).length, 1);
  assert.equal(fileFails([...base, "tsconfig.tsbuildinfo"]).length, 1);
  assert.equal(fileFails([...base, "weights/model.onnx"]).length, 1);
});

test("exports: types must come first in every condition", () => {
  assert.deepEqual(typesFirstFails({ ".": { types: "./a.d.ts", import: "./a.js" }, "./wasm": "./a.wasm" }), []);
  assert.equal(typesFirstFails({ ".": { import: "./a.js", types: "./a.d.ts" } }).length, 1);
  assert.equal(typesFirstFails({ ".": { import: "./a.js" } }).length, 1);
});

test("imports: bare specifiers reduce to package names", () => {
  const code = `import a from "three"; import { b } from "three/addons/x.js"; export * from "./c.js";
    const d = await import("@mlc-ai/web-llm"); import "node:fs"; import("https://esm.sh/x"); import type { E } from "@hackbuild/rig/bones";`;
  assert.deepEqual([...bareImports(code)].sort(), ["@hackbuild/rig", "@mlc-ai/web-llm", "three"]);
});
