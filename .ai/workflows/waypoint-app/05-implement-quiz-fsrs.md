---
schema: sdlc/v1
type: implement
slug: waypoint-app
slice-slug: quiz-fsrs
status: complete
stage-number: 5
created-at: "2026-07-12T04:14:40Z"
updated-at: "2026-07-12T04:14:40Z"
metric-files-changed: 17
metric-lines-added: 1450
metric-lines-removed: 132
metric-deviations-from-plan: 3
metric-review-fixes-applied: 0
commit-sha: ""
tags: [quiz-generation, ai-grading, fsrs, spaced-repetition, learner-model]
refs:
  index: 00-index.md
  implement-index: 05-implement.md
  slice-def: 03-slice-quiz-fsrs.md
  plan: 04-plan-quiz-fsrs.md
  siblings:
    - 05-implement-foundation.md
    - 05-implement-platform-proofs.md
    - 05-implement-accounts-data-layer.md
    - 05-implement-design-system-shell.md
    - 05-implement-lesson-renderer.md
    - 05-implement-sample-journey.md
    - 05-implement-ai-gateway.md
    - 05-implement-tutor-interview.md
    - 05-implement-roadmap-lesson-generation.md
  verify: 06-verify-quiz-fsrs.md
next-command: wf-verify
next-invocation: "/wf verify waypoint-app quiz-fsrs"
---

# Implement: Quiz Engine & FSRS Learner Model

## The Implementation

The pedagogy promise closes here. Nine slices of scaffolding — the D1 schema with its seven FSRS fields, the gateway's quiz tier, the quiz surface from the sample journey, the generation pipeline — were all waiting for this piece to wire them together. Two new library files (`src/lib/quiz/schema.ts`, `src/lib/quiz/fsrs-scheduler.ts`), five server functions in `src/server/quiz.ts`, one new quiz route, an extended `QuizView` that now handles both MC and FRQ with live AI grading, and 21 new unit tests across three test files. The `ts-fsrs` library (v5.4.1, FSRS-6) was installed as the scheduling math core; the D1 bridge maps snake_case rows to camelCase ts-fsrs cards and back, with a round-trip unit test that catches off-by-one mapping errors before they silently mis-schedule concepts.

Three typecheck deviations were caught and fixed at implement time: `Link` components in `QuizView.tsx` and the quiz route's `router.navigate()` call used the `/_authenticated/` prefix in route paths, but TanStack Router strips that prefix in registered paths — the correct form is `/journey/$journeyId/...`. The `sample/quiz.tsx` also needed `mode="sample"` added after `QuizView` adopted a required discriminated union prop. All 161 unit tests pass; 5 are intentionally skipped (live smoke tests awaiting API keys).

The grading fixture corpus (6 verdicts against a mocked gateway) and the MC lint gate (8 tests over `validateQuizQuestion`) run clean and fast. The FSRS scheduler tests use `vi.useFakeTimers()` to advance the clock through card state transitions (New → Learning → Review → Relearning) deterministically — no flakiness, no network, no Workers runtime. The E2E quiz walkthrough tests follow the established seeded-session pattern from `sample-journey.spec.ts` and carry the same `BETTER_AUTH_SECRET` deferral as AC-ADL1/5.

## Summary of Changes

