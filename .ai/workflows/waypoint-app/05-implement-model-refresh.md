---
schema: sdlc/v1
type: implement
slug: waypoint-app
slice-slug: model-refresh
status: complete
stage-number: 5
created-at: "2026-07-14T11:02:09Z"
updated-at: "2026-07-14T11:12:00Z"
metric-files-changed: 7
metric-lines-added: 109
metric-lines-removed: 23
metric-deviations-from-plan: 2
metric-review-fixes-applied: 0
commit-sha: "086e21ef53dcda30030eff3400923a22e922e2a7"
tags: [ai, model-selection, cost, latency, openrouter, reasoning-effort]
refs:
  index: 00-index.md
  implement-index: 05-implement.md
  slice-def: 03-slice-model-refresh.md
  plan: 04-plan-model-refresh.md
  siblings:
    - 05-implement-ai-gateway.md
    - 05-implement-roadmap-lesson-generation.md
    - 05-implement-quiz-fsrs.md
    - 05-implement-tutor-interview.md
  verify: 06-verify-model-refresh.md
next-command: wf-verify
next-invocation: "/wf verify waypoint-app model-refresh"
---

# Implement: Model Refresh

## The Implementation

The tier map that decides which model answers every generation call has run against the
mid-2024 landscape since day one — and two of its models were already delisted from
OpenRouter, so the lesson tier had been quietly falling back to an expensive `gpt-4o` until a
hot-patch caught it. This slice retires the whole 2024 table for the PO-ratified current
generation: `z-ai/glm-5.2` for the interview, lesson, and quiz tiers (near-Sonnet agentic
scores at roughly a seventh of the output price) and `x-ai/grok-4.5` for the low-volume,
latency-tolerant roadmap tier. Every fallback is pinned to a different provider than its
primary, and the pricing constants are corrected to the live 2026-07-12 OpenRouter figures so
cost recomputation stays honest.

The new primaries are reasoning models — grok's reasoning is mandatory — so the config gained
the one capability they require: an optional per-tier `reasoningEffort`. It is threaded through
**both** model-invocation paths: the gateway's `drainStream` (interview/quiz/roadmap and the
buffered lesson path) and the lesson SSE route's own `chat()` stream that deliberately bypasses
the gateway. Interview, lesson, and quiz send `effort: 'low'` (protecting the interview tier's
<3 s NFR); roadmap sends nothing, so grok's mandatory `high` default stands. The passthrough is
a typed `modelOptions: { reasoning: { effort } }` on the existing `chat()` calls — the mechanism
was re-confirmed against installed `@tanstack/ai-openrouter@0.15.8` source this round (RIM-E3),
not recalled, so no `as any` escape hatch was needed on the gateway path.

Two deviations from the plan, both in-scope and recorded below. The legacy OpenAI-compatible
adapter in `ai-client.ts` has a model enum narrower than OpenRouter's catalog and rejected the
`z-ai/glm-5.2` string at compile time; since that client targets OpenRouter's base URL (where the
model is valid at runtime) and the file is slated for removal by the ai-gateway-hygiene slice, I
resolved it with a marked `@ts-expect-error` carrying the typecheck error as its evidence. And
the plan's "AC-3 needs no code edit, re-run only" assumption held for correctness but not for
timing: the new reasoning models are materially slower than the non-reasoning models the prior
9/9 smoke run used, so the 5 s Vitest default timed out mid-generation. I added per-test timeouts
to the seven gated live cases so the tagged smoke passes as a plain gate without tribal
knowledge. All acceptance criteria are green; the one intermittent live-smoke flake observed is
the documented R1 residual (re-run absorbs it; different-provider fallbacks bound it).

## Summary of Changes
- Replaced all four tiers in `TIERS` with the PO-ratified current-generation table (glm-5.2 ×3,
  grok-4.5 ×1) plus different-provider fallback chains and live 2026-07-12 pricing.
- Added optional `reasoningEffort?: 'low' | 'medium' | 'high'` to `TierConfig`; set `low` on
  interview/lesson/quiz, left roadmap unset (grok default `high`).
