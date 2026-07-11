---
schema: sdlc/v1
type: slice
slug: waypoint-app
slice-slug: sample-journey
status: complete
stage-number: 3
created-at: "2026-07-10T22:43:12Z"
updated-at: "2026-07-11T20:51:58Z"
complexity: m
depends-on: [lesson-renderer]
tags: [first-run, fixtures, quiz-surface, milestone]
refs:
  index: 00-index.md
  slice-index: 03-slice.md
  siblings: [03-slice-foundation.md, 03-slice-platform-proofs.md, 03-slice-accounts-data-layer.md, 03-slice-design-system-shell.md, 03-slice-lesson-renderer.md, 03-slice-ai-gateway.md, 03-slice-tutor-interview.md, 03-slice-roadmap-lesson-generation.md, 03-slice-quiz-fsrs.md, 03-slice-adaptation-progress.md, 03-slice-source-grounding.md]
  plan: 04-plan-sample-journey.md
  implement: 05-implement-sample-journey.md
---

# Slice: Sample Journey & Quiz Surface

## The Slice

This is the visible milestone the PO ordered the sequence around: after this slice, a new user can sign in, land in a complete pre-baked journey — "How Waypoint works" — read two real lessons through the real renderer, take a working quiz, and never trigger a single LLM call. The sample journey is versioned fixture content in the repo (the shape's answer to sample-drift), authored against the components the previous two slices shipped, which makes it double as an integration test of the entire UI stack and as the demo artifact for anyone the PO wants to show.

The one scope decision worth defending: the quiz *surface* is born here, not in the quiz engine slice. AC-2 requires a *working* sample quiz with zero LLM spend, and multiple-choice grading is deterministic — so the quiz view (MC questions, equal-length options, immediate per-question feedback, attempt recording) ships now against fixture questions, and quiz-fsrs later adds what actually needs AI: generation, free-text grading, and FSRS updates. The surface gets a second consumer before its logic hardens, which is exactly the order you want.

## Goal

A first-login experience that lands new users in a pre-baked guided journey — two rendered lessons, one working MC quiz, zero LLM spend — proving the whole UI stack end-to-end on fixture content.

## Why This Slice Exists

AC-2 verbatim, plus the PO's Round-3 first-run decision (guided sample journey over empty dashboard) and the slice-stage ordering answer (visible milestone right after the proofs). It also satisfies the onboarding law: show value before asking for commitment or spend.

## Scope

- **In:** authored fixture journey content (roadmap with 3–4 waypoints, ≥ 2 full lessons exercising checkpoints/flipcards/citations, 1 MC quiz), versioned in-repo; first-login routing into the sample journey with a clear "start a real journey" CTA (skippable, per onboarding rules); the quiz view surface: MC rendering with equal-length options, selection → immediate feedback, score summary, attempt recorded to the data layer; sample-journey completion states on its roadmap sidebar.
- **Out:** quiz generation, free-text grading, FSRS updates (quiz-fsrs); the real-journey creation flow behind the CTA (tutor-interview — until then the CTA leads to a designed not-yet state); streak/mastery surfaces (adaptation-progress).

## Acceptance Criteria

- Given a first-ever login, When the learner lands in the app, Then they arrive in the sample journey with at least two pre-baked lessons and one working sample quiz rendering fully, And no OpenRouter/LLM request is made during the entire visit. *(AC-2)*
  <!-- observable: true — the first-run experience plus a network-level negative assertion -->
  verify: { method: playwright with network capture asserting zero outbound LLM calls; screenshots at 375/768/1280px, env: local dev, fixture: the versioned sample-journey content itself, rung: web-1 }
- Given the sample quiz, When the learner answers each MC question, Then feedback appears immediately per question (correct/incorrect + explanation), options are equal-length (no formatting clues), and the completed attempt persists with per-question results.
  <!-- observable: true — the quiz interaction loop is user-experienced; persistence asserted through the UI after reload -->
  verify: { method: playwright quiz walkthrough + reload persistence check, env: local dev, fixture: sample quiz with known answer key, rung: web-1 }
- Given the sample journey, When the learner completes a lesson or the quiz, Then the roadmap sidebar reflects completion state for those waypoints.
  <!-- observable: true — progress-on-the-map is the encouragement mechanic; visible in the sidebar -->
  verify: { method: playwright, env: local dev, fixture: sample journey, rung: web-1 }
- Given a returning user who has seen the sample journey, When they sign in again, Then they land on the dashboard (not forced back into the sample), and the sample journey remains accessible from it.
  <!-- observable: true — first-run must not become every-run; a navigation-behavior check -->
  verify: { method: playwright second-session scenario, env: local dev, fixture: user with sample journey visited, rung: web-1 }

## Dependencies on Other Slices

- `lesson-renderer`: the lesson view and widgets the fixture lessons render through (and transitively the shell, data layer, and auth).

## Risks

- Fixture authoring is real editorial work in the product's own pedagogy voice — budget it as content work, not filler; the sample journey is most users' first impression of lesson quality.
- The quiz surface's data shapes must anticipate the engine slice (free-text answers, AI verdicts, concept tags) so quiz-fsrs extends rather than reworks it; the attempt schema from accounts-data-layer is the contract.
- The "start a real journey" CTA dead-ends into a designed not-yet state until tutor-interview lands — acceptable mid-build, but it must be an honest, warm state, not a broken link.
