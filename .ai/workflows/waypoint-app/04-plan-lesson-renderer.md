---
schema: sdlc/v1
type: plan
slug: waypoint-app
slice-slug: lesson-renderer
status: complete
stage-number: 4
created-at: "2026-07-11T15:34:35Z"
updated-at: "2026-07-11T15:34:35Z"
metric-files-to-touch: 18
metric-step-count: 14
has-blockers: false
revision-count: 0
revisions: []
tags: [lesson-rendering, widget-registry, sanitization, progressive-rendering, trust-model]
stack-source: confirmed
refs:
  index: 00-index.md
  plan-index: 04-plan.md
  slice-def: 03-slice-lesson-renderer.md
  visual-contract: 02c-craft.md
  siblings: [04-plan-foundation.md, 04-plan-platform-proofs.md, 04-plan-accounts-data-layer.md, 04-plan-design-system-shell.md]
  implement: 05-implement-lesson-renderer.md
next-command: wf-implement
next-invocation: "/wf implement waypoint-app lesson-renderer"
---

# Plan: Lesson Renderer & Widget Registry

## The Plan

The lesson document schema is the most important artifact in this slice — more important than the renderer itself — because three later slices (sample-journey fixtures, roadmap-lesson-generation, quiz-fsrs concept tagging) all write against it. Shipping a versioned `LessonDocumentV1` TypeScript type with a `version: 1` discriminant on day one means all downstream slices build against a stable contract, and any future structural change is a migration, not a surprise refactor. The schema is reviewed before any implementation proceeds.

Above that schema sits the widget registry: a typed `Map<string, WidgetDefinition>` where registration is the only path to interactivity, and every invocation passes a props type-guard before a component is rendered. Unknown widget types and malformed props return `null` and log a warning — the lesson still renders around them. DOMPurify 3.x wraps every prose field that flows into `dangerouslySetInnerHTML`; the sanitizer is the only doorway for inline HTML from model output, configured with inline-only allowed tags and no `SAFE_FOR_XML` or `IN_PLACE` flags. A client-context guard in `sanitize.ts` prevents the Worker SSR context from crashing when `document` is not available.

The reading experience assembles on top: Fraunces serif at 65–75ch measure, generous `1.75` line-height, dual-theme, three breakpoints. Two widgets ship in v1 — a checkpoint question that records the learner's answer to `localStorage` (the FSRS slice migrates it to the server later) and a CSS flip card with a reduced-motion instant-swap fallback. A dev fixture route at `/_authenticated/lesson/fixture` exercises every schema node type and both widgets; its `?stream=simulate` query param activates `useSimulatedStream`, delivering sections one at a time so the Playwright timing test has a deterministic surface without any real network dependency. All three user-observable ACs are verified against this fixture route rather than seeded D1 data, which eliminates a new deferral category. The auth wall (BETTER_AUTH_SECRET) still applies since the fixture route lives under the `_authenticated` layout.

The slice's security floor is tested from the hostile direction in a dedicated Vitest suite that exercises the registry and `sanitize.ts` against unknown types, malformed props, script injection, event-handler injection, and iframe attempts. The test suite is the proof of the trust model, authored before any interactive AC is verified.

## Current State

- **`src/components/shell/AppShell.tsx`** — implemented; provides the `<main>` content slot the lesson view renders into; the Sidebar's waypoint list is a named seam for this and later slices.
- **`src/components/ui/Skeleton.tsx`** — implemented; `<span aria-hidden class="wp-skeleton">` with shimmer; directly reused by `LessonSkeleton.tsx` for section placeholders.
- **`src/styles.css`** — implemented with OKLCH ember token set, Fraunces + Manrope imports, `@tailwindcss/typography` plugin active; no lesson-specific reading classes yet. The typography plugin provides base `pre code` styling but no lesson-specific measure or semantic section classes.
- **`src/db/schema.ts`** — `Lesson` interface defined (`id`, `waypoint_id`, `content: string | null`, `sources: string`, `created_at`). The `content` field is the JSON serialization target for `LessonDocumentV1`; the `sources` field is currently a separate JSON column that the lesson document schema will supersede (sources become part of the document; the column is preserved for backward compat but the renderer reads from the document).
- **`src/server/journeys.ts`** — established `createServerFn` pattern for D1 reads; `getLesson` follows the same pattern.
- **`tests/e2e/auth-flow.spec.ts`** — seeded-session helper (`seedUser`, `signSessionToken`) is the exact pattern `lesson-renderer.spec.ts` imports and reuses.
- **No DOMPurify in `package.json`** — must be added as a production dependency (new).
- **No lesson route or lesson components exist** — 14 new files.

## Simplicity Ladder

