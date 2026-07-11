---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: design-system-shell
review-command: frontend-accessibility
status: complete
updated-at: "2026-07-11T15:17:15Z"
metric-findings-total: 2
metric-findings-blocker: 0
metric-findings-high: 0
metric-findings-pre-existing: 0
metric-findings-resolved: 0
result: issues-found
tags: []
refs:
  review-master: 07-review-design-system-shell.md
---

# Review: frontend-accessibility

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| FA-1 | MED | High | open | false | 2026-07-11 | src/components/shell/Sidebar.tsx:57 | WCAG 1.4.3 contrast failure: ink-faint on light backgrounds |
| FA-2 | NIT | Med | open | false | 2026-07-11 | src/styles.css:364 | .wp-input uses :focus box-shadow instead of :focus-visible |

## Detailed Findings

### FA-1: WCAG 1.4.3 contrast failure on informational text [MED]

**Location:** `src/components/shell/Sidebar.tsx:57,68`, `src/components/dashboard/JourneyCard.tsx:59`, `src/components/shell/DrawerNav.tsx:163`

**Source:** frontend-accessibility (cross-dim: accessibility A-1)

**Evidence:** Same as A-1 — approximately 2.85:1 contrast ratio on normal-sized text, below AA 4.5:1 threshold.

**Issue:** WCAG 2.1 SC 1.4.3 (AA): Text or images of text must have a contrast ratio of at least 4.5:1 (or 3:1 for large text). The 4 locations using `--ink-faint` for informational text fail this criterion. These are not disabled UI components, decorative elements, or HTML `placeholder` attributes — they are visible informational text.

**Fix:** Replace `text-[var(--ink-faint)]` with `text-[var(--ink-muted)]` at 4 locations. Same fix as A-1.

**Severity:** MED | **Confidence:** High | **Pre-existing:** false
**Status:** open | **Surfaced:** 2026-07-11T15:17:15Z | **Last seen:** 2026-07-11T15:17:15Z

---

### FA-2: .wp-input uses :focus box-shadow instead of :focus-visible [NIT]

**Location:** `src/styles.css:364`

**Source:** frontend-accessibility

**Evidence:**
```css
.wp-input { outline: none; }
.wp-input:focus { border-color: var(--ember); box-shadow: 0 0 0 3px oklch(0.54 0.19 32 / 0.2); }
```

**Issue:** The global `:focus-visible` rule provides the universal ember focus ring. `.wp-input { outline: none }` suppresses it. The replacement uses `:focus` (not `:focus-visible`), meaning the input shows a focus ring on both keyboard and pointer click. This is actually *more* accessible (shows on all focus), but inconsistent with the `:focus-visible` pattern used everywhere else. In environments where box-shadows are suppressed (e.g., some high-contrast modes), only the border-color change remains. The border-color change from `--border` to `--ember` provides sufficient non-text contrast.

**Fix:** Low priority. Consider using `:focus-visible` for consistency. Or add a CSS comment explaining the intentional difference.

**Severity:** NIT | **Confidence:** Med | **Pre-existing:** false
**Status:** open | **Surfaced:** 2026-07-11T15:17:15Z | **Last seen:** 2026-07-11T15:17:15Z

## Summary
- Open findings: 2 (resolved this run: 0)
- Open blockers: 0 (pre-existing excluded; pre-existing findings: 0)
- Status: Issues Found
