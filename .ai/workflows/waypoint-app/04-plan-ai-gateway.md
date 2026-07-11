---
schema: sdlc/v1
type: plan
slug: waypoint-app
slice-slug: ai-gateway
status: complete
stage-number: 4
created-at: "2026-07-11T22:49:31Z"
updated-at: "2026-07-11T22:49:31Z"
metric-files-to-touch: 10
metric-step-count: 10
has-blockers: false
revision-count: 0
revisions: []
tags: [ai-gateway, quotas, model-tiering, fallback, instrumentation, cost-attribution]
stack-source: confirmed
refs:
  index: 00-index.md
  plan-index: 04-plan.md
  slice-def: 03-slice-ai-gateway.md
  siblings:
    - 04-plan-foundation.md
    - 04-plan-platform-proofs.md
    - 04-plan-accounts-data-layer.md
    - 04-plan-design-system-shell.md
    - 04-plan-lesson-renderer.md
    - 04-plan-sample-journey.md
  implement: 05-implement-ai-gateway.md
next-command: wf-implement
next-invocation: "/wf implement waypoint-app ai-gateway"
---

# Plan: AI Gateway, Quotas & Instrumentation

## The Plan

The sample journey is live; every subsequent slice will talk to a language model. Before a single real generation feature ships, this plan puts a gate across the only path that matters: the call to OpenRouter. Ten files, three layers. The bottom layer is a thin tier config (`tiers.ts`) that names the model for each generation type and its fallback chain. The middle layer is the quota engine (`quota.ts`) — a D1 query over the already-existing `usage_events` table that decides in under one millisecond whether a user gets to call the model at all. The top layer is the gateway itself (`gateway.ts`), which enforces the gate, routes to the right tier adapter, retries through the fallback chain on failure, records the usage row, and emits the five instrumentation signals already designed in the augmentation plan. Nothing that generates text bypasses this function.

The user-visible surface is minimal by design: a warm blocking card that appears when a user's daily allowance is exhausted, showing their current usage, the limit, and the exact reset time — no paywall language, no upsell path, no friction beyond the honest fact. A test-harness route at `/_authenticated/quota-fixture` seeds a quota-exhausted user so Playwright can drive the card without waiting for real quota to exhaust. The gateway's observable-false acceptance criteria (fallback chain order, tier routing, usage recording) are all fully exercised by Vitest unit tests against a mocked adapter and an in-memory D1 mock — deterministic, fast, zero network calls.

The highest implementation risk is the OpenRouter usage payload: the plan prefers `usage.total_cost` directly over re-deriving cost from token counts and a pricing table, because pricing tables go stale when models are swapped. A unit test covers both the present and absent `total_cost` path so a future adapter difference surfaces at test time, not in production.

## Current State

Six slices are implemented and reviewed (foundation through sample-journey). The relevant inheritance for this slice:

- **`src/lib/ai-client.ts`** — the raw adapter layer from platform-proofs: three factories (`createOpenRouterClient`, `createOpenAIFallbackClient`, `createMockAIClient`). The gateway wraps these; they are not replaced.
- **`src/db/schema.ts`** — `UsageEvent` TypeScript interface already typed (matches `usage_events` table).
- **`migrations/0000_schema_v1.sql`** — `usage_events` table is live in the D1 schema (authored in accounts-data-layer). No new migration is needed for this slice.
- **`src/lib/auth-guard.ts`** — `requireAuth()` pattern used by all server functions; gateway uses the same session to attribute usage to `user.id`.
- **`src/server/journeys.ts`** — authoritative pattern for server functions using `env.DB.prepare().bind().run()` and `withSession` middleware. `src/server/ai.ts` mirrors this pattern.
- **`tests/smoke/ai-tool-call.test.ts`** — existing `// @vitest-environment node` test file; extended here for gateway-tier live smoke.
- **`src/routes/_authenticated/lesson/fixture.tsx`** — the test-harness route pattern; `quota-fixture.tsx` mirrors it.
- **`src/styles.css`** — ember token set already in place; quota card styles use existing variables.

