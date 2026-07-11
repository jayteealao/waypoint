---
schema: sdlc/v1
type: implement
slug: waypoint-app
slice-slug: platform-proofs
status: complete
stage-number: 5
created-at: "2026-07-11T09:53:39Z"
updated-at: "2026-07-11T09:53:39Z"
metric-files-changed: 12
metric-lines-added: 464
metric-lines-removed: 5
metric-deviations-from-plan: 6
metric-review-fixes-applied: 0
commit-sha: "2ffa2a1c21af4e702a490db2d5d6ac3100b3ef26"
tags: [de-risking, workerd, tanstack-ai, d1, better-auth, sse, platform-proof]
refs:
  index: 00-index.md
  implement-index: 05-implement.md
  slice-def: 03-slice-platform-proofs.md
  plan: 04-plan-platform-proofs.md
  siblings: [05-implement-foundation.md]
  verify: 06-verify-platform-proofs.md
next-command: wf-verify
next-invocation: "/wf verify waypoint-app platform-proofs"
---

# Implement: Platform Proofs

## The Implementation

Three beta dependencies — TanStack AI, better-auth on D1, and SSE streaming under the Cloudflare Workers runtime — now have empirical evidence in the codebase rather than documentation assumptions. Nine new files and three modified ones deliver that evidence. Vitest confirms the AI adapter interface: the mocked round-trip passes, the live test skips cleanly without a key, and a compile-level assertion proves the OpenAI-fallback adapter substitutes for the native adapter without touching a single call site. The route tree was regenerated after two new API routes joined the file-based tree. TypeScript is clean at zero errors.

The biggest surprises were API-shape discoveries resolved at implement time: `createAPIFileRoute` from `@tanstack/react-start/server` does not exist in v1.x (the actual API is `createFileRoute` with `server.handlers`), `@tanstack/ai`'s core package is activity-based rather than a simple factory (requiring two additional provider packages), and `better-auth/adapters/d1` has no separate export (D1Database is passed directly as the `database` option). All three were resolved in-scope with no user-observable scope change. The SSE route, the auth route, and the AI client all deliver the same AC evidence the plan named — only the implementation paths differ from the plan's assumptions.

Two Playwright proof tests remain to be run against `wrangler dev`: they require a running workerd process and are the evidence for AC-PP1 and AC-PP4. They are built and ready; execution is the verify stage's first task.

## Summary of Changes

- Added `@tanstack/ai 0.40.0`, `@tanstack/ai-openrouter 0.15.8`, `@tanstack/ai-openai 0.16.0`, and `better-auth 1.6.23` to `dependencies` (exact-pinned, no `^`/`~`).
- Added `d1_databases` binding to `wrangler.jsonc` with placeholder UUID valid for `wrangler dev`.
- Created `src/routes/api/demo-stream.ts` — SSE demo route emitting 5 timed chunks at 200ms intervals.
- Created `src/lib/ai-client.ts` — three AI client factories (`createOpenRouterClient`, `createOpenAIFallbackClient`, `createMockAIClient`) behind a shared `AIClient` interface.
- Created `src/lib/auth.ts` — `createAuth(db)` per-request factory wrapping `betterAuth()` directly with the D1 binding.
- Created `src/routes/api/auth/$.ts` — catch-all auth route mount using `createFileRoute` `server.handlers`.
- Created `src/cloudflare-workers.d.ts` — TypeScript module declaration for the `cloudflare:workers` virtual module.
- Created `tests/smoke/ai-tool-call.test.ts` — Vitest smoke: mocked round-trip, skippable live test, adapter-swap proof.
- Created `tests/e2e/sse-streaming.wrangler.spec.ts` — Playwright SSE timing proof against `wrangler dev`.
- Created `tests/e2e/d1-auth-spike.wrangler.spec.ts` — Playwright D1 + better-auth mount proof.
- Created `playwright.wrangler.config.ts` — second Playwright config pointing to `wrangler dev` on port 8787.
- Regenerated `src/routeTree.gen.ts` to include `/api/demo-stream` and `/api/auth/$`.

## Files Changed

