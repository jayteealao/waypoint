---
schema: sdlc/v1
type: review
slug: waypoint-app
review-scope: per-slice
slice-slug: sample-journey
status: complete
stage-number: 7
created-at: "2026-07-11T22:39:34Z"
updated-at: "2026-07-11T22:39:34Z"
verdict: ship
commands-run: [correctness, security, code-simplification, accessibility, frontend-accessibility, frontend-performance, interface-craft, ux-copy, testing, maintainability, reliability]
metric-commands-run: 11
metric-findings-total: 0
metric-findings-raw: 3
metric-findings-blocker: 0
metric-findings-pre-existing: 0
metric-findings-high: 0
metric-findings-med: 0
metric-findings-low: 0
metric-findings-nit: 0
metric-findings-resolved: 0
metric-findings-total-ever: 2
runs:
  - at: "2026-07-11T22:39:34Z"
    dimensions: [correctness, security, code-simplification, accessibility, frontend-accessibility, frontend-performance, interface-craft, ux-copy, testing, maintainability, reliability]
    verdict: ship
    fix-commit: "5a0433f"
tags: []
refs:
  index: 00-index.md
  slice-def: 03-slice-sample-journey.md
  implement: 05-implement-sample-journey.md
  verify: 06-verify-sample-journey.md
  sub-reviews:
    - 07-review-sample-journey-correctness.md
    - 07-review-sample-journey-security.md
    - 07-review-sample-journey-code-simplification.md
    - 07-review-sample-journey-accessibility.md
    - 07-review-sample-journey-frontend-accessibility.md
    - 07-review-sample-journey-frontend-performance.md
    - 07-review-sample-journey-interface-craft.md
    - 07-review-sample-journey-ux-copy.md
    - 07-review-sample-journey-testing.md
    - 07-review-sample-journey-maintainability.md
    - 07-review-sample-journey-reliability.md
next-command: wf-handoff
next-invocation: "/wf handoff waypoint-app"
---

# Review: Sample Journey & Quiz Surface

## The Review

The sample journey shipped with a clean implementation across all eleven review dimensions. Two findings surfaced — both in the quiz component, both fixed in the same commit — and no pre-existing debt touched this slice's lines. The quiz surface, the first-login routing, the ShellContext extension, and the fixture lessons each passed their respective domain checks without material issues: security found no injection vectors or credential leaks, reliability confirmed all cleanup paths and error boundaries, and the interface-craft check verified the quiz's ember-feedback visual language against the design contract.

The accessibility dimension found a semantic mismatch: `aria-pressed` on the quiz option buttons. Quiz options are single-selection choices, not toggles; `aria-pressed` announces "button, pressed" to screen readers where no toggle exists. The fix is a one-line deletion — the `disabled` attribute and the existing `role="status"` feedback region communicate post-selection state without any additional aria attribute. The correctness dimension found a non-null assertion (`restoredAttempt!`) in the results screen render path. The logic that sets both `restoredAttempt` and `showResults` together makes the assertion safe in practice, but the assertion suppresses TypeScript's null check and creates a fragile invariant if the code ever gains a third path into `showResults = true`. An explicit null guard is safer and clearer.

Both fixes landed in commit `5a0433f`. Typecheck and the full 67-test suite pass with no regressions. With 0 open findings and no pre-existing debt on this slice's lines, the verdict is **Ship**.

## Verdict

**Ship**

Zero OPEN findings after the fix loop. Two findings surfaced (1 MED accessibility, 1 LOW correctness), both fixed in commit `5a0433f` during this review run. No blockers, no highs, no pre-existing debt on this diff. The sample journey — first-login routing, two full fixture lessons, a four-question MC quiz, sidebar waypoint completion, returning-user bypass — is ready for handoff.

## Domain Coverage

| Domain | Command | Status |
|--------|---------|--------|
| Logic correctness | `correctness` | 1 LOW → fixed |
| Security | `security` | Clean |
| Code simplification | `code-simplification` | Clean |
| Accessibility (ARIA) | `accessibility` | 1 MED → fixed |
| Frontend accessibility (keyboard/focus) | `frontend-accessibility` | 1 MED → fixed (cross-listed with accessibility) |
| Frontend performance | `frontend-performance` | Clean |
| Interface craft | `interface-craft` | Clean |
| UX copy | `ux-copy` | Clean |
| Testing coverage | `testing` | Clean |
| Maintainability | `maintainability` | Clean |
| Reliability | `reliability` | Clean |

## All Findings

ALL findings recorded — open AND closed. All findings are `fixed`.

| ID | Sev | Conf | Status | Pre | Surfaced | Source | File:Line | Issue |
|----|-----|------|--------|-----|----------|--------|-----------|-------|
| AC-1 | MED | High | fixed | false | 2026-07-11 | Accessibility + Frontend-Accessibility | src/components/quiz/QuizView.tsx:210 | `aria-pressed` on single-selection quiz option buttons announces toggle semantics |
| CR-1 | LOW | High | fixed | false | 2026-07-11 | Correctness | src/components/quiz/QuizView.tsx:110 | Non-null assertion on `restoredAttempt` in results render path |

**Open:** BLOCKER: 0 | HIGH: 0 | MED: 0 | LOW: 0 | NIT: 0   **Pre-existing:** 0
**Closed:** resolved: 0 | fixed: 2 | dismissed: 0   **Ledger size (ever):** 2
*(This run: 2 net-new, 0 re-confirmed, 0 resolved; merged from 3 raw findings across 11 commands — cross-dim dedup collapsed accessibility + frontend-accessibility AC-1 into one finding)*

## Findings (Detailed)

### AC-1: `aria-pressed` on single-selection quiz option buttons [MED]

