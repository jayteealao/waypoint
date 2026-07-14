---
schema: sdlc/v1
type: slice
slug: waypoint-app
slice-slug: model-refresh
status: defined
stage-number: 3
created-at: "2026-07-12T11:01:38Z"
updated-at: "2026-07-12T11:01:38Z"
complexity: s
depends-on: [ai-gateway]
source: extension
source-ref: "user description"
extension-round: 1
tags: [ai, model-selection, cost, latency, openrouter]
refs:
  index: 00-index.md
  slice-index: 03-slice.md
  source: ""
  plan: 04-plan-model-refresh.md
  implement: 05-implement-model-refresh.md
  verify: 06-verify-model-refresh.md
---

# Slice: Model Refresh

## Goal

Move all four AI gateway tiers off 2024-era models onto current-generation, benchmark-selected models, and give the tier config the one capability the new generation requires: per-tier reasoning-effort control. After this slice, every generation type runs on a model chosen from live OpenRouter data (pricing, Artificial Analysis agentic/intelligence indices, ≥90% tool-call success, provider redundancy), the pricing table matches reality, and no stale model ID survives anywhere in `src/`.

## Why This Slice Exists

The tier map in `src/lib/ai/tiers.ts` was authored against the mid-2024 model landscape. Two of its models (`anthropic/claude-3.5-haiku`, `google/gemini-flash-1.5`) were later delisted from OpenRouter entirely — the lesson tier silently ran on its `gpt-4o` fallback at 2–5× intended cost until a verify-run hot-patch. The PO then drove a live model-selection session through the official OpenRouter MCP server (`list-models` with benchmark filters, `get-model`, `list-model-endpoints`) and confirmed a new tier table on 2026-07-12 (recorded in `po-answers.md`, extension round 1). Key data points:

- `z-ai/glm-5.2` — agentic index 43.1, intelligence 51.1, $0.42/$1.32 per 1M, 1M context, 20+ serving providers. 92% of Claude Sonnet 5's agentic score at ~1/7 the output price.
- `x-ai/grok-4.5` — agentic 45.7, intelligence 53.8, $2/$6. PO-approved roadmap primary: sonnet-5-class scores at 40% lower output cost; mandatory-reasoning model suited to the low-volume, latency-tolerant planning tier.
- PO explicitly rejected the gpt-5.4-mini/nano line as "not powerful or agentic enough" (agentic 30.2 / 27.5) — this slice must not substitute distilled-tier models.

The new primaries (glm-5.2, grok-4.5) are reasoning models; grok's reasoning is mandatory (default effort `high`). Without per-tier effort control the interview tier's <3 s NFR is at risk, so the config extension is in-scope rather than deferred.

## Scope

- In: New tier table in `src/lib/ai/tiers.ts`:
  - `interview`: `z-ai/glm-5.2` → fallback `openai/gpt-5.6-luna` ($0.42/$1.32; $1/$6)
  - `lesson`: `z-ai/glm-5.2` → fallback `google/gemini-3.5-flash` ($0.42/$1.32; $1.50/$9)
  - `roadmap`: `x-ai/grok-4.5` → fallback `openai/gpt-5.6-luna` ($2/$6; $1/$6)
  - `quiz`: `z-ai/glm-5.2` → fallback `deepseek/deepseek-v4-pro` ($0.42/$1.32; $0.75/$1.49)
- In: `pricingPer1MTokens` updated per tier to the primary's live OpenRouter pricing (authoritative as of 2026-07-12).
- In: `TierConfig` gains optional `reasoningEffort?: 'low' | 'medium' | 'high'`; the gateway passes it through the OpenRouter adapter on every call for that tier. Initial values: `interview: low`, `lesson: low`, `quiz: low`, `roadmap` unset (grok default `high` is desired for planning).
- In: Stale-reference cleanup — model-name comments in `src/server/interview.ts` and `src/routes/api/journey/$journeyId/lesson.ts`; hardcoded `gpt-4o-mini` in legacy `src/lib/ai-client.ts`.
- Out: Any change to gateway call shapes, quota logic, usage recording, or the tools/responseFormat invariant.
- Out: Per-request (as opposed to per-tier) reasoning-effort overrides.
- Out: `:nitro`/`:floor` provider-routing suffixes and provider pinning — revisit only if live latency measurements demand it.
- Out: The seeded model string in `tests/e2e/quota-fixture.spec.ts` (arbitrary historical data; not a config reference).

## Acceptance Criteria

- Given the tier map, When any generation type is resolved, Then its primary and every fallback resolve to model IDs that exist in the live OpenRouter catalog (no delisted IDs), and pricing constants match the primary's live OpenRouter pricing.
- Given the interview tier config, When the gateway calls glm-5.2, Then reasoning effort `low` is sent with the request (observable in the request payload or adapter options).
- Given the tagged live smoke suite (`tests/smoke/ai-tool-call.test.ts`) with `OPENROUTER_API_KEY` present, When run against the new tier table, Then all cases pass: interview-tier tool-call round trip on glm-5.2, structured-output calls on grok-4.5 (roadmap) and glm-5.2 (quiz), lesson-tier text generation, and the source-grounding marker case.
- Given `grep -ri "gpt-4o\|claude-3.5-haiku\|gemini-flash-1.5\|claude-haiku-4.5\|gemini-2.5-flash" src/`, When the slice is complete, Then zero hits remain (comments included).
- Given typecheck and the mocked test suites, When run, Then they pass unchanged — the `reasoningEffort` field is additive and optional.

## Dependencies on Other Slices

- `ai-gateway`: owns `tiers.ts`, `gateway.ts`, and the smoke-test harness this slice modifies and re-runs. Complete — this slice builds on its final shape, including the drainStream/adapter path the reasoning-effort passthrough must thread.

## Risks

- **Beta adapter surface**: `@tanstack/ai-openrouter`'s `createOpenRouterText` may not expose a reasoning/effort option directly; the passthrough may need adapter options or a raw `providerOptions` escape hatch. Plan must read the installed adapter source (study-sources) before committing to a mechanism.
- **Model freshness**: grok-4.5 is 4 days old with no uptime track record and xAI-only serving; gpt-5.6-luna is 3 days old. Mitigated by fallback chains on different providers and by the gateway's existing fallback instrumentation (`model.fallback_triggered`).
- **Benchmark ≠ prose quality**: indices don't measure long-form educational writing. The lesson-tier live smoke plus human spot-check of one generated lesson is the guard; if prose quality regresses, swap lesson primary to `google/gemini-3.5-flash` (one constant).
- **Cost telemetry drift**: usage dashboards/quota assumptions calibrated to old pricing; `usage.total_cost` is preferred at runtime so drift is limited to the recompute fallback path, but the quota card's daily budget semantics should be sanity-checked against the new unit costs.
