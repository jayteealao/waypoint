---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: lesson-renderer
review-command: ux-copy
status: complete
updated-at: "2026-07-11T20:02:45Z"
metric-findings-total: 1
metric-findings-blocker: 0
metric-findings-high: 0
metric-findings-pre-existing: 0
metric-findings-resolved: 0
result: issues-found
fragment: none
tags: []
refs:
  review-master: 07-review-lesson-renderer.md
---

# Review: ux-copy

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| UX-1 | NIT | Low | deferred | false | 2026-07-11T20:02:45Z | src/components/lesson/widgets/Flipcard.tsx:51 | "Question"/"Answer" labels hardcoded — not localizable |

## Summary
- Open findings: 1 deferred NIT (resolved this run: 0)
- Open blockers: 0
- Status: Issues Found (NIT only)

## Clean areas
- Checkpoint copy: "Correct! explanation" / "Not quite — explanation" — warm and direct; matches the Waypoint encouragement register
- "Content unavailable" fallback: appropriately minimal; informs without alarming
- "Recommended Reading" source block label: clear, non-jargon
- Flipcard hint "Click to reveal answer" / "Click to see question": clear state description
- Checkpoint aria-label "Checkpoint question": serviceable; not confused with widget label