- `package.json` — added 4 exact-pinned dependencies; pnpm lockfile regenerated
- `wrangler.jsonc` — added `d1_databases` array with `binding: "DB"`, `database_name: "waypoint-dev"`, placeholder ID
- `src/routeTree.gen.ts` — regenerated; now includes `ApiDemoStreamRoute` and `ApiAuthSplatRoute`
- `src/cloudflare-workers.d.ts` — new: TypeScript shim for `cloudflare:workers` virtual module
- `src/lib/ai-client.ts` — new: `AIClient` interface + three factories + AG-UI stream collector
- `src/lib/auth.ts` — new: `createAuth(db)` per-request better-auth factory
- `src/routes/api/demo-stream.ts` — new: SSE demo route with 5 timed chunks
- `src/routes/api/auth/$.ts` — new: catch-all better-auth API route mount
- `tests/smoke/ai-tool-call.test.ts` — new: Vitest node-env AI smoke (3 tests, 1 live-skippable)
- `tests/e2e/sse-streaming.wrangler.spec.ts` — new: Playwright SSE progressive-chunk proof
- `tests/e2e/d1-auth-spike.wrangler.spec.ts` — new: Playwright D1 + better-auth mount proof
- `playwright.wrangler.config.ts` — new: second Playwright config for `wrangler dev` on port 8787

## Shared Files (also touched by sibling slices)

- `package.json` — shared across all slices; added 4 deps without floating ranges
- `src/routeTree.gen.ts` — auto-generated; any slice that adds routes must regenerate and commit it

## Notes on Design Choices

- **`createFileRoute` with `server.handlers` instead of `createAPIFileRoute`** — `createAPIFileRoute` from `@tanstack/react-start/server` does not exist in TanStack Start v1.x. The actual server-route API is `createFileRoute` from `@tanstack/react-router` with the `server: { handlers: { GET, POST, ... } }` option. Behavior is identical for the proofs. The accounts-data-layer and ai-gateway slices should use the same pattern.

- **Two additional provider packages (`@tanstack/ai-openrouter`, `@tanstack/ai-openai`)** — `@tanstack/ai` 0.40.0 is activity-based (not a simple `openRouterText()` factory in the core). Provider adapters live in separate packages. Both pinned exact (0.15.8 and 0.16.0 respectively).

- **D1 binding passed directly as `database` option** — `better-auth/adapters/d1` does not exist as a named export. `betterAuth({ database: d1Binding })` is the correct pattern; `D1Database` from `@cloudflare/workers-types` is accepted directly. The TypeScript cast `db as Parameters<typeof betterAuth>[0]['database']` satisfies the type checker without importing a non-existent adapter.

- **Catch-all route filename `$.ts` not `[...all].ts`** — TanStack Router file-based routing uses `$` as the splat filename convention, not bracket notation. The route ID becomes `/api/auth/$` and the path matches `/api/auth/*`.

- **`cloudflare-workers.d.ts` shim** — `import { env } from 'cloudflare:workers'` requires a TypeScript module declaration. Without it, tsc fails. The shim declares `env: Record<string, any>` which is sufficient for the spike; `wrangler types` generation (producing a typed `Env` interface) is deferred to accounts-data-layer per the plan's assumption.

- **No `execute` in `toolDefinition()` config** — `ToolDefinitionConfig` does not include an `execute` property. Execution lives on the chained `.server(fn)` / `.client(fn)` methods. For the proof, only tool-call detection is needed (TOOL_CALL_START/ARGS/END events), not execution — so no execute handler is attached.

## Verification Seams Built

- AC-PP1 (SSE chunks arrive progressively) → `tests/e2e/sse-streaming.wrangler.spec.ts` uses `page.evaluate()` to run an in-page fetch with ReadableStream timing; asserts 5 data lines + elapsed ≥ 600ms. Seam: `src/routes/api/demo-stream.ts` emits fixed `data: chunk-N` lines with 200ms delays. Enables Playwright against `wrangler dev`.
- AC-PP2a (mocked tool-call round trip) → `tests/smoke/ai-tool-call.test.ts` test 1; seam: `createMockAIClient()` returns deterministic `{ tool_use: { name: 'echo_tool', input: { text: 'pong' } } }`. Enables Vitest node environment.
- AC-PP2b (live OpenRouter) → `tests/smoke/ai-tool-call.test.ts` test 2 with `test.skipIf(!OPENROUTER_API_KEY)`; seam: `createOpenRouterClient(apiKey)` factory. Enables tagged live run.
- AC-PP3 (adapter-swap zero-callsite) → `tests/smoke/ai-tool-call.test.ts` test 3; seam: both factories return `AIClient` — TypeScript compile check is the assertion. Enables Vitest node environment.
- AC-PP4a/b (D1 + better-auth mount + no leak) → `tests/e2e/d1-auth-spike.wrangler.spec.ts`; seam: `src/routes/api/auth/$.ts` + `src/lib/auth.ts` per-request factory. Enables Playwright against `wrangler dev`.