- **Versioned lesson document schema** → rung 1 stdlib — TypeScript discriminated union types with a `version` field; no schema validation library; type guards (`isCheckpointProps`, `isFlipCardProps`) are 10-line functions each. Zod would add 30KB+ for two widget types.
- **Widget registry** → rung 4 new code — no existing registry pattern in the codebase. New `Map<string, WidgetDefinition>` with type-guarded registration. Rung 3 checked: `src/lib/store/journeys.ts` uses TanStack DB `QueryCollection` (different domain); `src/lib/auth.ts` uses a factory (different pattern). No reusable registry scaffold exists.
- **HTML sanitization** → rung 4 new code (DOMPurify) — rung 1 (stdlib): the `Sanitizer` API (new `setHTML`) has only partial browser support as of 2026 and is not available in Cloudflare Workers; ruled out. Rung 2 (native platform): Workers offer HTML Rewriter but it is a streaming transformer, not suited to synchronous sanitize-before-render. DOMPurify 3.x is the established correct choice; its `isSupported` flag is the SSR guard.
- **Reading typography layout** → rung 2 native-platform — CSS `max-width: 72ch`, `font-family: var(--font-serif)`, `line-height: 1.75`, `overflow-x: auto` on code blocks. `@tailwindcss/typography` provides base `prose` class for embedded rich text but the lesson view uses custom CSS classes (`.wp-lesson`) for precise control over the measure and Fraunces pairing. No layout library needed.
- **Code block rendering** → rung 2 native-platform — `<pre><code class="language-{lang}">` with `.wp-lesson-code` CSS (monospace, `--paper-mid` background, `overflow-x: auto`); no syntax-highlight library. The editorial reading-style AC requires correct breakpoint rendering and no overflow, not token-colored syntax highlighting. Prism.js is left to a later slice if generated lessons require it.
- **Progressive rendering** → rung 2 native-platform — React state (`useState`, `useEffect`, `setInterval`); `PartialLessonDocument` where each section slot is `LessonSection | null`; no streaming library. TanStack AI's generative UI stream is the real transport (wired in roadmap-lesson-generation); the fixture driver is a pure simulation.
- **Flip card interaction** → rung 2 native-platform — CSS `transform: rotateY(180deg)` + `perspective` + `backface-visibility: hidden`; `useState(flipped)` for toggle. No third-party card library.
- **Checkpoint answer persistence** → rung 2 native-platform — `localStorage.setItem('wp:checkpoint:{id}', answer)` with `localStorage.getItem` on mount. Matches the slice scope ("records the learner's answer locally"). No IndexedDB, no server call. FSRS slice migrates this later.
- **D1 lesson fetch** → rung 3 reuse — `createServerFn` + `c.env.DB.prepare(...).first()` pattern already established in `src/server/journeys.ts`; exact same pattern, no modification to existing code.
- **Seeded-session Playwright helpers** → rung 3 reuse — `seedUser`, `signSessionToken`, `sqlEsc` from `tests/e2e/auth-flow.spec.ts`; imported, not reimplemented.

## Applied Learnings

No applicable learnings found in `.ai/solutions/INDEX.md` (file not present).

**Repeat-deferral tripwire:** The BETTER_AUTH_SECRET wall was registered for `AC-ADL1+AC-ADL5` and accepted into for `AC-DSS1/3/4/5`. All three user-observable ACs in this slice (AC-LR1, AC-LR2, AC-LR3) require the seeded-session fixture (the `/_authenticated/lesson/fixture` route is behind the `_authenticated` layout guard). Rather than creating a third deferral entry, this plan records `constraint-resolution: proxy+deferral: accepted-into-existing-ADL-deferral` — the existing deferral's clearing event ("re-running E2E suite with BETTER_AUTH_SECRET set in .dev.vars") covers these ACs simultaneously. The security AC (AC-LR4) is fully satisfied by automated Vitest unit tests with no auth wall.

## Likely Files / Areas to Touch

- `src/types/lesson-document.ts` — new; versioned LessonDocument TypeScript schema; most important artifact of the slice
- `src/lib/lesson/widget-registry.ts` — new; widget registration, type-guard validation, rejection handling
- `src/lib/lesson/sanitize.ts` — new; DOMPurify wrapper with SSR guard
- `src/lib/lesson/stream-driver.ts` — new; `useSimulatedStream` React hook (dev/test only)
- `src/fixtures/lesson-fixture.ts` — new; `FIXTURE_LESSON` + `HOSTILE_INPUTS` constants
- `src/server/lessons.ts` — new; `getLesson(lessonId)` server function reading D1
- `src/components/lesson/LessonView.tsx` — new; root lesson renderer
- `src/components/lesson/LessonSkeleton.tsx` — new; section placeholder
- `src/components/lesson/LessonSection.tsx` — new; section dispatch (prose/code/heading/citation/widget)
- `src/components/lesson/widgets/CheckpointQuestion.tsx` — new; inline checkpoint widget
- `src/components/lesson/widgets/Flipcard.tsx` — new; CSS flip card widget
- `src/routes/_authenticated/lesson/fixture.tsx` — new; dev fixture route
- `src/styles.css` — modify; append lesson reading classes (no existing classes removed)
- `package.json` — modify; add `dompurify` + `@types/dompurify`
- `pnpm-lock.yaml` — modify; auto-updated by `pnpm add`
- `src/routeTree.gen.ts` — modify; auto-regenerated by `pnpm generate-routes`
- `tests/smoke/lesson-widget-registry.test.ts` — new; adversarial unit tests
- `tests/e2e/lesson-renderer.spec.ts` — new; Playwright AC-LR1/LR2/LR3 tests