- Installed `ts-fsrs@5.4.1` exact pin (Workers-compatible pure ESM, no Node builtins)
- Refined `QUIZ_SYSTEM_PROMPT` with full output JSON schema in `src/lib/interview/prompts.ts`; added `GRADING_SYSTEM_PROMPT` (verdict/score/feedback output, empty/gibberish handling, injection resistance)
- New `src/lib/quiz/schema.ts`: `QuizQuestionOutput`, `GradingOutput` interfaces; `QUIZ_QUESTION_JSON_SCHEMA`, `GRADING_JSON_SCHEMA` for gateway `responseFormat`; `validateQuizQuestion` with MC equal-length lint; `buildQuizPrompt`, `buildGradingPrompt`
- New `src/lib/quiz/fsrs-scheduler.ts`: `mapDbCardToFsrs`, `mapFsrsToDb`, `applyGradeToCard`, `getDueConceptIds`, `computeRetrievability`; FSRS instance configured with `request_retention: 0.85, enable_fuzz: true`
- New `src/server/quiz.ts`: five server functions — `generateQuiz`, `getQuizQuestions`, `gradeAnswer`, `recordAttemptAndUpdateFsrs`, `getWaypointCompletionStatus`
- Extended `src/components/quiz/QuizView.tsx` with journey mode (FRQ textarea, grading state UX, verdict display, FSRS recording); sample mode preserved byte-for-byte
- New `src/routes/_authenticated/journey/$journeyId/waypoint/$waypointId/quiz.tsx`: quiz route with on-first-visit generation
- Converted `src/routes/_authenticated/journey/$journeyId/waypoint/$waypointId.tsx` → `index.tsx` (index route in subdirectory); added "Take Quiz →" CTA and `getWaypointCompletionStatus` loader call
- Added quiz styles to `src/styles.css`: `.wp-quiz-frq-input`, `.wp-quiz-grading-state`, `.wp-quiz-grade-verdict` with `.--correct`/`.--incorrect`/`.--partial` variants
- Three new unit test files (21 tests total): `fsrs-scheduler.test.ts` (7 clock-controlled), `quiz-schema.test.ts` (8 pure-function), `grading-fixture.test.ts` (6 fixture corpus)
- New `tests/e2e/quiz-fsrs.spec.ts`: 2 Playwright tests (AC-7 walkthrough + gibberish/empty scenario)

## Files Changed

- `package.json` — added `ts-fsrs@5.4.1` dependency
- `pnpm-lock.yaml` — auto-updated by pnpm add
- `src/lib/interview/prompts.ts` — refined `QUIZ_SYSTEM_PROMPT` (full output schema); added `GRADING_SYSTEM_PROMPT`
- `src/lib/quiz/schema.ts` — NEW: types, JSON schemas, validation, prompt builders
- `src/lib/quiz/fsrs-scheduler.ts` — NEW: ts-fsrs ↔ D1 bridge, scheduling, resurfacing query
- `src/server/quiz.ts` — NEW: 5 server functions
- `src/components/quiz/QuizView.tsx` — extended with journey mode (FRQ, grading state, FSRS recording); added `mode` prop
- `src/routes/_authenticated/journey/$journeyId/waypoint/$waypointId/quiz.tsx` — NEW: quiz route
- `src/routes/_authenticated/journey/$journeyId/waypoint/$waypointId/index.tsx` — renamed + extended with quiz CTA and completion status
- `src/routes/_authenticated/sample/quiz.tsx` — added `mode="sample"` to QuizView prop (discriminated union fix)
- `src/styles.css` — FRQ input, grading state, grade verdict styles
- `src/routeTree.gen.ts` — regenerated with new quiz route
- `tests/smoke/fsrs-scheduler.test.ts` — NEW: 7 clock-controlled FSRS unit tests
- `tests/smoke/quiz-schema.test.ts` — NEW: 8 schema validation + MC lint tests
- `tests/smoke/grading-fixture.test.ts` — NEW: 6-fixture grading corpus tests
- `tests/e2e/quiz-fsrs.spec.ts` — NEW: 2 Playwright E2E tests (serial mode, seeded session)

## Shared Files (also touched by sibling slices)

- `src/components/quiz/QuizView.tsx` — originally built by `sample-journey`. This slice extends it with journey mode while preserving sample mode byte-for-byte.
- `src/lib/interview/prompts.ts` — built by `tutor-interview`. This slice adds `GRADING_SYSTEM_PROMPT` and refines `QUIZ_SYSTEM_PROMPT`.
- `src/styles.css` — shared with all UI slices.

## Notes on Design Choices

- **Route path format fix**: `Link to` and `router.navigate` use `/journey/$journeyId/...` (no `_authenticated` prefix) — TanStack Router registers authenticated child routes without the layout segment in the `to` path. TypeScript caught this at typecheck, fixing it before any runtime failure.
- **Discriminated union `mode` prop**: `QuizView` now requires `mode: 'sample' | 'journey'` to distinguish between fixture-based and server-backed flows. `sample/quiz.tsx` needed `mode="sample"` added (single-character fix, no regression).
- **`captureFn` unused variable in fsrs-scheduler test**: test 5 (exclusion parameter test) creates a `captureFn` that's not called in the current implementation; the test was written to verify the SQL string instead. Harmless — already in scope for a future refactor if needed.
- **waypoint route moved from `$waypointId.tsx` to `$waypointId/index.tsx`**: required to add the `quiz` child route under `$waypointId/`. This is a standard TanStack Router pattern — no behavior change to the waypoint lesson page itself.

