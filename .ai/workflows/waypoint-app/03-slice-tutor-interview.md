---
schema: sdlc/v1
type: slice
slug: waypoint-app
slice-slug: tutor-interview
status: defined
stage-number: 3
created-at: "2026-07-10T22:43:12Z"
updated-at: "2026-07-10T22:43:12Z"
complexity: l
depends-on: [ai-gateway, design-system-shell]
tags: [agent-prompts, teach-grill-rewrite, interview, chat-ui, pedagogy]
refs:
  index: 00-index.md
  slice-index: 03-slice.md
  siblings: [03-slice-foundation.md, 03-slice-platform-proofs.md, 03-slice-accounts-data-layer.md, 03-slice-design-system-shell.md, 03-slice-lesson-renderer.md, 03-slice-sample-journey.md, 03-slice-ai-gateway.md, 03-slice-roadmap-lesson-generation.md, 03-slice-quiz-fsrs.md, 03-slice-adaptation-progress.md, 03-slice-source-grounding.md]
  plan: 04-plan-tutor-interview.md
  implement: 05-implement-tutor-interview.md
---

# Slice: Tutor Prompts & Interview

## The Slice

The PO put it in scope explicitly: the teach and grill skills are a *rewrite target*, not inspiration. This slice does that rewrite — turning the source skills' operative rules into Waypoint's agent prompt suite — and ships its first consumer, the interview. The pedagogy contract the freshness research extracted is precise enough to test against: consent before probing, exactly one question per turn, mission pushback on vagueness per MISSION-FORMAT, and capture of mission, scope, prior knowledge, and preferred sources into the journey record. Those rules become prompt text *and* an interview state machine — the state machine enforces structurally what the prompt requests behaviorally, so a chatty model can't break the one-question contract even when it tries.

The surface is the chat-with-chips conversation the PO chose in Round 2: bubbles, quick-reply chips, free text, typing indicator, running on the gateway's cheap interview tier with its < 3s turn budget. The prompt suite's lesson/quiz/roadmap prompts are drafted here as a coherent set (they share voice, the learner-model vocabulary, and the injection-resistance posture) but are *verified* by the slices that consume them — this slice's own bar is the interview working end-to-end, including the awkward paths: mid-interview abandonment resumes at the pending question, and declining consent entirely still yields a usable journey.

## Goal

The teach/grill prompt suite rewritten for Waypoint, with the consent-gated one-question-at-a-time interview — chat, chips, capture, resume — working end-to-end on the interview model tier.

## Why This Slice Exists

Shape sequencing constraint #3: the agent-prompt suite precedes roadmap/lesson/quiz generation — it is their shared foundation. AC-3 is the front door of every real journey; nothing downstream generates without the interview's captured record.

## Scope

- **In:** the prompt suite (interview/grilling prompts fully exercised; lesson, quiz, roadmap prompts drafted as a reviewed set with pedagogy-fidelity notes mapping each source-skill rule to its Waypoint home; injection-resistance posture documented in-suite); interview state machine (consent gate → question loop → capture → completion; enforces one-question-per-turn structurally); chat UI in the shell (bubbles, quick-reply chips + free text via TanStack Form, typing indicator); journey-record capture (mission with vagueness pushback, scope, prior knowledge, preferred source URLs — stored, fetching deferred to source-grounding); mid-interview persistence + resume; decline-consent path (record marked best-effort, interview ends gracefully); new-journey entry point replacing sample-journey's not-yet CTA.
- **Out:** roadmap generation from the captured record (roadmap-lesson-generation — until it lands, a completed interview ends on a designed "roadmap coming" state); source URL fetching (source-grounding); lesson/quiz prompt verification (their slices).

## Acceptance Criteria

- Given a learner starting a new journey with a stated goal, When the interview begins, Then the agent asks permission before probing, asks exactly one question per turn, offers quick-reply chips plus free text on every turn, and on completion the journey record contains mission, scope, prior knowledge, and any preferred sources. *(AC-3)*
  <!-- observable: true — the interview is a user-experienced conversation; the captured record is checkable through the UI (journey summary) after completion -->
  verify: { method: playwright scripted interview against the mocked interview tier (deterministic turns), env: local dev, fixture: scripted persona answers + mocked agent turns, rung: web-1; residual — one live-model interview via the tagged smoke, pre-registered }
- Given a vague mission answer ("I just want to learn Rust"), When the interview processes it, Then the agent pushes back for a concrete mission per MISSION-FORMAT rather than accepting it silently.
  <!-- observable: false — prompt-contract behavior provable by state-machine + prompt-fixture tests against recorded model outputs; live quality rides the pedagogy-fidelity manual review -->
- Given a learner who abandons mid-interview (closes the tab after question 3), When they return to the journey, Then the interview resumes at the pending question with prior answers intact.
  <!-- observable: true — resume is a user-experienced navigation outcome -->
  verify: { method: playwright close-and-return scenario, env: local dev, fixture: mocked interview mid-state, rung: web-1 }
- Given a learner who declines probing consent, When the interview ends, Then the journey record is marked best-effort-from-goal-alone, the agent says so plainly, and journey creation still completes.
  <!-- observable: true — the decline path is a designed conversational moment, not an error -->
  verify: { method: playwright decline scenario, env: local dev, fixture: mocked turns, rung: web-1 }
- Given the interview state machine, When a model reply attempts multiple questions in one turn (adversarial fixture), Then the state machine enforces the one-question contract (splits, truncates, or re-asks per the designed policy) — the UI never shows a multi-question turn.
  <!-- observable: false — structural enforcement provable by unit tests over the state machine with adversarial model-output fixtures -->
- Given the rewritten prompt suite, When reviewed against the source skills' operative rules (one-question, mission pushback, equal-length MC, knowledge-then-skill sequencing, learning-record supersession), Then each rule has a named home in the suite and deviations are justified in the pedagogy-fidelity notes.
  <!-- observable: false — a reviewable-artifact criterion; the human pedagogy-fidelity review from shape §Verification Strategy is its check -->

## Dependencies on Other Slices

- `ai-gateway`: the interview model tier, quota gate, and mocked-adapter harness every turn flows through.
- `design-system-shell`: the shell and tokens the chat surface composes from.

## Risks

- The interview is where "warm and encouraging" meets a live LLM — tone drift is real; the mocked deterministic tests pin structure, and the live-smoke + manual review pin voice. Budget prompt iteration time.
- One-question enforcement policy (split vs re-ask) affects perceived latency; decide at plan with the < 3s turn budget in view.
- Drafting lesson/quiz/roadmap prompts here without executing them risks speculative prompt design; mitigated by keeping them thin and letting consuming slices iterate — the suite's *structure*, not its final wording, is this slice's deliverable.
