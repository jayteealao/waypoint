---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: fix-continue-button
review-command: correctness
status: complete
updated-at: "2026-07-16T16:48:34Z"
metric-findings-total: 0
metric-findings-blocker: 0
metric-findings-high: 0
metric-findings-pre-existing: 0
metric-findings-resolved: 0
result: clean
fragment: none
tags: []
refs:
  review-master: 07-review-fix-continue-button.md
---

# Review: correctness

## Findings

No findings.

## Detailed Findings

None.

## Summary

- Open findings: 0
- Open blockers: 0
- Status: Clean

**Scope:** `src/components/dashboard/JourneyCard.tsx` (Continue control swapped from an
inert `<Button>` with no `onClick`/`href` to a real `@tanstack/react-router` `<Link>`), plus
the new regression test `src/components/dashboard/JourneyCard.test.ts`.

**What was checked:**

1. **Route target correctness.** `to="/journey/$journeyId/progress"` with
   `params={{ journeyId: journey.id }}` — cross-checked against
   `src/routeTree.gen.ts` (`'/journey/$journeyId/progress': typeof
   AuthenticatedJourneyJourneyIdProgressRoute`, `fullPath:
   '/journey/$journeyId/progress'`) and the target route file
   `src/routes/_authenticated/journey/$journeyId/progress.tsx`. The `_authenticated`
   segment is a pathless layout (no URL segment), so the `to` string matches the real
   route's full path exactly — no dead link.
2. **Param type correctness.** `Journey.id` is `string` (`src/db/schema.ts:13`), matching
   the route's inferred `journeyId: string` param — no runtime coercion or type mismatch.
   `pnpm exec tsc --noEmit` on the full project is clean.
3. **Style parity.** The removed `<Button variant="secondary" size="sm">` rendered
   `className={\`btn-base ${variantClass} ${sizeClass} ${className}\`}` →
   `"btn-base btn-secondary btn-sm "` (`src/components/ui/Button.tsx:29-37`). The new
   `<Link className="btn-base btn-secondary btn-sm">` reproduces the identical class set,
   and `.btn-base`/`.btn-secondary`/`.btn-sm` all exist in `src/styles.css`. The
   `:not(:disabled)` hover/active/focus selectors used by those classes are harmless on an
   `<a>` (anchors never match `:disabled`, and this control was never conditionally
   disabled) — no visual regression.
4. **Preload/eager-fetch risk.** `JourneyCard` is rendered once per journey inside
   `JourneysDashboard`'s grid (`src/components/dashboard/JourneysDashboard.tsx:104-111`).
   Swapping an inert button for a `Link` could, under an eager `defaultPreload`, fire the
   progress route's loader (`getJourneyProgress`) for every card on mount. Checked
   `src/router.tsx:12`: `defaultPreload: "intent"` — preload only fires on hover/focus
   intent, so no eager fan-out of server-function calls is introduced.
5. **Nested-interactive-element check.** `JourneyCard` renders as a top-level `<article>`
   (not wrapped in another `<a>`/`<button>` by its only caller, `JourneysDashboard`), so
   the new anchor does not produce an invalid nested-anchor DOM structure.
6. **Test verification (ran, not just read).**
   - `pnpm exec tsc --noEmit -p tsconfig.json` → clean, no errors.
   - `pnpm exec vitest run src/components/dashboard/JourneyCard.test.ts` → 2/2 passing.
     The test mounts a real `createRouter` (memory history) with the actual
     `/journey/$journeyId/progress` leaf and asserts (a) the rendered element is an
     `<a>` with `href="/journey/jrny_123/progress"`, and (b) a real `fireEvent.click`
     navigates the router to that path and mounts the target route's component — this is
     an end-to-end assertion of the fixed behavior, not a shallow render check.

No edge case, type mismatch, route-path drift, style regression, or eager-loader hazard was
found in the diff. The fix is a minimal, behavior-correct swap with adequate regression
coverage.
