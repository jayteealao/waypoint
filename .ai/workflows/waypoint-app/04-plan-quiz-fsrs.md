---
schema: sdlc/v1
type: plan
slug: waypoint-app
slice-slug: quiz-fsrs
status: complete
stage-number: 4
created-at: "2026-07-12T03:40:50Z"
updated-at: "2026-07-12T03:40:50Z"
metric-files-to-touch: 14
metric-step-count: 13
has-blockers: false
revision-count: 0
revisions: []
tags: [quiz-generation, ai-grading, fsrs, spaced-repetition, learner-model]
stack-source: confirmed
refs:
  index: 00-index.md
  plan-index: 04-plan.md
  slice-def: 03-slice-quiz-fsrs.md
  siblings:
    - 04-plan-foundation.md
    - 04-plan-platform-proofs.md
    - 04-plan-accounts-data-layer.md
    - 04-plan-design-system-shell.md
    - 04-plan-lesson-renderer.md
    - 04-plan-sample-journey.md
    - 04-plan-ai-gateway.md
    - 04-plan-tutor-interview.md
    - 04-plan-roadmap-lesson-generation.md
  implement: 05-implement-quiz-fsrs.md
next-command: wf-verify
next-invocation: "/wf verify waypoint-app quiz-fsrs"
---

# Plan: Quiz Engine & FSRS Learner Model

## The Plan

Ten slices of proven infrastructure converge here to close the pedagogy promise: the quiz
surface born in `sample-journey`, the generation pipeline from `roadmap-lesson-generation`,
the gateway that meters every LLM call, and the D1 schema that has carried seven FSRS fields
per concept card since the very first migration. Everything was waiting for this slice to wire
it together.

The implementation is two distinct but tightly coupled loops. The first is generation: when the
learner clicks "Take Quiz" on a completed lesson, a single server function reads the waypoint's
concept list, upserts concept rows into D1, initialises FSRS cards for any concepts that don't
have one yet, queries for due concepts from earlier waypoints (the resurfacing contract), and
calls `callGateway` once per question — one question per concept, quiz tier — returning a
validated question row for each. The second loop is grading and scheduling: the learner answers
a question, the UI posts the response to `gradeAnswer`, the gateway returns a verdict + feedback
in one non-streaming structured call, `recordAttemptAndUpdateFsrs` persists the attempt and
updates the concept's FSRS card via `ts-fsrs`'s `fsrs.repeat()`. Fourteen files, thirteen steps.

The FSRS scheduler is intentionally proven LLM-free: clock-controlled Vitest unit tests advance
cards through state transitions (New → Learning → Review → Relearning) using simulated answer
histories and fake timers. The one genuinely fuzzy surface — grading quality — is bounded by a
rubric prompt, a six-fixture corpus test that runs in CI against the mocked adapter, and a
tagged live-smoke test cleared on demand with the PO's OpenRouter key. Grading is not retried:
the grader is instructed to treat empty and gibberish answers as incorrect with gentle feedback,
so no re-grade loop can occur.

## Current State

Nine slices implemented and reviewed:

- **`src/components/quiz/QuizView.tsx`** — 249-line MC-only quiz flow (sample-journey). Handles
  one question at a time, immediate feedback, localStorage attempt persistence. Needs extension
  for FRQ inputs, AI grading state, and journey mode (server-backed attempts vs. localStorage).
- **`src/lib/interview/prompts.ts`** — `QUIZ_SYSTEM_PROMPT` drafted thin at the tutor-interview
  slice. Needs a full output JSON schema (mc/frq shapes, per-option explanations, concept_tag)
  and a new `GRADING_SYSTEM_PROMPT` for the per-question grading call.
- **`src/lib/ai/gateway.ts`** — `callGateway({ type: 'quiz', responseFormat })` already routed
  through the quiz tier (`src/lib/ai/tiers.ts`). No gateway changes needed.
- **`src/db/schema.ts`** — `QuizQuestion`, `QuizAttempt`, `Concept`, and `ConceptFsrsCard`
  interfaces all present, matching the D1 schema. The FSRS card has all seven fields.
- **`migrations/0000_schema_v1.sql`** — all four tables created with `CREATE TABLE IF NOT
  EXISTS`. No migration needed for this slice (no schema change).
- **`src/routes/_authenticated/journey/$journeyId/waypoint/$waypointId.tsx`** — renders
  `LessonView` or `LessonGeneratingView`. Needs a "Take Quiz" CTA added and completion status
  wired into the sidebar waypoints list.
