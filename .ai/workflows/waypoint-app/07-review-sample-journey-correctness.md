---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: sample-journey
review-command: correctness
status: complete
updated-at: "2026-07-11T22:39:34Z"
metric-findings-total: 1
metric-findings-blocker: 0
metric-findings-high: 0
metric-findings-pre-existing: 0
metric-findings-resolved: 0
result: issues-found
tags: []
refs:
  review-master: 07-review-sample-journey.md
---

# Review: correctness

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| CR-1 | LOW | High | open | false | 2026-07-11 | src/components/quiz/QuizView.tsx:110 | Non-null assertion on `restoredAttempt` in results screen path |

## Detailed Findings

### CR-1: Non-null assertion on `restoredAttempt` in results branch [LOW]

**Location:** `src/components/quiz/QuizView.tsx:110`

**Evidence:**
```tsx
if (showResults) {
  const attempt = restoredAttempt!   // line 110
  const correct = Math.round(attempt.score * questions.length)
```

**Issue:** `showResults` is set to `true` in two places: (a) inside the `useEffect` mount handler after `setRestoredAttempt(attempt)` is called, and (b) inside `handleAdvance` after `setRestoredAttempt(attempt)` is called. In both cases `restoredAttempt` is always non-null before `showResults` flips. However, the non-null assertion (`!`) silences TypeScript's null-check and will produce a runtime `TypeError: Cannot read properties of null` if the ordering assumption ever breaks (e.g., if the two `useState` setters are batched differently or if a future refactor adds a third path into `showResults = true`). A null guard makes the invariant explicit and removes the assertion.

**Fix:** Replace `const attempt = restoredAttempt!` with an explicit null guard:
```tsx
const attempt = restoredAttempt
if (!attempt) return null
```
This makes the invariant explicit, satisfies TypeScript without an assertion, and is safe — the component simply renders nothing rather than crashing on a null reference.

**Severity:** LOW | **Confidence:** High | **Pre-existing:** false
**Status:** open | **Surfaced:** 2026-07-11T22:39:34Z | **Last seen:** 2026-07-11T22:39:34Z

## Summary
- Open findings: 1  (resolved this run: 0)
- Open blockers: 0  (pre-existing excluded; pre-existing findings: 0)
- Status: Issues Found
