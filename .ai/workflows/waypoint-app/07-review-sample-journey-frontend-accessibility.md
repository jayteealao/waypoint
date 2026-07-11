---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: sample-journey
review-command: frontend-accessibility
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

# Review: frontend-accessibility

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| AC-1 | MED | High | open | false | 2026-07-11 | src/components/quiz/QuizView.tsx:210 | `aria-pressed` semantic mismatch on single-selection quiz buttons (cross-listed from accessibility) |

## Detailed Findings

### AC-1: `aria-pressed` semantic mismatch — cross-listed from accessibility [MED]

See `07-review-sample-journey-accessibility.md` § AC-1 for full evidence and fix description.

**Summary:** `aria-pressed` is for toggle buttons. Quiz options are single-selection. Remove the prop; `disabled={answered}` + `role="status"` `aria-live="polite"` feedback region correctly communicates the post-selection state.

**Severity:** MED | **Confidence:** High | **Pre-existing:** false
**Status:** open | **Surfaced:** 2026-07-11T22:39:34Z | **Last seen:** 2026-07-11T22:39:34Z

## Summary
- Open findings: 1  (resolved this run: 0)
- Open blockers: 0  (pre-existing excluded; pre-existing findings: 0)
- Status: Issues Found
