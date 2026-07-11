---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: lesson-renderer
review-command: code-simplification
status: complete
updated-at: "2026-07-11T20:02:45Z"
metric-findings-total: 2
metric-findings-blocker: 0
metric-findings-high: 0
metric-findings-pre-existing: 0
metric-findings-resolved: 0
result: issues-found
tags: []
refs:
  review-master: 07-review-lesson-renderer.md
---

# Review: code-simplification

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| CS-1 | NIT | Med | deferred | false | 2026-07-11T20:02:45Z | src/components/lesson/LessonSection.tsx:127 | `any` cast in widget dispatch — justified but could use generic helper |
| CS-2 | NIT | Low | deferred | false | 2026-07-11T20:02:45Z | src/types/lesson-document.ts:82 | `PartialLessonDocument` manually repeats `LessonDocumentV1` fields |

## Detailed Findings

### CS-1: `any` cast in widget dispatch [NIT — deferred]
**Location:** `src/components/lesson/LessonSection.tsx:127`
**Evidence:** `const WidgetComponent = resolved.component as React.ComponentType<any>`
**Issue:** The `any` cast is explained in a comment (TypeScript cannot carry the generic P across the `resolveWidget()` call). A typed `renderWidget` generic helper could eliminate it, but adds complexity. The current approach is idiomatic for this constraint. **Deferred** — convention decision needed.
**Severity:** NIT | **Confidence:** Med | **Pre-existing:** false | **Status:** deferred

### CS-2: `PartialLessonDocument` verbose interface [NIT — deferred]
**Location:** `src/types/lesson-document.ts:82`
**Evidence:** Interface repeats `version`, `title`, `summary`, `sources`, `recommended_primary_source` from `LessonDocumentV1`
**Fix:** `type PartialLessonDocument = Omit<LessonDocumentV1, 'sections'> & { sections: (LessonSection | null)[] }`
**Issue:** Utility type would auto-inherit future `LessonDocumentV1` field additions. Current explicit interface works but may drift. **Deferred** — clean cosmetic change, no urgency.
**Severity:** NIT | **Confidence:** Low | **Pre-existing:** false | **Status:** deferred

## Summary
- Open findings: 2 deferred (resolved this run: 0)
- Open blockers: 0 (pre-existing: 0)
- Status: Issues Found (NITs only)

## Clean areas
- Widget registry: minimal `Map` + factory pattern; no over-engineering
- `sanitize.ts`: direct and readable; no unnecessary abstractions
- `stream-driver.ts`: 40 lines for the hook; appropriate simplicity
- All `eslint-disable` comments have explanatory context
