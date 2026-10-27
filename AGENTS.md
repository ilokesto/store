# @ilokesto/store

This repository owns the framework-agnostic Store library.
Use Node 24.22.1 and pnpm 10.17.1 from this repository root.

- Keep the public API minimal and framework-agnostic; preserve compatibility.
- Source, behavior tests, and type tests live in `src/` and `type-tests/`.
- Maintain installation, basic usage, and limitations in `README.md` and
  `README.ko.md`. There is no official documentation website.
- Keep version, exports, runtime behavior, and migration history intact.
- Only this library and private workspaces in this repository may use workspace
  links. Other ilokesto libraries are registry dependencies.
- Run `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm test:typecheck`, and
  `pnpm test:tooling`.
- Repository setup alone does not require a Changeset. Consumer-facing changes
  require a root Changeset.
- `release:verify --sha <full-SHA>` is read-only. Main updates maintain the
  Changesets release PR; its merge publishes only the exact successful Verify
  artifact through GitHub Actions. Never publish locally.