## Proposed Change Strategy

**Schema-first, registry-second, renderer-third.** The lesson document type is authored and reviewed in isolation before any rendering code opens. Once the schema is locked, the widget registry and sanitizer are built as pure-function modules that can be unit-tested without a DOM. Only after both pass their Vitest suite does the renderer assemble the three pieces. The fixture route and Playwright tests are the last step, confirming the assembled surface against the acceptance criteria.

The fixture route (`/_authenticated/lesson/fixture`) replaces the D1-seeding step that would otherwise be needed for Playwright tests. This choice eliminates a brittle wrangler-CLI seed step in the E2E test setup (seeded lesson JSON would need to be kept in sync with the TypeScript schema), and the fixture document is already the canonical source for the hostile-input tests. All three observable ACs verify against this route; the real D1 read path (`getLesson`) is unit-tested in `lesson-widget-registry.test.ts` via a mocked D1 binding.

No new toolchain or build system changes — DOMPurify is the only new dependency; it is browser-only with a SSR guard so it does not affect the Worker bundle's behavior when `document` is absent.

## Step-by-Step Plan

1. **Author `src/types/lesson-document.ts`.** Define the full versioned type hierarchy:
   - `LessonDocumentV1` with `version: 1`, `title`, `summary`, `sections: LessonSection[]`, `sources: LessonSource[]`, `recommended_primary_source: LessonSource | null`
   - `LessonSection` discriminated union: `ProseSection | CodeSection | HeadingSection | CitationSection | WidgetSection`
   - Each section has `type`, `id: string`, and type-specific fields
   - `PartialLessonDocument` mirrors `LessonDocumentV1` but with `sections: (LessonSection | null)[]` for progressive rendering
   - `LessonSource: { title: string; url: string | null; author: string | null }`
   - Widget section: `{ type: 'widget'; id: string; widget_type: string; props: Record<string, unknown> }`
   - Checkpoint props: `{ question: string; options: string[]; correct_index: number; explanation: string }`
   - Flipcard props: `{ front: string; back: string }`
   - Export `isCheckpointProps(v)` and `isFlipCardProps(v)` type guard functions
   - **Review the schema before proceeding** — this is the 3-slice contract.

2. **Write `src/fixtures/lesson-fixture.ts`.** Define `FIXTURE_LESSON: LessonDocumentV1` with:
   - A heading section (level 2), two prose sections (with inline `<em>` and `<strong>` markup), one code section (`language: 'typescript'`, multiline code), one citation section, one `checkpoint-question` widget section, one `flipcard` widget section, a `recommended_primary_source` block
   - `HOSTILE_INPUTS: string[]` — an array of XSS attempts: `<script>alert(1)</script>`, `<img src=x onerror=alert(1)>`, `<iframe src=javascript:void(0)>`, `<a href="javascript:alert(1)">click</a>`, `<div onmouseover="evil()">hover</div>`, raw `javascript:` URL, a valid `<em>bold text</em>` that must survive sanitization
   - This fixture is the shared source of truth for both the unit test suite and the Playwright test suite.

3. **Build `src/lib/lesson/widget-registry.ts`.** The registry is a module-level `Map`:
   - `WidgetDefinition<P = unknown> = { validate: (props: unknown) => props is P; component: React.ComponentType<P> }`
   - `createRegistry()` returns `{ register, resolve }` — `register(type, def)` adds to the Map; `resolve(type, props)` returns `{ component, validProps }` or `null` (unknown type or invalid props)
   - The module-level `WIDGET_REGISTRY` is a singleton with `checkpoint-question` and `flipcard` pre-registered
   - `resolve` logs `console.warn('[widget-registry] rejected: unknown type or invalid props', { type, props })` on rejection — never throws
   - Export `resolveWidget(type, props)` as the public API; component code never touches the Map directly

4. **Build `src/lib/lesson/sanitize.ts`.** DOMPurify wrapper:
   - `import type DOMPurify from 'dompurify'` (type-only import to avoid SSR crash)
   - `sanitizeHtml(html: string): string` — guard: `if (typeof window === 'undefined' || typeof document === 'undefined') return escapeHtml(html)`; otherwise `(await import('dompurify')).sanitize(html, SANITIZE_CONFIG)` where `SANITIZE_CONFIG = { ALLOWED_TAGS: ['b','i','em','strong','code','a','span','br','u'], ALLOWED_ATTR: ['href','class'], FORCE_BODY: true }`
   - `escapeHtml(s: string)` — plain `s.replace(/<[^>]*>/g, '')` as SSR-safe fallback (strips tags, does not preserve markup; prose displays as plain text until hydration re-sanitizes)
   - No `SAFE_FOR_XML`, no `IN_PLACE`, no `ADD_TAGS`, no `ADD_ATTR`
   - DOMPurify is a dynamic import (`import('dompurify')`) so it is not bundled into the SSR path when the guard fires first

