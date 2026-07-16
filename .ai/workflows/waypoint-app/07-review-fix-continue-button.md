---
schema: sdlc/v1
type: review
slug: waypoint-app
review-scope: per-slice
slice-slug: fix-continue-button
status: complete
stage-number: 7
created-at: "2026-07-16T17:43:28Z"
updated-at: "2026-07-16T17:43:28Z"
verdict: ship
commands-run: [correctness, security, code-simplification, frontend-accessibility, intent-fidelity]
metric-commands-run: 5
metric-findings-total: 0
metric-findings-raw: 1
metric-findings-blocker: 0
metric-findings-pre-existing: 0
metric-findings-high: 0
metric-findings-med: 0
metric-findings-low: 0
metric-findings-nit: 0
metric-findings-resolved: 0
metric-findings-fixed: 1
metric-findings-total-ever: 1
fragment: none
runs:
  - at: "2026-07-16T17:43:28Z"
    dimensions: [correctness, security, code-simplification, frontend-accessibility, intent-fidelity]
    verdict: ship
    fix-commit: "8ae9089"
tags: [dashboard, navigation, journey-card]
refs:
  index: 00-index.md
  slice-def: 03-slice-fix-continue-button.md
  implement: 05-implement-fix-continue-button.md
  verify: 06-verify-fix-continue-button.md
  sub-reviews:
    - 07-review-fix-continue-button-correctness.md
    - 07-review-fix-continue-button-security.md
    - 07-review-fix-continue-button-code-simplification.md
    - 07-review-fix-continue-button-frontend-accessibility.md
    - 07-review-fix-continue-button-intent-fidelity.md
next-command: wf-handoff
next-invocation: "/wf handoff waypoint-app"
---

# Review

## The Review

This is the review the fix-continue-button slice was missing — the one gate standing between the slice and a clean handoff. The change under review is small: the journey card's "Continue" call-to-action, previously a dead `<Button>` with no handler, became a real TanStack `<Link>`. Five dimensions looked at it — the mandated floor (correctness, security, code-simplification) plus frontend-accessibility (a button→anchor swap changes the semantics screen readers and keyboards see) and intent-fidelity (does the wiring actually let a learner *resume* their journey, or just navigate somewhere).

