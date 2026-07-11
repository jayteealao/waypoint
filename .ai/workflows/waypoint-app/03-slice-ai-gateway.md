---
schema: sdlc/v1
type: slice
slug: waypoint-app
slice-slug: ai-gateway
status: complete
stage-number: 3
created-at: "2026-07-10T22:43:12Z"
updated-at: "2026-07-11T23:11:57Z"
complexity: m
depends-on: [platform-proofs, accounts-data-layer]
tags: [tanstack-ai, model-tiering, quotas, instrumentation, fallback]
refs:
  index: 00-index.md
  slice-index: 03-slice.md
  siblings: [03-slice-foundation.md, 03-slice-platform-proofs.md, 03-slice-accounts-data-layer.md, 03-slice-design-system-shell.md, 03-slice-lesson-renderer.md, 03-slice-sample-journey.md, 03-slice-tutor-interview.md, 03-slice-roadmap-lesson-generation.md, 03-slice-quiz-fsrs.md, 03-slice-adaptation-progress.md, 03-slice-source-grounding.md]
  plan: 04-plan-ai-gateway.md
  implement: 05-implement-ai-gateway.md
---

# Slice: AI Gateway, Quotas & Instrumentation

## The Slice

Every LLM call in Waypoint should flow through one gate, and this slice builds it before any feature is allowed to talk to a model. The gateway is where the shape's economics live: model tiering (cheap/fast for interview turns, premium for lessons, structured-output models for quizzes and roadmaps — config-swappable), fallback chains per tier, retry primitives, and — because the app's own OpenRouter key funds every user — quota enforcement and usage recording as first-class citizens, not afterthoughts. The augmentation plan made instrumentation load-bearing: per-generation token usage and cost from the OpenRouter usage payload, attributed to user and generation type in a queryable D1 table, plus failure/fallback counters and Workers observability. Silent cost drift is this product's darkest dark path, and this slice is the light switch.

Building the gateway feature-free has a second payoff: the mocked-adapter test harness and the tagged live-smoke suite become shared infrastructure here, so the four generation-consuming slices behind it inherit deterministic tests instead of each inventing their own mocking. The quota-reached UI — the warm blocking card with reset time, explicitly never paywall-shaped — is built here as the gateway's user-facing face, wired into real surfaces as those slices land.

## Goal

A single server-side AI gateway — tiering, fallbacks, quotas, cost/usage instrumentation — plus the shared mock/live test harness, so every generation feature inherits economics and resilience instead of reimplementing them.

## Why This Slice Exists

AC-11 and the shape's instrument augmentation demand quota and usage plumbing; putting it *before* the generation slices means no call path ever exists that bypasses metering — retrofitting metering after features ship is how costs leak.

## Scope

- **In:** gateway module over TanStack AI (all model calls route through it); model-tier config (interview/lesson/structured tiers per shape's defaults, env-swappable) with per-tier fallback chains; retry + failure-classification primitives (the building blocks AC-12's resume consumes later); per-user quota engine (daily/monthly, D1-backed, checked before any call); usage recording (tokens + cost from the OpenRouter usage payload → usage table, attributed to user + generation type + model); failure/fallback-trigger counters; Workers `observability: enabled`; the quota-reached blocking card component (warm, reset time, no dark patterns); mocked-adapter harness + tagged live-smoke suite as shared test infrastructure; a minimal operator cost view can be deferred to a query/CLI recipe documented in the reference doc (the PO is the only operator).
- **Out:** any user-facing generation feature (interview, roadmap, lesson, quiz slices); the resume-from-last-section UX (roadmap-lesson-generation composes it from these primitives); BYOK (roadmap, per shape).

## Acceptance Criteria

- Given a user whose quota is exhausted, When any generation is requested through the gateway, Then the request is refused before any LLM call is made (zero outbound requests) and the caller receives a typed quota-exhausted result; And when that state surfaces in the UI, Then the friendly quota card shows with its reset time. *(AC-11 enforcement half)*
  <!-- observable: true — the blocking state is a designed user-facing moment; the no-call guarantee is network-observable -->
  verify: { method: playwright driving a quota-exhausted fixture user against a harness surface + network capture asserting zero LLM calls, env: local dev with mocked adapter, fixture: user seeded at quota limit, rung: web-1 }
- Given any completed generation (mocked adapter emitting a realistic usage payload), When the gateway finishes the call, Then a usage record persists with user, generation type, model, token counts, and computed cost — and quota consumption reflects it. *(AC-11 recording half)*
  <!-- observable: false — attribution and arithmetic are fully provable by integration tests over the gateway + D1 usage table -->
- Given a tier whose primary model fails (injected fault), When a call runs, Then the gateway retries through that tier's fallback chain in order, succeeds on a healthy fallback, and increments the failure/fallback counters with the failing model named.
  <!-- observable: false — fallback mechanics are deterministic fault-injection territory; the user-facing recovery UX is AC-12's, verified in roadmap-lesson-generation -->
- Given the tier configuration, When a call is made per tier (interview/lesson/structured), Then it targets that tier's configured model and honors the shape's rule that structured-output calls and tool calls are never combined in one request.
  <!-- observable: false — request-shape assertions against the mocked adapter -->
- Given the tagged live-smoke suite with the PO's OpenRouter key, When it runs on demand, Then one interview-tier turn, one lesson-tier stream, and one structured-tier call succeed against real models with usage payloads recorded.
  <!-- observable: false — the pre-registered live residual from shape §Verification Strategy, cleared by this suite on demand rather than in CI -->

## Dependencies on Other Slices

- `platform-proofs`: the proven adapter path (and the fallback-swap pattern) this slice industrializes.
- `accounts-data-layer`: user identity for attribution; the usage/quota tables.

## Risks

- Cost math from the OpenRouter usage payload (including its 5.5% credit fee) must be exact-enough for quota decisions; treat pricing metadata as config, not constants, so model swaps don't silently mis-price.
- Quota semantics (what counts: tokens? calls? cost?) is a plan-time decision with UX consequences; pick one unit and keep the door open to change — the table records all three.
- Over-abstracting the gateway is a real temptation; it exists to meter and route, not to become a framework. Four known consumers define its API — build to them.
