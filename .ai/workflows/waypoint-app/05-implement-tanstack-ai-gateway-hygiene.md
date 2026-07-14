---
schema: sdlc/v1
type: implement
slug: waypoint-app
slice-slug: tanstack-ai-gateway-hygiene
status: complete
stage-number: 5
created-at: "2026-07-14T13:29:00Z"
updated-at: "2026-07-14T13:29:00Z"
metric-files-changed: 14
metric-lines-added: 737
metric-lines-removed: 690
metric-deviations-from-plan: 2
metric-review-fixes-applied: 0
commit-sha: ""
tags: [tanstack, tanstack-ai, gateway, tech-debt, refactor, dead-code, streaming, metering]
refs:
  index: 00-index.md
  implement-index: 05-implement.md
  slice-def: 03-slice-tanstack-ai-gateway-hygiene.md
  plan: 04-plan-tanstack-ai-gateway-hygiene.md
  siblings:
    - 05-implement-ai-gateway.md
    - 05-implement-model-refresh.md
    - 05-implement-roadmap-lesson-generation.md
    - 05-implement-quiz-fsrs.md
    - 05-implement-lesson-renderer.md
  verify: 06-verify-tanstack-ai-gateway-hygiene.md
next-command: wf-verify
next-invocation: "/wf verify waypoint-app tanstack-ai-gateway-hygiene"
---

# Implement: TanStack AI gateway hygiene (F4 + F5 + F9)

## The Implementation

Three findings clustered on one file, and closing them together left the AI path with one
streaming engine instead of two. The new `src/lib/ai/model-stream.ts` owns the machinery both
callers used to hand-roll separately: the model-fallback loop, the `@tanstack/ai` chunk
vocabulary (`TEXT_MESSAGE_CONTENT` / `TOOL_CALL_*` / `RUN_FINISHED`, plus the legacy snake_case
fallbacks), token-usage accumulation, cost computation, and the `usage_events` INSERT. The
buffered gateway drain and the token-by-token lesson SSE route now call `runModelWithFallback`
and differ only in one callback — `onTextDelta` appends to a string on the gateway path and
runs the NDJSON line-buffer/enqueue loop on the SSE path. That is the load-bearing decision
(RIM-E5): consumption is **parameterized, not unified**, so the SSE path still flushes
section-by-section and the quota gate stays a per-caller pre-flight check. The buffered gateway
awaits its D1 write; the SSE path keeps its fire-and-forget `Promise.all([...]).catch`.

The dead structured-output surface is gone. `GatewayInput` was a three-arm union whose
`responseFormat` arm was destructured, guarded with a `TypeError`, and passed a JSON-schema
object by three call sites — but never forwarded to `chat()`. Source-verified, `@tanstack/ai@0.40`
has no `responseFormat` parameter at all (the real API is `outputSchema`, a Standard Schema that
turns `chat()` into a parsed promise). Because quiz and roadmap already emit correct JSON from
their system prompts, the honest fix was removal: the union collapses to
`GatewayCallWithTools | GatewayCallText`, the guard and its three call-site props are gone, and
the three orphaned JSON-schema constants (`QUIZ_QUESTION_JSON_SCHEMA`, `GRADING_JSON_SCHEMA`,
`WAYPOINT_JSON_SCHEMA`) were deleted. The duplicate dead wrapper `src/lib/ai-client.ts` and its
sole-importer dependency `@tanstack/ai-openai` were removed (188 transitive packages pruned).

Nothing changes a public API a user reaches, a persisted shape, or a migration. `tsc` was the
primary net for orphaned references (clean), lint is clean, and the mocked Vitest suite is green
(200 passed, 6 live-key smokes skipped in the no-key run) including a new F9 no-regress assertion
and four new helper unit tests. The top residual risk is exactly what verify must disprove with
runtime evidence: that the SSE consolidation regressed token-by-token incrementality or the
zero-outbound-when-quota-exhausted invariant.

## Summary of Changes