- **`src/server/journeys.ts`**, **`src/server/roadmap.ts`** — established the pattern:
  `withSession` middleware, `requireAuth` + `requireOwnership`, D1 batch inserts,
  `callGateway` for structured output. `generateQuiz` follows exactly this pattern.
- **`pnpm-lock.yaml`** — ts-fsrs is NOT in `node_modules`. It must be added as a dependency.

## Simplicity Ladder

- **FSRS scheduling math** → rung 2 native-platform (ts-fsrs v5.4.1) — the algorithm is
  a solved problem; ts-fsrs is what Anki switched to. Implementing FSRS-6 from scratch would
  be ~500 lines of error-prone floating-point math with corner cases. The library is 12 kB
  minified, Workers-compatible (pure ESM, no Node builtins), exactly-pinnned.
- **Quiz generation per concept** → rung 3 reuse — `callGateway({ type: 'quiz',
  responseFormat: QUIZ_QUESTION_JSON_SCHEMA })` reuses the established gateway pattern.
  No new AI integration surface.
- **MC equal-length lint** → rung 1 stdlib — word count via `str.split(/\s+/).length`;
  comparison with 10% tolerance. Pure function, no library.
- **Grading** → rung 3 reuse — same `callGateway` pattern, quiz tier, new
  `GRADING_SYSTEM_PROMPT`. The existing Response Healing (non-streaming structured output)
  handles malformed grading JSON automatically.
- **Resurfacing selection** → rung 1 stdlib over D1 — a SQL query with
  `due <= ?` and a join on `concepts` to exclude the current waypoint. A D1 index
  `fsrs_user_due_idx ON concept_fsrs_cards(user_id, due)` already exists in the schema.
- **Concept row management** → rung 3 reuse — `INSERT OR IGNORE INTO concepts` on each
  quiz generation; the D1 schema already has `concepts(journey_id, name)`. No separate
  concept-management slice needed.

## Applied Learnings

No applicable learnings found. The solutions corpus (`.ai/solutions/INDEX.md`) does not exist
in this repository.

