---
schema: sdlc/v1
type: implement
slug: waypoint-app
slice-slug: fix-continue-button
slice-type: fix
compressed: true
status: complete
stage-number: 5
created-at: "2026-07-15T21:30:02Z"
updated-at: "2026-07-15T21:30:02Z"
metric-files-changed: 1
metric-lines-added: 8
metric-lines-removed: 3
metric-deviations-from-plan: 0
metric-review-fixes-applied: 0
commit-sha: ""
tags: [dashboard, navigation, journey-card]
refs:
  index: 00-index.md
  implement-index: 05-implement.md
  slice-def: 03-slice-fix-continue-button.md
  verify: 06-verify-fix-continue-button.md
next-command: wf-verify
next-invocation: "/wf verify waypoint-app fix-continue-button"
---

# Implement: fix-continue-button

## The Implementation

The journey card's "Continue" call-to-action was a dead control — a bare `<Button>` with no
handler and no link, atop a `Button` primitive that can't navigate. The fix swaps it for a
TanStack `<Link>` pointing at `/journey/$journeyId/progress` (the journey's roadmap/mastery page —
its de-facto overview, since no bare `/journey/$journeyId` index route exists), with the card's
`journey.id` interpolated per instance. It is the same Link-styled-as-button pattern the
dashboard's empty-state CTA already uses.

The change is deliberately minimal: `.btn-base` already sets `display: inline-flex`,
`align-items: center`, `gap: 0.5rem`, and `text-decoration: none`, so `className="btn-base
btn-secondary btn-sm"` on an `<a>` renders pixel-identical to the old secondary Button — no extra
layout classes, no new primitive, no wrapper. The now-unused `Button` import was removed. Typecheck
passes, which is the real guard here: TanStack's typed `to`/`params` would fail to compile against
the generated route tree if the path or param name were wrong, so a green `tsc` proves the
destination route exists and the param is correct.

## Summary of Changes

- Replaced the non-functional Continue `<Button>` in `JourneyCard` with a router `<Link>` to the
  journey progress/overview page, param-bound to the card's journey.
- Removed the unused `Button` import; added the `Link` import.

## Files Changed

- `src/components/dashboard/JourneyCard.tsx` (+8 / −3): Continue control is now a real
  navigation link (`to="/journey/$journeyId/progress"`, `params={{ journeyId: journey.id }}`),
  preserving label, `ArrowRight` icon, secondary-button styling, and the `Continue <title>`
  accessible name.

## Shared Files (also touched by sibling slices)

- None — `JourneyCard.tsx` is owned by the dashboard surface; no other open slice touches it.

## Notes on Design Choices

- **Link, not an onClick+navigate button.** A real anchor gives keyboard focus, ⌘/Ctrl-click to
  open in a new tab, and TanStack intent-preloading for free — all of which a `<button onClick>`
  would forfeit. Matches the empty-state CTA precedent in `JourneysDashboard.tsx`.
- **No extra flex classes.** Verified `.btn-base` in `styles.css:202` already supplies the
  inline-flex/gap/underline-reset the anchor needs, so styling stays to the three `btn-*` classes.

## Verification Seams Built

- AC-1 (Continue navigates to `/journey/<id>/progress`) → the destination is the existing route
  `src/routes/_authenticated/journey/$journeyId/progress.tsx`, which already exposes
  `data-testid="progress-page"` on its page wrapper — the observable seam `/wf verify` drives.
- The card root already carries `data-testid="journey-card"` and the control keeps
  `aria-label="Continue <title>"`, so the click target is selectable without new instrumentation.
- Compile-time seam: `pnpm typecheck` is green, proving the typed route/param against the
  generated route tree.

## Deviations from Plan

- None. One file, one step, exactly as the slice plan specified.

## Anything Deferred

- A distinct bare `/journey/$journeyId` overview index route was explicitly out of scope (the
  user confirmed the progress page as the overview target at the intake gate). If a separate
  overview surface is later wanted, it is a new slice (new route + component).

## Known Risks / Caveats

- Any component test asserting the old `<button>` markup for Continue will now see an `<a>`;
  `/wf verify` should update such an assertion if present. No `sdlc-debt:` shortcuts introduced.

## Freshness Research

- Not required — internal navigation change, no external dependency or API surface. The typed
  route contract (verified by `tsc`) is the authority for the destination.

## Recommended Next Stage

- **Option A (default):** `/wf verify waypoint-app fix-continue-button` — drive the signed-in
  dashboard, click Continue, assert `/journey/<id>/progress` loads (`data-testid="progress-page"`)
  and that ⌘-click opens a new tab. This is the runtime AC that implement deliberately deferred.
- **Option B:** `/wf review waypoint-app fix-continue-button` — the change is a one-line
  navigation wiring; a reviewer could sign off without a separate verify if the runtime click is
  checked manually.