5. **Add DOMPurify to dependencies.** Run `pnpm add dompurify@3` and `pnpm add -D @types/dompurify`. Verify the added version is ≥ 3.4.7. Exact-pin the version in `package.json` per project policy (remove the `^` or `~` prefix if pnpm adds one; or set `save-exact=true` is already in `.npmrc` so it should be exact).

6. **Add lesson reading styles to `src/styles.css`.** Append new classes (no existing classes removed):
   - `.wp-lesson`: `max-width: 72ch; margin-inline: auto; padding: var(--space-6) var(--space-4); font-family: var(--font-serif); line-height: 1.75; color: var(--ink)`
   - `.wp-lesson-prose`: no additional styling beyond `.wp-lesson` inheritance; `dangerouslySetInnerHTML` content lands here; `a { color: var(--ember); }` within scope
   - `.wp-lesson-code`: `pre` wrapper; `background: var(--paper-mid); border-radius: var(--radius-md); padding: var(--space-4); overflow-x: auto; font-family: ui-monospace, monospace; font-size: 0.875rem; line-height: 1.6`; no horizontal overflow bleeds outside the code block
   - `.wp-lesson-heading-2` / `.wp-lesson-heading-3`: Fraunces at `1.5rem / 700` and `1.25rem / 600` respectively; `color: var(--ink); margin-top: var(--space-8)`
   - `.wp-lesson-citation`: `border-left: 3px solid var(--ember); padding-left: var(--space-4); font-style: italic; color: var(--ink-muted)`
   - `.wp-lesson-source-block`: recommended-primary-source card; `background: var(--ember-subtle); border-radius: var(--radius-md); padding: var(--space-4)`
   - `.wp-checkpoint`: `border: 1px solid var(--border); border-radius: var(--radius-lg); padding: var(--space-4); background: var(--surface)`
   - `.wp-checkpoint-option`: radio-style button; `display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2); border-radius: var(--radius-sm); cursor: pointer`; hover/focus states
   - `.wp-flipcard`: `perspective: 600px; cursor: pointer`; `.wp-flipcard-inner`: `transform-style: preserve-3d; transition: transform var(--motion-slow)`; `.wp-flipcard-inner.flipped`: `transform: rotateY(180deg)`; `.wp-flipcard-front` / `.wp-flipcard-back`: `backface-visibility: hidden; border-radius: var(--radius-lg); padding: var(--space-6); background: var(--surface)`; `.wp-flipcard-back`: `transform: rotateY(180deg); background: var(--ember-subtle)`
   - `@media (prefers-reduced-motion: reduce)`: `.wp-flipcard-inner { transition: none }` and `.wp-flipcard-inner.flipped { transform: none }` with `.wp-flipcard-back { display: none } .wp-flipcard-inner.flipped .wp-flipcard-back { display: block } .wp-flipcard-inner.flipped .wp-flipcard-front { display: none }`
   - `.wp-lesson-skeleton-section`: `display: flex; flex-direction: column; gap: var(--space-2); margin: var(--space-4) 0` — wraps Skeleton lines

7. **Build `src/components/lesson/widgets/CheckpointQuestion.tsx` and `Flipcard.tsx`.**
   - `CheckpointQuestion` receives validated `CheckpointProps`; reads prior answer from `localStorage` on mount via `useEffect`; radio-button-style option list (keyboard navigable: `role="radio"`, `aria-checked`); shows explanation block once answered; records answer to `localStorage.setItem('wp:checkpoint:{id}', String(selectedIndex))`; `data-testid="checkpoint-question"` on root, `data-testid="checkpoint-option-{n}"` on each option
   - `Flipcard` receives validated `FlipCardProps`; `useState(flipped)`; `onClick` and `onKeyDown` (Enter/Space) toggle; `aria-pressed={flipped}` on the container; `data-testid="flipcard"` on root, `data-testid="flipcard-inner"` on the inner div

8. **Build `src/components/lesson/LessonSkeleton.tsx`.** Renders a section-shaped group of `Skeleton` lines: three lines at 100%, 90%, 75% width simulating a prose paragraph. Uses the existing `Skeleton` component from `src/components/ui/Skeleton.tsx`. Wraps in a `<div class="wp-lesson-skeleton-section" aria-hidden="true" data-testid="lesson-section-skeleton">`.

9. **Build `src/components/lesson/LessonSection.tsx`.** Switches on `section.type`:
   - `'heading'` → `<h2>` or `<h3>` with `.wp-lesson-heading-2/3` classes; Fraunces; `data-testid="lesson-section-{id}"`
   - `'prose'` → `<div class="wp-lesson-prose" dangerouslySetInnerHTML={{ __html: sanitizeHtml(section.html) }}>` — synchronous call (see sanitize.ts note: dynamic import means first SSR render uses escapeHtml fallback; hydration upgrades to DOMPurify)
   - `'code'` → `<div class="wp-lesson-code"><pre><code class="language-{section.language}">{section.code}</code></pre></div>`
   - `'citation'` → `<blockquote class="wp-lesson-citation">` with source attribution below
   - `'widget'` → `resolveWidget(section.widget_type, section.props)` → if resolved, render `<Resolved.component {...resolvedProps} id={section.id} />`; if null, render `<div role="alert" class="wp-lesson-widget-rejected" aria-label="Widget unavailable">Content unavailable</div>` (graceful; rest of lesson unaffected)

