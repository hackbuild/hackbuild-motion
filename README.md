# hackbuild-motion

Rigs, retargeting, IK, procedural and neural motion, avatars and lip sync for 3D characters on the web. Rust cores compiled to wasm, TypeScript bindings for three.js.

Status: scaffold, 2026-11-22. Packages land in `packages/` as they pass
their tests; the table below grows with them.

## Develop

    source ~/.nvm/nvm.sh && nvm use
    npm ci
    npm test

`npm ci` sets `core.hooksPath` to `.githooks`. Rules for every change are
in RULES.md and CONTRIBUTING.md.

## What is verified, and what is not

### Not verified by anything

- everything; nothing has landed yet.

## Licence

| path | licence |
|---|---|
| code | MIT (LICENSE) |
| README, CHANGELOG, docs | CC-BY-4.0 (LICENSES/CC-BY-4.0.txt), code samples also MIT |
