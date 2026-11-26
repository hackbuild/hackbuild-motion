import assert from "node:assert/strict";
import { test } from "node:test";
import { anchors, checkReadme, firstBlock, quickImports, sections, slug } from "../check-readme.mjs";
import { exportText, oneLine, typeText } from "../llms.mjs";

test("slug follows the GitHub heading rule", () => {
  assert.equal(slug("decodeAudio()"), "decodeaudio");
  assert.equal(slug("RECORDER\\_TYPES"), "recorder_types");
  assert.equal(slug("What is verified, and what is not"), "what-is-verified-and-what-is-not");
});

test("anchors counts repeats and explicit ids, and skips code", () => {
  const a = anchors("# a\n## a\n<a id=\"x\"></a>\n```\n# not\n```\n");
  assert.deepEqual([...a].sort(), ["a", "a-1", "x"]);
});

test("sections ignore headings inside fences and firstBlock takes the first ts block", () => {
  const md = "# t\n\nline\n\n## One\n\n```ts\n## inside\nconst x = 1;\n```\n\n## Two\n";
  const { list } = sections(md);
  assert.deepEqual(list.map((s) => s.title), ["One", "Two"]);
  assert.equal(firstBlock(list[0].body), "## inside\nconst x = 1;\n");
});

test("checkReadme names a missing template part and the not on npm line", () => {
  const out = checkReadme("ik", "# @hackbuild/ik\n\nline.\n\nnot on npm yet\n\n## Use\n");
  assert.ok(out.some((p) => p.includes('H2 "Use" is not in the template')));
  assert.ok(out.some((p) => p.includes('H2 "Quick start" is missing')));
  assert.ok(out.some((p) => p.includes("not on npm")));
});

test("typeText renders TypeDoc JSON types", () => {
  const ref = (name, typeArguments) => ({ type: "reference", name, ...(typeArguments ? { typeArguments } : {}) });
  assert.equal(typeText({ type: "union", types: [ref("A"), { type: "literal", value: null }] }), "A | null");
  assert.equal(typeText({ type: "array", elementType: { type: "union", types: [ref("A"), ref("B")] } }), "(A | B)[]");
  assert.equal(typeText(ref("Promise", [ref("Blob")])), "Promise<Blob>");
  const fn = { type: "reflection", declaration: { signatures: [{ kind: 4096, parameters: [{ name: "t", type: { type: "intrinsic", name: "string" } }], type: { type: "intrinsic", name: "boolean" } }] } };
  assert.equal(typeText(fn), "(t: string) => boolean");
});

test("exportText and oneLine give a signature and the first sentence", () => {
  const r = { kind: 64, name: "f", signatures: [{ kind: 4096, parameters: [{ name: "a", type: { type: "intrinsic", name: "number" }, flags: { isOptional: true } }], type: { type: "intrinsic", name: "void" } }] };
  assert.equal(exportText(r), "function f(a?: number): void");
  assert.equal(oneLine({ summary: [{ kind: "text", text: "Does a thing, e.g. this. Then more." }] }), "Does a thing, e.g. this.");
});

test("quickImports names each npm package once, without subpaths or node builtins", () => {
  const code = 'import { a } from "@hackbuild/ik";\nimport { b } from "@hackbuild/ik/three";\nimport * as THREE from "three";\nimport { c } from "./local";\nimport { d } from "node:fs";\n';
  assert.deepEqual(quickImports(code), ["@hackbuild/ik", "three"]);
});

test("checkReadme wants the mistakes list and the two extras after the template", () => {
  const out = checkReadme("ik", "# @hackbuild/ik\n\nline.\n\n## Size budget\n\n## Changelog and licences\n\n## Errors and troubleshooting\n\nnone\n");
  assert.ok(out.some((p) => p.includes("mistakes to avoid")));
  assert.ok(out.some((p) => p.includes("out of order")));
});
