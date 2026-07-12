---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: quiz-fsrs
review-command: correctness
status: complete
updated-at: "2026-07-12T04:54:26Z"
metric-findings-total: 1
metric-findings-blocker: 0
metric-findings-high: 0
metric-findings-pre-existing: 0
metric-findings-resolved: 0
result: issues-found
fragment: none
tags: []
refs:
  review-master: 07-review-quiz-fsrs.md
---

# Review: correctness

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| COR-1 | LOW | Med | deferred | false | 2026-07-12T04:54:26Z | src/routes/_authenticated/journey/$journeyId/waypoint/$waypointId/quiz.tsx:36 | Empty quiz retry: if all concept generation fails, loader retries on every visit |

## Detailed Findings

### COR-1: Empty quiz causes unbounded generation retries [LOW]

**Location:** `src/routes/_authenticated/journey/$journeyId/waypoint/$waypointId/quiz.tsx:36`

**Evidence:**
```typescript
let questions = await getQuizQuestions({ data: waypointId })
if (questions.length === 0) {
  questions = await generateQuiz({ data: { waypointId, journeyId } })
}
```

**Issue:** If `generateQuiz` returns an empty array (all concepts fail validation in two attempts each), the quiz page shows an empty state but next visit tries again. Under persistent gateway failures this causes repeated callGateway calls on every quiz page load.

**Fix:** After a failed generation, insert a sentinel `quiz_questions` row or set a `generation_failed_at` flag on the waypoint, checked before retrying. Alternatively: if `generateQuiz` returns `[]`, navigate back to lesson with an error message. Deferred — the gateway already has quota enforcement limiting worst-case spend.

**Severity:** LOW | **Confidence:** Med | **Pre-existing:** false
**Status:** deferred | **Surfaced:** 2026-07-12T04:54:26Z | **Last seen:** 2026-07-12T04:54:26Z

## Summary

- Open findings: 1 (resolved this run: 0)
- Open blockers: 0 (pre-existing excluded; pre-existing findings: 0)
- Status: Issues Found