**Location:** `src/components/quiz/QuizView.tsx:210`
**Source:** Accessibility, Frontend-Accessibility

**Evidence (before fix):**
```tsx
<button
  disabled={answered}
  aria-pressed={answered && idx === userAnswer ? true : undefined}
>
```

**Issue:** `aria-pressed` is the ARIA attribute for toggle buttons (think: mute, bold, like). Quiz options are mutually-exclusive single-selection choices — once one is selected the question is locked. Using `aria-pressed` causes screen readers to present the options as independent toggles rather than a single-choice group, which misrepresents the interaction contract to users who rely on assistive technology.

**Fix applied:** Deleted `aria-pressed` prop. The `disabled={answered}` attribute communicates that the button is no longer interactive after selection; the `role="status"` `aria-live="polite"` feedback div announces the correctness result.

**Severity:** MED | **Confidence:** High | **Pre-existing:** false
**Status:** fixed | **Surfaced:** 2026-07-11T22:39:34Z | **Last seen:** 2026-07-11T22:39:34Z | **Fixed:** 2026-07-11T22:39:34Z (commit 5a0433f)

---

### CR-1: Non-null assertion on `restoredAttempt` in results render path [LOW]

**Location:** `src/components/quiz/QuizView.tsx:110`
**Source:** Correctness

**Evidence (before fix):**
```tsx
if (showResults) {
  const attempt = restoredAttempt!   // non-null assertion
```

**Issue:** `restoredAttempt` is always set before `showResults` flips to `true` (both `useState` setters are called together in two code paths). The non-null assertion is technically safe but it silences TypeScript's null check and creates an invisible invariant. If a third code path ever sets `showResults = true` without first setting `restoredAttempt`, the component crashes with `TypeError: Cannot read properties of null` at runtime.

**Fix applied:** Replaced `restoredAttempt!` with:
```tsx
const attempt = restoredAttempt
if (!attempt) return null
```
Makes the invariant explicit, removes the assertion, and produces a safe empty render rather than a runtime crash in the hypothetical third-path case.

**Severity:** LOW | **Confidence:** High | **Pre-existing:** false
**Status:** fixed | **Surfaced:** 2026-07-11T22:39:34Z | **Last seen:** 2026-07-11T22:39:34Z | **Fixed:** 2026-07-11T22:39:34Z (commit 5a0433f)

## Pre-existing Debt

None. All OPEN findings introduced by this slice's diff (`pre-existing: false`).

## Triage Decisions

| ID | Sev | Source | Decision | Notes |
|----|-----|--------|----------|-------|
| AC-1 | MED | Accessibility + Frontend-Accessibility | fix | Autonomous: MED has no defer option per review policy |
| CR-1 | LOW | Correctness | fix | Autonomous: in-scope, localized, safe — one-line change removes fragile invariant |

## Fix Status

| ID | Sev | Source | Status | Fixed-at | Commit | Notes |
|----|-----|--------|--------|----------|--------|-------|
| AC-1 | MED | Accessibility + Frontend-Accessibility | fixed | 2026-07-11T22:39:34Z | 5a0433f | Deleted `aria-pressed` prop from quiz option button |
| CR-1 | LOW | Correctness | fixed | 2026-07-11T22:39:34Z | 5a0433f | Replaced `restoredAttempt!` with explicit null guard |

## Recommendations

### Must Fix (triaged "fix")
*(None remaining — all MED/HIGH were fixed this run.)*

### Should Fix (MED triaged "fix")
*(All MED findings fixed.)*

### Deferred (triaged "defer")
*(None.)*

### Dismissed
*(None.)*

### Consider (LOW/NIT — not triaged)
*(None — CR-1 (LOW) was fixed, not deferred.)*

## Soft Findings / Reviewer Notes

From the verify record's **Friction Notes** (surfaced for completeness per the review contract — not issues, just observations):

- The `setWaypoints` effect in `sample.tsx` fires after hydration, creating a narrow window where quiz option event handlers may not yet have stable closures. The fix (waiting for a sidebar waypoint to appear before clicking) is robust and documented in the test file.
- `DrawerNav` renders duplicate `data-waypoint` elements in the DOM even when visually hidden (CSS `md:hidden`). Selectors targeting `data-waypoint` must scope to `sidebar` or `drawer-nav` testids — documented in `sample-journey.spec.ts` with an explanatory comment.
- The "Start a real journey" CTA dead-ends into a loop (overview → dashboard → back to overview) until `tutor-interview` ships `/journey/new`. This is the accepted ceiling documented in `05-implement-sample-journey.md` and annotated with `sdlc-debt` comments in source.

From the verify record's **Free Exploration Notes:**
- Navigating directly to `/sample` as a returning user (bypassing the dashboard redirect) correctly shows the sample overview.
- Lesson waypoint cards show live completion badges after visiting lessons — updated within ~200ms via the `wp:sample-progress` event chain.

## Recommended Next Stage

- **Option A: Handoff** → `/wf handoff waypoint-app`
  Use when: verdict `ship` ✓, no OPEN blockers ✓. All intended slices (foundation through sample-journey) are implemented, verified, and reviewed. Handoff aggregates all complete slices for PR. **Recommended — this is the intended next step.**
- **Option D: Plan next slice** → `/wf plan waypoint-app ai-gateway` (or `tutor-interview`)
  Use when: More slices remain before handoff. The `ai-gateway`, `tutor-interview`, and downstream AI slices are not yet implemented. If the PO wants to continue building before shipping what's done, plan the next slice first.
- **Option E: Skip handoff** → `/wf ship waypoint-app`
  Use when: No PR/team review needed; CI/CD handles the merge.