Workers `observability: { enabled: true }` is set in `wrangler.jsonc` (foundation). All instrumentation signals are `console.log(JSON.stringify({...}))` — no new logging infrastructure needed.

## Simplicity Ladder

- **Model tiering** → rung 3 (reuse): `src/lib/ai-client.ts` adapter factories already cover OpenRouter + OpenAI-fallback + mock. `tiers.ts` maps generation type to model ID and calls the right factory — no new library.
- **Fallback chain execution** → rung 4 (new code): no existing fallback loop in the codebase. A `try/catch` over an ordered model list with a counter is ~15 lines in `gateway.ts`. No library; no rung 1–3 option covers multi-model retry logic.
- **Retry with classification** → rung 4 (new code): simple exponential backoff, 2 retries, classifying errors as `timeout | error | quota | tool-call-regression`. Pattern is <20 lines; adding a retry library would be over-abstraction for 2 retries.
- **Quota check (D1 window query)** → rung 3 (reuse): `env.DB.prepare().bind().first()` is the established D1 pattern from `src/server/journeys.ts`. Quota arithmetic is a SUM over an indexed date window — no ORM needed.
- **Usage recording (D1 insert)** → rung 3 (reuse): same D1 insert pattern as `createJourney()` in `src/server/journeys.ts`. The `usage_events` schema is already live; no migration.
- **Instrumentation signals** → rung 2 (native platform): `console.log(JSON.stringify({...}))` routes to Cloudflare Logpush via `observability: { enabled: true }`. No library; signal designs are copy-ready from `04b-instrument.md § Signal Designs`.
- **Quota blocking card UI** → rung 3 (reuse): `src/components/ui/Card.tsx` and ember tokens (`--color-ember-*`, `--radius-*`, `--space-*`) are the building blocks. `QuotaCard.tsx` is ~50 lines.
- **Test harness route** → rung 3 (reuse): `src/routes/_authenticated/lesson/fixture.tsx` is the established pattern for seeded-session Playwright test surfaces. `quota-fixture.tsx` mirrors it exactly.
- **Live-smoke suite extension** → rung 3 (reuse): extend `tests/smoke/ai-tool-call.test.ts`'s existing `skipIf(!OPENROUTER_API_KEY)` pattern. Three new tests; no new infrastructure.

## Applied Learnings

No applicable learnings found. `.ai/solutions/INDEX.md` does not exist — this is the first workflow run in this project.

**Repeat-deferral tripwire:** `00-index.md` `runtime-evidence-deferrals` has five entries. The relevant wall for this slice is the BETTER_AUTH_SECRET deferral (originally AC-ADL1+AC-ADL5, accumulated AC-DSS1/3/4/5 and AC-LR1/2/3). The quota-fixture Playwright test (AC-11 observable half) will hit the same cookie-signing wall. This is the same wall, not a new one — pre-authorized into the existing deferral entry per the pattern established in four prior slices. `harness-declined: N/A — absorbed into existing BETTER_AUTH_SECRET deferral`.

## Likely Files / Areas to Touch

- `src/cloudflare-workers.d.ts` — add `OPENROUTER_API_KEY` to `Cloudflare.Env` (currently absent; present in `worker-configuration.d.ts` via wrangler types, but not in the manual extension file)
- `src/lib/ai/tiers.ts` — new: model tier config (interview/lesson/structured model IDs, fallback chains, pricing metadata)
- `src/lib/ai/quota.ts` — new: quota engine (D1-backed, cost_usd, daily window, QuotaStatus return type)
- `src/lib/ai/gateway.ts` — new: core gateway function `callGateway()` with quota gate, tier routing, retry/fallback, usage recording, instrumentation
- `src/components/quota/QuotaCard.tsx` — new: warm blocking card component
- `src/styles.css` — modified: `.quota-card` styles using ember tokens
- `src/server/ai.ts` — new: `getQuotaStatus()` server function for fixture route and future consumers
- `src/routes/_authenticated/quota-fixture.tsx` — new: test harness route at `/_authenticated/quota-fixture`
- `tests/smoke/ai-gateway.test.ts` — new: Vitest unit tests for all observable-false ACs
- `tests/smoke/ai-tool-call.test.ts` — modified: add three gateway-tier live smoke tests

