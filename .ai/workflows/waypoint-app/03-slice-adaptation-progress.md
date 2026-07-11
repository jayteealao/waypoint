---
schema: sdlc/v1
type: slice
slug: waypoint-app
slice-slug: adaptation-progress
status: defined
stage-number: 3
created-at: "2026-07-10T22:43:12Z"
updated-at: "2026-07-10T22:43:12Z"
complexity: m
depends-on: [quiz-fsrs]
tags: [adaptation, progress-surfaces, mastery, streaks, responsive-sweep]
refs:
  index: 00-index.md
  slice-index: 03-slice.md
  siblings: [03-slice-foundation.md, 03-slice-platform-proofs.md, 03-slice-accounts-data-layer.md, 03-slice-design-system-shell.md, 03-slice-lesson-renderer.md, 03-slice-sample-journey.md, 03-slice-ai-gateway.md, 03-slice-tutor-interview.md, 03-slice-roadmap-lesson-generation.md, 03-slice-quiz-fsrs.md, 03-slice-source-grounding.md]
  plan: 04-plan-adaptation-progress.md
  implement: 05-implement-adaptation-progress.md
---

# Slice: Adaptation & Progress Surfaces

## The Slice

Everything the learner model knows becomes visible — and actionable — here. The two features share one slice because they are the same data speaking in two registers: the *progress surfaces* (waypoint completion on the roadmap, per-concept mastery meters computed from FSRS retrievability, quiz history with pass rates, streaks, review-due counts — all four, the PO selected everything) let the learner see their own map; the *adaptation proposal* is the tutor reading that same map and speaking up. The proposal card is the design brief's most carefully specified moment: after a weak quiz, a consent-shaped card — "I'd suggest adding a review waypoint — okay?" — with accept and decline as visual equals, warm rather than red, and the next waypoint accessible either way. Accept updates the roadmap visibly; decline changes nothing; the soft gate stays soft.

This slice also closes two whole-app criteria that needed a mature system to mean anything: the full AC-13 multiple-journeys check (independent roadmaps, learner models, and progress across concurrent journeys — the data model supported it from day one; now every surface proves it), and the final AC-14 responsive sweep — five core screens × three breakpoints, screenshots plus the human design-quality judgement against the design brief. It is the natural home for both: by the end of this slice, every core screen exists.

## Goal

The learner model made visible (all four progress surfaces) and conversational (propose/confirm adaptation), plus the whole-app closes: multiple-journeys end-to-end and the full responsive sweep.

## Why This Slice Exists

AC-9, AC-10, AC-13, and AC-14's final sweep. Encouragement — the design brief's whole register — is earned at exactly these surfaces: the map filling in, and the tutor proposing rather than punishing after failure.

## Scope

- **In:** progress surfaces (roadmap completion states; mastery meters from computed retrievability with grouping past ~30 concepts; quiz history + pass rates; streak + review-due counts; the "your map starts here" empty state for quiz-less journeys); adaptation engine (weak-quiz threshold → specific proposed roadmap change; accept applies + visibly updates roadmap; decline records and changes nothing; proposal history on the journey); the proposal card per the design brief's consent shape; AC-13 end-to-end (second journey with independent roadmap/model/progress, dashboard showing both); the full AC-14 sweep (5 screens × 3 widths screenshot grid + manual design-quality judgement against 02b-design.md).
- **Out:** streak *notifications* or any guilt mechanics (anti-goal, permanently); adaptation beyond insert-review-waypoint-class changes (v1 keeps proposals specific and small; richer restructuring is roadmap); operator cost dashboards (ai-gateway's reference-doc recipe covers v1).

## Acceptance Criteria

- Given accumulated activity, When the learner views their journey and dashboard, Then they see waypoint completion states, per-concept mastery meters, quiz history with pass rates, current streak, and review-due count, each consistent with the underlying data. *(AC-10)*
  <!-- observable: true — the surfaces are the deliverable; consistency is checked against seeded known activity -->
  verify: { method: playwright against a seeded activity fixture (known attempts, known FSRS states, known streak), env: local dev, fixture: deterministic seeded history, rung: web-1 }
- Given the metric derivations, When computed from fixture data, Then mastery-from-retrievability, pass rates, streak arithmetic (timezone/day-boundary rules), and due counts match hand-computed expectations.
  <!-- observable: false — pure derivation math; clock-controlled unit tests fully cover it -->
- Given a failed quiz below the threshold, When results display, Then the agent proposes a specific roadmap change on a consent-shaped card with accept/decline as equals; accept visibly updates the roadmap, decline leaves it unchanged, and the next waypoint remains accessible in both paths. *(AC-9)*
  <!-- observable: true — both consent paths are user-experienced flows -->
  verify: { method: playwright forcing a failing quiz (mocked grading), exercising accept AND decline, env: local dev, fixture: scripted weak-quiz scenario + mocked proposal, rung: web-1 }
- Given an existing journey, When the learner starts and progresses a second journey, Then both appear on the dashboard with independent roadmaps, learner models, and progress — activity in one never leaks into the other's surfaces. *(AC-13)*
  <!-- observable: true — cross-journey independence is user-visible on every surface -->
  verify: { method: playwright two-journey scenario (mocked generation), env: local dev, fixture: two seeded journeys with overlapping concept names, rung: web-1 }
- Given a journey with no completed quizzes, When the progress panel renders, Then the "your map starts here" empty state shows — teaching, not zeroed-out charts.
  <!-- observable: true — a designed empty state from the brief's inventory -->
  verify: { method: playwright, env: local dev, fixture: fresh journey, rung: web-1 }
- Given all five core screens (dashboard, interview, lesson, quiz, progress), When rendered at 375, 768, and 1280px, Then layout is usable and unbroken (sidebar collapse, no horizontal overflow, ≥ 44px touch targets) — the full screenshot grid — And the design quality is judged against 02b-design.md. *(AC-14 final)*
  <!-- observable: true — the sweep is interactive evidence; the quality half is the pre-registered human judgement from shape (manual, PO/design review) — the perceptual residual no automated rung reaches -->
  verify: { method: playwright 5×3 screenshot grid, env: local dev, fixture: seeded full-content state per screen, rung: web-1; residual — human design-quality judgement, pre-registered in shape }

## Dependencies on Other Slices

- `quiz-fsrs`: graded attempts, FSRS card states, and the weak-quiz signal that triggers proposals.
- (Transitive: every UI slice — this is where all five screens must exist and hold up together.)

## Risks

- Streak arithmetic is deceptively fiddly (timezones, day boundaries, server-vs-client time per shape's clock-skew note); the derivation tests pin it, but pick the rules deliberately at plan.
- Proposal quality depends on the tutor prompts reading FSRS state sensibly; keep v1 proposals template-constrained (insert-review-waypoint) so the LLM fills in *what*, not *whether the card is well-formed*.
- Grouping mastery meters past ~30 concepts is a real design problem (the brief flags it); resolve the grouping approach in this slice's visual contract, not ad hoc in code.
