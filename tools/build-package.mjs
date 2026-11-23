// build-package: wasm (when the package has a crate), the package's own
// scripts/prebuild.mjs when it has one, tsc, a copy of the wasm glue into
// dist/wasm and of src/generated into dist/generated, and a single file IIFE bundle with the wasm inlined
// for pages opened from file://.
// Usage: node tools/build-package.mjs <package-name> [GlobalName]
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { build } from "rolldown";

const [name, globalName] = process.argv.slice(2);
if (!name) {
  console.error("usage: node tools/build-package.mjs <package-name> [GlobalName]");
  process.exit(2);
}
const root = resolve(import.meta.dirname, "..");
const pkg = join(root, "packages", name);
const step = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: root });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
if (existsSync(join(root, "crates", name))) step("node", ["tools/build-wasm.mjs", name]);
if (existsSync(join(pkg, "scripts", "prebuild.mjs"))) step("node", [join(pkg, "scripts", "prebuild.mjs")]);
step("npx", ["tsc", "-p", join(pkg, "tsconfig.json")]);
for (const dir of ["wasm", "generated"]) if (existsSync(join(pkg, "src", dir))) cpSync(join(pkg, "src", dir), join(pkg, "dist", dir), { recursive: true });
const global = globalName ?? `Hackbuild${name.replace(/(^|-)(\w)/g, (_, _d, c) => c.toUpperCase())}`;
await build({
  input: join(pkg, "src", "single.ts"),
  external: ["three"],
  output: { file: join(pkg, "dist", `${name}.iife.js`), format: "iife", name: global, globals: { three: "THREE" }, codeSplitting: false },
  transform: { define: { "import.meta": "{}" } },
  logLevel: "warn",
});
const file = join(pkg, "dist", `${name}.iife.js`);
const size = statSync(file).size;
const gz = gzipSync(readFileSync(file), { level: 9 }).length;
console.log(`build-package: ${name}.iife.js ${size} bytes, ${gz} gzip (measured)`);
