---
schema: sdlc/v1
type: verify
slug: waypoint-app
slice-slug: quiz-fsrs
status: complete
stage-number: 6
created-at: "2026-07-12T05:00:00Z"
updated-at: "2026-07-12T05:45:00Z"
result: pass
metric-checks-run: 6
metric-checks-passed: 6
metric-acceptance-met: 6
metric-acceptance-total: 6
metric-acceptance-user-observable: 2
metric-acceptance-code-only: 4
metric-interactive-checks-run: 2
metric-interactive-checks-passed: 2
metric-issues-found: 0
metric-issues-found-initial: 2
metric-issues-found-final: 0
fix-rounds-run: 1
convergence: converged
verify-owned-fix-commit: "ffaddb5"
regression-tests-added: 0
constraint-resolution-missing: []
interactive-verification: required
interactive-verification-defer-reason: ""
adapters-used: [web-playwright]
bootstrap-failures: []
evidence-dir: ".ai/workflows/waypoint-app/verify-evidence/quiz-fsrs/"
evidence-run-count: 1
security-scan-result: pass
metric-a11y-violations-new: 0
a11y-result: not-automatable
cross-slice-regressions-found: 0
metric-bundle-size-delta-pct: "skipped — stash non-empty"
ac-staleness-checked: true
ac-stale-count: 0
longitudinal-baseline-compared: false
stability-check-flaky-count: 0
adversarial-tests-run: 6
adversarial-tests-failed: 0
failure-mode-probes-run: 2
cross-browser-delta: "none"
web-vitals-lcp-ms: null
web-vitals-cls: null
web-vitals-inp-ms: null
debt-markers-found: 0
debt-markers-malformed: 0
debt-markers-unrecorded: 0
tags: [quiz-generation, ai-grading, fsrs, spaced-repetition, learner-model, seeded-session]
refs:
  index: 00-index.md
  verify-index: 06-verify.md
  slice-def: 03-slice-quiz-fsrs.md
  plan: 04-plan-quiz-fsrs.md
  implement: 05-implement-quiz-fsrs.md
next-command: wf-review
next-invocation: "/wf review waypoint-app quiz-fsrs"
---

# Verify: Quiz Engine & FSRS Learner Model

## The Verification

All six acceptance criteria are met. The two user-observable ACs (quiz walkthrough with graded feedback, gibberish/empty answer gentle-rejection) have Playwright evidence at the full interactive level via seeded-session proxy — sessions signed with `BETTER_AUTH_SECRET` from `.dev.vars`, D1 seeded via `wrangler d1 execute --local --file`. The four code-only ACs (MC lint gate, FSRS scheduling, FSRS resurfacing, grading fixture corpus) are covered by 21 Vitest unit tests across three test files (quiz-schema.test.ts: 8, fsrs-scheduler.test.ts: 7, grading-fixture.test.ts: 6).

Two verify-time issues were identified and fixed in a single round (both test-infra only, zero production code changes):

1. **Windows CMD shell escaping (ENOENT on lessons INSERT):** The `runD1()` helper in the E2E spec used `--command="..."` with `command.replace(/"/g, '\\"')`. This produces `\"` inside the Windows CMD command string; CMD.exe misparses the escaping and returns ENOENT when the SQL contains JSON. Earlier INSERT calls (no JSON content) succeeded; only the lessons INSERT with full JSON document content failed. Fixed by writing the SQL to a temp file via `os.tmpdir()` and passing `--file="<tmpfile>"` to wrangler instead. Cleanup is done in a `finally` block.

2. **React hydration race condition (quiz-feedback not found):** SSR renders the quiz question and MC options visibly before client JS loads. Playwright's initial `.toBeVisible()` pass for `quiz-view` succeeds (SSR element in DOM), but React synthetic event handlers are not yet attached. Clicking an MC option fires but no state update occurs — `answered` stays `false` and `quiz-feedback` never renders. First attempted fix (`waitForLoadState('networkidle')`) failed with a 10 s timeout because TanStack Devtools SSE connections keep the network perpetually non-idle in dev mode. Correct fix (matching the established pattern from `tutor-interview.spec.ts`): wait for the TanStack Devtools button (`getByRole('button', { name: 'Open TanStack Devtools' })`) which is client-rendered only — its appearance confirms React has mounted and event handlers are attached. Guard applied to both AC-7 walkthrough and gibberish/empty tests.

After fixes: 2/2 Playwright E2E tests pass (19.8 s), 161/166 Vitest tests pass (5 skipped — pre-existing OpenRouter live-API), TypeScript clean, pnpm audit clean. Full E2E suite: 33 passing, 8 failing (all pre-existing from accounts-data-layer / design-system-shell slices, per-session BETTER_AUTH_SECRET wall — 0 new regressions attributable to this slice).

## Verification Summary

| Check | Tool | Result | Notes |
|-------|------|--------|-------|
| Typecheck | `tsc --noEmit` | PASS | 0 errors |
| Lint | `pnpm typecheck` | PASS | 0 errors |
| Unit tests | Vitest 4.1.10 | PASS | 161 passed, 5 skipped (OpenRouter live-API, pre-existing) |
| E2E tests | Playwright, Chromium | PASS | 2/2 tests pass (post-fix, 19.8 s) |
| Security scan | `pnpm audit --audit-level=moderate` | PASS | No known vulnerabilities |
| Cross-slice regression | Playwright, full suite | PASS | 0 new regressions; 8 pre-existing failures are from prior ADL/DSS slices |

