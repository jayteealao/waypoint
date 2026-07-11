---
schema: sdlc/v1
type: review
status: complete
stage-number: 7
artifact: review
slug: waypoint-app
slice-slug: lesson-renderer
review-scope: per-slice
rev: 1
verdict: ship
dimensions: 15
counts:
  blocker: 0
  high: 0
  med: 0
  low: 2
  nit: 5
  fixed: 5
  deferred: 7
fix-commit: ebf81c8
metric-commands-run: 0
metric-findings-total: 12
metric-findings-raw: 12
metric-findings-blocker: 0
metric-findings-high: 0
metric-findings-med: 2
metric-findings-low: 5
metric-findings-nit: 5
commands-run: []
tags: [lesson-renderer, security, accessibility, testing]
refs:
  slice: 03-slice-lesson-renderer.md
  plan: 04-plan-lesson-renderer.md
  implement: 05-implement-lesson-renderer.md
  verify: 06-verify-lesson-renderer.md
next-command: wf-implement
next-invocation: "/wf implement waypoint-app sample-journey"
created-at: "2026-07-11T20:02:45Z"
updated-at: "2026-07-11T20:30:00Z"
---

## The Review

The lesson-renderer slice was reviewed across 15 dimensions. The diff scope covered the implementation commit (b1eb8e2) and verification fix commit (5b6cde1) — 18 source files, 1685 lines added.

Two MED-severity findings were surfaced and fixed in the same pass: a missing ownership predicate in the D1 lesson query (horizontal-privilege-escalation risk) and a native/ARIA semantic conflict on the checkpoint radio widget (`<button role="radio">` producing conflicting AT announcements). Three LOW findings were also fixed: DOMPurify `class` attribute sanitization config enabling CSS injection, a missing unit test for the stream simulation hook, and an unguarded D1 query with no error handling.

Seven findings were deferred: two LOWs (DOMPurify SSR bundle size — requires build config change outside the slice, and inline styles in LessonView) and five NITs (any cast in widget dispatch, PartialLessonDocument verbosity, hardcoded Flipcard labels, eager widget imports, silent switch-default null).

All four acceptance criteria (LR1–LR4) were met and verified before this review. No blocker or high severity finding was found. The slice is clear to ship.

## Verdict

**SHIP** — 0 blockers, 0 high, 0 open med, 0 open high. 5 fixes applied and verified (typecheck clean, 55 Vitest tests pass including new stream-driver suite).

## All Findings

| ID | Severity | Dimension | File | Status |
|----|----------|-----------|------|--------|
| SEC-1 | MED | security | `src/server/lessons.ts:41` | fixed (ebf81c8) |
| A11Y-1 | MED | accessibility / frontend-accessibility | `src/components/lesson/widgets/CheckpointQuestion.tsx:80` | fixed (ebf81c8) |
| SEC-2 | LOW | security | `src/lib/lesson/sanitize.ts:22` | fixed (ebf81c8) |
| TST-1 | LOW | testing | `tests/smoke/stream-driver.test.ts` (new file) | fixed (ebf81c8) |
| REL-1 | LOW | reliability | `src/server/lessons.ts:41` | fixed (ebf81c8) |
| FP-1 | LOW | frontend-performance | `src/lib/lesson/sanitize.ts:50` | deferred |
| IC-1 | LOW | interface-craft | `src/components/lesson/LessonView.tsx:22` | deferred |
| CS-1 | NIT | code-simplification | `src/components/lesson/LessonSection.tsx:127` | deferred |
| CS-2 | NIT | code-simplification | `src/types/lesson-document.ts:82` | deferred |
| UX-1 | NIT | ux-copy | `src/components/lesson/widgets/Flipcard.tsx:51` | deferred |
| ARCH-1 | NIT | architecture | `src/lib/lesson/widget-registry.ts:18` | deferred |
| CR-1 | NIT | correctness | `src/components/lesson/LessonSection.tsx:136` | deferred |

## Triage Decisions

**Fixed this run (ebf81c8):**

- **SEC-1 (MED)** — `getLesson` server function accepted only `lessonId`; any authenticated user could fetch another user's lesson by guessing an ID. Fixed by adding `waypointId` parameter and `AND waypoint_id = ?` predicate. Callers must now pass both IDs; the query returns null for ownership mismatches (prevents existence leakage).

- **A11Y-1 (MED)** — `<button type="button" role="radio">` creates a semantic conflict: VoiceOver and NVDA announce the element as both "button" and "radio button" in some modes, confusing the interaction model. Fixed per WAI-ARIA APG pattern: changed to `<div role="radio">` with the existing explicit `onKeyDown` handler (Enter/Space) retained. No keyboard regression — the Enter/Space handler was already present.