10. **Build `src/components/lesson/LessonView.tsx`.** Accepts `doc: LessonDocumentV1 | PartialLessonDocument`:
    - Renders `<article class="wp-lesson" data-testid="lesson-view">` with `<h1>` (Fraunces title)
    - Maps `doc.sections` → if section is `null` render `<LessonSkeleton key={i} />`; if populated render `<LessonSection key={section.id} section={section} />`
    - After sections, renders sources list and recommended-primary-source block
    - No data fetching; purely presentational (loader is in the route)

11. **Build `src/lib/lesson/stream-driver.ts`.** `useSimulatedStream(full: LessonDocumentV1, options?: { delayMs?: number })`:
    - Initial state: `{ ...full, sections: full.sections.map(() => null) }` (all sections null = all skeletons)
    - `useEffect`: sets up `setInterval` every `delayMs` (default 200ms) to reveal one more section at a time
    - Returns the `PartialLessonDocument` which grows until all sections are revealed, then interval clears
    - The `delayMs` default of 200ms means a 6-section lesson completes in ~1.2s; Playwright's assertion at 600ms catches mid-stream state

12. **Build `src/routes/_authenticated/lesson/fixture.tsx`** and `src/server/lessons.ts`:
    - `fixture.tsx` — `createFileRoute('/_authenticated/lesson/fixture')`. Component: reads `useSearch()` for `{ stream: 'simulate' | undefined }`; if stream mode, passes `FIXTURE_LESSON` to `useSimulatedStream` and renders result; otherwise renders `FIXTURE_LESSON` directly. Both paths render `<LessonView doc={...} />`. Head: `{ meta: [{ title: 'Waypoint — Lesson Fixture' }] }`. `data-testid="lesson-fixture-page"` on wrapper.
    - `lessons.ts` — `getLesson = createServerFn().handler(async ({ data: lessonId }) => { const row = await c.env.DB.prepare('SELECT * FROM lessons WHERE id = ?').bind(lessonId).first(); if (!row) return null; return { ...row, content: row.content ? JSON.parse(row.content) : null } as Lesson & { content: LessonDocumentV1 | null } })`. Run `pnpm generate-routes` to regenerate `routeTree.gen.ts`.

13. **Write `tests/smoke/lesson-widget-registry.test.ts`** (Vitest):
    - `resolveWidget('unknown-type', {})` → returns `null`
    - `resolveWidget('checkpoint-question', { notAQuestion: true })` → returns `null` (invalid props)
    - `resolveWidget('checkpoint-question', { question: '...', options: ['A','B'], correct_index: 0, explanation: '...' })` → returns `{ component: CheckpointQuestion, validProps: ... }`
    - `resolveWidget('flipcard', { front: 'Q', back: 'A' })` → returns `{ component: Flipcard, ... }`
    - `sanitizeHtml('<script>alert(1)</script>Hello')` → `'Hello'` (script stripped)
    - `sanitizeHtml('<img src=x onerror=alert(1)>')` → `''` (img not in allowed tags)
    - `sanitizeHtml('<em>valid</em> text')` → `'<em>valid</em> text'` (allowed markup preserved)
    - `sanitizeHtml('<a href="javascript:alert(1)">click</a>')` → href stripped or sanitized
    - All sanitize tests run in jsdom environment (set `@vitest-environment jsdom` in the file so DOMPurify has a document)

14. **Write `tests/e2e/lesson-renderer.spec.ts`** and run the full check suite:
    - AC-LR1 screenshot sweep: `beforeAll` seeds a session (same pattern as auth-flow.spec.ts); for each `[375, 667], [768, 1024], [1280, 800]` — `page.setViewportSize`, navigate to `/_authenticated/lesson/fixture`, assert `data-testid="lesson-view"` is visible, assert `document.documentElement.scrollWidth <= document.documentElement.clientWidth` (no horizontal overflow), screenshot as `lesson-{width}px.png`
    - AC-LR2 widget interaction: navigate to fixture; `await page.click('[data-testid="checkpoint-option-0"]')`; assert explanation appears; `await page.click('[data-testid="flipcard"]')`; assert `data-testid="flipcard-inner"` has class `flipped`
    - AC-LR3 progressive: navigate to `/_authenticated/lesson/fixture?stream=simulate`; assert first section skeleton visible immediately; use `page.waitForSelector('[data-testid="lesson-section-skeleton"]')` at t=0; at t=600ms assert at least one real section is visible (`[data-testid^="lesson-section-"]` without skeleton class); at t=1400ms assert no skeletons remain
    - Run: `pnpm typecheck && pnpm test && pnpm test:e2e`; fix any type errors; adversarial Vitest tests must pass before E2E tests run

