---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: design-system-shell
review-command: ux-copy
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

# Review: ux-copy

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| UX-1 | NIT | Low | open | false | 2026-07-11 | src/components/shell/Sidebar.tsx:68 | Sidebar placeholder uses developer-oriented "Waypoints" terminology |

## Detailed Findings

### UX-1: Developer-oriented placeholder copy in sidebar [NIT]

**Location:** `src/components/shell/Sidebar.tsx:68`

**Source:** ux-copy

**Evidence:**
```tsx
<p className="px-2 text-xs text-[var(--ink-faint)] italic">
  Waypoints load when you open a lesson.
</p>
```

**Issue:** "Waypoints" is a product-internal term that a new user may not yet understand (they haven't had a lesson or seen the roadmap yet). The message reads like a developer note explaining placeholder content rather than user-facing copy that teaches or reassures.

**Fix (deferred):** Copy is placeholder; `lesson-renderer` and `roadmap-lesson-generation` slices replace it. If this text remains visible longer than planned, change to "Your lesson roadmap will appear here when you start a lesson." Low confidence: product team may want to keep the term "Waypoints" as it's introduced earlier in the product. Defer.

**Severity:** NIT | **Confidence:** Low | **Pre-existing:** false
**Status:** open | **Surfaced:** 2026-07-11T15:17:15Z | **Last seen:** 2026-07-11T15:17:15Z

## Summary
- Open findings: 1 (resolved this run: 0)
- Open blockers: 0 (pre-existing excluded; pre-existing findings: 0)
- Status: Issues Found