Four came back clean, and two of those clean verdicts are worth more than a rubber stamp because the reviewers grounded them in real source rather than recalled API shapes: security confirmed against `@tanstack/router-core` that typed path-param interpolation runs through `encodeURIComponent` (so `journey.id` can't smuggle a traversal or query-injection into the URL), and that the destination route is already auth-gated and ownership-checked server-side — this diff adds a UI door to a room that was already locked. Frontend-accessibility verified the accessible name carried over intact and that a real anchor is strictly more usable than the dead button it replaced.

Intent-fidelity is where the review earned its keep. It found (IF-1, HIGH) that pointing every card's Continue at `/progress` quietly betrayed the fix's own stated goal for one real population: a journey abandoned mid-interview has no roadmap, so Continue would land the learner on an empty progress shell with no way back into the interview — the shape explicitly promises those journeys "resume at the pending question." That was fixed in this same run (commit `8ae9089`): Continue now branches on whether a roadmap exists (waypoint count > 0, threaded through the dashboard's existing aggregate as one bulk query, no per-card N+1), routing to `/interview` when it doesn't and `/progress` when it does, with the regression test covering both branches. After the fix, zero findings remain open. **Verdict: ship.**

## Verdict

**Ship**

All five reviewed dimensions are clean. The only substantive finding — IF-1 (HIGH, intent-fidelity): "Continue" stranded mid-interview journeys on an empty progress page — was fixed in the review-owned fix loop (commit `8ae9089`) and re-verified (typecheck, lint, full suite 237 passed / 0 failed). No open blockers, no open findings of any severity.

## Domain Coverage

| Domain | Command | Status |
|--------|---------|--------|
| Logic / route / param correctness | `correctness` | Clean |
| Vulnerabilities / injection / authz | `security` | Clean |
| Reuse / minimalism | `code-simplification` | Clean |
| A11y of button→anchor swap | `frontend-accessibility` | Clean |
| Intent vs. shipped behavior | `intent-fidelity` | Clean (IF-1 fixed in-loop) |

## All Findings

| ID | Sev | Conf | Status | Pre | Surfaced | Source | File:Line | Issue |
|----|-----|------|--------|-----|----------|--------|-----------|-------|
| IF-1 | HIGH | High | fixed | false | 2026-07-16 | intent-fidelity | src/components/dashboard/JourneyCard.tsx:55 | Continue unconditionally targeted `/progress`, unable to resume a journey abandoned mid-interview — **fixed** (commit 8ae9089) |

**Open:** BLOCKER: 0 | HIGH: 0 | MED: 0 | LOW: 0 | NIT: 0   **Pre-existing:** 0
**Closed:** resolved: 0 | fixed: 1 | dismissed: 0   **Ledger size (ever):** 1
*(This run: 1 net-new, 0 re-confirmed, 0 resolved; merged from 1 raw finding across 5 commands; 1 fixed in-loop)*

## Findings (Detailed)

### IF-1: "Continue" always targeted `/progress`, which cannot resume a journey stuck mid-interview [HIGH]

**Location:** `src/components/dashboard/JourneyCard.tsx:55`
**Source:** intent-fidelity

**Issue:** The slice's restated intent — "so a returning learner can resume the journey they created" — plus the shape's explicit resume-at-pending-question contract (`02-shape.md:109`) require Continue to actually put the learner back where they can pick up. The first-pass diff routed every card to `/journey/$journeyId/progress` unconditionally. Because `listJourneys` has no completeness filter and `journey/new.tsx` persists the journey row before the interview completes, a journey abandoned mid-interview renders a live Continue control that would navigate to an empty progress shell (`waypoints: []`, no link back to `/interview`) — failing more quietly than the old dead button.

**Fix:** Branch the Continue destination on roadmap presence. `getProgressForDashboard` now returns `{ masteryPct, hasRoadmap }` per journey (`hasRoadmap` = waypoint count > 0, added as one bulk `Promise.all` query alongside the existing FSRS aggregate — no per-card query), threaded through the loader → `JourneysDashboard` → `JourneyCard`. `<Link to>` resolves to `/journey/$journeyId/interview` when `hasRoadmap` is false, else `/journey/$journeyId/progress`. The regression test exercises both branches.

**Severity:** HIGH | **Confidence:** High | **Pre-existing:** false
**Status:** fixed | **Surfaced:** 2026-07-16 | **Last seen:** 2026-07-16 | **Fixed:** 2026-07-16T17:43:28Z (commit 8ae9089)

## Triage Decisions

| ID | Sev | Source | Decision | Notes |
|----|-----|--------|----------|-------|
| IF-1 | HIGH | intent-fidelity | fix | User chose "Fix now, then push" — fixed in-loop, commit 8ae9089 |

## Fix Status

| ID | Sev | Source | Status | Fixed-at | Commit | Notes |
|----|-----|--------|--------|----------|--------|-------|
| IF-1 | HIGH | intent-fidelity | fixed | 2026-07-16T17:43:28Z | 8ae9089 | Branched Continue destination on roadmap presence; both branches tested; suite green |

## Recommendations

### Must Fix (triaged "fix")
- None remaining — IF-1 fixed in-loop (commit 8ae9089).

### Should Fix (MED triaged "fix")
- None.

### Deferred (triaged "defer")
- None.

### Dismissed
- None.

### Consider (LOW/NIT — not triaged)
- None.

## Recommended Next Stage

- **Option A (default):** `/wf handoff waypoint-app` — verdict ship, no open findings; this slice was the last review gate blocking the branch handoff. Re-run the branch handoff (`/wf handoff feat/waypoint-app`) to package waypoint-app and refresh PR #1.
- **Option B:** `/wf review waypoint-app fix-continue-button` — accumulating re-run if you want to re-check the fixed code with fresh eyes (resolve-sweeps what the fix cleared).