## Deviations from Plan

1. **`createAPIFileRoute` → `createFileRoute` with `server.handlers`** — The plan assumed `createAPIFileRoute` from `@tanstack/react-start/server`. This function does not exist in TanStack Start v1.x. The correct API is `createFileRoute` from `@tanstack/react-router` with `server: { handlers: { METHOD: fn } }`. All three AC proofs use this pattern. No user-observable consequence.

2. **`@tanstack/ai` requires separate provider packages** — Plan assumed `openRouterText()` factory in core `@tanstack/ai`. Actual: core is activity-based; `createOpenRouterText` lives in `@tanstack/ai-openrouter` and `createOpenaiChatCompletions` lives in `@tanstack/ai-openai`. Two additional exact-pinned packages added. No user-observable consequence; the `AIClient` interface is unchanged.

3. **`better-auth/adapters/d1` does not exist** — Plan assumed `import { d1 } from 'better-auth/adapters/d1'`. Actual: `D1Database` is passed directly as the `database` option in `betterAuth()`. TypeScript cast used to satisfy the type. No user-observable consequence.

4. **Catch-all route filename `$.ts` not `[...all].ts`** — TanStack Router uses `$` as the splat convention. The plan named the file `[...all].ts`; the actual file is `$.ts`. Route path and behavior are identical. Route tree regenerated successfully.

5. **`src/cloudflare-workers.d.ts` not in plan** — The `import { env } from 'cloudflare:workers'` pattern required a TypeScript module declaration. The plan did not list this file. Added as a zero-scope-change addition (1 file, 9 lines). No user-observable consequence.

6. **`execute` removed from `toolDefinition()` config** — Plan described adding an execute handler to tool definitions. `ToolDefinitionConfig` does not include `execute`; the property belongs on the chained `.server()` / `.client()` methods. Since the proof only observes tool-call events (not executes them), the handler is not needed. Removing it satisfies the TypeScript compiler and leaves the AC proofs fully intact.

## Anything Deferred

- **Playwright wrangler proofs (AC-PP1, AC-PP4)** — The SSE and D1 Playwright tests require a running `wrangler dev` process. They are built and ready; verify stage runs them.
- **Live OpenRouter smoke (AC-PP2b)** — Pre-registered residual from shape. Cleared by a tagged run with `OPENROUTER_API_KEY` present. The mocked proof (AC-PP2a) is the immediate proxy evidence.
- **Typed `Env` interface from `wrangler types`** — `src/cloudflare-workers.d.ts` uses `Record<string, any>` for `env`. The accounts-data-layer slice adds `wrangler types` generation to produce the strongly-typed `Env` interface.
- **Full better-auth OAuth config** — The spike uses minimal config (no OAuth plugins). Real OAuth providers are the accounts-data-layer slice's scope.

## Known Risks / Caveats

- **`wrangler dev` SSE behavior under workerd** — SSE streaming behavior is inferred-not-documented for the workerd runtime. If the Playwright timing proof fails (elapsed < 600ms), it indicates single-flush buffering — a shape-level event requiring an architecture discussion. Surface immediately; do not add workarounds.
- **Placeholder D1 database ID** — `wrangler.jsonc` has `"database_id": "00000000-0000-0000-0000-000000000000"`. Valid for `wrangler dev` (miniflare); must be replaced with a real Cloudflare D1 ID before the first production deploy.
  - `sdlc-debt: placeholder D1 ID — upgrade path: wrangler d1 create waypoint-dev, replace UUID in wrangler.jsonc before first production deploy`

## Freshness Research

No additional research conducted during implement. The shape's freshness sweep (2026-07-10) covered all relevant facts for this slice. API-surface discoveries (items 1–3 in Deviations) were resolved by reading installed package types rather than documentation — the correct approach for beta packages.

## Recommended Next Stage

- **Option A (default):** `/wf verify waypoint-app platform-proofs` — Run the full verification suite. Vitest passes locally; Playwright wrangler proofs require `wrangler dev` and are the next gate.
- **Option B:** `/wf review waypoint-app platform-proofs` — Skip verify if the wrangler tests pass manually and the evidence is captured in the verify artifact.
