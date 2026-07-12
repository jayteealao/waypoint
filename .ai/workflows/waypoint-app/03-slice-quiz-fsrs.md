---
schema: sdlc/v1
type: slice
slug: waypoint-app
slice-slug: quiz-fsrs
status: complete
stage-number: 3
created-at: "2026-07-10T22:43:12Z"
updated-at: "2026-07-10T22:43:12Z"
complexity: l
depends-on: [roadmap-lesson-generation, sample-journey]
tags: [quiz-generation, ai-grading, fsrs, spaced-repetition, learner-model]
refs:
  index: 00-index.md
  slice-index: 03-slice.md
  siblings: [03-slice-foundation.md, 03-slice-platform-proofs.md, 03-slice-accounts-data-layer.md, 03-slice-design-system-shell.md, 03-slice-lesson-renderer.md, 03-slice-sample-journey.md, 03-slice-ai-gateway.md, 03-slice-tutor-interview.md, 03-slice-roadmap-lesson-generation.md, 03-slice-adaptation-progress.md, 03-slice-source-grounding.md]
  plan: 04-plan-quiz-fsrs.md
  implement: 05-implement-quiz-fsrs.md
---

# Slice: Quiz Engine & FSRS Learner Model

## The Slice

The learner model is what separates Waypoint from a chat window that explains things, and it lands here whole: quiz generation on the structured tier (MC with equal-length options enforced by lint, short free-text), AI grading against rubrics with feedback, and every graded answer updating a per-concept FSRS card via ts-fsrs — due, stability, difficulty, reps, lapses, state, lastReview, exactly the seven fields the schema has been carrying since the data-layer slice. The spaced-repetition promise from the original request closes here too: when concepts from earlier waypoints come due, later quizzes interleave review questions for them alongside new material.

The quiz *surface* already exists (sample-journey built it against fixture MC), so this slice extends a working UI rather than inventing one: free-text answers with a brief "checking…" grading state, per-question feedback with verdicts, and attempt recording that now feeds FSRS. The engine's correctness is deliberately proven without any LLM — simulated answer histories under a controlled clock drive the scheduling and resurfacing tests — because the one thing a memory model must never depend on is a flaky generation. Grading quality, the genuinely fuzzy part, gets the fixture-corpus treatment from shape: recorded answers with expected verdicts, run against the mocked adapter in CI and live on demand.

## Goal

Generated quizzes with AI-graded free text, every answer updating per-concept FSRS cards, and due concepts from earlier waypoints resurfacing in later quizzes — the learner model, live.

## Why This Slice Exists

AC-7 and AC-8 are the pedagogy payload: retrieval practice, tight feedback, storage strength over fluency. FSRS-from-day-one was an explicit PO decision (Round 5), and the resurfacing behavior is the feature the original request named most concretely.

## Scope

- **In:** quiz generation per waypoint (structured tier, non-streaming + Response Healing, schema validation + one re-ask; equal-length MC lint as a generation-time gate; question→concept tagging from the lesson's tags); free-text grading (rubric-based verdict + feedback, gibberish/empty graded incorrect-with-gentle-feedback, no re-grade loops); quiz surface extensions (free-text input, grading state, verdict display); FSRS integration (ts-fsrs v5.x, FSRS-6, `request_retention: 0.85`, `enable_fuzz: true`, server-time scheduling, retrievability computed not stored); resurfacing selection (due/fading concepts from earlier waypoints interleaved into later quiz generation); attempt recording with per-question results feeding both FSRS and quiz history.
- **Out:** the adaptation proposal triggered by weak results (adaptation-progress); mastery/progress visualization (adaptation-progress); the future `task` question type (roadmap; schema already leaves the door open).

## Acceptance Criteria

- Given a completed lesson, When the learner takes its quiz, Then MC options are equal-length (no formatting clues), free-text answers receive LLM-graded verdicts with feedback, each question shows immediate feedback, and the attempt is recorded with score and per-question results. *(AC-7)*
  <!-- observable: true — the quiz loop is user-experienced end-to-end -->
  verify: { method: playwright quiz walkthrough (mocked generation + mocked grading verdicts, deterministic), env: local dev, fixture: scripted quiz + answer set, rung: web-1; residual — one live-graded quiz via tagged smoke }
- Given generated quizzes across a fixture corpus, When the MC-lint gate runs, Then options within each question are equal-length within tolerance and violations force regeneration (or re-ask) rather than shipping to the learner.
  <!-- observable: false — a generation-gate property provable by automated lint tests over generated fixtures -->
- Given graded answers tagged to concepts, When grading completes, Then each concept's FSRS card updates per ts-fsrs semantics (simulated histories produce the expected due/stability/difficulty/reps/lapses/state transitions under a controlled clock). *(AC-8 scheduling half)*
  <!-- observable: false — deterministic library-integration math; clock-controlled unit/integration tests fully cover it -->
- Given concepts from earlier waypoints that are due for review, When a later waypoint's quiz is generated, Then the quiz includes review questions for those due concepts interleaved with new material, and their grading updates the same cards. *(AC-8 resurfacing half)*
  <!-- observable: false — selection logic provable with clock-controlled tests over seeded card states; the learner-visible effect is additionally spot-checked in the AC-13/AC-10 interactive flows -->
- Given a gibberish or empty free-text answer, When grading runs, Then it is graded incorrect with gentle feedback, no crash, and no repeated grading calls for the same answer.
  <!-- observable: true — the learner sees the gentle-feedback moment; the no-loop property is also asserted on the mocked call count -->
  verify: { method: playwright gibberish-answer scenario on mocked grading + call-count assertion, env: local dev, fixture: scripted quiz, rung: web-1 }
- Given the grading fixture corpus (recorded answers with expected verdicts), When run against the mocked adapter, Then verdicts match expectations; And when run live on demand, Then divergences are reported for the manual quality review.
  <!-- observable: false — the fixture-corpus proxy from shape §Verification Strategy; live quality is the pre-registered residual cleared by the smoke + human review -->

## Dependencies on Other Slices

- `roadmap-lesson-generation`: lessons with concept tags (the quiz's source material) and the generation pipeline patterns.
- `sample-journey`: the quiz surface this slice extends.
- (Transitive: `ai-gateway` structured tier; `accounts-data-layer` FSRS card tables.)

## Risks

- Grading quality is the fuzziest surface in the product — a harsh grader is discouraging, a lax one corrupts the learner model. The rubric prompt + fixture corpus bound it, but expect iteration; budget a prompt-tuning loop at implement.
- Resurfacing depends on tag semantics from the generation slice; if tags prove too coarse/fine in practice, the fix is in generation prompts, not FSRS — keep the boundary clean.
- FSRS card explosion (10–80 concepts per journey × journeys) is fine for D1 scale but the resurfacing query must select due concepts efficiently; a plan-time index decision, not a rework risk.
