#!/usr/bin/env node
// llms: the files a coding agent reads. The same tool in each hackbuild
// library repository; the repository specific parts are REPO, SITE and
// SUMMARY below. Generated, never hand edited:
//
//   packages/<pkg>/llms.md   shipped in each tarball: purpose, install,
//                            every public export's signature with its one
//                            line doc, two or three minimal examples, and
//                            the mistakes an agent makes.
//   docs/llms.txt            llmstxt.org format: an H1, a one paragraph
//                            blockquote, then sections of links to every
//                            package's llms.md and quick start. The Pages
//                            site serves it at /llms.txt.
//   docs/llms-full.txt       llms.txt followed by every llms.md.
//
// Inputs: the TypeDoc JSON in .local/api/<pkg>.json (node tools/api-docs.mjs
// writes it), each README (one line, "What it does", "Install", ts blocks of
// "Concepts", "Errors and troubleshooting" with its "### mistakes to avoid"
// list, which is per package) and examples/<pkg>/quick.ts.
// Usage: node tools/llms.mjs [--check]
//   --check  fail when a generated file differs from what is on disk
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { firstBlock, sections, SHORT, SITE } from "./check-readme.mjs";

const root = resolve(import.meta.dirname, "..");
const check = process.argv.includes("--check");
export const REPO = "hackbuild-motion";
export const SUMMARY =
  "hackbuild-motion is a set of ESM packages under @hackbuild for moving 3D characters on the web: springs and seeded noise, a humanoid bone mapper, inverse kinematics, procedural legged gait, clip retargeting with BVH and VMD readers, a runtime for a quadruped motion network, motion matching, gaze, blink and idle presence, avatar loading for VRM, GLB and FBX, a three.js stage host, lit scenes, lip sync, a GLB and clip baker, and Vue and custom element views. The cores are Rust compiled to wasm, three.js is a peer, model and weight files are never bundled and load from a URL or a file you give, and every package has a single file build that runs from file://.";
const NOTE = `Every package is ESM only with types included, installs from npm under @hackbuild, and is MIT. Each llms.md below lists the package's exports with signatures, minimal examples and the mistakes to avoid. Code: https://github.com/hackbuild/${REPO}`;

const names = () => readdirSync(join(root, "packages")).filter((n) => existsSync(join(root, "packages", n, "package.json"))).sort();

// ---------------------------------------------------------------- types

const K = { Project: 1, Module: 2, Enum: 8, EnumMember: 16, Variable: 32, Function: 64, Class: 128, Interface: 256, Constructor: 512, Property: 1024, Method: 2048, CallSignature: 4096, IndexSignature: 8192, ConstructorSignature: 16384, Accessor: 262144, GetSignature: 524288, TypeAlias: 2097152, Reference: 4194304 };
const PREC = { union: 1, conditional: 0, intersection: 2, array: 4 };

/** A TypeDoc JSON type as TypeScript text. */
export function typeText(t, depth = 0) {
  if (!t) return "unknown";
  const wrap = (x, min) => (PREC[x?.type] !== undefined && PREC[x.type] < min ? `(${typeText(x, depth)})` : typeText(x, depth));
  switch (t.type) {
    case "intrinsic":
    case "unknown":
    case "inferred":
      return t.name;
    case "literal":
      return t.value === null ? "null" : typeof t.value === "object" ? `${t.value.negative ? "-" : ""}${t.value.value}n` : JSON.stringify(t.value);
    case "reference":
      return t.name + (t.typeArguments?.length ? `<${t.typeArguments.map((a) => typeText(a, depth)).join(", ")}>` : "");
    case "array":
      return `${wrap(t.elementType, 3)}[]`;
    case "union":
      return t.types.map((x) => wrap(x, 1)).join(" | ");
    case "intersection":
      return t.types.map((x) => wrap(x, 2)).join(" & ");
    case "tuple":
      return `[${(t.elements ?? []).map((e) => typeText(e, depth)).join(", ")}]`;
    case "namedTupleMember":
      return `${t.name}${t.isOptional ? "?" : ""}: ${typeText(t.element, depth)}`;
    case "optional":
      return `${typeText(t.elementType, depth)}?`;
    case "rest":
      return `...${typeText(t.elementType, depth)}`;
    case "typeOperator":
      return `${t.operator} ${wrap(t.target, 3)}`;
    case "indexedAccess":
      return `${wrap(t.objectType, 3)}[${typeText(t.indexType, depth)}]`;
    case "query":
      return `typeof ${typeText(t.queryType, depth)}`;
    case "conditional":
      return `${wrap(t.checkType, 1)} extends ${typeText(t.extendsType, depth)} ? ${typeText(t.trueType, depth)} : ${typeText(t.falseType, depth)}`;
    case "mapped":
      return `{ ${t.readonlyModifier === "+" ? "readonly " : ""}[${t.parameter} in ${typeText(t.parameterType, depth)}${t.nameType ? ` as ${typeText(t.nameType, depth)}` : ""}]${t.optionalModifier === "+" ? "?" : t.optionalModifier === "-" ? "-?" : ""}: ${typeText(t.templateType, depth)} }`;
    case "templateLiteral":
      return "`" + t.head + t.tail.map(([x, s]) => "${" + typeText(x, depth) + "}" + s).join("") + "`";
    case "predicate":
      return `${t.asserts ? "asserts " : ""}${t.name}${t.targetType ? ` is ${typeText(t.targetType, depth)}` : ""}`;
    case "reflection":
      return declText(t.declaration, depth + 1);
    default:
      return "unknown";
  }
}

