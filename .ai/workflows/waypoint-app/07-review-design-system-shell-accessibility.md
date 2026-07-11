---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: design-system-shell
review-command: accessibility
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

# Review: accessibility

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| A-1 | MED | High | open | false | 2026-07-11 | src/components/shell/Sidebar.tsx:57,68 | --ink-faint text on --paper-mid fails WCAG AA (~2.85:1) |
| A-2 | LOW | High | open | false | 2026-07-11 | src/styles.css:248 | .btn-sm min-height 36px below 44px touch target goal |

## Detailed Findings

### A-1: --ink-faint token misused for informational text — contrast failure [MED]

**Location:** `src/components/shell/Sidebar.tsx:57,68`, `src/components/dashboard/JourneyCard.tsx:59`, `src/components/shell/DrawerNav.tsx:163`

**Source:** accessibility

**Evidence:**
```
Sidebar.tsx:57:  text-[var(--ink-faint)] (section label "Current journey")
Sidebar.tsx:68:  text-[var(--ink-faint)] italic (placeholder text)
JourneyCard.tsx:59: text-xs text-[var(--ink-faint)] (timestamp)
DrawerNav.tsx:163: text-[var(--ink-faint)] (section label)

--ink-faint: oklch(0.64 0.028 30) — estimated WCAG luminance ≈ 0.258
--paper-mid: oklch(0.94 0.022 78) — estimated WCAG luminance ≈ 0.829
--surface:   oklch(0.99 0.008 80) — estimated WCAG luminance ≈ 0.96

Contrast (faint on paper-mid): (0.829+0.05)/(0.258+0.05) ≈ 2.85:1 < 4.5:1 AA normal text
Contrast (faint on surface):   (0.96+0.05)/(0.258+0.05)  ≈ 3.28:1 < 4.5:1 AA normal text
```

**Issue:** `--ink-faint` is documented as "placeholder, disabled labels" in the token comment, and its luminance produces contrast ratios (~2.85–3.28:1) below WCAG 2.1 AA for normal-sized text (4.5:1). Using it for informational text (section labels, timestamps) fails the AA requirement. These elements are text-xs (12px) which is NOT "large text" per WCAG definition.

**Fix:** Replace `text-[var(--ink-faint)]` with `text-[var(--ink-muted)]` at the 4 affected locations. `--ink-muted` on `--surface` and `--paper` is already tested and passing at ≥4.5:1 in the contrast test suite. Reserve `--ink-faint` for HTML `placeholder` attributes and disabled-state labels (WCAG 1.4.3 exempt).

**Severity:** MED | **Confidence:** High | **Pre-existing:** false
**Status:** open | **Surfaced:** 2026-07-11T15:17:15Z | **Last seen:** 2026-07-11T15:17:15Z

---

### A-2: .btn-sm min-height (36px) below 44px touch target goal [LOW]

**Location:** `src/styles.css:248`

**Source:** accessibility

**Evidence:**
```css
.btn-base { min-height: 2.75rem; /* 44px touch target */ }
.btn-sm   { min-height: 2.25rem; /* 36px — overrides base */ }
```

**Issue:** `.btn-base` commits to 44px minimum height. `.btn-sm` overrides to 36px. AC-DSS1 states "touch targets are ≥ 44px" and 02c-craft.md says "all min-h-11 for 44px touch target". `.btn-sm` is used in DrawerNav close button and ThemeToggle compact override. WCAG 2.2 AA (2.5.8) requires only 24px minimum, so not a WCAG AA violation, but violates the slice's stated 44px goal.

**Fix:** Raise `.btn-sm` to `min-height: 2.75rem` (44px), OR add a CSS comment explicitly marking `btn-sm` as for compact desktop-only contexts. If raised, the DrawerNav close button and ThemeToggle override visual appearance may need review.

**Severity:** LOW | **Confidence:** High | **Pre-existing:** false
**Status:** open | **Surfaced:** 2026-07-11T15:17:15Z | **Last seen:** 2026-07-11T15:17:15Z

## Summary
- Open findings: 2 (resolved this run: 0)
- Open blockers: 0 (pre-existing excluded; pre-existing findings: 0)
- Status: Issues Found