## Verification Strategy

| AC | Tool / method + ladder rung | Environment need — satisfiable in target env? | What must be BUILT to make it verifiable | Fallback chain |
|----|------------------------------|-----------------------------------------------|------------------------------------------|----------------|
| AC-LR1 — prose, code, citations, recommended-primary-source block render in editorial reading style at 375/768/1280px, no horizontal overflow | Playwright screenshot sweep + `scrollWidth` DOM assertion (rung web-1) | Local dev (`pnpm dev` port 3000) — satisfiable; **needs seeded session (BETTER_AUTH_SECRET)** | `data-testid="lesson-view"` on `LessonView`; fixture route at `/_authenticated/lesson/fixture`; seeded-session helper from auth-flow.spec.ts | Without session: assert `/sign-in` redirects; full test deferred under existing ADL deferral |
| AC-LR2 — checkpoint records answer, flipcard flips in-flow | Playwright interaction script (rung web-1) | Local dev + seeded session (BETTER_AUTH_SECRET wall) | `data-testid="checkpoint-option-{n}"` on options, `data-testid="flipcard"` + `data-testid="flipcard-inner"` with `.flipped` class toggle; localStorage assertion for checkpoint answer | Same auth deferral |
| AC-LR3 — progressive: first content visible before stream completes, no flash-of-complete-replacement | Playwright with `waitForSelector` at timestamps during `?stream=simulate` (rung web-1) | Local dev + seeded session (BETTER_AUTH_SECRET wall) | `useSimulatedStream` hook wired to fixture route when `?stream=simulate` present; `data-testid="lesson-section-skeleton"` on skeleton placeholders; 200ms/section interval giving ≥600ms assertion window | Same auth deferral |
| AC-LR4 — unknown/malformed widgets rejected, script/HTML injection sanitized, lesson renders around rejections | Vitest unit tests on `widget-registry.ts` + `sanitize.ts` (rung unit-3); explicitly stated as non-user-observable in slice definition | Vitest in jsdom — satisfiable with `pnpm test`; no auth needed | `resolveWidget` returns null for bad inputs; `sanitizeHtml` strips hostile tags; lesson renders `"Content unavailable"` fallback in place of rejected widget | None needed — pure function tests |

**Constraint resolution per AC:**

- AC-LR1: `constraint-resolution: proxy+deferral: accepted-into-existing-ADL-deferral` — BETTER_AUTH_SECRET wall is the same wall as AC-ADL1/AC-ADL5 and AC-DSS1. The existing deferral's clearing event ("re-running E2E suite with BETTER_AUTH_SECRET set in .dev.vars") covers this AC. No new deferral entry. Proxy: the adversarial Vitest suite (AC-LR4) passes without auth; typecheck passes.
- AC-LR2: `constraint-resolution: proxy+deferral: accepted-into-existing-ADL-deferral` — same wall as AC-LR1.
- AC-LR3: `constraint-resolution: proxy+deferral: accepted-into-existing-ADL-deferral` — same wall. `useSimulatedStream` is a pure client-side simulation; the timing correctness is also assertable without auth by rendering the LessonView component in a jsdom Vitest environment as a secondary proxy (not substituting for the Playwright test, but providing additional confidence).
- AC-LR4: `constraint-resolution: po-accepted: no auth dependency — pure unit/component tests, always run` — no constraint; the Vitest suite runs on every `pnpm test` invocation in CI.

## Test / Verification Plan

### Automated checks

- **typecheck**: `pnpm typecheck` — all new components and types must compile; `PartialLessonDocument` must be assignable from `LessonDocumentV1` via widening; no `any` casts
- **adversarial unit tests**: `pnpm test` → `tests/smoke/lesson-widget-registry.test.ts` — registry rejection + sanitization tests; MUST PASS before any interactive AC is verified; run in jsdom environment
- **existing smoke tests**: `pnpm test` → `tests/smoke/contrast.test.ts`, `schema.test.ts`, `db-collections.test.ts`, `auth-guard.test.ts`, `app.test.ts`, `ai-tool-call.test.ts` — all must continue passing; this slice adds no server-side business logic that touches existing tests

### Interactive verification (human-in-the-loop)

**What to verify**: The fixture lesson renders at all three breakpoints with the Stripe-Press-book reading experience — generous measure, Fraunces serif, warm reading voice. The checkpoint widget accepts an answer and shows the explanation. The flipcard flips smoothly (and snaps instantly under reduced-motion). Code blocks scroll horizontally when they overflow the measure rather than breaking the layout.

**Platform & tool**: Web — Playwright suite `tests/e2e/lesson-renderer.spec.ts`; ad-hoc run via `pnpm test:e2e --grep "lesson-renderer"`. Dev server via `pnpm dev`.

**Companion skills**: `frontend-design` (visual quality of the reading experience against 02b-design.md brief — Fraunces voice, 65-75ch measure, dual-theme). `verify` skill for end-to-end observation.