- **F9 — one shared streaming/fallback/metering helper.** New `src/lib/ai/model-stream.ts`
  exports `runModelWithFallback` (fallback loop + chunk parsing + usage accumulation),
  `computeCost` (prefer `total_cost`, else recompute from tier pricing), and `recordUsage`
  (the `usage_events` INSERT). `gateway.ts` (buffered) and `lesson.ts` (SSE) both consume it.
- **F4 — dead structured-output path removed.** `GatewayCallWithFormat`, the `responseFormat`
  destructure, the `TypeError` guard, and the invariant doc blocks are gone; three call sites and
  three JSON-schema constants deleted. `GatewayInput = GatewayCallWithTools | GatewayCallText`.
- **F5 — dead wrapper + dep removed.** `src/lib/ai-client.ts` deleted; `@tanstack/ai-openai`
  dropped from `package.json`; lockfile regenerated.
- **Tests.** New `tests/smoke/model-stream.test.ts` (helper unit coverage); `ai-gateway.test.ts`
  TypeError test removed + F9 no-regress test added; `ai-tool-call.test.ts` re-pointed off the
  deleted wrapper onto an inline mock, adapter-swap test retired, `responseFormat` props stripped.

## Files Changed

- `src/lib/ai/model-stream.ts` (**new**, 211 loc): `runModelWithFallback`, `computeCost`,
  `recordUsage`, plus `StreamUsage` / handler / options types. The single home for the AI
  streaming machinery.
- `src/lib/ai/gateway.ts`: `callGateway` now runs quota gate → `generation.started` →
  `runModelWithFallback` (buffered via an `onTextDelta` that appends) → `computeCost` →
  `recordUsage` → `generation.completed`. Removed `drainStream`, `recomputeCost`, the
  `StreamUsage` interface, the `GatewayCallWithFormat` arm, the `responseFormat` destructure, and
  the `TypeError` guard. `GatewayResponse`/`GatewayUsage` shapes unchanged.
- `src/routes/api/journey/$journeyId/lesson.ts`: SSE route runs `runModelWithFallback` with
  `modelTimeoutMs: 120_000` and an `onTextDelta` holding the exact NDJSON line-buffer + enqueue
  loop; `onFallback` emits the waypoint-scoped `model.fallback_triggered` payload and resets
  per-attempt SSE state. Metering stays fire-and-forget via `recordUsage` inside `Promise.all().catch`.
- `src/server/quiz.ts`: dropped `responseFormat` from `generateQuiz` and `gradeAnswer`; removed
  the two schema imports; refreshed two stale "structured output" doc lines.
- `src/server/roadmap.ts`: dropped `responseFormat` from `attemptRoadmapCall`; removed the schema
  import; refreshed the module doc.
- `src/lib/quiz/schema.ts`: deleted `QUIZ_QUESTION_JSON_SCHEMA` + `GRADING_JSON_SCHEMA` (all
  validators / lint / prompt builders retained).
- `src/lib/roadmap/schema.ts`: deleted `WAYPOINT_JSON_SCHEMA` (validator / prompt builder retained).
- `src/lib/ai/tiers.ts`: rewrote the stale `responseFormat`/`TypeError` invariant doc blocks to
  describe prompt-driven JSON.
- `src/lib/ai-client.ts`: **deleted** (dead second wrapper).
- `package.json`: removed `@tanstack/ai-openai`. `pnpm-lock.yaml`: regenerated (−188 pkgs).
- `tests/smoke/ai-gateway.test.ts`: removed the TypeError-invariant test, stripped `responseFormat`
  from the roadmap reasoning-effort test, added the F9 buffered-path no-regress test.
- `tests/smoke/ai-tool-call.test.ts`: dropped the `#/lib/ai-client` + `GRADING_JSON_SCHEMA`
  imports; test-1 mocked round-trip is now a self-contained inline mock; retired the AC-PP3
  adapter-swap test and the wrapper-based live smoke; stripped `responseFormat` from live cases.
- `tests/smoke/model-stream.test.ts` (**new**): helper unit tests.

## Shared Files (also touched by sibling slices)

- `src/lib/ai/gateway.ts` — owned by `ai-gateway`; `model-refresh` threaded `reasoningEffort`
  through its (now-removed) `drainStream`. This slice preserved that passthrough via the helper's
  `reasoningEffort` option.