## Proposed Change Strategy

**Gateway wraps, not replaces.** `src/lib/ai-client.ts` stays as the raw adapter layer. `gateway.ts` imports the adapter factories and calls them inside the tiering + retry loop. Consumer slices call `callGateway()`, never the raw adapters directly.

**Quota unit: cost_usd (daily window).** The `usage_events` table records prompt_tokens, completion_tokens, and cost_usd. Quota enforcement uses cost_usd because it is the common denominator across model tiers (interview model tokens are ~4x cheaper than lesson model tokens, making token-count limits unintuitive). Default: $0.50/day per user. The table records all three dimensions so a future pivot to token-based quotas requires no schema change.

**OpenRouter total_cost preferred over recomputed cost.** The gateway reads `usage.total_cost` from the OpenRouter usage payload when present (includes the 5.5% credit fee). Falls back to `(prompt_tokens × input_price + completion_tokens × output_price) / 1_000_000` only when absent. A warning signal is emitted when the fallback path activates.

**Structured + tool calls: never combined.** The `callGateway()` function accepts either `tools` or `responseFormat` in its input, not both. This is encoded as a TypeScript discriminated union. A unit test asserts a `TypeError` is thrown when both are supplied.

**Tier config is env-overridable but no new env vars required.** Model IDs ship as typed constants in `tiers.ts`. The instrumentation plan specified no new env vars for this slice; the OpenRouter key is already in the Cloudflare.Env type via `worker-configuration.d.ts`.

## Step-by-Step Plan

1. **Extend `src/cloudflare-workers.d.ts`.** Add `OPENROUTER_API_KEY: string` to both `declare namespace Cloudflare { interface Env }` and the global `interface Env`. This unblocks `gateway.ts` from reading the key via `env.OPENROUTER_API_KEY` — the same pattern used by all other secrets in this file.

2. **Author `src/lib/ai/tiers.ts`.** Define `GenerationType = 'interview' | 'lesson' | 'quiz' | 'roadmap'` and `TierConfig = { primaryModel: string; fallbackChain: string[]; pricingPer1MTokens: { input: number; output: number } }`. Export `TIERS: Record<GenerationType, TierConfig>` with initial values:
   - `interview`: `openai/gpt-4o-mini`, fallback `['google/gemini-flash-1.5']`, ~$0.15/$0.60 per 1M
   - `lesson`: `anthropic/claude-3.5-haiku`, fallback `['openai/gpt-4o']`, ~$1.00/$5.00 per 1M
   - `structured`: `openai/gpt-4o-mini`, fallback `['openai/gpt-4o']`, ~$0.15/$0.60 per 1M — note: structured-output tier; tool calls never combined here
   - `quiz`: `openai/gpt-4o-mini`, fallback `['anthropic/claude-3.5-haiku']` — quiz grading is structured; same invariant applies

3. **Author `src/lib/ai/quota.ts`.** Export:
   - `QuotaStatus = { allowed: boolean; used: number; limit: number; resetAt: Date }`
   - `DAILY_LIMIT_USD = 0.5` (constant; operator can adjust by editing the constant and deploying)
   - `checkQuota(db: D1Database, userId: string): Promise<QuotaStatus>` — runs `SELECT COALESCE(SUM(cost_usd), 0) AS used FROM usage_events WHERE user_id = ? AND at >= ?` with the start of the current UTC day as the lower bound. Returns `{ allowed: used < DAILY_LIMIT_USD, used, limit: DAILY_LIMIT_USD, resetAt: startOfNextUTCDay }`. Emits `quota.rejected` log when `!allowed` per `04b-instrument.md`.

