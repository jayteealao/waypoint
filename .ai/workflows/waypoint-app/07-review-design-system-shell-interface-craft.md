---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: design-system-shell
review-command: interface-craft
status: complete
updated-at: "2026-07-11T15:17:15Z"
metric-findings-total: 1
metric-findings-blocker: 0
metric-findings-high: 0
metric-findings-pre-existing: 0
metric-findings-resolved: 0
result: issues-found
tags: []
refs:
  review-master: 07-review-design-system-shell.md
---

# Review: interface-craft

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| IC-1 | LOW | Med | open | false | 2026-07-11 | src/styles.css:195 | Focus ring border-radius (6px) mismatches element radii (10px/16px) |

## Detailed Findings

### IC-1: Focus ring border-radius mismatches element border-radius [LOW]

**Location:** `src/styles.css:195`

**Source:** interface-craft

**Evidence:**
```css
:focus-visible {
  outline: 3px solid oklch(0.54 0.19 32 / 0.5);
  outline-offset: 2px;
  border-radius: var(--radius-sm);  /* 6px globally */
}
.btn-md { border-radius: var(--radius-md); }  /* 10px */
.btn-lg { border-radius: var(--radius-lg); }  /* 16px */
.wp-card { border-radius: var(--radius-lg); }  /* 16px */
```

**Issue:** The `border-radius` in `:focus-visible` applies a 6px radius to the outline — tighter than the element's own corners (10px for `btn-md`, 16px for `btn-lg`, cards). The "concentric radius" principle (02c-craft.md §5) requires nested/related elements to step down, not that the focus ring should have mismatched corners. Visually, the focus ring on a `btn-lg` appears to have sharp corners relative to the rounded button. This is a craft subtlety, not a functional issue.

**Fix (deferred):** Consider using `outline-radius: inherit` (CSS Draft, limited support) or removing `border-radius` from `:focus-visible` to let it adapt to the element. Alternatively, add per-variant focus-ring overrides. Low priority cosmetic issue.

**Severity:** LOW | **Confidence:** Med | **Pre-existing:** false
**Status:** open | **Surfaced:** 2026-07-11T15:17:15Z | **Last seen:** 2026-07-11T15:17:15Z

## Summary
- Open findings: 1 (resolved this run: 0)
- Open blockers: 0 (pre-existing excluded; pre-existing findings: 0)
- Status: Issues Found