- `src/routes/api/journey/$journeyId/lesson.ts` — owned by `roadmap-lesson-generation` /
  `lesson-renderer`; the SSE contract (event shapes, resume replay, 120s timeout, 429 quota
  response, terminal error event) is byte-for-byte preserved.
- `src/lib/ai/tiers.ts` — owned by `model-refresh`; only doc comments changed (no tier data).
- `tests/smoke/ai-tool-call.test.ts` — carries historical AC-PP2/PP3 + quiz/source-grounding live
  smokes; the live gateway interview-tier tool-call smoke is retained as the "real tool-call round trip".

## Notes on Design Choices

- **Handler-callback seam over a mode flag.** `onTextDelta` is the minimal parameterization that
  keeps buffered vs. streaming consumption in the callers (RIM-E5). A `mode: 'buffered' | 'stream'`
  flag would have pulled both strategies into the helper — the unification RIM-E5 forbids.
- **`computeCost` split out from `recordUsage`.** The SSE path needs the cost value *synchronously*
  for its `generation.completed` log while the D1 write stays fire-and-forget; a pure `computeCost`
  plus an INSERT-only `recordUsage` preserves that split exactly (see Deviation D1).
- **Helper does not emit `generation.started/completed`.** Those signals are caller-owned and differ
  between paths (gateway emits `generation.started`; lesson does not). Keeping them in callers
  preserves the exact signal surface.
- **Removed, not rewired to `outputSchema`.** Wiring the native structured-output API would convert
  JSON-Schema objects to Standard Schema and change `chat()`'s return from a stream to a parsed
  promise — a larger, behavior-changing edit. Removal met the AC at the smallest blast radius;
  adopting `outputSchema` remains available to a future slice.

## Verification Seams Built

- **AC-HYG4 (helper is the single implementation; both callers use it)** → `tests/smoke/model-stream.test.ts`
  unit tests exercise the fallback loop, handler routing, usage extraction, cost, and INSERT
  directly, independent of either caller. Enables verify to assert "one shared helper" without a
  live model.
- **AC-HYG4 SSE (token-by-token preserved)** → the SSE `onTextDelta` keeps the per-line
  `controller.enqueue`; the existing `tests/e2e/sse-streaming.wrangler.spec.ts` observes multiple
  `data:` frames over time under `wrangler dev`.
- **AC-HYG5 (buffered no-regress: quota, fallback, cost, metering)** → new
  `ai-gateway.test.ts` "shared helper (F9)" test asserts text still drains and exactly one
  `usage_events` row is written with the right `type`/`cost_usd`; the retained quota/fallback/tier/
  cost tests are the rest of the no-regress net.
- **AC-HYG2 (real tool-call round trip)** → the live gateway interview-tier tool-call smoke in
  `ai-tool-call.test.ts` (skips without `OPENROUTER_API_KEY`; the inline mock is the always-green proxy).

## Deviations from Plan

- **D1 — `recordUsage` signature split into `computeCost` + `recordUsage`.** The plan's Step 1
  named a single `recordUsage(db, { …, usage, tier, … })` that computes cost *and* INSERTs. Building
  it that way would have hidden the cost value inside a fire-and-forget promise on the SSE path,
  where the `generation.completed` log needs the cost synchronously. Split into a pure
  `computeCost(usage, tier) → { costUsd, recomputed }` and an INSERT-only `recordUsage(db, { …, costUsd })`.
  This is behavior-preserving (it is what the plan's "keep the fire-and-forget split" watchout
  requires) and `class: implementation-detail` — no AC, API surface, or persisted shape changes.
  Not an "API-not-found" deviation; no source-absence claim involved.
- **D2 — tool-call chunks accumulated inside the helper, returned as `toolUse`, instead of routed to
  `handlers.onToolCall*`.** The plan sketched `onToolCall*` handlers; no caller needs per-tool-chunk
  streaming (only the buffered gateway consumes tool calls, and it wants the assembled `toolUse`).
  Internal accumulation returning `{ toolUse }` matches the old `drainStream` behavior exactly and is
  the smaller seam. `class: implementation-detail`; `onTextDelta` remains the streaming seam RIM-E5
  requires.

