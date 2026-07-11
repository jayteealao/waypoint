---
schema: sdlc/v1
type: augmentation
augmentation-type: instrument
slug: waypoint-app
parent-workflow: waypoint-app
instrumentation-framework: "Cloudflare Workers observability (console.log → Logpush) + D1 usage_events table"
dark-paths-found: 0
signals-designed: 8
pii-warnings: false
status: ready
created-at: "2026-07-11T00:13:07Z"
---

# Augmentation: Instrumentation

## The Instrumentation

The shape's augmentation decision (Round 4) was explicit: the app's OpenRouter key funds every
user's generation, so silent cost or failure drift is not a monitoring nice-to-have, it's a
business risk. Eight signals are designed here, organized around the three dark paths the shape
identified: generation cost attribution, model fallback detection, and quota enforcement. None of
the signals carry raw PII — the `user_id` field is the internal D1 UUID, never an email or OAuth
token.

The collection layer costs nothing to set up. `wrangler.jsonc` gets `observability: { enabled: true }`
in the foundation slice, which routes every `console.log` and `console.error` call in the Workers
runtime to Cloudflare Logpush. Structured JSON to `console.log` is therefore all that's needed;
no third-party logger library, no instrumentation SDK, no additional vendor. The one exception is
cost attribution to users over time, which needs persistence — a `usage_events` table in D1 (the
project's system of record) captures the per-generation row that the quota engine reads and the
operator cost dashboard queries.

Since this is greenfield, the current state section is trivially empty — no code exists yet, no
dark paths in existing files. All signals are forward-looking designs for slices 7–11 (ai-gateway,
tutor-interview, roadmap-lesson-generation, quiz-fsrs, adaptation-progress). The foundation slice's
contribution is exactly the `observability: { enabled: true }` line in `wrangler.jsonc`, which the
plan folds into Step 6.

## 1. Current State

| File | Quality | Existing signals | Dark paths |
|------|---------|-----------------|------------|
| (all) | dark | none — greenfield | N/A (no code exists) |

Summary: 0 dark paths found across 0 files. Framework: none yet — greenfield. The instrumentation
plan designs the framework from scratch. Framework chosen: Cloudflare Workers native observability
(`observability: { enabled: true }` in `wrangler.jsonc`) as the log collector; structured
`console.log(JSON.stringify({...}))` calls in the Workers runtime; D1 `usage_events` table for
cost persistence.

## 2. Instrumentation Plan

| File | Function/path | Signal type | Signal name | Key fields | Rationale |
|------|--------------|-------------|-------------|------------|-----------|
| `app/lib/ai/gateway.ts` | `startGeneration()` | log | `generation.started` | `user_id`, `model`, `generation_type`, `estimated_prompt_tokens`, `journey_id` | Enables in-flight cost estimation and latency measurement |
| `app/lib/ai/gateway.ts` | `completeGeneration()` | log | `generation.completed` | `user_id`, `model`, `generation_type`, `prompt_tokens`, `completion_tokens`, `cost_usd`, `duration_ms`, `outcome` | Full generation audit row; also written to D1 usage_events |
| `app/lib/ai/gateway.ts` | `completeGeneration()` | metric | `generation.cost_usd` | `model`, `generation_type`, `cost_usd` | Per-call cost for quota enforcement and operator dashboard |
| `app/lib/ai/gateway.ts` | `completeGeneration()` | metric | `generation.duration_ms` | `model`, `generation_type`, `duration_ms` | Latency vs. NFR budget (lesson < 5s, interview turn < 3s) |
| `app/lib/ai/gateway.ts` | `handleFallback()` | log | `model.fallback_triggered` | `user_id`, `original_model`, `fallback_model`, `reason` | Detects the OpenRouter adapter regression scenario; named explicitly |
| `app/lib/ai/quota.ts` | `checkQuota()` | log | `quota.rejected` | `user_id`, `quota_limit`, `quota_used`, `request_type` | Emitted before any LLM call; proves the gate works; drives quota UX |
| `app/lib/ai/interview.ts` | `completeTurn()` | log | `interview.turn_completed` | `user_id`, `journey_id`, `turn_number`, `model`, `latency_ms`, `question_type` | Interview-turn latency NFR (< 3s) observable in production |
| `wrangler.jsonc` | `observability` | event | `workers.observability_enabled` | n/a — config flag | Cloudflare built-in; routes all console.log to Logpush; the collector |

## 3. Signal Designs

All signals use Cloudflare Workers structured-log idiom: `console.log(JSON.stringify({event, ...fields}))`.
The Workers runtime serializes this to Logpush as a queryable JSON field.

**`generation.started`** — emit before the first token request:
```typescript
// app/lib/ai/gateway.ts — startGeneration()
console.log(JSON.stringify({
  event: 'generation.started',
  user_id: userId,           // internal D1 UUID — not PII-sensitive
  journey_id: journeyId,
  model: modelId,
  generation_type: type,     // 'interview' | 'lesson' | 'quiz' | 'roadmap'
  estimated_prompt_tokens: estimatedTokens,
  timestamp: Date.now(),
}));
```

**`generation.completed`** — emit after the last token is received (or on error):
```typescript
// app/lib/ai/gateway.ts — completeGeneration()
const costUsd = (usage.prompt_tokens * modelPricing.input + usage.completion_tokens * modelPricing.output) / 1_000_000;
console.log(JSON.stringify({
  event: 'generation.completed',
  user_id: userId,
  journey_id: journeyId,
  model: modelId,
  generation_type: type,
  prompt_tokens: usage.prompt_tokens,
  completion_tokens: usage.completion_tokens,
  cost_usd: costUsd,
  duration_ms: endTime - startTime,
  outcome: error ? 'failure' : 'success',
  error_code: error?.code ?? null,
}));
// Also write to D1 usage_events for quota enforcement:
await db.insert(usageEventsTable).values({ userId, model: modelId, type, costUsd, durationMs, at: new Date() });
```

**`model.fallback_triggered`** — emit when the primary model fails:
```typescript
// app/lib/ai/gateway.ts — handleFallback()
console.log(JSON.stringify({
  event: 'model.fallback_triggered',
  user_id: userId,
  original_model: primaryModel,
  fallback_model: fallbackModel,
  reason: reason,  // 'timeout' | 'error' | 'quota' | 'tool-call-regression'
}));
```

**`quota.rejected`** — emit before making any LLM call when quota is exhausted:
```typescript
// app/lib/ai/quota.ts — checkQuota()
console.log(JSON.stringify({
  event: 'quota.rejected',
  user_id: userId,
  quota_limit: limit,
  quota_used: used,
  request_type: type,
  reset_at: resetAt.toISOString(),
}));
```

**`interview.turn_completed`** — emit after each interview response is sent to the client:
```typescript
// app/lib/ai/interview.ts — completeTurn()
console.log(JSON.stringify({
  event: 'interview.turn_completed',
  user_id: userId,
  journey_id: journeyId,
  turn_number: turnNumber,
  model: modelId,
  latency_ms: Date.now() - turnStartTime,
  question_type: questionType,  // 'consent' | 'knowledge' | 'scope' | 'mission' | 'sources'
}));
```

**D1 `usage_events` table schema** (defined in accounts-data-layer slice's D1 migration):
```sql
CREATE TABLE usage_events (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id     TEXT NOT NULL REFERENCES users(id),
  journey_id  TEXT REFERENCES journeys(id),
  model       TEXT NOT NULL,
  type        TEXT NOT NULL CHECK(type IN ('interview','lesson','quiz','roadmap')),
  prompt_tokens     INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd    REAL NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  outcome     TEXT NOT NULL DEFAULT 'success',
  at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX usage_events_user_at ON usage_events(user_id, at);
```

## 4. PII & Security Notes

No PII concerns identified in the planned signals. All `user_id` values are internal D1 UUIDs
(opaque, non-reversible to email or name without a database join that requires authentication).
No email addresses, OAuth tokens, session tokens, or user-provided content appear in any signal.

| Field | Risk | Recommended handling |
|-------|------|---------------------|
| `user_id` | Internal UUID — not PII in isolation | Acceptable to log as-is; never log the raw OAuth `access_token` or `email` in signal fields |
| `journey_id` | Internal UUID | Acceptable to log |
| `model` | Internal config value | No restriction |

**Injection posture:** The `generation_type`, `model`, `outcome`, and `question_type` fields
accept only values from a closed enum — they must be validated before logging (never string-interpolated
from model output, which could be adversarial). Log the enum value, not the raw string.

## 5. Implementation Notes

For `wf-implement`:

1. **`wrangler.jsonc` (foundation slice — Step 6):** Add `"observability": { "enabled": true }` to
   the base config. This is the only foundation-slice instrumentation task; all other signals land in
   later slices.

2. **`app/lib/ai/` directory (ai-gateway slice):** Create `gateway.ts` with `startGeneration()`,
   `completeGeneration()`, and `handleFallback()`. The signal designs in §3 are copy-ready; adapt
   to the actual TanStack AI adapter's `usage` payload shape (OpenRouter returns `usage.prompt_tokens`,
   `usage.completion_tokens`, and `usage.total_cost` — prefer `usage.total_cost` directly to avoid
   pricing-table drift).

3. **`app/lib/ai/quota.ts` (ai-gateway slice):** Create `checkQuota()` with the rejection log.
   The quota check must run on every path that calls `startGeneration()` — the only entry point
   where the gate can be reliably enforced.

4. **`app/lib/ai/interview.ts` (tutor-interview slice):** Add `completeTurn()` latency log after
   the SSE response is flushed (not before — the latency is end-to-end client receipt).

5. **D1 `usage_events` migration (accounts-data-layer slice):** Include the table schema from §3
   in the D1 migration file. The `ai-gateway` slice's `completeGeneration()` inserts into it; the
   `quota.ts` module reads from it to enforce per-user limits.

6. **New imports:** No new logging library is needed. All signals are `console.log(JSON.stringify({...}))`.
   The only new import in `gateway.ts` is the D1 client (already imported from the accounts
   data-layer module) for the `usage_events` insert.

7. **New env vars:** No new env vars for observability. Cloudflare's Logpush destination is
   configured in the Cloudflare dashboard, not in the app's `.env`.

8. **No conflicts with plan steps:** The plan steps for the ai-gateway, tutor-interview, and
   accounts-data-layer slices will each include "add instrumentation per 04b-instrument.md"
   as an explicit step — this avoids re-touching the same files twice.
