---
schema: sdlc/v1
type: implement
slug: waypoint-app
slice-slug: fsrs-scheduler-test-determinism
status: complete
stage-number: 5
created-at: "2026-07-14T21:42:17Z"
updated-at: "2026-07-14T21:42:17Z"
metric-files-changed: 0
metric-lines-added: 0
metric-lines-removed: 0
metric-deviations-from-plan: 0
metric-review-fixes-applied: 0
commit-sha: ""
tags: [test, determinism, quiz-fsrs, flaky, ts-fsrs]
refs:
  index: 00-index.md
  implement-index: 05-implement.md
  slice-def: 03-slice-fsrs-scheduler-test-determinism.md
  plan: 04-plan-fsrs-scheduler-test-determinism.md
  siblings:
    - 05-implement-quiz-fsrs.md
    - 05-implement-adaptation-progress.md
  verify: 06-verify-fsrs-scheduler-test-determinism.md
next-command: wf-verify
next-invocation: "/wf verify waypoint-app fsrs-scheduler-test-determinism"
---

# Implement: FSRS scheduler test determinism

## The Implementation

There was nothing left to build. The determinism fix — the review-card fixture pinned to a
fixed absolute instant instead of `Date.now() - 1 day` — already rode into the tree on commit
`4274839`, so this pass was the confirm-and-reconcile the plan called for, not an edit. The
working tree stayed clean; not a single line of code changed. What the pass produced is
*evidence*: the suite runs 11/11 green, the failing path is provably clock-invariant by
construction, and the one open design question — should the scheduler also clamp a non-positive
`delta_t`? — is settled **no**, cited to the installed ts-fsrs source rather than to memory.

The load-bearing decision is the no-clamp call. ts-fsrs 5.4.1 throws on `t < 0` **on purpose**
(`node_modules/ts-fsrs/dist/index.cjs:938`, inside `next_state`), and the only production caller
that produces a `delta_t` (`src/server/quiz.ts:420`) always passes a real `new Date(now)` against
a *past* DB `last_review`, so the interval is naturally `>= 0` in operation. A negative value
there would mean genuinely inverted inputs — clock skew, a corrupt row — that must surface loudly,
not be silently masked. So the scheduler stays strict; the entire fix lives in the test fixture.
Top residual risk is nil: the decision carries its source citation and the fix is already proven
green under a clean tree.

## Summary of Changes

