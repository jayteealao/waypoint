---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: design-system-shell
review-command: motion
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

# Review: motion

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| MO-1 | LOW | Med | open | false | 2026-07-11 | src/styles.css:599 | No exit animation on DrawerNav; abrupt snap to hidden on close |

## Detailed Findings

### MO-1: No exit animation on DrawerNav [LOW]

**Location:** `src/styles.css:599-607`

**Source:** motion

**Evidence:**
```css
@media (prefers-reduced-motion: no-preference) {
  .wp-drawer { animation: wp-drawer-in var(--motion-slow) both; }
}
@keyframes wp-drawer-in {
  from { transform: translateX(-100%); }
  to   { transform: translateX(0); }
}
/* No wp-drawer-out keyframe */
```

**Issue:** The DrawerNav opens with a smooth 340ms slide-in animation, but closes by adding Tailwind's `hidden` class (display:none) which is instantaneous. There is no exit animation. The abrupt disappearance on close breaks the "motion should feel natural and physical" principle — an object that enters from the left should also exit to the left.

**Fix (deferred):** Implement exit animation using one of: (1) transition-based approach with `transform: translateX(-100%)` and `visibility: hidden`/`visible` (preserves elements in DOM, allows exit transition), or (2) add a closing state class with a CSS animation and use a `transitionend` event to apply `display:none` after the exit animation completes. This requires a design decision on exit timing and complexity — defer to a future slice.

**Severity:** LOW | **Confidence:** Med | **Pre-existing:** false
**Status:** open | **Surfaced:** 2026-07-11T15:17:15Z | **Last seen:** 2026-07-11T15:17:15Z

## Summary
- Open findings: 1 (resolved this run: 0)
- Open blockers: 0 (pre-existing excluded; pre-existing findings: 0)
- Status: Issues Found
