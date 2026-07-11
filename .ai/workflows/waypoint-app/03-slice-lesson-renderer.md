---
schema: sdlc/v1
type: slice
slug: waypoint-app
slice-slug: lesson-renderer
status: defined
stage-number: 3
created-at: "2026-07-10T22:43:12Z"
updated-at: "2026-07-10T22:43:12Z"
complexity: m
depends-on: [design-system-shell]
tags: [widget-registry, lesson-rendering, sanitization, streaming-ui, trust-model]
refs:
  index: 00-index.md
  slice-index: 03-slice.md
  siblings: [03-slice-foundation.md, 03-slice-platform-proofs.md, 03-slice-accounts-data-layer.md, 03-slice-design-system-shell.md, 03-slice-sample-journey.md, 03-slice-ai-gateway.md, 03-slice-tutor-interview.md, 03-slice-roadmap-lesson-generation.md, 03-slice-quiz-fsrs.md, 03-slice-adaptation-progress.md, 03-slice-source-grounding.md]
  plan: 04-plan-lesson-renderer.md
  implement: 05-implement-lesson-renderer.md
---

# Slice: Lesson Renderer & Widget Registry

## The Slice

The product's trust model becomes code here. The shape's resolution of the interactivity question — TanStack AI generative UI, where the model invokes typed, developer-registered React components and never writes executable code — needs three things built before any lesson is ever generated: a lesson content schema (structured sections, prose, code blocks, citations, widget invocations), the widget registry itself with its first widgets (inline checkpoint question, flipcard), and a renderer that turns a lesson document into the Stripe-Press-book reading experience the design brief demands — serif voice, generous measure, citation styling — inside the warm chrome.

The renderer is built stream-shaped from the start: it renders a *partial* lesson document that grows, with a skeleton outline that progressively fills, because the brief says the stream IS the loading state. That means this slice can prove progressive rendering with a simulated stream long before real generation exists — and when roadmap-lesson-generation lands, it plugs a real stream into an already-verified surface. The security floor is absolute and tested from the hostile direction: unknown or malformed widget invocations are rejected, and any HTML-ish string from model output passes DOMPurify ≥ 3.4.7 — the registry is the *only* interactivity path.

## Goal

A lesson rendering pipeline — schema, trusted widget registry, progressive renderer with the editorial reading experience — proven against fixture lessons and hostile inputs before any AI touches it.

## Why This Slice Exists

Shape sequencing constraint #5: widget registry precedes lesson rendering, and both precede the sample journey (fixture content must be authored against real components) and lesson generation. Building the render surface AI-free isolates the trust-model tests from generation flakiness.

## Scope

- **In:** lesson document schema (versioned; sections, prose, code blocks with highlighting, citations + recommended-primary-source block, widget slots); widget registry machinery (typed registration, props validation, rejection of unknown/malformed invocations) + v1 widgets: inline checkpoint question (answerable in-flow, records the response locally) and flipcard; the lesson view surface (reading serif, 65–75ch measure, dual-theme, responsive at all three breakpoints); progressive rendering of partial documents (skeleton outline filling in, simulated-stream fixture driver); DOMPurify sanitization on every model-originated HTML-ish string.
- **Out:** real lesson generation and its stream transport (roadmap-lesson-generation); quiz surfaces (sample-journey introduces them); checkpoint answers feeding FSRS (quiz-fsrs — here they persist as plain interactions); lesson *content* (sample-journey authors the fixtures learners actually see).

## Acceptance Criteria

- Given a fixture lesson document, When the lesson view renders it, Then prose, code blocks, citations, and the recommended-primary-source block render in the editorial reading style at 375/768/1280px with no horizontal overflow.
  <!-- observable: true — the reading experience is the product's centerpiece surface -->
  verify: { method: playwright screenshot sweep, env: local dev, fixture: authored fixture lesson exercising every schema node type, rung: web-1 }
- Given a fixture lesson containing a checkpoint widget and a flipcard, When the learner interacts (answers the checkpoint, flips the card), Then the widgets respond in-flow and the checkpoint records the learner's answer.
  <!-- observable: true — widget interactivity is the user-experienced payoff of the whole trust model -->
  verify: { method: playwright interaction script, env: local dev, fixture: fixture lesson with both widgets, rung: web-1 }
- Given a simulated lesson stream (fixture chunks delivered over time), When the lesson view consumes it, Then content renders progressively — first content visible before the stream completes, skeleton sections filling as chunks arrive, no flash-of-complete-replacement. *(AC-6 render half)*
  <!-- observable: true — progressive rendering is the perceived-latency promise; observed via timestamped DOM growth -->
  verify: { method: playwright with DOM-mutation timestamps during a fixture stream, env: local dev, fixture: chunked fixture lesson driver, rung: web-1 }
- Given a lesson document containing an unknown widget type, malformed widget props, or embedded script/HTML injection attempts, When rendered, Then the hostile nodes are rejected or sanitized (DOMPurify ≥ 3.4.7, no `SAFE_FOR_XML`/`IN_PLACE`), nothing executes, and the rest of the lesson still renders.
  <!-- observable: false — the security contract is fully provable by adversarial unit/component tests over the registry and sanitization paths -->

## Dependencies on Other Slices

- `design-system-shell`: tokens (the serif voice, spacing, themes) and the content pane the lesson view lives in.

## Risks

- The lesson schema is a contract three later slices write against (sample-journey fixtures, lesson generation, quiz concept-tagging); getting it wrong forces coordinated rework — version it from day one and review it as the slice's most important artifact.
- Progressive rendering against a *simulated* stream may hide real-transport quirks (chunk boundaries mid-token); the generation slice re-verifies AC-6 against the real stream — planned, not assumed.
- Widget ambition creep: two widgets are enough to prove the registry; resist adding more until generated lessons show what's actually needed.
