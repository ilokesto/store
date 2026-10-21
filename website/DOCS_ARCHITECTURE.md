# Store docs architecture guide

This document guides the official bilingual documentation maintained by
`@ilokesto/store`.

Edit canonical Store documentation in `../docs`; `website/` consumes those
sources directly.

## 1. Core principle

The docs are package-first.

Each package should feel self-contained, but readers should still be able to predict the rhythm of a new section before they read it.

The goal is not to force every package into the same tree. The goal is to make every package feel like it belongs to the same family.

## 2. Default package rhythm

Every new package docs section should evaluate this baseline shape first:

1. `index`
2. `quick-start`
3. `mental-model` or an equivalent concept page
4. main guides and/or reference pages
5. optional sections only if the package truly needs them
6. advanced or internal notes only when they are meaningful

Packages do not need every optional section. They should only add structure when the content volume justifies it.

## 3. Landing page contract

Every package `index` page should try to answer these questions quickly:

- What is this package?
- What does it give me?
- What does it intentionally not do?
- What is the shortest useful example?
- Where should I go next?

An index page is not just an introduction. It is a routing page.

The site presents `/<language>/store` as an illustration-led landing with real
Store controls, a short core-code example, and a direct documentation link.
Keep the documentation sidebar and table of contents on detailed pages, not on
this landing. `quick-start` remains the complete setup path.

Canonical index MDX stays in `../docs`. It supplies metadata, search, and
machine-readable documentation; the application owns only the Store landing
presentation and interactive demo. Do not duplicate package documentation
into the application to build a landing.

The local language homepage introduces Store and its documentation. It does not
invent routes or publication entries for sibling packages.

## 4. Page type meanings

### `index`

Use for package positioning and onward routing.

### `quick-start`

Use for the shortest successful path from install to a working example.

### `mental-model`

Use for the conceptual frame behind the API. Explain why the package looks the way it does.

### Reference pages

Use for exact API surfaces, behavior rules, or lower-level contracts.

### Guide pages

Use for usage patterns, decisions, and practical composition.

### Advanced / internals pages

Use for implementation-backed details that matter for power users or maintainers.

## 5. Category and mapping rules

### Prefer categories for

- Introduction
- Reference
- Guides
- Advanced
- Internals

These are reader-facing sections.

### Prefer mapping-style groups only when

- the subtree really has multiple sibling topics,
- readers are likely to browse inside that subtree,
- and the extra hierarchy reduces confusion rather than adding it.

Good examples:

- middleware families
- utility families
- integration families

Do not create a mapping when there is only one child page or when the nesting only repeats the same label.

## 6. Naming rules

Common page types should stay predictable across packages when they mean the same thing.

Preferred names:

- Introduction
- Quick Start
- Mental Model
- Reference
- Guides
- Advanced
- Implementation Notes

Domain-specific buckets are allowed after the intro pages when they fit the package better than generic buckets.

## 7. Cross-link rules

Cross-links should answer the reader's next natural question, not create a dense web of links everywhere.

Good patterns:

- `index` -> `quick-start`
- `index` -> `mental-model`
- `quick-start` -> key next concept page
- API page -> the guide or reference page that explains the important caveat
- deep-dive page -> the overview page it belongs to

Avoid linking for the sake of completeness alone.

## 8. Korean / English parity rules

- Korean pages must not be placeholders that redirect readers back to English.
- UI-facing labels should be Korean-only in Korean docs.
- API names stay in English.
- Concept labels should stay internally consistent within and across packages when they refer to the same kind of page.

English and Korean pages do not have to be word-for-word mirrors, but they should offer the same practical value.

## 9. When to add optional sections

Optional sections like `middleware`, `utilities`, `integrations`, or `extensibility` are justified only when:

- the package actually has that surface,
- it contains multiple distinct topics,
- and collapsing it into one page would make navigation worse.

## 10. Future scaling rule

As long as the package family remains small, keep the top-level docs structure package-first.

Only consider a larger product shell or top-level regrouping when:

- the package count grows significantly,
- framework-specific docs multiply,
- or readers repeatedly struggle to distinguish overview, guide, and reference content.

Until then, prefer consistency over hierarchy.

## 11. Quick checklist for new package docs

Before shipping a new package section, check:

- Does the landing page explain the package boundary?
- Is there a real quick-start path?
- Is there a concept page if the API shape needs one?
- Are guide pages separate from strict reference pages?
- Are optional sections justified by content volume?
- Do the onward links point to the next likely reader question?
- Are English and Korean pages both complete?

## 12. Onboarding editorial standard

Write for a developer choosing a tool and trying it for the first time.

- Start with the user's task and the observable result, not internal data
  structures or a list of exported types.
- Explain adjacent choices: `store` versus `state`, and `overlay` versus
  `modal` or `toast`. Link to the alternative when it better fits the task.
- Keep the index example short. Put the complete installation and application
  setup in quick start, including imports, providers, required styles, and
  framework prerequisites.
- Give each runnable example an expected result and explain how to trigger it.
  Distinguish a complete example from a fragment that extends an earlier one.
- Verify examples against the actual public exports and behavior. State a beta
  installation channel where required; do not describe unreleased APIs as
  available in the current npm release.
- Use reference pages for exact defaults, return values, lifecycle constraints,
  and failure behavior. Use guides for completing a user task.
- End introductory pages with a small set of next steps. Keep useful deep
  references, rather than shortening every page to the same template.
- Translate the complete journey, including outcomes and caveats. Keep API
  identifiers unchanged and use natural Korean for explanatory labels.

## 13. Documentation improvement verification

Before handing off a documentation change:

- Run `pnpm docs:typecheck`, `pnpm docs:build`, and `pnpm docs:test`.
- Execute changed quick-start examples against the stated package API; a
  successful MDX build does not prove that example code works.
- Check both languages through home, the Store landing, quick start, and an API
  page, including search and switching languages.
- Check desktop and mobile layouts for body, code, table, and navigation
  overflow, and verify keyboard access to interactive controls.
- Preserve public routes and check Markdown, Open Graph images, `/llms.txt`,
  and `/llms-full.txt`.

Documentation publication timing and release-version selection are a separate
deployment concern; editorial changes must not silently alter those policies.