## Verification Seams Built

- AC-7 quiz walkthrough → `data-testid="quiz-page"` at `quiz.tsx:55`; `data-testid="quiz-view"` at `QuizView.tsx:284`; `data-testid="quiz-feedback"` at `QuizView.tsx:487`; `data-testid="quiz-grading-state"` at `QuizView.tsx:549`; `data-testid="quiz-grade-verdict"` at `QuizView.tsx:559` — enables Playwright to observe MC feedback and FRQ grading loop
- AC-7 FRQ input → `data-testid="quiz-frq-input"` textarea at `QuizView.tsx:538` — enables Playwright to type answers and observe submit/disable behavior
- AC-8 scheduling → `applyGradeToCard`, `getDueConceptIds` exported directly from `fsrs-scheduler.ts`; D1 stub via `vi.fn` — enables clock-controlled Vitest tests
- Grading fixture → `gradeAnswer` calls `callGateway` which is mockable via `vi.mock('#/lib/ai/gateway')` — enables fixture corpus tests in `grading-fixture.test.ts`
- Quiz results screen → `data-testid="quiz-results"`, `data-testid="quiz-score"` — enables Playwright to verify completion flow

## Deviations from Plan

1. **Route `to` path format**: plan assumed `/_authenticated/...` prefix in `Link to` and `router.navigate`; TypeScript typecheck revealed the correct form strips `_authenticated`. Fixed at implement time — zero behavior change, purely a path string correction.
2. **`sample/quiz.tsx` `mode` prop**: plan did not explicitly note that adding the `mode` discriminated union to `QuizView` would require updating `sample/quiz.tsx`. Fixed at implement time — one-line addition.
3. **`quiz-debug.mjs` in root**: a debug script created during development was found in the repo root. It was excluded from the commit. Will be deleted or gitignored in a follow-up.

## Anything Deferred

- **AC-7 E2E walkthrough**: `constraint-resolution: proxy+deferral` — BETTER_AUTH_SECRET not set in automated env. Proxy evidence: 21 unit tests (FSRS + MC lint + grading fixture) all pass. Absorbed into existing AC-ADL1+AC-ADL5 deferral entry; same clearing event ("re-running E2E suite with BETTER_AUTH_SECRET set in .dev.vars").
- **AC-7 live-graded quiz smoke**: OPENROUTER_API_KEY not in automated env. Tagged smoke test (`quiz-live-smoke`) deferred per pre-registered plan constraint; clearing event: "one live-graded quiz via tagged smoke with OPENROUTER_API_KEY present".
- **Concept batching**: the plan noted that batching multiple concepts into one gateway call (instead of one call per concept) could reduce cost. Recorded as a plan-time option; `sdlc-debt: batch quiz concepts into single callGateway call if per-waypoint generation cost becomes a concern (currently N calls for N concepts)` — upgrade path: refactor `generateQuiz` to batch.

## Known Risks / Caveats

- **Grading quality is fuzzy**: the `GRADING_SYSTEM_PROMPT` rubric + 6-fixture corpus bound it, but prompt tuning may be needed after live learner usage. The fixture corpus is the baseline; divergences in live smoke tests are logged for manual review.
- **ts-fsrs Card/D1 bridge**: the round-trip unit test (`mapFsrsToDb(mapDbCardToFsrs(dbCard))`) catches mapping errors, but FSRS scheduling is sensitive to floating-point precision — the D1 REAL column stores `stability` and `difficulty` as doubles, matching ts-fsrs's internal representation.

## Freshness Research

No new freshness research required at implement time. Plan's freshness section confirmed ts-fsrs v5.4.1 API (`new FSRS(...)`, `fsrs.repeat(card, now)[rating]`, `createEmptyCard()`, `fsrs.get_retrievability(card, now)`) and verified Workers compatibility (pure ESM, no Node builtins). All API calls match the confirmed signatures.

## Recommended Next Stage

- **Option A (default):** `/wf verify waypoint-app quiz-fsrs` — unit tests pass clean (21/21); E2E tests are written and will run when BETTER_AUTH_SECRET is present. Verify stage runs the full suite and records deferral evidence per the established pattern.
- **Option B:** `/wf review waypoint-app quiz-fsrs` — skip verify if the unit test evidence is sufficient for the review gate.