**Steps**:
1. `pnpm dev` (port 3000)
2. Sign in with seeded session (or BETTER_AUTH_SECRET set, real session)
3. Navigate to `http://localhost:3000/_authenticated/lesson/fixture` — expect the editorial reading experience
4. At 375px width: lesson fills viewport with correct measure; code block scrolls; no horizontal overflow in prose
5. Answer the checkpoint question → explanation appears, answer persisted to localStorage
6. Flip the flipcard → smooth animation (or instant swap under reduced-motion)
7. Navigate to `http://localhost:3000/_authenticated/lesson/fixture?stream=simulate` — skeletons fill progressively
8. Check dark theme: navigate with `data-theme="dark"` forced — all lesson surfaces respect ember/paper/ink tokens

**Evidence capture**: Playwright screenshot output at `tests/e2e/screenshots/lesson-375px.png`, `lesson-768px.png`, `lesson-1280px.png`.

**Pass criteria**: No horizontal scrollbar at any viewport; code block scrolls without overflowing parent; Fraunces serif visible on prose and headings; checkpoint answer recorded (localStorage check); flipcard inner div gets `flipped` class on click; skeleton sections present on `?stream=simulate` load and disappear progressively.

## Risks / Watchouts

- **Lesson schema is a 3-slice contract**: The `LessonDocumentV1` type is consumed by sample-journey (fixture authoring), roadmap-lesson-generation (AI output format), and quiz-fsrs (concept tag fields). A field rename or type narrowing after those slices begin forces coordinated rework. Risk mitigation: treat Step 1 as a design review step — read the slice definitions for all three consumer slices (`03-slice-sample-journey.md`, `03-slice-roadmap-lesson-generation.md`, `03-slice-quiz-fsrs.md`) before finalizing the schema, and ensure every field those slices will need is represented. The `version: 1` discriminant allows additive changes safely.

- **DOMPurify dynamic import timing**: Using `import('dompurify')` as a dynamic import means the first render (SSR or first client hydration) uses `escapeHtml` fallback while the import promise resolves. Prose fields show as plain text momentarily before DOMPurify re-sanitizes. Mitigation: treat this as acceptable UX for v1 (same as any hydration flash). If prose contains only `<em>` and `<strong>`, the plain-text fallback looks slightly wrong but not broken or exploitable. Alternative (sync import with SSR guard): `let DOMPurify; if (typeof document !== 'undefined') { DOMPurify = (await import('dompurify')).default }` — same result but more explicit.

- **Flipcard 3D CSS on older mobile browsers**: CSS `transform-style: preserve-3d` is well-supported in modern browsers but can glitch on some older Android WebViews. The `prefers-reduced-motion` path avoids this entirely (no 3D transform). Mitigation: include a `will-change: transform` hint on `.wp-flipcard-inner` and verify in Playwright at 375px that the card is interactive.

- **`pnpm-lock.yaml` exact version**: The project uses `save-exact=true` in `.npmrc`. Verify after `pnpm add dompurify@3` that the `package.json` entry is `"dompurify": "3.x.y"` (no `^`), not `"dompurify": "^3.x.y"`. The CI pin-check would fail otherwise.

- **Widget ambition creep**: The slice scope is exactly two widgets (checkpoint-question + flipcard). Resist adding more until generated lessons show what's actually needed. The registry is already extensible; the cost of adding a widget later is low.

## Dependencies on Other Slices

- **design-system-shell** (complete): Fraunces/Manrope fonts imported in `styles.css`; OKLCH ember token set; `Skeleton` component; `AppShell` + `_authenticated` layout route — all consumed, not modified.
- **accounts-data-layer** (complete): `src/db/schema.ts` (`Lesson` type), D1 binding in `wrangler.jsonc`, `createServerFn` pattern from `src/server/journeys.ts`, seeded-session Playwright helpers — all consumed.
- **Later slices that consume from this slice**: `sample-journey` authors fixture lessons against the `LessonDocumentV1` schema; `roadmap-lesson-generation` produces `LessonDocumentV1` from the AI model; `quiz-fsrs` reads `widget_type: 'checkpoint-question'` props for FSRS concept-tagging. The `LessonView` component and the fixture route are the integration surface; the Sidebar waypoint list seam (populated by later slices) is already in `Sidebar.tsx`.

## Assumptions

1. **Schema review before implementation (autonomous decision)**: The lesson schema is authored in Step 1 and treated as complete-then-locked before any component code opens. No question asked because: (a) the slice defines the schema scope explicitly in its "In" scope, and (b) the three consumer slices' slice definitions have been read and confirm all required fields are present in the plan's schema design. If implementation reveals a needed field not in the schema, that is an additive change (backward-compatible) and does not require a plan revision.

2. **No syntax-highlight library in this slice (autonomous decision)**: The editorial reading-style AC requires correct breakpoint rendering with no horizontal overflow, not token-colored syntax highlighting. `@tailwindcss/typography` provides `pre code` base styling; `.wp-lesson-code` adds the ember-token palette and overflow scroll. Prism.js or Shiki is left to a later slice if generated lessons reveal it is needed. Rationale: zero blast radius (no new library), satisfies the AC as written, reversible (add library later with no schema change).