4. **Author `src/lib/ai/gateway.ts`.** Export `callGateway({ env, userId, journeyId, type, messages, tools, responseFormat })`:
   - Validate: if both `tools` and `responseFormat` are provided, throw `TypeError('structured-output and tool calls cannot be combined in one request')`.
   - Quota gate: call `checkQuota(env.DB, userId)`. If `!allowed`, log `quota.rejected` signal and throw a typed `QuotaExhaustedError` with the `QuotaStatus` attached.
   - Emit `generation.started` log signal with `{ event, user_id, journey_id, model, generation_type, estimated_prompt_tokens: messages.reduce(...), timestamp }`.
   - Tier loop: try the primary model from `TIERS[type]`, then each fallback in order. On any error: log `model.fallback_triggered` signal; continue to next fallback. If all exhaust: throw the last error.
   - On success: compute `costUsd = usage.total_cost ?? (prompt_tokens * input_price + completion_tokens * output_price) / 1_000_000`. Insert usage row via `env.DB.prepare('INSERT INTO usage_events ...')`. Emit `generation.completed` log signal.
   - Return the `AIResponse` from the successful adapter call.

5. **Author `src/components/quota/QuotaCard.tsx`.** Props: `{ status: QuotaStatus }`. Renders a warm card (uses `src/components/ui/Card.tsx`) with: heading "Daily generation limit reached", body "You've used $X.XX of your $Y.YY daily allowance. It resets at [resetAt formatted as local time]." No upsell copy. A thin progress bar (`<meter>` element) shows used/limit ratio. Exports `QuotaCard` as default.

6. **Add `.quota-card` styles to `src/styles.css`.** Using existing ember token variables: `.quota-card { ... }`, `.quota-card__bar { accent-color: var(--color-ember-500); ... }`, `.quota-card__reset { color: var(--color-ember-700); font-size: var(--font-size-sm); ... }`. Scoped under `.quota-card`; no global selector side effects.

7. **Author `src/server/ai.ts`.** Following the `withSession` middleware pattern from `src/server/journeys.ts`, export `getQuotaStatus = createServerFn().middleware([withSession]).handler(...)` that calls `checkQuota(env.DB, session.user.id)` and returns the `QuotaStatus`. This server function is the consumer surface for the fixture route and will be reused by tutor-interview and roadmap-lesson-generation.

8. **Author `src/routes/_authenticated/quota-fixture.tsx`.** A route at `/_authenticated/quota-fixture` (auto-generated into routeTree.gen.ts). Calls `getQuotaStatus()` in `loader`. If `!status.allowed`, renders `<QuotaCard status={status} />`. If allowed, renders `<p data-testid="quota-ok">Quota available: ${(status.limit - status.used).toFixed(4)} remaining</p>`. The `data-testid` attributes make Playwright assertions unambiguous. **Note:** adding this route requires re-running `pnpm generate-routes` to update `routeTree.gen.ts`.

9. **Author `tests/smoke/ai-gateway.test.ts`.** `// @vitest-environment node`. Tests:
   - `quota gate: rejects call when quota exhausted` — seed mock D1 returning SUM > limit; assert `callGateway` throws `QuotaExhaustedError` before any adapter call.
   - `quota gate: allows call when quota available` — seed mock D1 returning SUM < limit; assert `callGateway` reaches the adapter.
   - `usage recording: inserts row after successful call` — capture the D1 `prepare().bind().run()` call; assert `usage_events` insert with correct `user_id`, `type`, `cost_usd`.
   - `fallback chain: tries primary then fallback on error` — mock primary adapter to throw; assert fallback adapter is called; assert `model.fallback_triggered` signal emitted.
   - `tier routing: interview type targets interview model` — assert `callGateway({ type: 'interview', ... })` calls the adapter with `TIERS.interview.primaryModel`.
   - `structured+tool-call invariant: throws TypeError` — assert `callGateway({ tools: [...], responseFormat: {...}, ... })` throws immediately.
   - `cost math: prefers usage.total_cost over recomputed` — mock adapter returning `usage.total_cost = 0.001`; assert cost_usd in D1 insert equals `0.001`.
   - `cost math: fallback to token recompute when total_cost absent` — mock adapter returning `usage.total_cost = undefined`; assert cost_usd derived from token counts and pricing table.