## Anything Deferred

- **Native `outputSchema` structured output not adopted** (Assumption A1). The dead `responseFormat`
  surface was removed rather than rewired to `@tanstack/ai`'s real `outputSchema` API. Ceiling: quiz
  and roadmap rely on prompt-mandated JSON + a validate-and-one-re-ask loop (unchanged, already
  verified). Upgrade path: a later slice can wire `outputSchema` (Standard Schema) if provider-enforced
  structured output is wanted — reversible.

## Known Risks / Caveats

- **`sdlc-debt:` in `computeCost`** — the tier pricing table is the recompute fallback when OpenRouter
  omits `total_cost`; it goes stale on model swaps. Live ceiling, carried forward unchanged from the
  old `gateway.ts` (this slice moved the marker, did not introduce the shortcut). Upgrade path: rely
  on `usage.total_cost` once every tier surfaces it.
- **SSE fallback re-emits sections** — if a model fails mid-stream after emitting sections, the retried
  model restarts from the resume baseline and re-enqueues sections already sent to the client (the
  dedup guard resets with per-attempt state). This is the pre-existing behavior, preserved verbatim by
  `resetPerModelState()` in `onFallback`; not introduced here.

## Verification Strategy Cross-Reference

Source ACs: `03-slice-tanstack-ai-gateway-hygiene.md`. All environment walls named by verification
(`OPENROUTER_API_KEY` live smoke, `BETTER_AUTH_SECRET` seeded-session e2e) are already cleared —
keys present in `.dev.vars`. No new deferral is opened; verification reuses the retired harnesses.
RIM-E5 makes AC-HYG4/AC-HYG5 behavior-preserving mandates — verify must show before/after evidence for
both consumption modes (buffered drain unchanged; SSE still token-by-token) AND the pre-flight quota invariant.

## Freshness Research

- **`@tanstack/ai@0.40` structured-output API** — `node_modules/@tanstack/ai/dist/esm/activities/chat/index.d.ts`
  exposes `outputSchema` (Standard Schema; makes `chat()` return a parsed value), and grep of that file
  confirms **no** `responseFormat` parameter. Basis for removing (not rewiring) the dead F4 surface.
  Honors the `MEMORY.md` "assume-missing" anti-pattern and RIM-E3: the API claim is grounded in installed
  source, not the in-repo comments (which wrongly called the invariant "enforced").
- **`@tanstack/ai-openrouter@0.15.8` chunk vocabulary** — `TEXT_MESSAGE_CONTENT` / `RUN_FINISHED` /
  `modelOptions.reasoning.effort` were source-verified in the `model-refresh` plan and are empirically
  proven by the (passing) gateway + lesson suites. The shared helper reuses that exact vocabulary.

## Automated Check Results (implement-time)

- `pnpm typecheck` — clean (primary net for orphaned `responseFormat`/`ai-client`/schema-constant refs).
- `pnpm lint` (oxlint) — clean; only pre-existing warnings in files this slice did not touch.
- `pnpm test` (Vitest) — 18 files, 200 passed, 6 skipped (live-key smokes; no `OPENROUTER_API_KEY` in
  the mocked run). Includes the 4 new helper unit tests + the F9 no-regress test.
- `pnpm audit --audit-level=high` — no known vulnerabilities (post `@tanstack/ai-openai` removal).
- Full Playwright e2e (SSE incrementality, seeded-session lesson streaming) + tagged live-smoke run are
  the verify stage's mandate, not re-run here.

## Recommended Next Stage

- **Option A (default):** `/wf verify waypoint-app tanstack-ai-gateway-hygiene` — RIM-E5 demands runtime
  before/after proof of SSE token-by-token flush and the quota invariant on both consumption modes.
  **Consider `/compact` first** — implementation detail is noise for verification; workflow state lives
  in the artifact files and is re-read after compaction.
- **Option B:** `/wf review waypoint-app tanstack-ai-gateway-hygiene` — only if the runtime SSE/quota
  evidence is deemed already covered by the helper unit tests + the existing `sse-streaming.wrangler`
  spec; a refactor of two live code paths generally warrants verify first.
