---
schema: sdlc/v1
type: verify-index
slug: waypoint-app
status: in-progress
stage-number: 6
created-at: "2026-07-11T00:56:06Z"
updated-at: "2026-07-12T07:00:00Z"
slices-verified: 10
slices-total: 12
tags: []
refs:
  index: 00-index.md
  implement-index: 05-implement.md
next-command: wf-review
next-invocation: "/wf review waypoint-app roadmap-lesson-generation"
---

# Verify Index

| Slice | Result | Convergence | Fix rounds | Run count | Notes |
|-------|--------|-------------|------------|-----------|-------|
| foundation | partial | converged | 1 | 6 | All ACs met; AC-F4 (CI run) carries plan-pre-authorized proxy+deferral; run-6 found 2 issues (TS implicit-any in db-collections test, BetterAuth SSR crash in auth-client.ts) — both fixed in 1 round, commit 0faa320; platform-proofs sibling tests pass, 0 regressions |
| platform-proofs | partial | not-needed | 0 | 4 | All ACs met except AC-PP2b live OpenRouter (pre-registered plan-time residual, no key); run 4 found 0 new issues; wrangler config fix from run 1 (commit 7da0ab7) holds; accounts-data-layer in-progress tests (13 new) all pass with 0 regressions |
| accounts-data-layer | partial | not-needed | 0 | 1 | 4 code-only ACs fully met; 2 user-observable ACs evidenced at always-run level (sign-in UI, account redirect); seeded-session proxy tests deferred (BETTER_AUTH_SECRET absent); real OAuth deferred (pre-registered); 0 regressions; 1 LOW issue (build EBUSY, Skip) |
| design-system-shell | partial | not-needed | 0 | 1 | 2 code-only ACs fully met (contrast 13/13, reduced-motion CSS inspection); 3 user-observable ACs deferred (BETTER_AUTH_SECRET, accepted into existing ADL deferral); sign-in ember styling + sibling redirect regression pass; 0 regressions; 1 LOW issue (build EBUSY, Skip) |
| lesson-renderer | pass | converged | 1 | 1 | All 4 ACs met: AC-LR1/2/3 at full Playwright interactive level (screenshots + interaction + timing), AC-LR4 via 19/19 adversarial Vitest unit tests; 2 verify-owned fixes committed (5b6cde1): React 19 hydration mismatch in prose sections (ProseSection + useState escapeHtml seed) + E2E session cookie prefix (__Secure- required for HTTPS BETTER_AUTH_BASE_URL); pre-registered AC-LR1/2/3 deferral CLEARED; 0 regressions across 50/51 tests (1 skip = OpenRouter, pre-existing) |
| sample-journey | pass | converged | 1 | 1 | All 4 ACs met at full Playwright interactive level (first-login redirect, quiz walkthrough, sidebar completion, returning-user bypass); 3 verify-owned test-infra fixes committed (96743b5): React effects timing guard in AC-SJ3, Playwright strict-mode selector scoped to sidebar in AC-SJ3b, serial mode added to prevent SQLITE_BUSY_RECOVERY in beforeAll seeding; pre-registered AC-SJ1/2/3/4 deferral CLEARED (BETTER_AUTH_SECRET present in .dev.vars); 0 regressions across 67/68 tests (1 skip = OpenRouter, pre-existing) |
| tutor-interview | pass | converged | 1 | 1 | All 6 ACs met: AC-TI1/3/4 at full Playwright interactive level (seeded-session, mock mode), AC-TI2/5 via 18/18 Vitest unit tests, AC-TI6 via in-place pedagogy review (po-accepted); 5 verify-time issues fixed (1 round): CSS cascade .wp-drawer.hidden, test index off-by-one (assistant-2→3), React hydration timing (hydration-wait for TanStack Devtools button), CSS cascade .wp-mobile-topbar md:hidden, missing interview.turn_completed instrument signal; 0 regressions across 95/95 Vitest + 11 sibling E2E tests |
| roadmap-lesson-generation | partial | converged | 1 | 1 | 5/6 ACs met; AC-5/6/12/all-fail at full Playwright interactive level (mock SSE + seeded D1); concept-tags code-only via 20 Vitest assertions; AC-15 (first Cloudflare deploy) deferred (OPENROUTER_API_KEY absent; po-accepted constraint at plan time); 2 verify-time fixes (commit a79c117): E2E URL bug (/_authenticated/ → /journey/), testid bug (checkpoint-feedback → checkpoint-explanation); 0 regressions across 116 Vitest + 8 sibling E2E tests; 4/4 instrumentation signals present |
| quiz-fsrs | pass | converged | 1 | 1 | All 6 ACs met: AC-7 walkthrough + gibberish at full Playwright interactive level (seeded-session, mocked grading), 4 code-only ACs via 21 Vitest unit tests (quiz-schema 8, fsrs-scheduler 7, grading-fixture 6); 2 verify-time fixes (commit ffaddb5): Windows CMD shell escaping in runD1() (temp-file --file approach), React hydration race (TanStack Devtools button guard); live-graded smoke (OPENROUTER_API_KEY) pre-registered plan residual absorbed into platform-proofs deferral; 0 regressions |
| adaptation-progress | partial | converged | 1 | 1 | All 4 ACs met at full Playwright interactive level (seeded-session): AC-10 progress surfaces (streak/due/pass-rate/roadmap/history), AC-9 adapt-accept + adapt-decline + empty-state, AC-13 multi-journey isolation via progress routes, AC-14 responsive sweep 5×3 (15 screenshots, no overflow); 3 verify-time test-infra fixes (commit 93a2f94): React 19 hydration guard for adapt-accept and adapt-decline, AC-13 rewritten to use progress routes instead of TanStack DB collection (timing unreliable); pre-registered AC-9/10/13/14 deferral CLEARED (BETTER_AUTH_SECRET present in .dev.vars); AC-14 perceptual design quality is pre-registered human residual (po-accepted); 0 regressions across 181/186 Vitest tests |

## Recommended Next Stage

- **Option A (recommended):** proceed to code review for adaptation-progress — all 4 ACs verified at full interactive Playwright level; 3 test-infra fixes committed (93a2f94); 0 remaining automated issues; AC-14 perceptual design quality is pre-registered human residual; ready for code review
