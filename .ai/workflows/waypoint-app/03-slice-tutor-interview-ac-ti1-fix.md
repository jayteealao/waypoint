---
schema: sdlc/v1
type: slice
slug: waypoint-app
slice-slug: tutor-interview-ac-ti1-fix
status: defined
stage-number: 3
created-at: "2026-07-14T22:31:45Z"
updated-at: "2026-07-14T22:31:45Z"
complexity: s
depends-on: []
source: extension
source-ref: "user description (AC-TI1 e2e regression, surfaced by round-5 e2e-session-cookie-prefix full-suite run)"
extension-round: 6
tags: [test, e2e, playwright, tutor-interview, regression, react-19-hydration]
refs:
  index: 00-index.md
  slice-index: 03-slice.md
  source: ""
  plan: 04-plan-tutor-interview-ac-ti1-fix.md
  implement: 05-implement-tutor-interview-ac-ti1-fix.md
---

# Slice: Tutor-interview AC-TI1 chip-visibility fix

## Goal

Make the deterministically failing Playwright test in `tests/e2e/tutor-interview.spec.ts` —
**"AC-TI1: scripted interview completes with chips at each stage"** (test at line 207) — pass
reliably. It currently fails at line 267, where the "A little" prior-knowledge chip
(`page.getByRole("button", { name: "A little" })`) never becomes visible during the scripted
interview flow. Diagnose which layer is actually broken, fix at that layer, and leave the full
spec green.

## Why This Slice Exists

The failure was surfaced during the round-5 `e2e-session-cookie-prefix` full-suite regression run
(49 passed, this 1 failed, 3 did not run) and deliberately **not** absorbed into that slice — it
is independent of the cookie rename. `tutor-interview.spec.ts` already injects the correct
`__Secure-better-auth.session_token` / `secure: true` cookie (line 186) and fails **identically in
isolation**, so this is not an auth/session problem. It is a real, deterministic defect in the
scripted interview flow (or its test harness) that must be fixed before the workflow can hand off
with a green e2e suite.

**Repro:**
```
set -a && . ./.dev.vars && set +a && pnpm exec playwright test tests/e2e/tutor-interview.spec.ts -g "AC-TI1" --reporter=line
```

## Scope

- **In:**
  - **Diagnose first (plan/implement step 1):** capture what the page actually renders at the
    failing step (screenshot + `page` text / accessibility snapshot) to identify **which interview
    stage the flow is stuck on** before touching any code.
  - Fix at whichever layer the diagnosis points to, among the three candidate causes:
    1. **React 19 hydration timing** on the chip interaction — the established repo pattern is to
       wait for the client-only "Open TanStack Devtools" button before interacting
       (`tests/e2e/adaptation-progress.spec.ts:391-392`); if the chip click fires pre-hydration
       and no-ops, apply the same hydration gate in this spec. (Test-only fix.)
    2. **The `?mock=1` scripted-stage flow** — the interview route honors `?mock=1`; if the mock
       stage sequence doesn't advance to emit the prior-knowledge chips, fix the mock/scripted
       flow.
    3. **A real stage-transition regression** — `STAGE_CHIPS` / `InterviewStateMachine` in
       `src/types/interview.ts` and `src/server/interview.ts`; if the state machine no longer emits
       the "A little" chip at the prior-knowledge stage, fix the transition in source. (App fix.)
  - Ground any state-machine / mock behavior read in the installed source before choosing the fix
    mechanism (study-sources), per the workflow's standing RIM-E3 constraint.
  - Leave the whole `tutor-interview.spec.ts` spec green; commit cleanly through the now-healthy
    pre-commit gate (no `--no-verify`).
- **Out:**
  - Any redesign of the interview UX, prompt suite, or state-machine contract beyond restoring the
    AC-TI1 behavior.
  - Broader e2e flakiness hardening across other specs (the 3 "did not run" tests are a separate
    concern unless the diagnosis shows a shared root cause).
  - Changes to the completed `tutor-interview` slice's other acceptance criteria.

## Acceptance Criteria

- **AC-TI1F1** — Given the seeded session, When the AC-TI1 repro command runs, Then the test passes:
  the scripted interview advances through its stages and the "A little" prior-knowledge chip becomes
  visible and clickable (no timeout at line 267).
- **AC-TI1F2** — Given the full `tests/e2e/tutor-interview.spec.ts` spec, When it runs under the
  seeded secret, Then every test that previously passed still passes (no regression introduced by
  the fix).
- **AC-TI1F3** — The diagnosis (which stage the flow was stuck on and which of the three layers was
  at fault) is recorded in the implement artifact, and the fix is committed with a conventional
  message and **without** `--no-verify`. If the root cause is a real app regression (not test-only
  timing), the source fix is covered by the state-machine's unit tests as well.

## Dependencies on Other Slices

- None (`depends-on: []`). This corrects a test against the completed `tutor-interview` slice
  (context, not modification) and shares the React-19 hydration-gate pattern proven in the
  completed `adaptation-progress` and round-5 `e2e-session-cookie-prefix` slices. Independent of all
  pending work; orderable anytime.

## Risks

- **Misdiagnosis into the wrong layer.** The three candidate causes need distinct fixes (test-only
  hydration gate vs. mock-flow fix vs. real state-machine regression); jumping to the hydration gate
  without confirming the stage the flow is stuck on could mask a genuine app regression. The
  diagnose-first step (screenshot/page-text at the failing point) exists precisely to prevent this —
  do not apply a fix before the stuck stage is identified.
- If the cause is a **real** `InterviewStateMachine` regression, the fix touches production
  interview logic and must be proven by unit tests, not just the e2e green (AC-TI1F3).
