---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: lesson-renderer
review-command: correctness
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

# Review: correctness

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| CR-1 | NIT | Low | deferred | false | 2026-07-11T20:02:45Z | src/components/lesson/LessonSection.tsx:136 | Switch default returns null silently — no runtime warning for unhandled type |

## Summary
- Open findings: 1 deferred NIT (resolved this run: 0)
- Open blockers: 0
- Status: Issues Found (NIT only)

## Clean areas
- All 5 discriminated union cases handled: `heading`, `prose`, `code`, `citation`, `widget`
- `isCheckpointProps` / `isFlipCardProps` type guards are correctly exhaustive (all required fields checked, options array element type checked)
- `useSimulatedStream` correctly resets on `delayMs` change; captured `revealed` counter stays in-scope
- `CheckpointQuestion` `answered` guard prevents double-selection
- `sanitizeHtml` SSR path correctly returns `escapeHtml()` before DOMPurify resolves — no `null`/`undefined` surface
- All `console.warn` calls in `resolveWidget` fire on both unknown-type and invalid-props paths
