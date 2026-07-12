---
schema: sdlc/v1
type: verify
slug: waypoint-app
slice-slug: live-ai
status: complete
stage-number: 6
created-at: "2026-07-12T00:00:00Z"
updated-at: "2026-07-12T00:00:00Z"
result: pass
convergence: converged
metric-checks-run: 3
metric-checks-passed: 3
metric-acceptance-met: 3
metric-acceptance-total: 3
metric-interactive-checks-run: 9
metric-interactive-checks-passed: 9
metric-issues-found: 3
evidence-dir: ".ai/workflows/waypoint-app/verify-evidence/live-ai"
tags: [live-ai, openrouter, gateway, quota, model-config]
refs:
  files:
    - src/lib/ai/gateway.ts
    - src/lib/ai/tiers.ts
    - src/routes/api/journey/$journeyId/lesson.ts
    - tests/smoke/ai-tool-call.test.ts
    - tests/smoke/ai-gateway.test.ts
next-command: handoff
next-invocation: "/wf handoff waypoint-app"
---

# Live AI verification — clearing the OPENROUTER_API_KEY deferrals

Triggered by the PO providing `OPENROUTER_API_KEY` (added to `.dev.vars`, gitignored).
Goal: run the tagged live-smoke tests and clear the three OpenRouter-dependent
runtime-evidence deferrals (AC-PP2b, AC-4, AC-7).

Running the live path for the first time surfaced **three real production bugs** that
every mocked proxy had masked — the mocks emitted fabricated stream events that matched
the buggy code, so the unit suite validated a fiction. This is exactly the false-confidence
gap the runtime-evidence deferral existed to catch.

## Bugs found and fixed

### BUG-1 — text never extracted from the model stream (critical)
`drainStream` (gateway) and the SSE lesson route matched chunk type `TEXT_DELTA`, but the
`@tanstack/ai-openrouter` adapter emits streamed text as `TEXT_MESSAGE_CONTENT`. Result:
`response.text` was **always `undefined`** for every text/structured generation. Impact:
- Interview `sendTurn`/`startInterview` (`gatewayResult.text ?? fallback`) silently fell back
  to canned questions — the "dynamic LLM interview" produced hardcoded strings.
- Lesson generation (SSE), roadmap generation, and quiz grading all read `.text` → broken.
- Fix: match `TEXT_MESSAGE_CONTENT` (accept legacy `TEXT_DELTA` too). Files:
  `src/lib/ai/gateway.ts`, `src/routes/api/journey/$journeyId/lesson.ts`.

### BUG-2 — token usage never captured → quota meter non-functional
Both drains read a `USAGE` chunk with snake_case `prompt_tokens`. The adapter carries usage
on the terminal `RUN_FINISHED` chunk as camelCase `usage.promptTokens/completionTokens`, and
never emits a per-call cost. Result: every `usage_events` row recorded **0 tokens / $0 cost**,
so the daily `$0.50` quota SUM was always 0 and the cap could never trigger. Fixed alongside
BUG-1 (read `RUN_FINISHED.usage`, camelCase, cost recomputed from the pricing table).

### BUG-3 — three stale/invalid model slugs in the tier config
Verified against the live OpenRouter model list:
- `lesson.primaryModel: anthropic/claude-3.5-haiku` → **404 No endpoints** → every lesson call
  silently failed over to `openai/gpt-4o`. Fixed → `anthropic/claude-haiku-4.5`.
- `interview.fallbackChain: google/gemini-flash-1.5` → invalid → dead safety net.
  Fixed → `google/gemini-2.5-flash`.
- `quiz.fallbackChain: anthropic/claude-3.5-haiku` → invalid → dead safety net.
  Fixed → `anthropic/claude-haiku-4.5`.
File: `src/lib/ai/tiers.ts`. The app appeared to work only because the *primary* for
interview/quiz/roadmap (`openai/gpt-4o-mini`) is valid; the fallback chains were all broken.

## Verification results

- `pnpm tsc --noEmit` — clean.
- Full unit suite (mocked, no key): 191 pass, 5 skipped (live-gated) — no regressions.
  Mock fixtures realigned to the real adapter event vocabulary; added a `.text`-population
  regression guard so BUG-1 cannot silently recur in keyed-less CI.
- Live smoke (`OPENROUTER_API_KEY` present), `tests/smoke/ai-tool-call.test.ts`: **9/9 pass**
  - interview-tier tool-call round trip
  - gateway smoke: interview / lesson / roadmap tiers (live)
  - interview-tier returns a single question (with the real `INTERVIEW_SYSTEM_PROMPT`)
  - **live-graded free-response answer → valid rubric score (AC-7)**
  - **lesson generation reflects distinctive source marker (AC-4)**

## Deferrals cleared

- **AC-PP2b** (platform-proofs) — live OpenRouter tool-call smoke → cleared.
- **AC-7** (quiz-fsrs) — live-graded quiz smoke → cleared.
- **AC-4** (source-grounding) — live-model grounding quality → cleared.

## Still deferred

- **AC-15** (roadmap-lesson-generation) — the credential half is resolved and live lesson-tier
  generation is proven, but this AC requires the **first Cloudflare Workers deploy** driving
  live SSE end-to-end. Clearing event: `wrangler deploy` + one live generation.
- All `BETTER_AUTH_SECRET` seeded-session E2E deferrals are unaffected by this run (separate
  clearing event).
