---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: design-system-shell
review-command: testing
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

# Review: testing

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| TE-1 | NIT | High | open | false | 2026-07-11 | tests/smoke/contrast.test.ts:100 | Contrast test misses ink-faint/paper-mid and ink-faint/surface pairs |

## Detailed Findings

### TE-1: Missing contrast test pairs for actual usage patterns [NIT]

**Location:** `tests/smoke/contrast.test.ts:100`

**Source:** testing

**Evidence:**
```typescript
// Currently covered pairs (partial list):
// ink / paper, ink / surface, ink-muted / surface, ink / paper-mid, ink-muted / paper
// NOT covered: ink-faint / paper-mid, ink-faint / surface

// Sidebar uses text-[var(--ink-faint)] on wp-sidebar (.paper-mid background)
// JourneyCard uses text-[var(--ink-faint)] on card (.surface background)
```

**Issue:** The contrast test covers 13 pairs, but misses `--ink-faint` on `--paper-mid` and `--ink-faint` on `--surface` — the actual rendering contexts where `--ink-faint` is used for informational text. If these pairs had been tested, the contrast failure in DSS-1 would have been caught at test time.

**Fix:** After applying the DSS-1 fix (replacing `ink-faint` with `ink-muted` at the 4 informational-text locations), add regression guard test cases:
1. `ink-muted on paper-mid ≥ 4.5:1` (sidebar informational text regression guard)
2. `ink-faint on surface ≥ 3:1` (confirming ink-faint is only used for exempt placeholder/disabled text which requires ≥ 3:1)

**Severity:** NIT | **Confidence:** High | **Pre-existing:** false
**Status:** open | **Surfaced:** 2026-07-11T15:17:15Z | **Last seen:** 2026-07-11T15:17:15Z

## Summary
- Open findings: 1 (resolved this run: 0)
- Open blockers: 0 (pre-existing excluded; pre-existing findings: 0)
- Status: Issues Found