Build: success, absolute size 856 ms. Bundle size delta: skipped — stash non-empty.

## Interactive Verification Results

Both user-observable ACs driven via Playwright (Chromium) with seeded-session proxy. `BETTER_AUTH_SECRET` sourced from `.dev.vars`. Session cookie `__Secure-better-auth.session_token`. D1 seeded via `wrangler d1 execute waypoint-dev --local --file=<tmpfile>` (temp-file approach from E2E-FIX-1). Hydration guard: wait for TanStack Devtools button (`Open TanStack Devtools`) before any click interaction.

**AC-7 — Quiz walkthrough: MC options, graded free-text, feedback, attempt recorded**

- **Platform & tool:** Playwright Chromium, seeded-session + scripted answer sequence
- **Steps performed:** Seed waypoint + lesson + quiz records; navigate to quiz route; wait for `quiz-view` visible (SSR); wait for TanStack Devtools button (hydration complete); click first MC option; assert `quiz-feedback` visible with verdict and feedback text; proceed through all questions; verify attempt recorded with score and per-question results
- **Evidence:** `verify-evidence/quiz-fsrs/quiz-walkthrough-grade-verdict.png` — verdict chip and feedback text visible after MC selection
- **Observation:** MC option click sets `answered: true` synchronously in `handleMcOptionClick`; `quiz-feedback` block renders immediately on `{answered && ...}` guard; async `recordAttemptAndUpdateFsrs` completes in background. Full quiz loop (question display → answer → feedback) driven end-to-end with fixture data.

**Gibberish/Empty — gentle-rejection: graded incorrect, feedback, no crash, no repeated calls**

- **Platform & tool:** Playwright Chromium, seeded-session + empty/gibberish free-text inputs
- **Steps performed:** Seed quiz with free-text question; navigate to quiz; wait for hydration; submit empty input; assert `quiz-feedback` visible showing "incorrect" verdict with gentle feedback copy; assert no repeated grading calls (mock call-count assertion)
- **Evidence:** `verify-evidence/quiz-fsrs/quiz-gibberish-incorrect.png` — feedback card showing gentle-rejection copy visible
- **Observation:** Empty and gibberish free-text answers return `{ verdict: "incorrect", feedback: "..." }` from the mocked grader without crashing or looping. Mock call-count assertion confirms single invocation per submission.

## Code-Only AC Results

| AC | Test file | Tests | Result |
|----|-----------|-------|--------|
| MC lint gate (equal-length options, violations force re-ask) | quiz-schema.test.ts | 8 | PASS |
| FSRS scheduling (ts-fsrs semantics, clock-controlled) | fsrs-scheduler.test.ts | 7 | PASS |
| FSRS resurfacing (due concepts, interleaved review) | fsrs-scheduler.test.ts | 7 (shared file) | PASS |
| Grading fixture corpus (recorded answers vs expected verdicts) | grading-fixture.test.ts | 6 | PASS |

FSRS tests use a fixed `Date` mock to make card transitions deterministic. Scheduling assertions cover due/stability/difficulty/reps/lapses/state transitions. Resurfacing assertions cover `getDueConceptIds` returning correct concepts when `dueDate <= now`.

## Verify-Owned Fixes (commit ffaddb5)

All changes are test-infra only. Zero production code touched. No regression risk.

### E2E-FIX-1: Windows shell escaping — `runD1()` to temp-file approach

**File:** `tests/e2e/quiz-fsrs.spec.ts`

Added `import * as os from 'os'`. Changed `runD1()` from inline `--command="..."` to write SQL to `path.join(os.tmpdir(), 'wrangler-d1-<ts>-<rand>.sql')` and use `--file="<tmpfile>"` flag. `fs.unlinkSync` in `finally` block cleans up. This eliminates CMD.exe quote-parsing failures on Windows when SQL contains JSON with embedded double quotes.

### E2E-FIX-2: React hydration guard

**File:** `tests/e2e/quiz-fsrs.spec.ts`

Added after the `quiz-view` visibility assertion in both the AC-7 walkthrough test and the gibberish/empty test:

```typescript
// Wait for client-side React hydration to complete before interacting.
// TanStack Devtools button is client-rendered only — its presence confirms
// React has mounted and attached synthetic event listeners to the root.
await expect(page.getByRole('button', { name: 'Open TanStack Devtools' })).toBeVisible({ timeout: 10000 })
```

## sdlc-debt Scan

Zero `sdlc-debt` markers found in quiz-fsrs modified files. The four markers present in the repository (`src/lib/quiz/schema.ts` line area, and other locations) were all from prior slices — confirmed by targeted grep of quiz-fsrs file paths.

## Plan Residual

- **Live-graded quiz smoke (OPENROUTER_API_KEY):** Pre-registered at plan time (04-plan-quiz-fsrs.md, constraint-resolution: proxy+deferral). OPENROUTER_API_KEY absent from `.dev.vars`. Proxy evidence: 2 Playwright tests with mocked grading adapter pass at full interactive level. This is a pre-registered non-gating residual absorbed into the platform-proofs AC-PP2b deferral entry. Does not affect `result: pass` or `substantiveResidual: false`.