10. **Extend `tests/smoke/ai-tool-call.test.ts` with gateway-tier live smoke.** Append inside the existing describe block three `test.skipIf(!process.env['OPENROUTER_API_KEY'])` tests:
    - `gateway smoke: interview tier live call` — `callGateway({ env: {..., OPENROUTER_API_KEY: key}, type: 'interview', ... })` against a mock D1 (quota satisfied); assert `tool_use` result and that a usage row would have been inserted.
    - `gateway smoke: lesson tier live text generation` — similar, type `lesson`, streaming text result.
    - `gateway smoke: structured tier live call` — similar, type `structured`, `responseFormat` (no tools).

## Verification Strategy

| AC | Tool / method + ladder rung | Environment need — satisfiable? | What must be BUILT to make it verifiable | Fallback chain |
|----|------------------------------|--------------------------------|------------------------------------------|----------------|
| AC-11 quota gate (blocking state + zero LLM calls) | Playwright seeded-session on `/_authenticated/quota-fixture` + network intercept asserting no OpenRouter calls (web-1) | Local dev with seeded quota-exhausted fixture user — needs BETTER_AUTH_SECRET for cookie signing | `src/routes/_authenticated/quota-fixture.tsx` + `src/server/ai.ts`; fixture user seeded via existing test-seeding pattern | Vitest unit test (gateway throws QuotaExhaustedError before adapter call — already in Step 9) → pre-registered deferral |
| AC-11 usage recording (tokens + cost persisted) | Vitest unit test: mock D1 capture + mock adapter emitting usage payload (rung 4 unit) | Node (Vitest `// @vitest-environment node`) — no runtime deps | `tests/smoke/ai-gateway.test.ts` Step 9 | N/A — fully deterministic |
| AC fallback chain (retry order, failure counter) | Vitest fault-injection unit test (rung 4 unit) | Node — no runtime deps | `tests/smoke/ai-gateway.test.ts` Step 9 | N/A — deterministic |
| AC tier routing (per-tier model target) | Vitest unit test: assert model ID passed to adapter (rung 4 unit) | Node — no runtime deps | `tests/smoke/ai-gateway.test.ts` Step 9 | N/A — deterministic |
| AC live smoke (interview + lesson + structured real call) | Vitest `skipIf(!OPENROUTER_API_KEY)` (rung 3 reuse — extends existing pattern) | `OPENROUTER_API_KEY` in env — absent in automated runner | Extend `tests/smoke/ai-tool-call.test.ts` Step 10 | pre-registered deferral (same as AC-PP2b in 00-index.md) |

**constraint-resolution per AC:**

- AC-11 quota card (Playwright / observable): `proxy+deferral` — proxy is the Vitest unit test proving zero adapter calls when quota exhausted (Step 9, deterministic). Deferral accepted into the **existing AC-ADL1+AC-ADL5 BETTER_AUTH_SECRET deferral entry** (the same cookie-signing wall paid by four prior slices). `cleared-by: re-running E2E suite with BETTER_AUTH_SECRET set in .dev.vars`.

- AC live smoke (OPENROUTER_API_KEY wall): `proxy+deferral` — absorbed into the **existing AC-PP2b deferral entry** in `00-index.md`. Same wall, same clearing event. `harness-declined: N/A — pre-registered`.

## Test / Verification Plan

### Automated checks

- **typecheck:** `pnpm typecheck` — covers all new TypeScript files including the discriminated union in `callGateway`
- **lint:** `pnpm lint` — covered by typecheck (same command in this project)
- **unit tests:** `pnpm test` — `tests/smoke/ai-gateway.test.ts` (8 tests, node env), extended `tests/smoke/ai-tool-call.test.ts` (3 live tests, all skipped without key)
- **existing tests:** all 30+ prior Vitest and Playwright tests must continue to pass — `callGateway` is additive; `ai-client.ts` is not modified

### Interactive verification (human-in-the-loop)

