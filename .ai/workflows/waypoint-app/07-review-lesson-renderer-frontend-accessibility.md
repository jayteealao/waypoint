---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: lesson-renderer
review-command: frontend-accessibility
status: complete
updated-at: "2026-07-11T20:02:45Z"
metric-findings-total: 1
metric-findings-blocker: 0
metric-findings-high: 0
metric-findings-pre-existing: 0
metric-findings-resolved: 0
result: issues-found
tags: []
refs:
  review-master: 07-review-lesson-renderer.md
---

# Review: frontend-accessibility

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| A11Y-1 | MED | High | open | false | 2026-07-11T20:02:45Z | src/components/lesson/widgets/CheckpointQuestion.tsx:80 | `<button role="radio">` native/ARIA conflict (cross-tagged: accessibility + frontend-accessibility) |

## Detailed Findings

### A11Y-1 (cross-tagged): `<button role="radio">` [MED]

**Location:** `src/components/lesson/widgets/CheckpointQuestion.tsx:80`
**Source:** accessibility, frontend-accessibility (merged)

See `07-review-lesson-renderer-accessibility.md` for full evidence and fix guidance.

**Severity:** MED | **Confidence:** High | **Pre-existing:** false
**Status:** open | **Surfaced:** 2026-07-11T20:02:45Z | **Last seen:** 2026-07-11T20:02:45Z

## Clean areas
- `ProseSection` `aria-live` announced explanation via `role="status"` is correct
- `Flipcard` focus management: `tabIndex={0}` on the container div with `role="button"` is correct
- `LessonSkeleton` `aria-hidden="true"` prevents skeleton from polluting AT tree
- All link elements in LessonView have descriptive text content (no "click here")

## Summary
- Open findings: 1 (resolved this run: 0)
- Open blockers: 0 (pre-existing: 0)
- Status: Issues Found