const tparams = (tp) => (tp?.length ? `<${tp.map((p) => p.name + (p.type ? ` extends ${typeText(p.type)}` : "") + (p.default ? ` = ${typeText(p.default)}` : "")).join(", ")}>` : "");
const param = (p, depth) => `${p.flags?.isRest ? "..." : ""}${p.name}${p.flags?.isOptional || p.defaultValue !== undefined ? "?" : ""}: ${typeText(p.type, depth)}`;
const sigText = (s, depth = 0, arrow = false) => `${arrow && s.kind === K.ConstructorSignature ? "new " : ""}${tparams(s.typeParameters)}(${(s.parameters ?? []).map((p) => param(p, depth)).join(", ")})${arrow ? " => " : ": "}${typeText(s.type, depth)}`;

/** An object type literal or function type from a reflection declaration. */
function declText(d, depth) {
  if (!d) return "{}";
  const members = memberLines(d, depth);
  if (d.signatures?.length && !members.length) return d.signatures.length === 1 ? sigText(d.signatures[0], depth, true) : `{ ${d.signatures.map((s) => (s.kind === K.ConstructorSignature ? "new " : "") + sigText(s, depth)).join("; ")} }`;
  const all = [...(d.signatures ?? []).map((s) => (s.kind === K.ConstructorSignature ? "new " : "") + sigText(s, depth)), ...members];
  if (!all.length) return "{}";
  return `{ ${all.join("; ")} }`;
}

/** Member lines of an interface, class or object type, without docs. */
function memberLines(d, depth = 0) {
  const out = [];
  for (const s of d.indexSignatures ?? (d.indexSignature ? [d.indexSignature] : [])) out.push(`[${(s.parameters ?? []).map((p) => param(p, depth)).join(", ")}]: ${typeText(s.type, depth)}`);
  for (const c of d.children ?? []) {
    if (c.flags?.isPrivate || c.flags?.isProtected || c.name.startsWith("#")) continue;
    const ro = c.flags?.isReadonly ? "readonly " : "";
    const st = c.flags?.isStatic ? "static " : "";
    const opt = c.flags?.isOptional ? "?" : "";
    if (c.kind === K.Method) for (const s of c.signatures ?? []) out.push(`${st}${c.name}${opt}${sigText(s, depth)}`);
    else if (c.kind === K.Accessor) out.push(`${st}${c.setSignature ? "" : "readonly "}${c.name}: ${typeText(c.getSignature?.type ?? c.setSignature?.parameters?.[0]?.type, depth)}`);
    else if (c.kind === K.Constructor) for (const s of c.signatures ?? []) out.push(`constructor(${(s.parameters ?? []).map((p) => param(p, depth)).join(", ")})`);
    else out.push(`${st}${ro}${c.name}${opt}: ${typeText(c.type, depth)}`);
  }
  return out;
}

const plain = (parts) => (parts ?? []).map((p) => (p.kind === "inline-tag" ? p.text : p.text)).join("").replace(/\s+/g, " ").trim();

/** The first sentence of a comment summary. */
export function oneLine(comment) {
  const s = plain(comment?.summary);
  if (!s) return "";
  const m = /^(.+?\.)(\s|$)/.exec(s.replace(/\b(e\.g|i\.e|etc|vs)\./g, "$1\u0000"));
  return (m ? m[1] : s).replace(/\u0000/g, ".");
}

