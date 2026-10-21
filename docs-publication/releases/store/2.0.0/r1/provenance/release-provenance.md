# Current release provenance and documentation freeze audit

Audit date: 2026-09-27 (fresh npm and GitHub observations). Scope: the current published channel selected by governance for each of the eight public packages. No source, tag, branch, registry object, or workflow was changed.

## Decision

Freeze each release from two immutable inputs:

1. the complete npm tarball, addressed by the registry SHA-512 integrity below;
2. the immutable release corpus at `packages/<name>/docs/**`, `README.md`, and `README.ko.md` from Git commit `ecd9709b76d1976ec86865314e85b916f220c818` (`docs: polish package READMEs (#99)`); and
3. a separate, explicit `docsRevision` for public rendering where release-time prose is demonstrably stale. The revision must preserve the release corpus as historical evidence and must be proven package-runtime-source identical to `ecd9709…`.

Do **not** use the versioning commit `72df13a23290224e128d98167bed8ff1a769548c`, a moving `main`, or a workspace import as the release boundary. The only Publish run, [36302267041](https://github.com/ilokesto/ilokesto/actions/runs/36302267041), checked out `ecd9709…`, built, published, and created the annotated tags. Between the versioning commit and that checkout, PR #96 changed every package's canonical `docs/index*.mdx`, PR #98 added the dispatch-only publisher, and PR #99 changed every README (and added Utilinent's Korean README). All eight tags resolve to `ecd9709…`, as do their remote peeled refs.

This is strong operational and content evidence, but not cryptographic source provenance: npm exposes neither `gitHead` nor provenance attestations for any of these eight versions. Preserve that limitation in every receipt.

The raw release corpus is not automatically accurate public copy. Store and State were published after their index source-basis paragraphs had become stale, and Fetcher's channel wording is ambiguous after `1.0.0` was placed on `beta`. Preserve `ecd9709…` as `releaseSource`, but do not serve those paragraphs unchanged.

## Per-package evidence

`Docs` counts the complete canonical `packages/<name>/docs` tree at the publish checkout; each corpus also has two release READMEs. `Tree` is the Git tree object for that docs directory. Every npm tarball contains the two READMEs and both are byte-identical to the corresponding blobs at `ecd9709…`; no tarball contains the larger `docs/` tree.

| Package/channel | Published (UTC); npm payload | Tarball SRI (SHA-512) | Canonical docs at publish checkout | Published dependency contract | Exports |
|---|---|---|---|---|---|
| `@ilokesto/store@2.0.0` (`latest`) | `2026-09-27T07:12:38.435Z`; 5 files, 24,936 B; SHA-1 `22f9d8021a38e4ee7f8a71e206fdc32d16063a77` | `sha512-ezW/FizFYp6yV/cwdIi7KrDN01sSRS38CC48ozkwm6UyIs0N7dNjaWaZOlVmZCieHWm9pQKxD1Z+7EVnYet82A==` | 34 MDX (17 EN/17 KO) + 5 `meta.json`; tree `26f0dd70ed6eae748b19d066177b9215f33fd1cf` | no dependencies or peers | `.` -> `dist/index.{js,d.ts}` |
| `@ilokesto/state@2.0.0` (`latest`) | `2026-09-27T07:16:00.412Z`; 109 files, 179,701 B; SHA-1 `a5fc732da5369789701551d6e9dcb3f6b70ea79f` | `sha512-GOg2Ovmq8qqqQfozizHhQ4hV+kWQ8DmmYmKsQJCMOZpAfG2nDqt5j8sl2jMJ0PdHWr13UJQ+ZQpTDH8Qy5m7IQ==` | 60 MDX (30/30) + 7 meta; tree `0857ea83168d0963cd10b34569a35a6f875aa69b` | dep `@ilokesto/store ^2.0.0`; optional peers `@angular/core ^17\|^18\|^19\|^20\|^21`, `immer ^9.0.12`, `react ^18\|^19`, `solid-js ^1.7\|^2`, `svelte ^4\|^5`, `vue ^3` | `.`, `./adaptor`, `./react`, `./vue`, `./angular`, `./svelte`, `./solid`, `./middleware`, `./utils`, `./package.json`; JS/type targets as declared, with `default` on code entries |
| `@ilokesto/form@2.0.0` (`latest`) | `2026-09-27T07:12:48.604Z`; 25 files, 432,313 B; SHA-1 `287cef128bf55fdce2864f39c0f644f2a45fc179` | `sha512-+cwHb++t/kuCd8j1IHngHzlTx79GLKlaAjPJPyCvyl96FogzGkV+PYU7zWHntMj0i9RXumGYsw3fC4X6EPwMuQ==` | 52 MDX (26/26) + 5 meta; tree `4e259ded6563a50ea41d0ad245ff78a669065554` | deps `@ilokesto/store 2.0.0`, `immer 11.1.8`; optional peers `react ^19`, `solid-js ^1.9`, `svelte ^5`, `vue ^3.5` | `.`, `./react`, `./vue`, `./solid`, `./svelte`, `./package.json` |
| `@ilokesto/overlay@2.0.0` (`latest`) | `2026-09-27T07:13:32.739Z`; 25 files, 46,033 B; SHA-1 `c2e79e51da3726ef03c545b9f59a99cd9e376b73` | `sha512-g3nHsweF+cl51vG95oq+C0dE5WA+G2HAXBrnrBUq5IdU2NfkiQ1EbWEsELl1/EPMFwsfnOiguaC0vT8PB/Z/sg==` | 40 MDX (20/20) + 5 meta; tree `b1c16ee0772aebfea47770759910f1f02a4e644f` | dep `@ilokesto/store ^2.0.0`; peer `react ^18\|^19` | `.` -> `dist/index.{js,d.ts}` |
| `@ilokesto/modal@2.0.0` (`latest`) | `2026-09-27T07:12:53.878Z`; 6 files, 134,962 B; SHA-1 `c50583525a876d997fc1d2bc7696a278f2a99182` | `sha512-ORXDt6x2uJPFGu2CZgsNM+mLonzhpFfZH8d7/oSS7gTEmIsLaxMdfyXldb5gsDLNT1UxJyOVfrgkEU7af8ckQw==` | 12 MDX (6/6) + 1 meta; tree `8c48d81d3b1d6d371989bda2200a26821a7c0fd5` | dep `@ilokesto/overlay ^2.0.0`; peers `react ^18\|^19`, `react-dom ^18\|^19` | `.` -> `dist/index.{js,d.ts}` |
| `@ilokesto/toast@2.0.0` (`latest`) | `2026-09-27T07:12:55.788Z`; 29 files, 53,764 B; SHA-1 `a96bf7b4437a1c8d8923b4f2a24a935e4fef858d` | `sha512-n9nRqwC97SN/8ruE5mguRiT5EWg+Qi57zEAvx7tbkPoyhP9FbRAVDAJKq2+kOUrWTn2WpAei6zMMCxV20c9G9g==` | 12 MDX (6/6) + 1 meta; tree `c3ff43ba360db7db09b41da194b3cc230470b16f` | deps `@ilokesto/overlay ^2.0.0`, `@ilokesto/store ^2.0.0`; peers `react ^18\|^19`, `react-dom ^18\|^19` | `.` -> `dist/index.{js,d.ts}` |
| `@ilokesto/fetcher@1.0.0` (`beta`; `latest` remains `1.0.0-beta.1`) | `2026-09-27T07:13:02.691Z`; 13 files, 73,168 B; SHA-1 `45d1f61288d27d372ecb49687ada13ba7adfedcd` | `sha512-fzhRTXxkss9U9hwcxx4iJ9a2pStg4pBPQOvw3g3xdoR3wHoY+DF1mBFRTV5yVo/bQf9giuYF1SdPiULqxt3k9A==` | 44 MDX (22/22) + 5 meta; tree `32bb8477d80a4cdeddc5d555c451ece383ec4daa` | peer `ky ^1.14.0`; Node `>=22` | `.`, `./core`, `./openapi` |
| `@ilokesto/utilinent@1.2.0` (`latest`) | `2026-09-27T07:13:04.748Z`; 123 files, 100,136 B; SHA-1 `8d33965d65ed0126e8e12289209a6a06d56fb3c0` | `sha512-qyiB9JvHFqX/eIYz3CXEI5BNJ87dGTMWTAxsnkfOGn9bX5l3QsKKa40ZMqOxCel3lPn1bbU0iFbdLNS4OmXI7A==` | 84 MDX (42/42) + 5 meta; tree `c71af0b0bb71c214a76f4fef0efee90f6d1e2a1c` | peer `react >=18.0.0` | `.`, `./hooks` |

All export targets above were read from the extracted artifact manifests, not workspace manifests. pnpm rewrote only internal dependency protocols during packing: State/Overlay/Modal/Toast changed `workspace:^2.0.0` to `^2.0.0`; Form changed `workspace:*` to exact `2.0.0`. No other source/artifact manifest fields differ.

## Source and tag provenance

- Exact publish checkout and release-doc source: `ecd9709b76d1976ec86865314e85b916f220c818`.
- Version/changelog commit: `72df13a23290224e128d98167bed8ff1a769548c`; it is an ancestor, but it is **not** the publish checkout or the final docs corpus.
- Publisher introduction: `7e75c9e690343041e1a7fd3e8cb42d909f5fb838` (#98), parent of the publish checkout.
- All eight annotated tag objects were made by `github-actions[bot]` and peel to `ecd9709…`; local and `git ls-remote --tags origin` agree.
- The sole Publish workflow run reports `headSha: ecd9709…`, `workflow_dispatch`, success, checkout/build/publish/tag steps, from `07:10:07Z` through `07:12:08Z`.
- Extracted artifact manifests and both README bytes match that checkout (apart from the expected workspace-protocol rewrites above). Seven already-built workspace `dist` trees were byte-identical to the tarballs; Fetcher's publish-checkout source was freshly built in `/tmp` and its `dist` was byte-identical to the tarball. This supports, but cannot replace, missing registry provenance.
- Registry metadata has two verified npm registry signatures per ilokesto artifact. An isolated install followed by `npm audit signatures` verified all 13 packages in the React closure below. The command found provenance attestations only for third-party `immer@11.1.8`, `react@19.2.8`, and `react-dom@19.2.8`; direct attestation endpoint requests for all eight ilokesto versions returned HTTP 404.

## Canonical documentation freeze

Archive complete Git objects, not rendered pages and not only npm READMEs:

```text
commit = ecd9709b76d1976ec86865314e85b916f220c818
paths  = packages/<name>/docs/**
         packages/<name>/README.md
         packages/<name>/README.ko.md
```

For each package, store an immutable receipt containing the commit, docs tree ID from the table, the two README blob IDs below, every archived path/byte-count/SHA-256, and the npm tarball identity/inventory/hash. Generate renderer frontmatter, routing, locale links, and version notices outside the archived bytes. Fail closed if any receipt, tree, path inventory, file hash, package identity, tag target, or SRI differs.

| Package | `README.md` blob | `README.ko.md` blob |
|---|---|---|
| store | `a5efb34e5eba642c68c3bf0d3100c5da3c87c798` | `dc57a8d099af34589dfea8d1349992cb1e65f1e0` |
| state | `fd13d183751bf5a0e984876573125ef731dd52cb` | `2b31ec3e1349713a21636ac947b89f6cb6c056ed` |
| form | `48bc92842132f486279fb145da74300acd66b517` | `fffbfffc6a33025e7465959da09601919ab1ae7d` |
| overlay | `b1133dc6d7d5e13db995bca1425c1398365d0f87` | `727f1501a07cff3ff134c7d89f363fd7a4ba7a91` |
| modal | `7b84ce1616fd18896f2d66f7984568b59c2e0200` | `6c6e0410ce77d12e48486f9a60081d5e6c11a0ab` |
| toast | `6d4a67e70009caa50904e265f67ae4536dfeb6cb` | `230a2bfad1021eedff438f342a67c79bb53eb06e` |
| fetcher | `a53eb20030a96b4ca55f5c63388e22622b61d8e5` | `679f9538a8bb3a26d89bc29359e363814c606e71` |
| utilinent | `1040690ad5cbd6b3c16d6c7d6feeba575b0c9ec9` | `e6b0d6aa0e22d7657029fc6ea20e7cec322425bf` |

The docs trees at the publish commit and current committed HEAD have no differences, but that is an observation, not permission to substitute HEAD. The npm artifacts prove only the README subset; the Git tree objects are the required evidence for the full canonical corpus.

## Index accuracy and `docsRevision`

The bilingual package indexes at `ecd9709…` were inspected directly against the fresh registry facts in this report.

| Package | Release-index decision | Required public treatment |
|---|---|---|
| Store | **Stale.** Both indexes say the installable version is `1.1.2`, cite workspace commit `bb26d48`, and say `createStore`, structural contracts, `set`/`update`, FIFO delivery, selector subscriptions, and aggregated listener errors are not yet versioned. npm `latest` is `2.0.0`, and those are the published 2.0 foundation APIs/semantics. `bb26d48` is not resolvable in the current repository object database. | Revise EN/KO to identify `@ilokesto/store@2.0.0`, release source `ecd9709…`, and those APIs as published 2.0 behavior. The introductory `Store` example may remain as a supported compatibility surface, but must not be presented as the limit of the release. |
| State | **Stale.** Both indexes say `1.0.4`, cite unavailable `bb26d48`, and call root `createStore`/`createReducer`, framework `bind`/`bindReducer`, and the notification foundation pending-major APIs. npm `latest` is `2.0.0`; the paragraph's release-status warning is reversed by publication. | Revise EN/KO to identify `@ilokesto/state@2.0.0`, release source `ecd9709…`, and the named foundation APIs as published 2.0 behavior. Reframe the linked migration page as migration to 2.0, not a “next major” preview. |
| Fetcher | **Channel wording needs clarification.** `@ilokesto/fetcher@beta` is correct and resolves to `1.0.0`, while `latest` deliberately remains `1.0.0-beta.1`. Calling `1.0.0` itself “a prerelease” is inaccurate in SemVer terms even though governance still calls this the beta phase. | State the two exact dist-tag mappings and call it a beta-channel release, not a SemVer prerelease. Keep the `@beta ky` installation command. |
| Form | No version or source-basis assertion appears in either index; inspected API/install copy is compatible with the published `2.0.0` manifest. | No correction identified in this scoped index audit. Version metadata can be renderer-supplied from the receipt. |
| Overlay | No version or source-basis assertion appears in either index; dependency/install copy matches `2.0.0`. | No correction identified. |
| Modal | No version or source-basis assertion appears in either index; dependency/install copy matches `2.0.0`. | No correction identified. |
| Toast | No version or source-basis assertion appears in either index; dependency/install copy matches `2.0.0`. | No correction identified. |
| Utilinent | No version or source-basis assertion appears in either index; peer/install copy matches `1.2.0`. | No correction identified. |

No corrected `docsRevision` commit exists yet. The isolated implementation worktree `/Users/ayden/Documents/ilokesto/.worktrees/docs-release-rollout` is clean at pilot commit `4d1bd07`, and all 16 package index files there are byte-identical to `ecd9709…`; it therefore preserves runtime identity but also preserves the stale prose and cannot be named as the correction revision.

A later dedicated correction commit can be verified as runtime-identical without ambiguity. Record its full SHA as `docsRevision`, require `ecd9709…` to be its ancestor, and require the release-to-revision diff **within `packages/**`** to contain only:

```text
packages/store/docs/index.mdx
packages/store/docs/index.ko.mdx
packages/state/docs/index.mdx
packages/state/docs/index.ko.mdx
packages/fetcher/docs/index.mdx
packages/fetcher/docs/index.ko.mdx
```

Then compare every `packages/<name>/src` tree and `package.json` blob with `ecd9709…` and require equality. As an additional broad guard, reject changes to package build configuration, the root lockfile, or any `packages/**` path outside the six allowlisted docs files. Documentation-application and publication machinery inherited from pilot `4d1bd07` may differ from the release commit; those changes do not become package runtime source. Pilot `4d1bd07` proves the baseline is suitable: all eight complete `packages/<name>` trees are exactly identical to `ecd9709…`, and the version commit `72df13a…` through publish commit `ecd9709…` also has no `src` or package-manifest change for any package. The correction commit itself remains unverified until it exists; do not put an uncommitted worktree state or `4d1bd07` into `docsRevision`.

Public rendering should therefore carry both identities: `releaseSource: ecd9709…` for artifact/runtime provenance and `docsRevision: <future exact correction SHA>` for corrected prose. Archive and hash both source versions; never overwrite the release corpus in place.

## Runtime closure and deterministic examples

The current docs application imports all eight packages through React-facing demos. Its `workspace:*` dependencies are unsuitable for released examples. A fresh isolated npm install of the exact published packages and release-lock peer choices produced this complete 13-node React runtime closure and passed `npm audit signatures`:

```text
@ilokesto/store@2.0.0
@ilokesto/state@2.0.0 -> @ilokesto/store@2.0.0
@ilokesto/form@2.0.0 -> @ilokesto/store@2.0.0 + immer@11.1.8
@ilokesto/overlay@2.0.0 -> @ilokesto/store@2.0.0
@ilokesto/modal@2.0.0 -> @ilokesto/overlay@2.0.0
@ilokesto/toast@2.0.0 -> @ilokesto/overlay@2.0.0 + @ilokesto/store@2.0.0
@ilokesto/fetcher@1.0.0 -> ky@1.14.3
@ilokesto/utilinent@1.2.0
react@19.2.8
react-dom@19.2.8 -> scheduler@0.27.0
```

(`immer@11.1.8` was nested under Form by npm because State advertises an optional incompatible Immer 9 peer; the list has 13 physical lock entries including that nested location.) Every lock entry has an exact `version`, registry `resolved` URL, and `integrity` in the generated npm lockfile. The direct third-party SRIs observed were: `ky@1.14.3` `sha512-9zy9lkjac+TR1c2tG+mkNSVlyOpInnWdSMiue4F+kq8TwJSgv6o8jhLRg8Ho6SnZ9wOYUq/yozts9qQCfk7bIw==`; `immer@11.1.8` `sha512-/tbkHMW7y10Lx6i1crLjD4/OhNkRG+Fo7byZHtah0547nIeXYcpIXaUh0IAQY6gO5459qpGGYapcEOHtFXkIuA==`; `react@19.2.8` `sha512-PWaYA1L/q9u2u7xYQi+Y3L3Yfnie7XyLeaJICV1MGD6LprsBxcAqGjYyr0eY3p+QdsA+x/Irkt4Qif8D63+Sbw==`; `react-dom@19.2.8` `sha512-rVprimfGBG3DR+Tq0IQG2DT5PxKth1WIGDmj5yPmlzr4YBe7uyE+Du4oVqTDXZSHGGGXRtTJEGSSePyQCMBglQ==`; `scheduler@0.27.0` `sha512-eNv+WrVbKu1f3vbYJT/xtiF5syA5HPIMtf9IgY/nKg0sWqzAUEvqY/xm7OcZc/qafLx/iO9FgOmeSAp4v5ti/Q==`.

Recommended implementation:

1. Put released-demo dependencies in an isolated package/install root that is **outside** the workspace globs (`apps/*`, `packages/*`, `packages/form/examples/*`). Do not resolve through `apps/docs`'s `workspace:*` entries.
2. Use exact npm specs (or version-named npm aliases for the top-level imports), commit a lockfile, require `npm ci --ignore-scripts`, and verify every lock integrity plus the release receipt before bundling. Set the isolated project to the public registry explicitly. A lockfile, not ranges or aliases alone, freezes transitives.
3. Make the released demo import only that isolated, lock-backed output. Add a resolution assertion for each `@ilokesto/*` package (`package.json` version + SRI/receipt) and reject paths resolving inside repository `packages/*`.
4. Keep peer sets per rendered framework. The exact alternatives tested in the publish commit's lock are React `19.2.8`/React DOM `19.2.8`, Solid `1.9.14`, Svelte `5.56.9`, Vue `3.5.41`, State Immer `9.0.21`, and Angular core `21.2.20` with RxJS `7.8.2` (Angular's other peers must also be pinned if an Angular demo is made). Generate a separate isolated lock per framework/example rather than installing every optional peer globally.

Do not use one all-framework closure. A direct attempt to install Form's mandatory `immer@11.1.8` together with State's optional `immer@^9.0.12` at one root failed with npm `ERESOLVE`. The current React State demo does not import the Immer adaptor, so omitting State's optional Immer peer is correct; an Immer-adaptor demo needs its own exact Immer 9 closure.

## Mismatches and blockers

1. **No npm source anchor:** all eight registry records have `gitHead: null`, no `dist.attestations`, and no provenance endpoint. The workflow run, tags, artifact bytes, and reproducible Fetcher build establish a trustworthy practical source route, but they do not provide registry-signed commit provenance. Future publishing should emit npm provenance; these already-published artifacts cannot be retroactively attested.
2. **State timestamp anomaly:** `@ilokesto/state@2.0.0` is timestamped `07:16:00.412Z`, 3 minutes 52 seconds after the sole Publish run reports completion at `07:12:08Z`; the other seven timestamps align with the run. State's tag, manifest rewrite, READMEs, SRI, and existing built `dist` all match the same release state, but the registry/workflow timing cannot be reconciled from public evidence. Mark State's source link as operationally supported, not provenance-proven.
3. **Tags are later than versioning:** every tag points to #99's merge, not the `ci: release` version commit. This is correct for the actual publish checkout and docs, but any rollout keyed to the versioning commit would freeze stale index docs and READMEs.
4. **npm is not the full docs corpus:** tarballs include only bilingual READMEs; `docs/**` must be archived from the exact Git tree. Treating tarball documentation as complete would lose 34/60/52/40/12/12/44/84 MDX files respectively.
5. **Workspace examples are not release evidence:** `apps/docs/package.json` currently binds all eight names with `workspace:*`. Source-compatible demos therefore do not prove which npm runtime is executing; released examples must use the isolated exact closure above.
6. **Release docs contain stale public claims:** Store and State's EN/KO source-basis paragraphs predate publication and cite an unavailable commit; Fetcher's prerelease wording conflates a beta dist-tag with SemVer prerelease syntax. The clean pilot commit does not correct them, and no verifiable correction `docsRevision` exists yet.

## Verification record

- Queried fresh exact-version and package-level npm metadata, dist-tags, publish times, dependencies, peers, exports, tarball URLs, SHA-1, SHA-512, file counts, and unpacked sizes.
- Downloaded all eight tarballs under `/tmp`, recomputed SHA-1/SHA-512, enumerated payloads, inspected packed manifests, and byte-compared all shipped READMEs with `ecd9709…`.
- Inspected Git ancestry, changed paths, docs inventories/tree and README blob IDs, local annotated tags, remote peeled tags, PRs #98/#99, and Publish run 36302267041.
- Queried all eight npm attestation endpoints (HTTP 404) and ran `npm audit signatures` over a real isolated exact install (13/13 registry signatures verified; only three third-party packages had attestations).
- Built Fetcher from a temporary archive of `ecd9709…` and byte-compared its complete `dist` with npm; compared the other seven available built `dist` trees byte-for-byte with npm.
- Confirmed the isolated exact React closure installs; separately reproduced the all-framework Immer conflict.
- Inspected all 16 release-commit package indexes for version/source assertions, confirmed `bb26d48` is unavailable, compared every package tree from `ecd9709…` to clean pilot `4d1bd07`, and verified that no correction commit currently exists.