- Threaded the effort through both model-invocation paths as `modelOptions.reasoning.effort` —
  `drainStream` (gateway) and the lesson SSE route's direct `chat()`.
- Swept every stale 2024 model reference out of `src/` (comments in `interview.ts` and
  `lesson.ts`; two literals in legacy `ai-client.ts`) so the AC-4 grep returns zero.
- Added two mocked reasoning-effort assertions to `ai-gateway.test.ts` and per-test timeouts to
  the seven live cases in `ai-tool-call.test.ts`.

## Files Changed
- `src/lib/ai/tiers.ts` — new tier table, corrected pricing, additive `reasoningEffort` field, updated pricing-authority date.
- `src/lib/ai/gateway.ts` — optional 4th `drainStream` param; conditional `modelOptions.reasoning.effort`; passes `tier.reasoningEffort` at the sole call site.
- `src/routes/api/journey/$journeyId/lesson.ts` — SSE-path reasoning passthrough (conditional spread on the direct `chat()`); stale header comment retargeted to the new lesson chain.
- `src/server/interview.ts` — two stale `gpt-4o-mini` comments retargeted to `z-ai/glm-5.2`.
- `src/lib/ai-client.ts` — two legacy hardcoded literals retargeted to `z-ai/glm-5.2`; marked `@ts-expect-error` for the OpenAI adapter's narrow model enum (see Deviations D1).
- `tests/smoke/ai-gateway.test.ts` — interview-tier asserts `modelOptions.reasoning.effort === 'low'`; roadmap-tier asserts no `reasoning` field.
- `tests/smoke/ai-tool-call.test.ts` — per-test `180_000` timeout on the seven gated live cases (Deviations D2).

## Shared Files (also touched by sibling slices)
- `src/lib/ai/tiers.ts`, `src/lib/ai/gateway.ts`, `tests/smoke/ai-gateway.test.ts` — owned by `ai-gateway`; this slice edits constants and adds an additive field/param without touching call shapes, quota, or usage recording.
- `src/routes/api/journey/$journeyId/lesson.ts` — owned by `roadmap-lesson-generation` (the SSE bypass path); only the reasoning passthrough and one comment changed.
- `src/lib/ai-client.ts` — legacy, full removal owned by `ai-gateway-hygiene`; de-staled only.

## Notes on Design Choices
- **One mechanism for both paths.** `modelOptions: { reasoning: { effort } }`, added only when the tier sets an effort, keeps the gateway drain path and the SSE bypass path identical — no adapter wrapper, no raw provider escape hatch.
- **Effort omitted when unset.** Roadmap emits no `modelOptions.reasoning` at all, so grok-4.5's mandatory `high` applies for planning — verified by the AC-2 roadmap assertion.
- **Narrow union.** `reasoningEffort` is kept to `'low' | 'medium' | 'high'` (per slice scope) even though OpenRouter permits more; widening later is additive.

## Verification Seams Built
- AC-2 (interview effort `low`) → mocked assertion on `chat`'s `modelOptions.reasoning.effort` at `tests/smoke/ai-gateway.test.ts` (interview + roadmap cases). Deterministic, node env, no key.
- AC-3 (tagged live smoke passes) → per-test `180_000` timeout on the seven live `test.skipIf` cases at `tests/smoke/ai-tool-call.test.ts`, so the new (slower) reasoning-model tiers complete without hitting the 5 s default. Not a plan-named seam — added to keep AC-3 observable (see Deviations D2).
- AC-1 / AC-4 / AC-5 need no new seam: AC-1 rides the AC-3 live smoke, AC-4 is a `grep`, AC-5 is typecheck + the existing symbolic-reference mocked suite.

