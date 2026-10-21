# Documentation design

## Illustrated package landings

The user rejected the previous article-with-demo-box layout and approved an
illustration-led direction referencing Zustand's landing page. This section
supersedes the shared article-frame rules for all eight package indexes.
After the Store proposal, the user directed continuation on best judgment when
the visual-feedback question timed out. This is not a claim of explicit visual
approval of the prototype.

- Reference: Zustand's illustrated full-screen scene, compact code panel with
  an overlapping live counter, minimal navigation, separate documentation.
- Original artwork: factory workers using tools and maintaining machinery.
  Use realistic adult proportions, worn workwear, steel, patina, and textured
  industrial illustration. No animal mascots, cute character proportions,
  storybook scenery, text, logos, or slogans inside the artwork.
- The user clarified that the feedback concerns illustration, not status copy,
  and then explicitly requested a consistent, less rounded theme on the overall
  homepage too. Preserve wording, layout and behavior; align surface colors,
  corners and shadows across the homepage and package landings. The emotional
  description is an art-direction constraint, never a catchphrase.
- Composition: a single illustrated stage, not stacked feature cards. Large
  package title at upper left, character on the left, code on the right, and
  live controls crossing the code panel's top edge. Richer controls flow in
  document order so validation/results cannot obscure code.
- On small screens: title, character, overlapping counter, then code in
  reading order. The document scrolls; the code block alone can scroll
  horizontally. The artwork remains a substantial part of the first screen.
- Navigation: ilokesto home, documentation/quick-start, GitHub, and the other
  language. No documentation sidebar or table of contents on this index.
- Shared palette: concrete `#efeee8`, graphite `#272d2a`, muted ink `#62675e`,
  code surface `#202622`, code ink `#edf0e8`, ochre `#ead7a2`,
  code comment `#b2b8a9`, syntax string `#ead7a2`, keyword `#dfb682`.
  Overview dark mode uses `#242823` surfaces and `#efede5` text. Illustrated
  scenes keep their fixed light treatment; detailed docs retain their theme.
- Typography: existing application sans and monospace fonts. Store display
  80–120px, mobile 64px; supporting text 16–18px; code 12–14px/1.8.
- Spacing: existing 4px scale; desktop page gutters 40–64px, mobile 24px.
  Panels use 2–4px corners, controls 2px, and restrained hard-offset shadows.
  No tilted sticky-note surfaces, pill CTAs, accent borders or gradient blobs.
- Real Store state drives increment, decrement, reset, and a subscribed code
  output. Keep the existing regression-test selectors and negative values.
- Native 44px controls, readable contrast, keyboard focus, localized labels,
  polite value announcements. The illustration is decorative; all meaning
  and functionality remain in accessible HTML.
- Only interaction feedback transitions (160ms opacity/transform); respect
  reduced motion. No continuous background animation or animation library.
- Existing canonical MDX, Markdown endpoints, OG metadata and quick-start routes
  remain available. Only index presentation bypasses the documentation shell.
- The overall homepage explains package selection without a dependency diagram.
- All 16 landings require functional browser checks and responsive captures;
  the full revision requires type/build tests, independent review and CI.

## Existing system

### Published and development documentation

- Every package uses compact version links using existing typography,
  neutral borders and 44px link targets; it does not redesign the illustrations.
- Released pages show the exact npm version. Next pages show a clear
  unpublished-content notice and preserve the version when switching language.
- Public pages use frozen documentation and examples from the selected npm
  release. Development pages live under the explicit package `next` path.
- Version switching preserves a matching document or returns to the selected
  channel's index. Language switching keeps the selected channel.
- Keep the existing illustrated scenes, layout, controls and motion unchanged.
- Landings use a compact version row with an explicit unreleased link label;
  detailed provenance text belongs in the document layout, clear of the artwork.

Use the existing Fumadocs neutral theme, Tailwind utilities, package color
metadata, and ilokesto logo. The site supports light and dark themes. Do not
introduce a second theme or font system.

## Reader journey

Home explains the whole toolbox, groups all eight packages by user task,
and explains adjacent package choices without a technical dependency map.
Each package exposes separate introduction and quick-start links.
Package indexes are the hands-on entry point: each offers a working example
using that package, its corresponding code, and onward documentation links.
Package documentation remains package-first; the overall homepage does not
privilege one package with its own interactive or static API tutorial.

## Tokens and typography