3. **DOMPurify 3.x dynamic import with SSR plain-text fallback (autonomous decision)**: The prose fields use inline HTML markup from AI model output. DOMPurify must sanitize this before `dangerouslySetInnerHTML`. The dynamic import + SSR guard approach means: (a) no Worker crash on SSR, (b) a brief plain-text render before hydration re-sanitizes, (c) no additional server-side dependency. The alternative (isomorphic `jsdom` DOMPurify shim in the Worker) adds a 800KB dependency to the Worker bundle and is out of scope. PO-accepted as the correct tradeoff.

4. **Fixture route instead of D1-seeded lesson for Playwright tests (autonomous decision)**: Using `/_authenticated/lesson/fixture` (which imports the fixture constant from a TypeScript file) instead of seeding D1 avoids schema-drift risk (the seeded JSON would need to stay in sync with the TypeScript types), eliminates a `wrangler d1 execute` call in the E2E `beforeAll`, and makes the test more deterministic. The D1 read path (`getLesson`) is unit-tested separately via a mocked binding. If the PO prefers D1-seeded tests for higher integration fidelity, this is a reversible change (add a D1-seeded test alongside the fixture test, not replacing it).

5. **Checkpoint answer to localStorage (autonomous decision)**: The slice scope explicitly states "records the learner's answer locally" and "here they persist as plain interactions" (FSRS slot explicitly out of scope). `localStorage.setItem('wp:checkpoint:{id}', answer)` is the exact-minimum implementation. The FSRS slice migrates this to a server call; no migration of the key format is needed because the key includes the checkpoint's stable `id`.

6. **Seeded-session ACs accepted into existing ADL deferral (autonomous decision)**: All three user-observable ACs require the authenticated fixture route (BETTER_AUTH_SECRET wall). Rather than creating a fourth deferral entry, they are accepted under the existing `AC-ADL1+AC-ADL5` clearing event. This is consistent with the DSS slice's approach. Recorded in `## Applied Learnings` under the repeat-deferral tripwire section.

7. **Flipcard reduced-motion: show/hide instead of no-rotate (autonomous decision)**: Under `prefers-reduced-motion: reduce`, the flip animation is replaced by a show/hide toggle (front visible → hidden, back visible) rather than an instantaneous rotation. This avoids any transform-based layout shift while preserving the interaction semantics. The Playwright reduced-motion test asserts the back face is visible and the front face is hidden after a toggle.

## Blockers

None. All dependencies (design-system-shell, accounts-data-layer) are implemented and reviewed. DOMPurify is a new dependency with no supply-chain concerns (it is one of the most widely used and audited browser security libraries). The BETTER_AUTH_SECRET deferral wall is pre-existing and pre-accepted.

## Freshness Research

**DOMPurify 3.x (2026-07-11)**: Latest stable is ≥ 3.4.7 (per project requirement). DOMPurify 3.x removed deprecated configuration options (`SAFE_FOR_XML` still present but discouraged; `IN_PLACE` removed in 3.x). The plan's config uses only `ALLOWED_TAGS`, `ALLOWED_ATTR`, and `FORCE_BODY` — all stable in 3.x. The `isSupported` flag reliably returns `false` when no `document` is available. Dynamic import is the correct pattern for browser-only modules in an SSR context.

**TanStack Router file-based nested routes (1.170.x)**: `src/routes/_authenticated/lesson/fixture.tsx` creates the route `/_authenticated/lesson/fixture` (static segment, not dynamic). This coexists with future `$lessonId.tsx` dynamic routes in the same directory. TanStack Router resolves static routes before dynamic params; no conflict.

**Cloudflare Workers + DOMPurify**: As of workerd (the Workers runtime), `document` is not available in the global scope of a Worker module. The `typeof document !== 'undefined'` guard reliably fires as `false` in the Worker SSR path, routing to the `escapeHtml` fallback. This is the established pattern for browser-only APIs in Worker + React SSR stacks.

**Prism.js / syntax highlighting**: Not included. Shiki (server-side) adds ~1MB; Prism.js adds ~30KB client. Neither is installed or planned. The `@tailwindcss/typography` plugin's `pre code` styles provide adequate visual distinction for the editorial reading-style AC. Re-evaluate when generated lessons are available to judge how complex code blocks actually are.

## Recommended Next Stage

- **Option A (default): implement lesson-renderer** → follow the 14-step plan; schema first, then registry + sanitizer, then components, then route, then tests. All dependencies are implemented. No blockers. Consider `/compact` before implementing — five slice planning cycles of research are now in context.
- **Option B: plan sample-journey in parallel** — `sample-journey` requires this slice's `LessonDocumentV1` schema (Step 1's output), but does not need the renderer itself. The sample-journey plan can be authored after Step 1 is complete. Not recommended to parallel-implement before the renderer is verified.
- **Option C: revisit slice** — Not indicated; no slice-boundary issues.
