---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: fix-continue-button
review-command: code-simplification
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

# Review: code-simplification

## Findings

No findings.

## Detailed Findings

None.

## Summary

- Open findings: 0
- Open blockers: 0
- Status: Clean

**Reuse.** The new `<Link to="/journey/$journeyId/progress" params={{ journeyId: journey.id }}
className="btn-base btn-secondary btn-sm">` in `src/components/dashboard/JourneyCard.tsx:55-63`
carries exactly the class string `Button({ variant: "secondary", size: "sm" })` would render
(`btn-base ${variantClass} ${sizeClass}` in `src/components/ui/Button.tsx:29-37`) — no
hand-rolled styling, no new CSS added to `src/styles.css`, and `.btn-base` already supplies
`display: inline-flex`, `gap`, and `text-decoration: none` (`src/styles.css:202-214`), so the
icon + label layout and link-not-underlined requirement come for free. The Link-styled-as-button
shape itself is not new: it's the same pattern already in use at
`JourneysDashboard.tsx:57-64` (empty-state CTA) and six further sites (`QuizView.tsx`,
`waypoint/$waypointId/index.tsx`, `waypoint/$waypointId/quiz.tsx`,
`sample/index.tsx`, `sample/lesson-1.tsx`, `sample/lesson-2.tsx`). With 7 pre-existing instances
and no `LinkButton`/`AnchorButton` wrapper ever extracted, the codebase has already settled on
inlining `btn-base btn-{variant} btn-{size}` onto `Link` as the accepted idiom — adding an 8th
instance is following convention, not a missed-reuse opportunity ripe for extraction.

**Quality.** The component diff is a like-for-like swap: `Button` import removed, `Link` import
added, same children (`Continue` + `<ArrowRight>`), same `aria-label`. No new state, no new
props, no dead code, no narrating comments.

**Test boilerplate.** `JourneyCard.test.ts:34-56` builds a two-route TanStack Router
(`createRootRoute`/`createRoute`/`createRouter`/`createMemoryHistory`) rather than a lighter
shallow render. This is the minimum required, not gold-plating: AC-1 asserts real client-side
navigation to the progress route (`router.state.location.pathname`), which needs an actual
target route to land on, and AC-2 asserts the rendered element is a real `<a>` — both need a
working `RouterProvider` tree, not a mock. No prior router-test helper exists anywhere else in
`src/` to reuse (only match besides this file is the unrelated `__root.tsx` route definition),
so this isn't a missed-reuse case either. The `React.createElement(...)` calls and the
`// eslint-disable-next-line @typescript-eslint/no-explicit-any` cast on `RouterProvider` look
like avoidable JSX/typing overhead at first glance, but `vitest.config.ts:10`'s `include` only
matches `src/**/*.test.ts` / `src/**/*.spec.ts` (no `.tsx`) — so JSX is not an option for this
test file under the current config, and the `createElement` + cast is the necessitated shape,
not an oversight.

No efficiency concerns: this is a presentational swap in a component with no loops, no data
fetching, and no state added.