const docOf = (r) => r.comment ?? r.signatures?.find((s) => s.comment)?.comment ?? r.getSignature?.comment;

/** One export as TypeScript declaration text. */
export function exportText(r) {
  const block = (head, d) => {
    const lines = memberLines(d);
    return lines.length ? `${head} {\n${lines.map((l) => `  ${l};`).join("\n")}\n}` : `${head} {}`;
  };
  switch (r.kind) {
    case K.Function:
      return (r.signatures ?? []).map((s) => `function ${r.name}${sigText(s)}`).join("\n");
    case K.Variable:
      return `${r.flags?.isConst ? "const" : "let"} ${r.name}: ${typeText(r.type)}`;
    case K.TypeAlias:
      return `type ${r.name}${tparams(r.typeParameters)} = ${typeText(r.type)}`;
    case K.Interface: {
      const ext = r.extendedTypes?.length ? ` extends ${r.extendedTypes.map((t) => typeText(t)).join(", ")}` : "";
      return block(`interface ${r.name}${tparams(r.typeParameters)}${ext}`, r);
    }
    case K.Class: {
      const ext = r.extendedTypes?.length ? ` extends ${r.extendedTypes.map((t) => typeText(t)).join(", ")}` : "";
      return block(`class ${r.name}${tparams(r.typeParameters)}${ext}`, r);
    }
    case K.Enum:
      return `enum ${r.name} { ${(r.children ?? []).map((c) => `${c.name} = ${typeText(c.type)}`).join(", ")} }`;
    default:
      return `${r.name}: ${typeText(r.type)}`;
  }
}

/** Entry modules of a TypeDoc project: [[import path, reflection]]. */
function modules(project, pkg) {
  const mods = project.children?.some((c) => c.kind === K.Module) ? project.children.filter((c) => c.kind === K.Module) : [project];
  return mods.map((m) => [m === project || m.name === "index" ? pkg : `${pkg}/${m.name}`, m]);
}

// ---------------------------------------------------------------- readme

function readme(name) {
  const md = readFileSync(join(root, "packages", name, "README.md"), "utf8");
  const { lead, list } = sections(md);
  const paras = lead.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const body = (t) => (list.find((s) => s.title === t)?.body ?? "").trim();
  return { line: (paras[1] ?? "").replace(/\s*\n\s*/g, " "), body };
}