**What to verify:** The quota-exhausted card renders correctly for a seeded user; no network calls to OpenRouter appear in DevTools when the card shows.

**Platform & tool:** Web — in-repo Playwright suite (`tests/e2e/quota-fixture.spec.ts`, seeded-session pattern), ad-hoc run via `pnpm test:e2e`.

**Companion skills:** `verify` skill for end-to-end behavior confirmation.

**Constraint:** Requires BETTER_AUTH_SECRET in `.dev.vars`. Pre-resolved via existing proxy+deferral entry (same wall as AC-ADL1/5, AC-DSS1/3/4/5, AC-LR1/2/3 — all four prior Playwright seeded-session suites).

**Steps:**
1. Set BETTER_AUTH_SECRET in `.dev.vars`.
2. `pnpm dev` (Vite dev server).
3. Seed a user at quota limit via the existing `tests/e2e/helpers/seed.ts` pattern (add quota seeding helper).
4. Run `pnpm test:e2e --grep quota-fixture`.
5. Assert: QuotaCard renders at `/_authenticated/quota-fixture`; no outbound fetch to `openrouter.ai` in network log.

**Evidence capture:** Screenshot at 375px, 768px, 1280px per the runtime-adapters web-1 pattern.

**Pass criteria:** QuotaCard visible with correct `resetAt` time; network log shows zero calls to `openrouter.ai`; `data-testid="quota-ok"` is absent.

If BETTER_AUTH_SECRET not set: tests skip per the existing deferral — cleared by re-running with the secret present (same clearing event as prior slices).

## Risks / Watchouts

- **OpenRouter `usage.total_cost` absent:** If the `@tanstack/ai-openrouter` adapter does not expose `total_cost` in its usage payload, the fallback recomputation activates. This is handled but the pricing table needs maintenance when models change. Mitigated by preferring `total_cost` and logging a warning when the fallback path is used.
- **D1 SUM query performance:** The daily quota check runs a `SUM(cost_usd)` over `usage_events` filtered by `user_id` and `at`. The `usage_events_user_at_idx` index on `(user_id, at)` is already in the schema — this query is covered.
- **Clock skew in daily window:** UTC day boundary computed as `new Date().toISOString().slice(0, 10) + 'T00:00:00Z'`. D1's `at` column stores ISO-8601 strings — consistent with UTC. Workers runtime clock is UTC; no issue.
- **New route in routeTree.gen.ts:** Adding `quota-fixture.tsx` requires `pnpm generate-routes`. The implement step must run this; the generated file is committed as part of the change.
- **Over-abstracting the gateway:** The slice definition explicitly calls this out. The gateway is a function, not a class. It has two callers at implementation time (the test harness and the live smoke). Four known consumers define its API; the plan builds to them.

## Dependencies on Other Slices

- **Depends on:** `platform-proofs` (adapter factories in `ai-client.ts`), `accounts-data-layer` (`usage_events` table in D1 schema, `env.DB` binding, server function pattern, `withSession` middleware).
- **Depended on by:** `tutor-interview`, `roadmap-lesson-generation`, `quiz-fsrs`, `adaptation-progress` — all four generation-consuming slices call `callGateway()`.
- **No file conflicts with implemented slices:** `ai-client.ts` is read-compatible (gateway imports it, does not modify it). The new `src/lib/ai/` subdirectory has no sibling conflicts.

## Assumptions

All of the following were resolved autonomously per the autonomous-override policy (no user-observable scope or contract change).

1. **Quota unit: cost_usd (daily window).** Assumed over alternatives (token count, call count) because cost is the common denominator across model tiers — interview model tokens are ~4x cheaper than lesson model tokens, making a token-count limit unintuitive to communicate to the user. Daily window is assumed over monthly because daily gives a clear, short reset time the UI can display as "resets tomorrow at midnight UTC" — which is friendly rather than alarming. The `usage_events` table records all three dimensions, so a future pivot to token-based quotas requires no schema change. _Why:_ smallest blast radius while keeping the door open; daily is simpler to reason about.

