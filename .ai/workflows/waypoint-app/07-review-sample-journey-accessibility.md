---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: sample-journey
review-command: accessibility
status: complete
updated-at: "2026-07-11T22:39:34Z"
metric-findings-total: 1
metric-findings-blocker: 0
metric-findings-high: 0
metric-findings-pre-existing: 0
metric-findings-resolved: 0
result: issues-found
tags: []
refs:
  review-master: 07-review-sample-journey.md
---

# Review: accessibility

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| AC-1 | MED | High | open | false | 2026-07-11 | src/components/quiz/QuizView.tsx:210 | `aria-pressed` is semantically incorrect for single-selection quiz option buttons |

## Detailed Findings

### AC-1: `aria-pressed` semantic mismatch on quiz option buttons [MED]

**Location:** `src/components/quiz/QuizView.tsx:210`

**Evidence:**
```tsx
<button
  key={idx}
  type="button"
  className={`wp-quiz-option${extraClass}`}
  data-testid={`quiz-option-${idx}`}
  onClick={() => handleOptionClick(idx)}
  disabled={answered}
  aria-pressed={answered && idx === userAnswer ? true : undefined}
>
```

**Issue:** `aria-pressed` is an ARIA attribute for toggle buttons — it conveys a two-state (pressed / not pressed) toggle, similar to a mute button or a bold-formatting toggle. Quiz options are single-selection choices: once selected, the entire question group is locked and no deselection is possible. Using `aria-pressed` on a quiz option misleads assistive technology into announcing "button, pressed" (or "button, toggle button") rather than communicating the selection semantics correctly. Screen readers may present the options as independent toggles rather than a mutually-exclusive choice, potentially confusing users who rely on them.

The correct semantic model for mutually exclusive single-answer selection is `role="radio"` + `aria-checked` within a `role="radiogroup"` container. Since the options disable after the first selection anyway, the minimal fix is to simply remove `aria-pressed` — the `disabled` attribute communicates the post-selection locked state, and the existing `role="status"` + `aria-live="polite"` feedback region announces the result to screen readers without any additional aria attribute.

**Fix:** Remove `aria-pressed` from the option button. Change:
```tsx
aria-pressed={answered && idx === userAnswer ? true : undefined}
```
to nothing (delete the prop). The `disabled={answered}` attribute already communicates that the button is no longer interactive post-answer, and the `role="status"` feedback div announces correctness via `aria-live="polite"`.

**Severity:** MED | **Confidence:** High | **Pre-existing:** false
**Status:** open | **Surfaced:** 2026-07-11T22:39:34Z | **Last seen:** 2026-07-11T22:39:34Z

## Summary
- Open findings: 1  (resolved this run: 0)
- Open blockers: 0  (pre-existing excluded; pre-existing findings: 0)
- Status: Issues Found
