# Contributing

| rule | what it means |
|---|---|
| authors | people only. The git author of every commit is a person. No AI assistant, model or AI tool is an author, co-author, contributor or credit anywhere: messages, trailers, file headers, CHANGELOG, package metadata. |
| hooks | run `npm ci` once per clone. Its `prepare` script sets `core.hooksPath` to `.githooks`, so the commit-msg and pre-commit hooks run on every commit. Check with `git config core.hooksPath`; never pass `--no-verify`. |
| trailers | none of any kind. No Signed-off-by, Co-Authored-By, Reviewed-by or generated-with lines. The commit-msg hook rejects every `<word>-by:` and `<word>-with:` line, and CI repeats the check. |
| outside PRs | a maintainer squashes the PR and rewrites the message so it passes the hook. Your git author line is kept; that line is the credit. |
| commit subjects | imperative, lowercase, under 60 characters, no trailing punctuation, optional lowercase scope: `memory: merge near duplicate episodes`. |
| licence | inbound equals outbound: code is MIT (LICENSE), README, CHANGELOG and docs are CC-BY-4.0 with code samples also MIT (LICENSES/CC-BY-4.0.txt). No CLA, no DCO sign-off. |
| weights | never commit model weights or owner likeness files. Name each model's weight licence where it is referenced. |
| marks | a contribution grants no right to the hack.build name or logo (TRADEMARKS.md). |

Before you open a PR, run `npm test` and, when `crates/` changed,
`cargo test --workspace`. A harness that did not run is reported as not run.

## Package checks

`npm run build`, then `npm run lint:packages` packs every public package
into `.pack/` and checks each tarball: LICENSE, README.md and package.json
present and nothing outside the files allowlist (no sources, tests, maps
or dotfiles), ESM with types first in every exports condition,
`sideEffects: false`, every bare import a dependency or a peer (only
`@hackbuild` packages are dependencies, so three.js and every runtime is a
peer), publint and `attw --profile esm-only` clean, and the gzip size of
the main entry, each wasm and the single file build within 5 percent of
`tools/size-budget.json`. The "Size budget" table in each package README is
generated from that file: after a reviewed size change run
`node tools/lint-packages.mjs --update-budget` and commit both.
`node tools/check-browser.mjs` then loads every single file build from a
file:// page in headless Chrome. CI runs both, in the `packages` and
`browser` jobs, and names every skipped test in the `unit` job summary.

## Releasing

Nothing is published yet: the `@hackbuild` npm org does not exist.

| step | what |
|---|---|
| record a change | `npx changeset add`, pick the packages and the bump, write one plain line in the house voice; the file in `.changeset/` lands with the change |
| dry run | `npm run build && npm run release:dry`: the package checks, then each package, version, tarball and sha512, whether that version is on the registry, and the pending bumps |
| cut versions | `npx changeset version` bumps versions, updates internal ranges and writes each package CHANGELOG.md. It makes no commit (`commit: false`); commit it yourself under the subject rules, such as `packages: version for release` |
| release workflow | Actions, release, Run workflow: every ci gate, then the packed tarballs as an artifact and the dry run in the job summary. It has no publish step |

To turn publishing on, the owner:

1. Creates the `hackbuild` org on npmjs.com with 2FA, downloads the
   tarballs artifact of a green release run, and publishes each once by
   hand (`npm publish <file>.tgz --access public`) to claim the names.
2. Registers `.github/workflows/release.yml` as the trusted publisher of
   each package on npmjs.com, with the environment `release`.
3. Creates the GitHub environment `release` with the owner as required
   reviewer.
4. Adds a `publish` job to release.yml: `needs: pack`, `environment:
   release`, `permissions: id-token: write, contents: write`, download
   the artifact, `npm install -g npm@11.21.0` (trusted publishing needs
   npm 11.5.1 or later), `npx changeset publish`, then
   `git push --follow-tags` for the tags it creates. No token secret is
   needed or stored.
