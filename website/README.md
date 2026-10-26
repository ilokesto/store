# @ilokesto/store documentation

This private Next.js 16 / Fumadocs application belongs to the standalone Store
repository. Use Node.js 24.22.1 and pnpm 10.17.1 from the repository root.

## Development

```sh
pnpm install --frozen-lockfile
pnpm docs:dev
```

The Store landing and documentation are available at `/en/store` and
`/ko/store`. Current package documentation is served at `/en/store/next` and
`/ko/store/next`.

## Content and publication

Canonical bilingual MDX lives in `../docs`; the application consumes it
directly and does not keep a second copy. `source.config.ts` declares the Store
current and released collections. Active and candidate publication manifests
select only Store, while `lib/docs-links.ts` retains the complete public-package
classification needed to route foreign links to their owning repositories.

The released Store collection is generated from the immutable snapshots under
`../docs-publication/releases/store`. The private `@ilokesto/docs-runtime`
workspace contains only the released Store landing and demo, backed by the
registry Store alias and its recorded runtime closure.

The current and released Store index routes keep the existing landing, artwork,
short code panel, and interactive Store demo. Detailed pages retain the
documentation navigation and table of contents. Both locales preserve the
`/<language>/store` and `/<language>/store/next` route shapes.

## Verification

From the repository root, run:

```sh
pnpm docs:publication:verify
pnpm docs:typecheck
pnpm docs:build
pnpm docs:test
```

The website tests start a production server and exercise Store navigation,
search, Markdown, Open Graph images, responsive demo layout, and the actual
interactive counter in Chromium. Verified Inter variable-font subsets are
bundled with the website, so builds do not fetch fonts from Google.
The generated documentation site is local-only during this migration; do not
change hosting or deploy it.

Machine-readable routes include `/llms.txt`, `/llms-full.txt`, and
`/llms.mdx/docs/<language>/store/<page>/content.md`. Open Graph images use
`/og/docs/<language>/store/<page>/image.webp`. Development equivalents place
`/next` after `store`; released search and LLM endpoints exclude development
pages.