/** Rewrite README relative links to absolute site or repository links. */
function absLinks(text, name) {
  return text.replace(/\]\((?!https?:|#|mailto:)([^)\s]+)\)/g, (_, p) => {
    const url = new URL(p, `https://github.com/hackbuild/${REPO}/blob/main/packages/${name}/`).href;
    const api = /\/blob\/main\/docs\/api\/([^/]+)\/([^#]+)\.md(#.*)?$/.exec(url);
    if (api) return `](${SITE}docs/${api[1]}/api/${api[2] === "README" ? "" : `${api[2]}.html`}${api[3] ?? ""})`;
    const rd = /\/blob\/main\/packages\/([^/]+)\/README\.md(#.*)?$/.exec(url);
    if (rd) return `](${SITE}docs/${rd[1]}/llms.md)`;
    return `](${url})`;
  });
}

function tsBlocks(text, n) {
  const out = [];
  for (const m of text.matchAll(/^```(ts|typescript|js)[^\n]*\n([\s\S]*?)^```\s*$/gm)) if (out.length < n) out.push(m[2].trim());
  return out;
}

/** Rows of the README errors table as "message: what to do". */
function errorRows(text) {
  const out = [];
  for (const line of text.split("\n")) {
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length >= 3 && !/^-+$/.test(cells[0]) && cells[0] !== "message") out.push(`${cells[0]} (${cells[1]}): ${cells[2]}`);
  }
  return out;
}

/** Bullets of the "### mistakes to avoid" list in a README section, each joined to one line. */
function mistakeList(text) {
  const m = /^### mistakes to avoid\n([\s\S]*?)(?=^#{1,3} |$(?![\s\S]))/m.exec(text);
  if (!m) return [];
  return m[1].split(/\n(?=- )/).map((b) => b.trim()).filter((b) => b.startsWith("- ")).map((b) => b.slice(2).replace(/\s*\n\s*/g, " "));
}

// ---------------------------------------------------------------- output

/** The llms.md of one package. */
export function llmsMd(name) {
  const pkg = `@hackbuild/${name}`;
  const jsonFile = join(root, ".local", "api", `${name}.json`);
  if (!existsSync(jsonFile)) throw new Error(`llms: ${jsonFile} is missing. fix: node tools/api-docs.mjs ${name}`);
  const project = JSON.parse(readFileSync(jsonFile, "utf8"));
  const r = readme(name);
  const out = [`# ${pkg}`, "", `> ${r.line}`, "", `Generated by tools/llms.mjs from the TypeDoc JSON, the README and the examples of ${REPO}. Human docs: ${SITE}docs/${name}/`, ""];
  if (SHORT[name]) out.push(`Deprecated: use @hackbuild/${SHORT[name]} (${SITE}docs/${SHORT[name]}/llms.md).`, "");
  const what = r.body("What it does");
  if (what) out.push("## Purpose", "", absLinks(what, name), "");
  out.push("## Install", "", absLinks(r.body("Install"), name), "");
  out.push("## Exports", "");
  for (const [path, mod] of modules(project, pkg)) {
    const kids = (mod.children ?? []).filter((c) => c.kind !== K.Reference).sort((a, b) => a.name.localeCompare(b.name));
    if (!kids.length) continue;
    out.push(`### ${path}`, "");
    for (const c of kids) out.push("```ts", exportText(c), "```", "", oneLine(docOf(c)) || "(no summary)", "");
  }
  const quick = join(root, "examples", name, "quick.ts");
  const examples = [];
  if (existsSync(quick)) examples.push(["quick start", readFileSync(quick, "utf8").trim()]);
  for (const b of tsBlocks(r.body("Concepts"), 3 - examples.length)) examples.push(["from the concepts", b]);
  if (examples.length) {
    out.push("## Examples", "");
    for (const [t, code] of examples) out.push(`### ${t}`, "", "```ts", code, "```", "");
  }
  const errText = r.body("Errors and troubleshooting");
  const mistakes = mistakeList(errText);
  if (mistakes.length) out.push("## Mistakes to avoid", "", ...mistakes.map((m) => `- ${m}`));
  const errs = errorRows(errText);
  if (errs.length) out.push("", "## Errors this package throws", "", ...errs.map((e) => `- ${e}`));
  return absLinks(out.join("\n"), name).trimEnd() + "\n";
}

/** docs/llms.txt in the llmstxt.org format. */
export function llmsTxt(list) {
  const out = [`# ${REPO}`, "", `> ${SUMMARY}`, "", NOTE, "", "## Packages", ""];
  for (const n of list) out.push(`- [@hackbuild/${n}](${SITE}docs/${n}/llms.md): ${readme(n).line}`);
  out.push("", "## Quick starts", "");
  for (const n of list) if (existsSync(join(root, "examples", n, "quick.ts"))) out.push(`- [${n} quick start](${SITE}docs/${n}/quick.ts): the smallest program for @hackbuild/${n}, typechecked in CI`);
  out.push("", "## Docs", "", `- [getting started](${SITE}docs/): install, the first program, and how the packages fit`, `- [concepts](${SITE}docs/concepts.html): the normalized humanoid space, loading the wasm cores, three.js as a peer, files you give, file:// builds, labels on numbers`, `- [examples](${SITE}): the live demo pages`, "", "## Optional", "");
  for (const n of list) out.push(`- [@hackbuild/${n} API reference](${SITE}docs/${n}/api/): every export, generated by TypeDoc`);
  out.push(`- [llms-full.txt](${SITE}llms-full.txt): this file and every llms.md in one file`);
  return out.join("\n") + "\n";
}

function main() {
  const list = names();
  const files = new Map();
  const mds = [];
  for (const n of list) {
    const md = llmsMd(n);
    mds.push(md);
    files.set(join("packages", n, "llms.md"), md);
  }
  const txt = llmsTxt(list);
  files.set(join("docs", "llms.txt"), txt);
  files.set(join("docs", "llms-full.txt"), [txt, ...mds].join("\n---\n\n"));
  let stale = 0;
  for (const [rel, text] of files) {
    const file = join(root, rel);
    const now = existsSync(file) ? readFileSync(file, "utf8") : null;
    if (now === text) continue;
    if (check) {
      stale += 1;
      console.error(`llms: ${rel} is stale. fix: node tools/api-docs.mjs && node tools/llms.mjs`);
    } else writeFileSync(file, text);
  }
  console.log(`llms: ${files.size} files, ${check ? `${stale} stale` : "written"}`);
  process.exitCode = stale ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) main();