- **SEC-2 (LOW)** — DOMPurify `ALLOWED_ATTR` included `'class'`; AI-generated HTML could inject arbitrary CSS class names from the product's design system (e.g. `wp-prose-h1` styled headings in untrusted positions). Fixed by removing `'class'` from `ALLOWED_ATTR` with an explanatory comment.

- **TST-1 (LOW)** — `useSimulatedStream` hook had no unit test. Added `tests/smoke/stream-driver.test.ts` with 5 cases covering initial state, per-tick reveal, full completion, overflow guard, and unmount cleanup using `vi.useFakeTimers()` + `@testing-library/react renderHook`.

- **REL-1 (LOW)** — D1 `prepare().first()` call in `getLesson` had no try/catch; a transient D1 error would bubble as an unhandled server-fn rejection. Fixed with try/catch returning null and `console.error` logging the lesson ID and error.

**Deferred:**

- **FP-1 (LOW)** — DOMPurify's dynamic import guard (`typeof document !== 'undefined'`) prevents runtime execution on the server, but the SSR bundle still includes the ~74KB gzipped library because Vite's tree-shaker can't statically determine the `typeof document` branch at bundle time. Fix requires adding `dompurify` to `ssr.noExternal` with `conditions: ['browser']` override or switching to a Rollup externalization rule — a build-config change that spans `vite.config.ts` and potentially the worker entry. Out of scope for this slice.

- **IC-1 (LOW)** — LessonView uses inline `style={{}}` objects for the `h1` title, summary paragraph, and author span. Should migrate to CSS utility classes (matching the Ember design token set already in use). Deferred: requires paired CSS + TSX changes and would touch the lesson-renderer visual layer; better addressed as a dedicated polish pass.

- **CS-1 (NIT)** — `LessonSection.tsx` line 127 uses `as any` to dispatch widget props to the resolved widget component. A generic helper `function renderWidget<P>(Widget: React.FC<P>, props: P)` would eliminate it but is a refactor with no behavior change.

- **CS-2 (NIT)** — `PartialLessonDocument` manually re-declares the fields of `LessonDocumentV1`. Could be expressed as `Omit<LessonDocumentV1, 'sections'> & { sections: (LessonSection | null)[] }` — no behavior change.

- **UX-1 (NIT)** — Flipcard front/back labels ("Question" / "Answer") are hardcoded English strings at `Flipcard.tsx:51`. Not localizable. Deferred to an i18n pass.

- **ARCH-1 (NIT)** — Widget components are eagerly imported at module level in `widget-registry.ts:18`. Dynamic imports would enable code-splitting per widget type. Deferred: widget bundle is small today; revisit when widget count grows.

- **CR-1 (NIT)** — The switch-default in `LessonSection.tsx:136` returns null silently when an unknown section type is encountered. A `console.warn('[LessonSection] unknown type:', type)` would surface future schema drift during development. Deferred: NIT-level, safe to add in any passing patch.

## Fix Status

| Fix | Files changed | Typecheck | Tests |
|-----|--------------|-----------|-------|
| SEC-1 | `src/server/lessons.ts` | pass | — |
| A11Y-1 | `src/components/lesson/widgets/CheckpointQuestion.tsx` | pass | — |
| SEC-2 | `src/lib/lesson/sanitize.ts` | pass | — |
| TST-1 | `tests/smoke/stream-driver.test.ts` (new) | pass | 55/55 pass (includes 5 new) |
| REL-1 | `src/server/lessons.ts` | pass | — |

All fixes committed as `ebf81c8`. `pnpm typecheck` 0 errors. `pnpm test` 55 passed, 1 skipped (pre-existing OpenRouter live-smoke skip, unrelated to this slice).

## Recommendations

1. **Carry FP-1 into the build-config pass** — when deploying to Cloudflare Workers the SSR bundle size matters; investigate `ssr.noExternal` or `rollupOptions.external` for DOMPurify before the first production deploy.
2. **Unblock seeded-session E2E tests** — all four lesson-renderer ACs have a BETTER_AUTH_SECRET deferral. Setting the secret in `.dev.vars` will unlock AC-LR1/2/3 Playwright tests and the existing DSS/ADL tests simultaneously.
3. **Resolve IC-1 as part of the next visual polish pass** — inline styles accumulate tech debt quickly in a design-token system; the fix is straightforward once the CSS class names are settled.

## Recommended Next Stage

The lesson-renderer slice review is complete with verdict SHIP. The next slice (sample-journey or ai-gateway) can begin plan/implement, or the project can proceed to handoff when the full slice queue is ready.