## Deviations from Plan
- **D1 — `ai-client.ts` line 93 needed a marked cast (class: implementation-detail).** The plan (A7) assumed both legacy literals swap cleanly to `z-ai/glm-5.2`. Line 80 (`createOpenRouterText`, accepts any string) did; line 93 (`createOpenaiChatCompletions`, from `@tanstack/ai-openai`) has a typed OpenAI-only model enum that rejects `z-ai/glm-5.2`. Evidence at the site: `tsc` error `TS2345` listing only OpenAI ids — the enum is non-exhaustive and this client targets OpenRouter's base URL where the model is valid at runtime. Resolved with a `@ts-expect-error` + `sdlc-debt:` marker (repro-cited, matching the existing `gateway.ts:241` idiom). No user-observable scope change; the cast retires with the file under ai-gateway-hygiene.
- **D2 — AC-3 live smoke needed per-test timeouts (class: implementation-detail).** The plan's Verification Strategy said AC-3 needs "no code edit; re-run only." Correctness held (all model IDs resolve, 9/9 pass), but the new reasoning models are slower than the prior non-reasoning models, so the 5 s Vitest default timed out mid-generation (a different 3 cases each run — a latency wall, not a catalog failure). Added `180_000` per-test timeouts to the seven gated live cases so the tagged smoke passes as a plain gate. In-scope (touches only the AC-3 harness the slice re-runs); no product-surface change.

## Anything Deferred
- **Legacy `ai-client.ts` full removal** — owned by the ai-gateway-hygiene slice; this slice only de-staled its literals (ceiling: the marked `@ts-expect-error` cast is live until that slice removes the file).
- **Per-request (vs per-tier) reasoning-effort overrides** — out of slice scope; the config is per-tier only.
- **`:nitro`/`:floor` provider-routing suffixes and provider pinning** — out of scope; revisit only if live latency measurements demand it.

## Known Risks / Caveats
- **Marked `@ts-expect-error` in `ai-client.ts`** (D1) is a live suppression until ai-gateway-hygiene removes the legacy adapter. Ceiling: if the OpenAI adapter's typings later widen to accept arbitrary model strings, `@ts-expect-error` will itself error (it flags an unused expectation) — a self-correcting tripwire.
- **Live-smoke provider flake (R1 residual):** one intermittent single-case failure observed across repeated runs; re-run passed 9/9. Different-provider fallbacks and the `model.fallback_triggered` alarm bound the residual, exactly as the plan documented.
- **Cost-telemetry drift (watchout):** quota/dashboard assumptions were calibrated to old pricing (glm-5.2 cheaper on output, grok-4.5 pricier). `usage.total_cost` is preferred at runtime so drift is limited to the recompute fallback path; roadmap is low-volume so daily-budget impact is small.

## Freshness Research
- **`@tanstack/ai-openrouter@0.15.8` reasoning surface — re-read installed source this round (RIM-E3).** Confirmed: `chat()` accepts `modelOptions?: providerOptions` (`node_modules/@tanstack/ai/dist/esm/activities/chat/index.d.ts:91`); the adapter documents a `modelOptions` passthrough and declares `reasoning` a supported provider option (`node_modules/@tanstack/ai-openrouter/dist/esm/model-meta.d.ts`); the OpenRouter `ChatRequest` carries `reasoning?: ChatRequestReasoning` with an `effort` field constraining reasoning effort (`node_modules/@openrouter/sdk/esm/models/chatrequest.d.ts:184`). Line numbers drifted from the plan's `text.ts:1148,1193` citation (bundled-vs-src path skew), but the mechanism is intact. Takeaway: the typed passthrough exists — no `as any` on the gateway path.
- **Model catalog / pricing — validated at point of use, not re-queried.** The four tiers and pricing are PO-ratified from live OpenRouter data (2026-07-12, po-answers extension round 1). The authoritative catalog-existence gate is the AC-3 live smoke, which passed 9/9 against the real API this round — every primary and fallback resolves, no delisted IDs.

## Recommended Next Stage
- **Option A (default):** `/wf verify waypoint-app model-refresh` — the slice changes model configuration plus an additive request field; all ACs have automated verification paths (mocked assertions, grep, live smoke). Consider `/compact` first — implementation research is context noise for verification.
- **Option B:** `/wf review waypoint-app model-refresh` — skip verify only if the live-smoke evidence in this record is accepted as sufficient; not recommended, since verify should independently re-run the live catalog gate and do the R3 lesson-prose spot-check.