2. **Default quota limit: $0.50/day per user.** Assumed as a reasonable conservative default. $0.50/day ≈ 300 interview turns (at $0.15/1M tokens, ~500 tokens per turn) or ≈ 50 lesson streams (at $1.00/1M input, ~10K tokens per lesson). The PO is the only operator at v1; changing the constant and deploying is the change mechanism. _Why:_ prevents runaway cost without being so tight it frustrates real usage; the constant is trivially operator-adjustable.

3. **Gateway wraps ai-client.ts rather than replacing it.** The existing adapter factories are the proven interface from platform-proofs. Replacing them would touch the existing smoke tests. Wrapping adds a layer above without modifying a tested layer. _Why:_ smallest blast radius; preserves existing test coverage.

4. **Tier models:** Interview → `openai/gpt-4o-mini`; Lesson → `anthropic/claude-3.5-haiku`; Structured/Quiz → `openai/gpt-4o-mini`. Assumed as the shape's "cheap/fast for interview turns, premium for lessons" directive translated to the OpenRouter model catalog as of 2026-07-11. All are config constants in `tiers.ts` — tutor-interview and roadmap-lesson-generation slices can change the tier constants without touching the gateway. _Why:_ cheapest-sufficient-quality choice per generation type; fallback chains handle availability.

5. **Structured + tool calls invariant encoded as TypeScript discriminated union.** Assumed that a compile-time check is preferable to a runtime check only. Both are present (TypeScript union + runtime `TypeError` in `callGateway`). _Why:_ catching the invariant at type-check time is free and prevents consumer slices from ever compiling the invalid combination.

6. **QuotaCard UI is self-contained (no modal, no redirect).** The blocking card renders in place on whatever route the user is on when quota exhausted. It does not redirect or dismiss automatically. _Why:_ simpler implementation; avoids routing side effects in a pre-feature slice; each generation-consuming feature can compose the card into its own loading state however it wants.

7. **Test harness route at `/_authenticated/quota-fixture`.** Assumed analogous to `/_authenticated/lesson/fixture`. Route is clearly named as a fixture; it will not appear in the sidebar navigation (no `waypoints` in ShellContext). _Why:_ established project pattern; zero new infrastructure.

8. **OPENROUTER_API_KEY added to `Cloudflare.Env` in `src/cloudflare-workers.d.ts`.** The key is already in `worker-configuration.d.ts` (generated by `wrangler types` from `wrangler.jsonc`). Adding it to the manual extension file is a minor duplication but makes the `env.OPENROUTER_API_KEY` type visible to `gateway.ts` without depending on the generated file. _Why:_ consistent with the pattern for all other secrets in `cloudflare-workers.d.ts`.

## Blockers

None. All ACs are resolvable with available tooling and existing infrastructure. The BETTER_AUTH_SECRET and OPENROUTER_API_KEY walls are pre-registered deferrals absorbed into existing entries — no new blockers.

## Freshness Research

The `@tanstack/ai` and `@tanstack/ai-openrouter` packages are already installed and proven in the platform-proofs slice (commit 7da0ab7). No new dependencies are added in this slice. Key facts from the platform-proofs freshness pass remain current:

- `@tanstack/ai 0.40.0` is the pinned version; the OpenRouter adapter's usage payload shape was validated in the live-smoke run.
- `openai/gpt-4o-mini` is available on OpenRouter and was the model used in the platform-proofs smoke test.
- The `usage.total_cost` field availability depends on the adapter; the plan's fallback path covers its absence.
- No CVEs or advisories affect the pinned versions for this slice's capabilities.

Model pricing used in `tiers.ts` is authoritative as of 2026-07-11 from OpenRouter's pricing page; it is stored as typed config (not hardcoded arithmetic) so staleness is a config update, not a code change.

## Recommended Next Stage

- **Option A (default):** Implement this slice — all ACs resolved, no blockers, the gateway is the prerequisite for all four remaining generation-feature slices. Consider `/compact` before implementing — six prior slices of research and review are in context.
- **Option B:** Revisit slice — not indicated; no slice-boundary issues.
