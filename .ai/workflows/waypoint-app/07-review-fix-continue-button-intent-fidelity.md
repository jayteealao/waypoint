---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: fix-continue-button
review-command: intent-fidelity
status: complete
updated-at: "2026-07-16T16:48:34Z"
metric-findings-total: 0
metric-findings-blocker: 0
metric-findings-high: 0
metric-findings-pre-existing: 0
metric-findings-resolved: 0
metric-findings-fixed: 1
result: clean
fragment: none
tags: [dashboard, navigation, journey-card]
refs:
  review-master: 07-review-fix-continue-button.md
---

# Review: intent-fidelity

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| IF-1 | HIGH | High | fixed | false | 2026-07-16 | src/components/dashboard/JourneyCard.tsx:55 | Continue unconditionally targets `/progress`, which cannot resume a journey stuck mid-interview — **fixed** (commit 8ae9089) |

## Detailed Findings

### IF-1: "Continue" always targets `/progress`, which cannot resume a journey stuck mid-interview [HIGH]

**Location:** `src/components/dashboard/JourneyCard.tsx:55-58`

**Evidence:**
```
JourneyCard.tsx:55-58 (diff-added):
  <Link
    to="/journey/$journeyId/progress"
    params={{ journeyId: journey.id }}
    className="btn-base btn-secondary btn-sm"
    aria-label={`Continue ${journey.title}`}
  >

02-shape.md:109 (betrayed directive, this workflow's own core-loop failure-mode contract):
  "Learner abandons interview mid-way -> partial interview state persists; journey resumes at
  the pending question."

src/server/journeys.ts:27-32 (listJourneys — feeds the dashboard, no completeness filter):
  "SELECT * FROM journeys WHERE user_id = ? ORDER BY created_at DESC"

src/routes/_authenticated/journey/new.tsx:46-51 (journey creation flow):
  const journey = await createJourney({ data: { title: trimmed, goal: trimmed } });
  await startInterview({ data: journey.id });
  await navigate({ to: "/journey/$journeyId/interview", params: { journeyId: journey.id } });

src/components/progress/ProgressPanel.tsx:173-183 (EmptyState) + :64-90 (RoadmapList):
  EmptyState only fires on quizHistory.length === 0; RoadmapList renders a bare empty <ol> when
  waypoints=[] — no message, no link back to /interview.
```

**Issue:** The fix's stated goal — "so a returning learner can resume the journey they created" (this slice's own Restated Request) — and the intake-level contract it must honor (shape's explicit resume-at-pending-question guarantee for abandoned interviews) both require "Continue" to actually put the learner back where they can pick up. The shipped `Link` treats "journey overview" as one static destination (`/progress`) for every card, with no branch on whether that journey's interview/roadmap ever completed.

Trace of the failure path: `new.tsx` creates the `journeys` row and calls `startInterview` *before* navigating to `/interview` (`journey.id` is persisted the moment the form submits). If the learner closes the tab, loses network, or otherwise abandons the interview — the exact scenario `02-shape.md:109` names as a first-class failure mode with a promised resume behavior — the journey row survives with zero waypoints. `listJourneys` (the dashboard's data source) has no filter for interview/roadmap completeness, so that journey renders a normal `JourneyCard` with a live "Continue" control. Clicking it now — post-fix — genuinely navigates (real anchor, correct href), but lands on `/progress`, whose `getJourneyProgress` loader returns `waypoints: []`, and whose `ProgressPanel` renders an **empty roadmap list with no waypoints, no quiz history, and no link anywhere back to `/interview`**. The `EmptyState` sub-component only triggers on zero quiz *history*, not zero waypoints, so this specific state isn't even a labeled empty state — it is a silent, dead-end shell.

This is an uncovered narrowing: the slice's own "Decision — destination (confirm at gate)" section resolves "journey overview" as if every journey card were in the same state (roadmap generated, waypoints present — the only case the fix's regression test in `JourneyCard.test.ts` exercises), and no RIM ledger entry or shape fidelity-table row adjudicates this narrower reading. For journeys still mid-interview, the shipped behavior is a simplified imitation of "Continue resumes the journey": the control now *looks* functional (real link, right styling, passes the headless test) for a fixture that always has a complete roadmap, but for the real, named failure-mode population it still does not deliver what the button promises — it just fails more quietly than the old dead `<Button>` did (a click that goes somewhere pointless is easy to mistake for "working").

**Fix:** Branch the Continue destination on journey/interview completeness — e.g. check `journey` for a roadmap/waypoint signal (or thread an `interviewComplete`/`waypointCount` flag from the dashboard loader that already computes `masteryByJourneyId`) and route to `/journey/$journeyId/interview` when no waypoints exist yet; alternatively, give `ProgressPanel`'s waypoints-empty state its own message with a "Resume interview" link. Either closes the gap between the promised "resume the journey" and the actual behavior for this journey state.

**Severity:** HIGH | **Confidence:** High | **Pre-existing:** false
**Status:** fixed | **Surfaced:** 2026-07-16 | **Last seen:** 2026-07-16 | **Fixed:** 2026-07-16T17:43:28Z (commit 8ae9089)

**Fix applied (review-owned fix loop):** Continue's destination now branches on roadmap presence. `getProgressForDashboard` returns a `hasRoadmap` signal per journey (waypoint count > 0, one bulk query added in parallel to the existing FSRS aggregate — no per-card N+1), threaded through the dashboard loader → `JourneysDashboard` → `JourneyCard`. When `hasRoadmap` is false (journey abandoned mid-interview), `<Link to>` resolves to `/journey/$journeyId/interview` (resume the interview per 02-shape.md:109); otherwise it keeps `/journey/$journeyId/progress`. The regression test covers both branches. Verified: typecheck, lint, and full suite (237 passed / 0 failed) green.

## Summary

- Open findings: 0    (fixed this run: 1)
- Open blockers: 0    (pre-existing excluded; pre-existing findings: 0)
- Status: Clean (the one HIGH, IF-1, was fixed in-loop — commit 8ae9089)

The shipped diff advances the intake's product for the case it was tested against: a journey with an
already-generated roadmap now has a real, accessible, preload-capable link where a dead `<button>`
used to sit, and the chosen destination (`/journey/$journeyId/progress`) is correctly grounded — the
layout-only `$journeyId.tsx` route has no index child, and `progress.tsx` is genuinely the app's
mastery-map/roadmap surface, matching the dashboard header's own framing ("Pick up where you left
off"). That part is a real fix, not an imitation. The gap is narrower and more specific: the fix
treats "the journey" as a single state and never accounts for the journey/interview lifecycle the
rest of this workflow explicitly designed for (`02-shape.md:109`'s abandoned-interview resume
contract, and `new.tsx`'s create-before-interview-completes flow that makes that state reachable from
the dashboard). For that population, "Continue" still doesn't resume anything — it silently strands
the learner on an empty progress shell with no way back into the interview. Because this is the one
load-bearing decision the compressed slice document itself flags ("Decision — destination (confirm at
gate)"), and no ledger entry adjudicates the narrower reading, IF-1 is filed HIGH rather than a
cosmetic note.
