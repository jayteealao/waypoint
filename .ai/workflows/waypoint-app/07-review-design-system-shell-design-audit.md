---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: design-system-shell
review-command: design-audit
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

# Review: design-audit

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| DA-1 | MED | High | open | false | 2026-07-11 | src/components/shell/Sidebar.tsx:57 | Anti-goal: --ink-faint used for informational text, violating token semantic contract |

## Detailed Findings

### DA-1: 02c-craft.md anti-goal — --ink-faint token semantics violated [MED]

**Location:** `src/components/shell/Sidebar.tsx:57,68`, `src/components/dashboard/JourneyCard.tsx:59`, `src/components/shell/DrawerNav.tsx:163`

**Source:** design-audit (cross-dim: accessibility A-1)

**Evidence:**
```
02c-craft.md §4: "Ink / ink-muted: all text; headings use --ink, descriptive copy --ink-muted, placeholders --ink-faint"
Anti-goal: "No gradient opacity hacks for contrast: if a text/background pair fails AA, change the token value, not the opacity of the text"

--ink-faint: oklch(0.64 0.028 30) — designed for placeholder/disabled text
Used for: section labels, placeholder content, timestamps — NOT placeholder or disabled
```

**Mock fidelity inventory — all 10 items honored:**
1. OKLCH ember token table — honored (src/styles.css:13-55)
2. Warm cream paper base — honored (--paper: oklch(0.98 0.018 80))
3. Fraunces dual-voice serif — honored (.display-title + JourneyCard/dashboard headings)
4. App shell topology — honored (wp-shell, 240px sidebar, mobile collapse)
5. Ember progress fills — honored (.wp-meter-fill, .wp-mobile-progress-fill)
6. Rounded generous component feel — honored (--radius-lg cards, --radius-md inputs)
7. Keyboard focus rings — honored (:focus-visible global rule, ember outline)
8. prefers-reduced-motion suppression — honored (all animated elements gated)
9. Empty state teaching message — honored (EmptyState with compass SVG + CTA)
10. Dark theme as first-class — honored (dual-signal pattern, complete overrides)

**Anti-goals honored (except DA-1):**
- No teal/lagoon remnants — ✓ (typecheck confirms zero old token refs)
- No gamification chrome — ✓
- No red for incomplete — ✓
- No `outline: none` without replacement — ✓ (input uses box-shadow substitute)
- No fixed heights on text containers — ✓ (line-clamp used correctly)
- No conditional dark theme — ✓ (dual-signal)
- No !important — ✓
- No gradient opacity hacks — ✓

**Issue:** `--ink-faint` designated for placeholders/disabled labels is applied to informational text (section labels, timestamps). This produces ~2.85:1 contrast on light backgrounds, which is a semantic violation of the token contract AND an accessibility failure.

**Fix:** Replace with `--ink-muted` at 4 locations (same as A-1 fix).

**Severity:** MED | **Confidence:** High | **Pre-existing:** false
**Status:** open | **Surfaced:** 2026-07-11T15:17:15Z | **Last seen:** 2026-07-11T15:17:15Z

## Summary
- Open findings: 1 (resolved this run: 0)
- Open blockers: 0 (pre-existing excluded; pre-existing findings: 0)
- Status: Issues Found