- **No code change.** The determinism fix (`REVIEW_CARD_TS = new Date("2026-07-10T00:00:00Z")` for
  the shared `reviewCard` fixture's `due` / `last_review`) is already committed in `4274839`;
  `git diff tests/smoke/fsrs-scheduler.test.ts` is empty.
- **No-clamp decision ratified** — `src/lib/quiz/fsrs-scheduler.ts` stays strict; no defensive
  guard on non-positive `delta_t` was added. Grounded in installed ts-fsrs source (see below).
- **Optional header-count comment left untouched** (the `Tests (7):` header counts scenarios, not
  the 11 `it()` blocks) — deliberately no edit, to avoid churn on an accurate-enough comment.
- **Evidence captured:** suite 11/11 green; `tsc --noEmit` exit 0; date-independence proven
  structurally.

## Files Changed

- None. This slice is a confirmation-and-reconciliation pass; the fixture fix was already landed by
  `4274839` (`chore(format): apply oxfmt baseline`), attributed via `git log -S "REVIEW_CARD_TS"`.

## Files Read (for the no-clamp decision)

- `node_modules/ts-fsrs/dist/index.cjs:938` — `next_state` throws
  `new FSRSValidationError(\`Invalid delta_t "${t}"\`)` when `t < 0`. Confirmed present; version
  `ts-fsrs@5.4.1` (`node_modules/ts-fsrs/package.json`).
- `src/lib/quiz/fsrs-scheduler.ts:151` — `fsrsInstance.repeat(baseCard, serverNow)`, where a
  negative interval would surface. Left strict, unmodified.
- `src/server/quiz.ts:118` (`Rating.Manual` — skips `repeat()`, no `delta_t`) and `:420`
  (`applyGradeToCard(..., new Date(now))` — real server clock vs. a past DB `last_review`, so
  `delta_t >= 0`). Confirms production never feeds a negative interval.

## Shared Files (also touched by sibling slices)

- `tests/smoke/fsrs-scheduler.test.ts` and `src/lib/quiz/fsrs-scheduler.ts` originate in the
  `quiz-fsrs` slice; this slice neither modified them (the fixture edit predates this pass in
  `4274839`) nor introduced a conflict.

## Notes on Design Choices

- **Fixture-only determinism, scheduler stays strict** (`class: implementation-detail`). Fix the
  *data* the test feeds the scheduler, not the library's built-in validation. Highest simplicity
  rung that holds: rung 3 (reuse fixture data) for the test seam, rung 1/2 (keep the library's own
  `t < 0` guard) for the scheduler. No new code, no new abstraction.
- **AC-FSD3 satisfied by the already-landed commit; no history rewrite** (`class:
  implementation-detail`). Splitting one file out of a mid-history commit on a multi-commit unpushed
  branch is high blast-radius for zero behavior change, and interactive rebase is unsupported here.
  The lifecycle-tracked, gate-passing, non-`--no-verify` audit trail the slice wanted already exists.

## Verification Seams Built

- **None needed** — the fixed-timestamp fixture (`REVIEW_CARD_TS`, before the pinned
  `serverNow = 2026-07-12`) *is* the determinism seam, and it was already in the tree. Date-
  independence is structural: the failing path (`applyGradeToCard` → `repeat(baseCard, serverNow)`)
  reads only fixed constants; the two tests that touch `Date.now()` (`computeRetrievability`) build
  strictly positive elapsed intervals (`last_review = now − 60s`, `due = now + 7d`), so no
  `Date.now()` value can drive a negative `delta_t`. The green `pnpm test` run is the full evidence.

## Deviations from Plan

- None. The plan explicitly framed this as a confirm-and-reconcile pass (fix already committed);
  the pass executed exactly that. The slice's original "apply the uncommitted fix" premise was
  already reconciled by the plan as stale, so it is not a fresh deviation.

## Anything Deferred

- None. No `sdlc-debt:` shortcut taken; no capability deferred.

## Known Risks / Caveats

- The scheduler's strict `t < 0` throw is deliberately retained. If a real-world inverted-input case
  (clock skew, corrupt `last_review`) ever appears in production, it will surface loudly as a
  `FSRSValidationError` rather than be silently clamped — this is intended (fail-loud), not a latent
  defect. A clamp remains an available, reversible future move if such a case is ever observed.

## Evidence

- **AC-FSD1 + AC-FSD2** — `pnpm test tests/smoke/fsrs-scheduler.test.ts` →
  `Test Files 1 passed (1)`, `Tests 11 passed (11)`, ~450 ms, node environment. No
  `Invalid delta_t` error. Date-independence proven structurally (above).
- **AC-FSD3** — fixture fix committed in `4274839`, a conventional commit
  (`chore(format): apply oxfmt baseline`, 2026-07-14) that passed the full pre-commit gate without
  `--no-verify`. Confirmed clean via `git diff` (empty) + `git log -S "REVIEW_CARD_TS"`.
- **Tree health** — `pnpm exec tsc --noEmit` → exit 0.

## Freshness Research

No external-dependency freshness pass required — the slice adds no dependency and no new API
surface. The one behavioral fact leaned on (ts-fsrs `delta_t` validation) was verified directly
against the **installed** package source (`node_modules/ts-fsrs/dist/index.cjs:938`,
`ts-fsrs@5.4.1`), which outranks a web-doc lookup for version-pinned behavior.

## Recommended Next Stage

- **Option A (default):** `/wf verify waypoint-app fsrs-scheduler-test-determinism` — verify
  independently re-drives the suite (11/11, no `Invalid delta_t`), confirms date-independence, and
  confirms AC-FSD3's landed-commit reconciliation. Consider `/compact` first — workflow state lives
  in the artifact files.
- **Option B:** `/wf review waypoint-app fsrs-scheduler-test-determinism` — the change is a pure
  test-determinism confirmation with no runtime UI/service surface; a reviewer could treat the green
  suite + typecheck as sufficient and skip straight to review. Verify is still the safer default.