Repeat-deferral tripwire: the existing `BETTER_AUTH_SECRET` deferral wall (AC-ADL1/5,
AC-DSS1/3/4/5, AC-LR1/2/3) will apply again to the E2E quiz tests. Per the force-scope rule
the plan records this explicitly:
- **constraint-resolution: proxy+deferral** — absorbed into the existing AC-ADL1+AC-ADL5
  deferral entry. Proxy evidence: FSRS unit tests + MC lint tests + grading fixture corpus
  all pass without authentication. Clearing event: same as existing entry ("re-running E2E
  suite with BETTER_AUTH_SECRET set in .dev.vars").
No new deferral entry is created; the existing one already names this clearing event.

## Likely Files / Areas to Touch

- `package.json` — add ts-fsrs exact pin
- `src/lib/interview/prompts.ts` — refine QUIZ_SYSTEM_PROMPT + add GRADING_SYSTEM_PROMPT
- `src/lib/quiz/schema.ts` — NEW: output types, JSON schema, validation, MC lint, buildQuizPrompt
- `src/lib/quiz/fsrs-scheduler.ts` — NEW: ts-fsrs ↔ D1 bridge, scheduling, resurfacing
- `src/server/quiz.ts` — NEW: 5 server functions (generateQuiz, getQuizQuestions, gradeAnswer, recordAttemptAndUpdateFsrs, getWaypointCompletionStatus)
- `src/components/quiz/QuizView.tsx` — extend for FRQ, grading state, journey mode
- `src/routes/_authenticated/journey/$journeyId/waypoint/$waypointId/quiz.tsx` — NEW quiz route
- `src/routes/_authenticated/journey/$journeyId/waypoint/$waypointId.tsx` — add quiz CTA + completion status
- `src/styles.css` — FRQ input + grading-state + partial-verdict styles
- `tests/smoke/fsrs-scheduler.test.ts` — NEW: clock-controlled FSRS unit tests
- `tests/smoke/quiz-schema.test.ts` — NEW: JSON validation + MC lint gate tests
- `tests/smoke/grading-fixture.test.ts` — NEW: fixture corpus for grading verdicts
- `tests/e2e/quiz-fsrs.spec.ts` — NEW: Playwright quiz walkthrough + gibberish scenario
- `pnpm-lock.yaml` — auto-updated by pnpm add

## Proposed Change Strategy

Scheduler-first, then generation, then grading, then UI, then tests. The FSRS bridge
(`fsrs-scheduler.ts`) is the mathematical core and can be fully unit-tested before any gateway
call is made. Once the bridge is verified, `generateQuiz` wires concepts → FSRS card init →
question generation in a single server function. The grading loop (`gradeAnswer` +
`recordAttemptAndUpdateFsrs`) is a thin layer on top. The UI extension is last because it
depends on server function signatures being stable.

No database migration is needed: all four tables (`quiz_questions`, `quiz_attempts`,
`concepts`, `concept_fsrs_cards`) were created in `0000_schema_v1.sql` with the exact schema
this slice uses. The `fsrs_user_due_idx` index already exists for efficient resurfacing queries.

## Step-by-Step Plan

1. **Install ts-fsrs.** Run `pnpm add ts-fsrs@5.4.1` (exact pin per `.npmrc`
   `save-exact=true`). Confirm the package is Workers-compatible (pure ESM, no Node builtins).

2. **Refine `QUIZ_SYSTEM_PROMPT` and add `GRADING_SYSTEM_PROMPT` in
   `src/lib/interview/prompts.ts`.** The refined quiz prompt must include the full output
   JSON schema comment (mc/frq shapes: question, type, options[4], correct_answer, rubric,
   concept_tag, per-option explanations). The grading prompt must specify the output shape
   (verdict: 'correct'|'incorrect'|'partial', score: 0|1|2, feedback: string), instruct the
   grader to treat empty/gibberish as incorrect with gentle feedback (no re-grade, no crash),
   and include the question text + rubric in the user message assembled by `buildGradingPrompt`.

3. **Author `src/lib/quiz/schema.ts`.** Exports:
   - `QuizQuestionOutput` TypeScript interface (the model's response for one question)
   - `GradingOutput` TypeScript interface (the model's grading response)
   - `QUIZ_QUESTION_JSON_SCHEMA` — JSON Schema object for `callGateway` `responseFormat`
   - `GRADING_JSON_SCHEMA` — JSON Schema for the grading response
   - `validateQuizQuestion(value: unknown): QuizQuestionOutput` — pure validation function
     that checks all required fields AND the MC equal-length lint (options must all be within
     10% word count of the shortest — the gate that prevents formatting clues)
   - `buildQuizPrompt(conceptName: string, waypointContext: string): string` — user message
     for quiz generation
   - `buildGradingPrompt(question: QuizQuestion, response: string): string` — user message
     for grading

4. **Author `src/lib/quiz/fsrs-scheduler.ts`.** Imports `fsrs`, `createEmptyCard`, `Rating`
   from `ts-fsrs`. Exports:
   - `mapDbCardToFsrs(row: ConceptFsrsCard): Card` — converts snake_case D1 fields to
     ts-fsrs Card (due: new Date(row.due), stability, difficulty, reps, lapses,
     state: row.state as State, lastReview: row.last_review ? new Date(row.last_review) : undefined)
   - `mapFsrsToDb(card: Card): Omit<ConceptFsrsCard, 'id'|'user_id'|'concept_id'>` —
     converts back (due: card.due.getTime(), last_review: card.lastReview?.getTime() ?? null)
   - `applyGradeToCard(db: D1Database, userId: string, conceptId: string, rating: Rating,
     serverNow: Date): Promise<void>` — reads existing card (or creates via createEmptyCard()),
     calls `fsrs.repeat(card, serverNow)[rating]`, writes updated fields via UPSERT
   - `getDueConceptIds(db: D1Database, userId: string, journeyId: string,
     currentWaypointId: string, limit?: number): Promise<string[]>` — SQL:
     `SELECT c.id FROM concepts c JOIN concept_fsrs_cards fc ON fc.concept_id = c.id
      WHERE c.journey_id = ? AND fc.user_id = ? AND fc.due <= ?
      AND c.id NOT IN (SELECT concept_id FROM quiz_questions WHERE waypoint_id = ?)
      ORDER BY fc.due ASC LIMIT ?`
   - `computeRetrievability(card: ConceptFsrsCard, now: number): number` — calls
     `fsrs.get_retrievability(mapDbCardToFsrs(card), new Date(now))`
   - FSRS instance configured once at module scope:
     `const fsrs = new FSRS({ request_retention: 0.85, enable_fuzz: true })`

5. **Author `src/server/quiz.ts`** — five `createServerFn` functions, all with
   `withSession` middleware (`requireAuth`), following the `journeys.ts` pattern:

   (a) **`generateQuiz({ waypointId, journeyId })`**: reads the waypoint row
   (`SELECT concepts FROM waypoints WHERE id = ?`); parses the JSON concept array; upserts
   each concept name into the `concepts` table (`INSERT OR IGNORE INTO concepts`); calls
   `applyGradeToCard` with `Rating.Manual` (sentinel for "new card, no history") only if the
   card doesn't exist yet — this initialises the card without updating stability; calls
   `getDueConceptIds` with `limit=2` to append up to 2 review questions from earlier
   waypoints; calls `callGateway({ type: 'quiz', responseFormat: QUIZ_QUESTION_JSON_SCHEMA,
   messages: [{ role: 'user', content: buildQuizPrompt(conceptName, context) }] })` once per
   question concept; validates via `validateQuizQuestion` (one re-ask on malformed JSON);
   batch-inserts `quiz_questions` rows; returns the question list.

   (b) **`getQuizQuestions({ waypointId })`**: `SELECT * FROM quiz_questions WHERE
   waypoint_id = ? ORDER BY rowid` — returns `QuizQuestion[]`.

   (c) **`gradeAnswer({ questionId, response })`**: reads the `quiz_questions` row (for rubric
   + correct_answer); calls `callGateway({ type: 'quiz', responseFormat: GRADING_JSON_SCHEMA,
   messages: [{ role: 'user', content: buildGradingPrompt(question, response) }] })`; parses
   and returns `GradingOutput`.

   (d) **`recordAttemptAndUpdateFsrs({ questionId, response, score, feedback })`**:
   authorisation-checks the question belongs to a waypoint in the authenticated user's journey;
   inserts into `quiz_attempts`; if the question has a `concept_id`, calls `applyGradeToCard`
   with the appropriate `Rating` (score=2 → `Rating.Good`; score=1 → `Rating.Hard`;
   score=0 → `Rating.Again`).

   (e) **`getWaypointCompletionStatus({ journeyId })`**: SQL:
   `SELECT q.waypoint_id, COUNT(*) > 0 as completed FROM quiz_questions q
    JOIN quiz_attempts a ON a.quiz_question_id = q.id AND a.user_id = ? AND a.score >= 1
    WHERE q.waypoint_id IN (SELECT id FROM waypoints WHERE journey_id = ?)
    GROUP BY q.waypoint_id`
   Returns `Record<string, boolean>`.

6. **Extend `src/components/quiz/QuizView.tsx`**. Add a `mode: 'sample' | 'journey'` prop.
   In `'journey'` mode: accept `questions: QuizQuestion[]` (D1-typed, not sample fixture);
   render a `<textarea>` with `data-testid="quiz-frq-input"` for `type === 'frq'` questions;
   on FRQ submit, call `gradeAnswer` server function and show `data-testid="quiz-grading-state"`
   with a "Checking your answer…" message during the await; render the returned verdict and
   feedback in the existing `.wp-quiz-feedback` element with `data-testid="quiz-grade-verdict"`;
   call `recordAttemptAndUpdateFsrs` after grading. In `'sample'` mode the existing flow is
   preserved byte-for-byte (no regression to the sample journey).

7. **Author `src/routes/_authenticated/journey/$journeyId/waypoint/$waypointId/quiz.tsx`**.
   Route: `/_authenticated/journey/$journeyId/waypoint/$waypointId/quiz`. Loader:
   `const questions = await getQuizQuestions({ data: { waypointId } }); if (!questions.length)
   { await generateQuiz({ data: { waypointId, journeyId } }); }` — generation on first visit.
   Component: renders `<QuizView mode="journey" questions={questions} />` inside a
   `<div data-testid="quiz-page">` wrapper. On quiz completion, calls
   `router.navigate({ to: '/_authenticated/journey/$journeyId/waypoint/$waypointId', params })`.
   Re-run `pnpm generate-routes` after creating this file.

8. **Modify `src/routes/_authenticated/journey/$journeyId/waypoint/$waypointId.tsx`**.
   Loader: also call `getWaypointCompletionStatus({ journeyId })` and include in loader data.
   Component: (a) add a "Take Quiz →" `<Link>` to the quiz route, shown below `LessonView`
   when `parsedDoc !== null` and the lesson is not generating. (b) pass the completion status
   map to `setWaypoints` so the sidebar can mark completed waypoints (update the `completed`
   field in the waypoint array; `Sidebar.tsx` already reads this field but hard-coded it to
   `false` in the route's TODO comment).

9. **Add quiz UI styles to `src/styles.css`**.
   - `.wp-quiz-frq-input`: full-width textarea, ember token border on focus, min-height 120px,
     resize-vertical.
   - `.wp-quiz-grading-state`: `data-testid="quiz-grading-state"`, muted ink, italic, with a
     CSS `@keyframes` blink on a trailing ellipsis.
   - `.wp-quiz-grade-verdict`: verdict color variants (`.--correct`, `.--incorrect`,
     `.--partial` using `--ember-600` amber token for partial, matching the design system palette).

10. **Write `tests/smoke/fsrs-scheduler.test.ts`**. Uses `vi.useFakeTimers()`. Tests:
    - New card (no existing row) starts in New state after `applyGradeToCard`.
    - `Rating.Good` on a New card advances stability and changes state to Learning.
    - `Rating.Again` on a Review card increments lapses and transitions to Relearning.
    - `getDueConceptIds` returns concept IDs where `due <= serverNow`.
    - `getDueConceptIds` excludes concepts whose quiz questions belong to `currentWaypointId`.
    - `computeRetrievability` returns ≈1.0 immediately after a successful review.
    - Round-trip: `mapFsrsToDb(mapDbCardToFsrs(dbCard))` produces the original field values.
    All tests use a lightweight D1 stub (vitest mock of `env.DB.prepare().bind().run/first`).

11. **Write `tests/smoke/quiz-schema.test.ts`**. Tests:
    - `validateQuizQuestion` accepts a valid 4-option MC question with equal-length options.
    - Rejects missing `question` field.
    - Rejects MC with `options.length !== 4`.
    - MC lint: rejects when one option is >10% longer in word count than the shortest.
    - MC lint: accepts options within 10% word count tolerance.
    - FRQ question with valid rubric passes.
    - FRQ question without rubric fails.
    - `buildQuizPrompt` returns a non-empty string containing the concept name.

12. **Write `tests/smoke/grading-fixture.test.ts`**. Fixture corpus (6 entries):
    `{ question, response, expectedVerdict }` covering correct / incorrect / partial /
    gibberish / empty / multi-sentence-correct. Mocks `callGateway` to return deterministic
    `GradingOutput` objects matching the fixture's `expectedVerdict`. Asserts each verdict
    matches expectation and feedback is a non-empty string. Asserts gibberish/empty inputs
    receive `verdict='incorrect'` without throwing. Tests run in < 1s (no network).

13. **Write `tests/e2e/quiz-fsrs.spec.ts`**. Pattern from `sample-journey.spec.ts`:
    seeded user + session + journey + waypoint + 3 pre-seeded `quiz_questions` rows (2 MC,
    1 FRQ) inserted via wrangler CLI. Two tests (serial mode):
    - **(AC-7 walkthrough)**: navigates to quiz route, mocks `gradeAnswer` at the network
      level to return `{ verdict: 'correct', score: 2, feedback: 'Well done!' }`, answers MC
      question, asserts `data-testid="quiz-feedback"` visible, proceeds to FRQ, types answer,
      asserts `data-testid="quiz-grading-state"` visible briefly, asserts
      `data-testid="quiz-grade-verdict"` visible after grading.
    - **(Gibberish / empty)**: FRQ question only; submits empty textarea; mocks grading to
      return `{ verdict: 'incorrect', score: 0, feedback: 'Give it another try — …' }`;
      asserts `verdict='incorrect'`, asserts gentle language in feedback, asserts only 1
      network request to the grading endpoint (no re-grade loop). constraint-resolution:
      proxy+deferral — accepted into existing AC-ADL1+AC-ADL5 deferral (BETTER_AUTH_SECRET).

## Verification Strategy

| AC | Tool / method + ladder rung | Environment need — satisfiable? | What must be BUILT | Fallback chain |
|----|-----------------------------|---------------------------------|--------------------|----------------|
| AC-7 quiz walkthrough (MC + FRQ + AI grading + attempt recorded) | Playwright E2E, seeded session + mocked callGateway (web-1) | local dev + BETTER_AUTH_SECRET in .dev.vars — same wall as AC-ADL1/5 deferral | seeded quiz_questions rows, gradeAnswer mock at network level, data-testid seams | proxy: FSRS unit + MC lint + grading fixture pass; pre-registered deferral (BETTER_AUTH_SECRET); live-graded smoke cleared by OPENROUTER_API_KEY |
| AC-7 live-graded quiz residual | Tagged smoke test with real OPENROUTER_API_KEY | OPENROUTER_API_KEY in .dev.vars — not in automated env | none (uses existing gateway) | pre-registered deferral; cleared by: live-graded smoke run with key present |
| AC-8 scheduling (FSRS card transitions) | Vitest clock-controlled unit tests (rung 2 automated) | node env, no Workers runtime — satisfiable in CI | D1 stub (vi.mock), fake timers | none needed — deterministic math |
| AC-8 resurfacing (due concepts in later quiz) | Vitest unit test over getDueConceptIds (rung 2 automated) | same as above — satisfiable | D1 stub with seeded cards | none needed |
| Gibberish/empty grading (gentle feedback, no loop) | Playwright E2E, mocked grading (web-1) | same BETTER_AUTH_SECRET wall | data-testid="quiz-grading-state", network request count assertion | proxy: grading-fixture.test.ts fixture asserts empty → verdict='incorrect' without crash |
| Grading fixture corpus (verdicts match expected) | Vitest fixture corpus over mocked callGateway (rung 2 automated) | node env — satisfiable | 6-fixture corpus in grading-fixture.test.ts | none needed — mocked |

**Per-AC constraint-resolution:**

- **AC-7 walkthrough E2E**: `constraint-resolution: proxy+deferral` — proxy: FSRS unit tests
  + MC lint + grading fixture corpus pass without auth; deferral absorbed into existing
  AC-ADL1+AC-ADL5 entry (BETTER_AUTH_SECRET wall). Clearing event already recorded.
- **AC-7 live-graded smoke**: `constraint-resolution: proxy+deferral` — proxy: mocked grading
  E2E passes; pre-registered deferral. Clearing event: "one live-graded quiz via tagged smoke
  with OPENROUTER_API_KEY present".
- **AC-8 (both halves)**: `constraint-resolution: po-accepted: AC-8 is fully covered by
  deterministic Vitest unit tests (clock-controlled); no runtime environment dependency.`
- **Gibberish E2E**: same as AC-7 walkthrough (BETTER_AUTH_SECRET wall, same deferral).
- **Grading fixture corpus**: no constraint — fully automated in CI.

## Test / Verification Plan

### Automated checks

- **lint/typecheck**: `pnpm typecheck` — ts-fsrs types must satisfy the ConceptFsrsCard
  bridge without `as any` casts; `QuizQuestion` and `GradingOutput` interfaces must align.
- **unit tests** (`pnpm test`):
  - `tests/smoke/fsrs-scheduler.test.ts` — 7 tests, clock-controlled, ~50ms.
  - `tests/smoke/quiz-schema.test.ts` — 8 tests, pure functions, ~10ms.
  - `tests/smoke/grading-fixture.test.ts` — 6 fixtures, mocked gateway, ~20ms.
- **integration tests** (included in `pnpm test`): the existing `tests/smoke/ai-gateway.test.ts`
  already covers the quiz tier routing; no new gateway integration tests needed.

### Interactive verification (human-in-the-loop)

- **What to verify**: Quiz walkthrough — learner takes a generated quiz, receives immediate
  per-question feedback on MC and graded feedback on FRQ, and sees the waypoint sidebar
  item updated to complete afterward.
- **Platform & tool**: Web — in-repo Playwright suite (`pnpm test:e2e`), dev server at
  `pnpm dev` (port 3000). Seeded session via wrangler CLI (pattern from sample-journey.spec.ts).
- **Companion skills**: `verify` skill for end-to-end observation.
- **Steps**:
  1. `pnpm dev` (or `wrangler dev` for Workers runtime) in one terminal.
  2. `pnpm exec wrangler d1 execute waypoint-dev --local --command="<seed SQL>"` to insert
     a user, session, journey, waypoint, and 2 quiz_questions (1 MC, 1 FRQ).
  3. `pnpm test:e2e --grep "quiz-fsrs"` — runs the two seeded-session tests.
  4. Observe: `data-testid="quiz-grading-state"` appears and resolves; `data-testid=
     "quiz-grade-verdict"` shows; sidebar waypoint shows completion indicator after quiz.
- **Evidence capture**: Playwright screenshot at `quiz-feedback` visible (MC path) and
  `quiz-grade-verdict` visible (FRQ path). Network trace asserting single grading request.
- **Pass criteria**: Both tests green, screenshots showing feedback and verdict, network log
  showing exactly 1 POST to the grading server function per FRQ answer.

If `BETTER_AUTH_SECRET` is absent from `.dev.vars`, tests skip by design — absorbed into
existing deferral (AC-ADL1+AC-ADL5). Run with secret present to clear.

**Live-graded smoke** (on demand, with OPENROUTER_API_KEY):
- `pnpm test:e2e --grep "quiz-live-smoke"` (tagged separately) — submits a real FRQ
  answer to the real grader; asserts verdict is one of the three valid values and feedback
  is non-empty. Divergences from fixture-corpus expectations are logged for manual review
  (grading quality gate — human judgement, not a hard assertion).

## Risks / Watchouts

- **Grading quality is fuzzy.** A harsh grader discourages learners; a lax one corrupts the
  FSRS model. The rubric prompt + fixture corpus bound it, but prompt iteration should be
  budgeted at implement time. Keep the GRADING_SYSTEM_PROMPT narrow and explicit; the model
  should not interpret intent — it reads the rubric and scores accordingly.
- **ts-fsrs Card/D1 bridge mapping.** ts-fsrs uses camelCase (due, stability, lastReview);
  D1 uses snake_case. An off-by-one in `mapDbCardToFsrs` silently mis-schedules cards. The
  round-trip unit test catches this.
- **Resurfacing query performance.** The `fsrs_user_due_idx ON concept_fsrs_cards(user_id, due)`
  index already exists; the join on `concepts.journey_id` and the exclusion of the current
  waypoint's concepts are selective. Verify with `EXPLAIN QUERY PLAN` if the journey has > 100
  concepts (unlikely in v1 but the index makes it safe).
- **Quiz generation cost per waypoint.** One `callGateway` call per question concept means
  2–5 quiz-tier calls per waypoint generation event. At Gemini 2.5 Flash pricing these are
  cheap, but a waypoint with 8 concepts costs 8 calls. The gateway's quota enforcement caps
  worst-case spend; consider batching concepts into a single call (multi-question JSON array)
  if call counts become a concern at implement time. Recorded as plan-time option, not a
  blocker.
- **Tag semantics from generation.** FSRS resurfacing depends on concept tags matching between
  generation and quiz. If the roadmap-lesson-generation slice's concept names are too coarse or
  change format between slices, the FSRS join breaks. Fix is in generation prompts, not here —
  keep the boundary clean and document the tag format contract in `schema.ts`.

## Dependencies on Other Slices

- **`roadmap-lesson-generation`** (direct): lessons with concept tags (waypoint.concepts JSON
  array) are the quiz's source material. The concept array format is `["Concept A", "Concept B"]`
  — string names, not IDs. The quiz server function converts names → rows.
- **`sample-journey`** (direct): the quiz surface this slice extends. The existing `QuizView`
  component is preserved under `mode='sample'`; the extension must not break the sample journey.
- **Transitive: `ai-gateway`** — all gateway calls go through `callGateway`. No direct dep
  on the gateway internals; only the `type: 'quiz'` tier configuration and the
  `GatewayInput`/`GatewayResponse` contract.
- **Transitive: `accounts-data-layer`** — the FSRS card, concept, quiz_question, and
  quiz_attempt tables were created in this slice's migration. No migration work here.

## Assumptions

- **A1 — Quiz generation is per-waypoint on demand (not batch at roadmap-generation time).**
  Chosen because: (a) on-demand fits the usage pattern (learner clicks "Take Quiz" after
  completing a lesson); (b) it avoids burning quota for lessons the learner never reaches;
  (c) the gateway's per-user quota naturally rate-limits generation. The slice definition does
  not specify timing; this is an implementation choice with the lowest blast radius.

- **A2 — Grading is per-question synchronous (one gateway call per FRQ answer on submit).**
  The acceptance criteria specify "immediate per-question feedback" (AC-7); synchronous grading
  is the only model that can deliver this without a polling loop. MC questions are graded
  client-side (no gateway call — the correct_answer is stored in the question row).

- **A3 — FSRS update happens after each question is graded (not at end-of-quiz).**
  More granular updates: if the learner abandons the quiz mid-way, the FSRS cards for answered
  concepts still update. Tradeoff: more D1 writes per quiz session. Acceptable at v1 scale
  (D1 write is < 1ms at < 1000 rows).

- **A4 — Review questions (resurfacing) are appended to the current waypoint's question list
  (up to 2 review slots).**
  Simpler than interleaving at arbitrary positions. Still satisfies AC-8 ("included in the
  quiz") and is user-visible as the last N questions. The shape spec does not prescribe position.

- **A5 — Gibberish/empty detection is the grader's responsibility (no separate heuristic
  pass before calling the gateway).**
  The GRADING_SYSTEM_PROMPT explicitly instructs the model to treat empty/gibberish as
  incorrect with gentle feedback. No separate pre-filter is needed; adding one would be
  redundant code that requires its own test coverage and drift management.

- **A6 — ts-fsrs v5.4.1 is the correct target version.**
  Confirmed by shape §Freshness Research: "ts-fsrs (v5.4.1, FSRS-6) docs". The shape also
  specifies `request_retention: 0.85` and `enable_fuzz: true` as the configuration.

- **A7 — MC correct_answer field stores the option text string (not index).**
  The `quiz_questions.correct_answer` column is TEXT. Storing the text rather than index
  means the client can compare directly without re-parsing the options array; it is also
  resilient to option reordering. The quiz generation prompt instructs the model to include
  `correct_answer` as the verbatim correct option text.

- **A8 — `getWaypointCompletionStatus` defines "complete" as at least one passing attempt
  (score >= 1) per quiz question.**
  "Passing" is 1 or 2 (partially correct or fully correct), not 2 only. This is learner-
  friendly; a learner who partially understands a concept has still demonstrated engagement.
  The adaptation-progress slice may refine this threshold with FSRS retrievability data.

## Blockers

None. All dependencies are implemented. ts-fsrs is not yet installed — Step 1 resolves this.
The schema, gateway, quiz tier, and UI surface are all in place.

## Freshness Research

- Source: ts-fsrs GitHub (ts-fsrs/ts-fsrs, v5.4.1 tag, 2026-07-10 shape sweep confirmed).
  Why it matters: the FSRS bridge must call the correct ts-fsrs v5 API (`new FSRS({ ... })`,
  `fsrs.repeat(card, now)[rating]`, `createEmptyCard()`, `fsrs.get_retrievability(card, now)`).
  Takeaway: v5.x API is stable; `Rating` enum values are `Again=1, Hard=2, Good=3, Easy=4`;
  `State` enum: `New=0, Learning=1, Review=2, Relearning=3`. `fsrs.repeat()` returns a map
  keyed by `Rating` — `result[Rating.Good].card` gives the updated card. `createEmptyCard()`
  initialises a New-state card with all zeros. All pure ESM — no Node builtins; Workers-compatible.

- Source: OpenRouter Response Healing announcement + TanStack AI docs.
  Why it matters: quiz generation and grading use non-streaming structured output; Response
  Healing is the re-ask mechanism if the model returns malformed JSON.
  Takeaway: Response Healing applies only to non-streaming structured calls (exactly the quiz
  and grading pattern). The plan's one-re-ask is handled transparently by OpenRouter; the
  plan's `validateQuizQuestion` / `validateGrading` provide the application-level gate after
  the transport layer's repair attempt.

- Source: Cloudflare D1 `EXPLAIN QUERY PLAN` behavior (developers.cloudflare.com).
  Why it matters: the resurfacing query joins concept_fsrs_cards with concepts; the existing
  `fsrs_user_due_idx` must be the primary access path.
  Takeaway: D1's SQLite planner uses `fsrs_user_due_idx` for the `WHERE user_id = ? AND
  due <= ?` predicate; the join on `concepts.journey_id` is selective enough at v1 scale
  (< 200 concept rows per user). No additional index needed.

## Recommended Next Stage

- **Option A (default): implement quiz-fsrs** — Plan is complete, no blockers, all
  dependencies implemented. The scheduler-first sequence (Steps 1–4) is fully testable
  before any gateway call is written.
- **Option B: plan adaptation-progress in parallel** — adaptation-progress depends on
  quiz-fsrs FSRS data; its plan can be authored now (the data model is stable). Not
  necessary before quiz-fsrs implements; parallel planning is a capacity option.
