---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: lesson-renderer
review-command: accessibility
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

# Review: accessibility

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| A11Y-1 | MED | High | open | false | 2026-07-11T20:02:45Z | src/components/lesson/widgets/CheckpointQuestion.tsx:80 | `<button role="radio">` overrides native button semantics — AT conflict |

## Detailed Findings

### A11Y-1: `<button role="radio">` ARIA conflict in CheckpointQuestion [MED]

**Location:** `src/components/lesson/widgets/CheckpointQuestion.tsx:80-89`
**Source:** accessibility

**Evidence:**
```tsx
<button
  role="radio"
  aria-checked={isSelected}
  aria-disabled={answered && !isSelected}
  className="wp-checkpoint-option"
  data-testid={`checkpoint-option-${i}`}
  onClick={() => choose(i)}
  onKeyDown={(e) => handleKeyDown(i, e)}
  tabIndex={!answered || isSelected ? 0 : -1}
  type="button"
>
```

**Issue:** Using `<button type="button" role="radio">` overrides the native button role with ARIA `radio`. The WAI-ARIA spec permits this, but some assistive technologies (particularly JAWS and older NVDA versions) announce the native element type alongside or instead of the override role, potentially reading "button — unchecked" rather than "radio button — unchecked". The WAI-ARIA Authoring Practices Guide radio group pattern uses a non-interactive host element (`div` or `li`) for `role="radio"` to avoid this ambiguity.

Additionally, the native `<button>` fires a `click` event on Enter key, while the `onKeyDown` handler also calls `choose(i)` on Enter. These are redundant but harmless due to the `if (answered) return` guard. Using a `<div role="radio">` eliminates this duplication.

**Fix:** Replace `<button>` with `<div role="radio" tabIndex={...}>` (or wrap in `<ul role="radiogroup"><li role="radio">` for semantics). Add explicit `onClick` and keyboard handler (`Enter`/`Space`). This removes the native-vs-ARIA conflict and follows the established APG pattern.

**Severity:** MED | **Confidence:** High | **Pre-existing:** false
**Status:** open | **Surfaced:** 2026-07-11T20:02:45Z | **Last seen:** 2026-07-11T20:02:45Z

## Summary
- Open findings: 1 (resolved this run: 0)
- Open blockers: 0 (pre-existing excluded; pre-existing findings: 0)
- Status: Issues Found

## Clean areas
- `LessonSkeleton` — correct `aria-hidden="true"` on decorative placeholder
- `Flipcard` — `role="button"` on div, `aria-pressed`, `aria-label` correctly describes current state, keyboard `Enter`/`Space` handled
- `CheckpointQuestion` — `role="radiogroup"` container, `aria-live="polite"` on explanation announcement, `tabIndex={-1}` on answered non-selected options (removes from tab order cleanly)
- `LessonSection` widget-rejected fallback — `role="alert"`, `aria-label="Widget unavailable"` provides screen reader context
- `ProseSection` — `suppressHydrationWarning` does not suppress a11y announcements
