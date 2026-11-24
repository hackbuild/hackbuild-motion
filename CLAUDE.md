@RULES.md

# CLAUDE.md

How an agent works in hackbuild-motion. RULES.md is absolute and wins over this file.

## Attribution

- Never add Claude, any AI assistant, or any AI or LLM tool as an author, co-author, contributor
  or credit: not in commits, trailers, comments, docs, CHANGELOG, package.json or Cargo.toml.
- Every package author is `Moheeb Zara <hackbuildvideo@gmail.com>`.
- `npm ci` sets `core.hooksPath` to `.githooks` through `prepare`; confirm with
  `git config core.hooksPath`. Never pass `--no-verify`.

## Toolchain on the owner's Mac

- `source ~/.nvm/nvm.sh && nvm use 22.18.0` before npm; the shell default is 22.12.
- Rust 1.95 (Homebrew) with the wasm32 target and wasm-pack. Playwright refuses macOS 12;
  browser tests use puppeteer-core with the system Chrome.
- Run test suites per package and long jobs in the background with a log; a tool call
  that runs about 10 minutes with no output gets killed.

## What lives here

    crates/      Rust cores: organic, rig, retarget, ik, gait, motion-net, motion-match, bake
    packages/    @hackbuild/organic, rig, retarget, ik, gait, motion-net, motion-match,
                 presence, avatar, avatar-host, lipsync, bake (TS wrappers and three.js
                 adapters)

The family plan and the research behind each package are kept outside this repository by the
owner. Packages in the sibling repos (hackbuild-motion, hackbuild-browser-ai, hackbuild-agents,
dog-simulator) share the contracts below; change a contract in all of them together.

## Shared contracts

- Normalized humanoid space: VRM 1.0 bone names, T pose, +Z forward, meters, feet at y = 0.
- Chain model for non humanoids: named limb chains with root, tip and pole.
- `Rng = () => number` injected everywhere; never `Math.random` in library code.
- Weights are never bundled: accept a URL, ArrayBuffer or File; state the weight licence.
- Every package: ESM only, exports map with types first, `sideEffects: false`, three.js as a
  peer, optional runtimes as optional peers behind subpath exports, a single file build that
  runs from file://, a README with "What is verified, and what is not".

## Order of checks before a commit

- `npm run typecheck`, `npm test`, `cargo test --workspace` when crates changed.
- `node tools/lint-voice.mjs` on the changed files.
- Commit and push to main after the gates pass (owner delegation, 2026-10-14). Never publish
  to npm; the npm org does not exist yet.
