# Store documentation

Read the repository root `AGENTS.md`. Canonical bilingual content is `../docs`;
immutable released inputs are under `../docs-publication/`.

- Preserve both locales, released and `/next` routes, current Store landing and
  demo, and the existing visual design.
- Keep discovery scoped to Store while classifying all eight public package links.
- The site is local-only for this migration. Do not deploy or change hosting.
- Run root `docs:publication:verify`, `docs:typecheck`, `docs:build`, and
  `docs:test`; browser-check navigation, language, search, and the counter demo.