- Surfaces and text: `fd-background`, `fd-card`, `fd-accent`, `fd-foreground`,
  `fd-muted-foreground`, `fd-border`, and `fd-primary`.
- Focus: `fd-ring`; visible keyboard rings are required.
- Package accents: existing `packageMetadata` colors, never new brand colors.
- Code: neutral-950 background, neutral-200 foreground, fuchsia-300 keywords,
  emerald-300 strings, amber-300 numbers.
- Body: the application's inherited font, `text-sm` or `text-base`, generous
  line height. Code uses the inherited monospace stack.
- Display: responsive 4xl/5xl/6xl headline; section headings 3xl/4xl;
  balanced headings and Korean `break-keep`.

## Layout and primitives

- Content is centered in `max-w-7xl` with responsive 5/8/10-unit gutters.
- Hero stacks on small screens and becomes a two-column grid on large screens.
- Package cards use the same description, accent, and two-link anatomy.
- Card grids use one, two, then up to three columns according to available width.
- Borders are neutral; tonal backgrounds distinguish hover states.
- Section spacing uses the Tailwind 16/20/24 scale. Rounded surfaces use the
  existing 2xl/3xl scale.
- The document owns vertical scrolling; code blocks own horizontal overflow.

## Interactive package examples

### Compact, stable demonstrations (issue #101)

This revision replaces the counter/parity examples and supersedes the earlier
counter-specific controls. Preserve every illustration and the industrial palette.

- Show one practical task per package, with a short visible instruction.
- Core snippets contain at most 12 lines, normally at most 42 characters per line.
  Keep all lines visible without vertical code scrolling or smaller type to fit.
  Link complete setup to the matching channel's documentation.
- Use one shared syntax-highlighted code panel with a copy control. The unhighlighted
  loading state has exactly the same line boxes as the highlighted result.
- Keep controls anchored during errors, results, loading, reset, and repeated input.
  Reserve space for field errors and results at first render; use a bounded preview
  area for variable lists and overlays rather than changing the scene's height.
- Controls use the existing paper, graphite, and ochre tokens, 44px targets and
  2px corners. Preview tones use those same tokens and a text label.
- Measure element coordinates before and after actions, including user-triggered
  shifts that the browser's CLS score excludes. Do not animate height or move the
  page to make space. Respect reduced motion and preserve keyboard focus.
- On phones keep the artwork above the workspace; the document still owns vertical
  scrolling. Compact code and bounded demo contents must not create page overflow.
- Verify all eight packages, both languages, released and next channels, at phone
  and desktop widths. Frozen examples change only through a new publication revision.

- Reuse a shared `DemoFrame`: a compact floating live surface and a dark code
  panel integrated into the illustrated scene. Do not recreate an article
  header or nested demo-card stack inside that surface.
- Use the existing Fumadocs tokens and package accent, not stock photographs or
  a new brand. Numeric examples use tabular figures and a clear result area.
- Controls have at least 44px target height, visible focus rings, disabled
  states, and associated input labels. Announce results with an appropriate
  live region; validation errors are attached to their fields.
- Every example is resettable or reversible, scoped to its mounted instance,
  and cleans up subscriptions, requests, overlays, and timers on unmount.
- Actual package APIs drive the interaction. Code shown beside an example must
  describe the same operation; presentation-only markup may be omitted.
- HTTP examples use a same-origin demonstration endpoint with deterministic
  success/error responses, clearly labeled as demo data. No external account,
  third-party availability, or real user data is required.
- Load package demo code only where needed. Static documentation and the
  ecosystem overview must not eagerly execute all eight packages.

## Interaction and accessibility

Use native links and buttons. Preserve a single page H1 and ordered heading
levels. Mark decorative icons as hidden from assistive technology. Do not
turn a multi-link card into a nested link.

Motion is limited to hover color/opacity feedback; no decorative animation.
Check keyboard focus, theme switching, and language navigation in addition
to pointer use. Korean explanatory labels are localized; API names remain
unchanged.

## Verification

Review English and Korean at mobile, tablet, and desktop widths. Check the
hero, complete package groups, comparison section, code scrolling, and all
navigation controls. Retain rendered screenshots and route-test evidence
under the task's local `.omo/evidence` directory.

## Accepted constraints

This change retains Fumadocs for detailed documentation; package indexes use
the illustrated landing shell and explicit documentation links.
It does not redesign package APIs, release channels, or deployment behavior.
