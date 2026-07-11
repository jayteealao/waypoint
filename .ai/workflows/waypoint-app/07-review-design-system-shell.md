---
schema: sdlc/v1
type: review
slug: waypoint-app
review-scope: per-slice
slice-slug: design-system-shell
status: complete
stage-number: 7
created-at: "2026-07-11T15:00:00Z"
updated-at: "2026-07-11T15:45:00Z"
verdict: ship
commands-run:
  - correctness
  - security
  - code-simplification
  - testing
  - maintainability
  - reliability
  - accessibility
  - frontend-accessibility
  - frontend-performance
  - interface-craft
  - ux-copy
  - design-audit
  - design-critique
  - motion
  - refactor-safety
metric-commands-run: 15
metric-findings-total: 7
metric-findings-raw: 7
metric-findings-blocker: 0
metric-findings-high: 0
metric-findings-med: 1
metric-findings-low: 4
metric-findings-nit: 2
metric-findings-resolved: 2
metric-findings-total-ever: 7
runs:
  - at: "2026-07-11T15:45:00Z"
    dimensions:
      - correctness
      - security
      - code-simplification
      - testing
      - maintainability
      - reliability
      - accessibility
      - frontend-accessibility
      - frontend-performance
      - interface-craft
      - ux-copy
      - design-audit
      - design-critique
      - motion
      - refactor-safety
    verdict: ship
    fix-commit: 7702f83
tags: []
refs:
  fix-commit: 7702f83
next-command: /wf handoff
next-invocation: /wf handoff slug=waypoint-app
---

# Review: design-system-shell

**Slice:** design-system-shell  
**Implementation commit:** bf5f09a (24 files, +1350/-310)  
**Fix commit:** 7702f83  
**Reviewed:** 2026-07-11  
**Dimensions:** 15  
**Verdict:** SHIP — no open MED+ findings after fix loop

---

## Executive Summary

The design-system-shell slice delivers the OKLCH ember token palette, app shell (AppShell + Sidebar + DrawerNav), journeys dashboard, and authenticated layout route. All 10 visual contract items from the craft spec are honored. One MED finding (sub-AA contrast token misuse) was fixed inline. Four LOW and two NIT findings are deferred with documented rationale. The implementation is production-quality.

---

## Findings — Consolidated Ledger

| ID | Sev | Source dimensions | Decision | Status | Location(s) |
|----|-----|-------------------|----------|--------|-------------|
| DSS-1 | **MED** | accessibility, frontend-accessibility, design-audit | FIX | **Fixed** (7702f83) | Sidebar:57,68; JourneyCard:59; DrawerNav:163 |
| DSS-2 | LOW | accessibility | DEFER | Open | styles.css:248 |
| DSS-3 | LOW | motion | DEFER | Open | styles.css:599 |
| DSS-4 | LOW | interface-craft | DEFER | Open | styles.css:195 |
| DSS-5 | LOW | reliability | DEFER | Open | JourneysDashboard:96 |
| DSS-6 | NIT | testing | FIX | **Fixed** (7702f83) | contrast.test.ts |
| DSS-7 | NIT | ux-copy | DEFER | Open | Sidebar:68 |

**After fix loop:** 0 open MED+, 4 open LOW (all deferred), 1 open NIT (deferred)

---

## Fix Loop Detail

### DSS-1: Sub-AA contrast token on informational text [MED → Fixed]

`--ink-faint` (OKLCH L=0.64, documented for disabled/placeholder text only) was used in
four places for live informational text on `--paper-mid` backgrounds, yielding approximately
2.85:1 contrast — below the WCAG 2.1 AA threshold of 4.5:1 for normal-size text.

Replaced with `--ink-muted` (L=0.44) in all four callsites, achieving approximately 5.3:1.

Affected files:
- `src/components/shell/Sidebar.tsx` lines 57, 68
- `src/components/dashboard/JourneyCard.tsx` line 59
- `src/components/shell/DrawerNav.tsx` line 163

### DSS-6: Contrast smoke test coverage gap [NIT → Fixed]

Added to `tests/smoke/contrast.test.ts`:
1. `--ink-muted on --paper-mid ≥ 4.5:1` — regression guard for the DSS-1 fix
2. `--ink-faint on --paper-mid < 4.5:1` — documentation assertion confirming the token
   is correctly sub-AA and should never appear on content text

---

## Deferred Findings

### DSS-2: Focus ring radius mismatch on larger buttons [LOW]

Global `:focus-visible` uses `border-radius: var(--radius-sm)` (6px). Buttons with md/lg
variants have corner radii of 10px and 16px respectively, causing the focus outline to
visually clip corners. Mild cosmetic impact; fix requires per-variant `outline-radius` or
Tailwind ring-radius overrides. Defer to design-system hardening pass.

### DSS-3: Drawer has entry animation but no exit animation [LOW]

`.wp-drawer` plays `wp-drawer-in` on mount but has no closing transition. The `always-rendered
+ display:none` pattern used for focus-trap efficiency requires AnimatePresence or a
CSS animation exit approach (data-closing attribute + animation-fill-mode). Deferred to
UX-polish slice.

### DSS-4: btn-sm at 36px below 44px enhanced touch target [LOW]

`.btn-base { min-height: 2.75rem }` (44px) is overridden by `.btn-sm { min-height: 2.25rem }`
(36px). WCAG 2.2 SC 2.5.8 AA requires 24×24px minimum — btn-sm passes WCAG. The 44px base
implements Apple HIG enhanced target. Raising btn-sm to 44px has layout implications.
Defer unless mobile audit finds real user impact.

### DSS-5: useJourneys() dual-shape normalization [@tanstack/db workaround] [LOW]

`useJourneys()` in `JourneysDashboard.tsx` normalizes both `Journey[]` and
`{ journeys: Journey }[]` row shapes from `@tanstack/db` (pre-1.0 unstable API). This
is documented with an sdlc-debt comment including the upgrade path. Remove normalization
when `@tanstack/db` emits consistent shapes.

### DSS-7: Sidebar placeholder uses internal "Waypoints" terminology [NIT]

"Waypoints load when you open a lesson." — low confidence finding; the term may be
intentionally introduced here. Text is placeholder content replaced by the
lesson-renderer slice. Deferred.

---

## Clean Dimensions (No Findings)

correctness · security · code-simplification · maintainability · frontend-performance ·
design-critique · refactor-safety

---

## Verdict

**SHIP** — one MED contrast violation fixed; all remaining open items are LOW or NIT with
documented deferral rationale. No blockers, no highs.
