---
schema: sdlc/v1
type: plan
slug: waypoint-app
slice-slug: platform-proofs
status: complete
stage-number: 4
created-at: "2026-07-11T09:17:42Z"
updated-at: "2026-07-11T09:53:39Z"
metric-files-to-touch: 9
metric-step-count: 10
has-blockers: false
revision-count: 0
revisions: []
tags: [de-risking, workerd, tanstack-ai, d1, better-auth, sse, platform-proof]
stack-source: confirmed
refs:
  index: 00-index.md
  plan-index: 04-plan.md
  slice-def: 03-slice-platform-proofs.md
  siblings:
    - 04-plan-foundation.md
  implement: 05-implement-platform-proofs.md
next-command: wf-implement
next-invocation: "/wf implement waypoint-app platform-proofs"
---

# Plan: Platform Proofs

## The Plan

Three beta dependencies sit on the critical path of every subsequent slice, and this plan answers whether each one actually works in this specific scaffold before any UI investment begins. The nine files added or modified here are deliberately small — demo routes, library configs, and focused test fixtures — because the goal is evidence, not features. Two Playwright tests hit the running dev server under the Cloudflare Workers runtime; one Vitest file exercises the TanStack AI client in a node environment with a mocked adapter (and skips to live if the OpenRouter key is present). If any proof fails, the failure arrives while the codebase is still minimal enough to diagnose.

The SSE streaming proof drives an API route that emits five timed chunks through `toServerSentEventsResponse()` against `wrangler dev`. Progressive chunk arrival is the only question — the test asserts on response timing, not content. The TanStack AI proof plumbs both the native OpenRouter adapter and the OpenAI-adapter-with-baseURL fallback behind a shared interface, then runs a single tool-call round trip to validate the schema. A third test rewires the factory to use the fallback and runs the same assertions unchanged, proving the swap is zero-callsite. The D1 + better-auth spike mounts the auth library on `createAPIFileRoute` with per-request client creation and sends two sequential requests to confirm no module-scope state leaks between them.

Ten steps, nine files. The highest risk is the SSE behavior under workerd — if it genuinely fails, that is a shape-level event and the proof's job is to surface it immediately rather than paper over it.

## Current State

Foundation is complete: TanStack Start scaffold on `feat/waypoint-app`, `@cloudflare/vite-plugin` wired in `vite.config.ts`, `wrangler.jsonc` present with `observability: { enabled: true }`, Vitest and Playwright both passing. Three routes exist (`__root.tsx`, `index.tsx`, `about.tsx`). No API routes exist yet. `@tanstack/ai` and `better-auth` are not yet installed. The `wrangler.jsonc` has no D1 binding.

Key observations from the codebase:
- `vite.config.ts` uses the `cloudflare({ viteEnvironment: { name: 'ssr' } })` pattern — confirmed compatible with `@cloudflare/vite-plugin 1.44.0`.
- `vitest.config.ts` uses `jsdom` environment and covers `tests/smoke/**/*.test.ts`. The AI tool-call smoke test runs in node (not jsdom) — it will need either a separate vitest project or the `@vitest/browser` env override. Decision: use `// @vitest-environment node` docblock annotation on the AI test file to override the environment per-file.
- `playwright.config.ts` drives `pnpm dev` as the web server. For SSE and D1 tests, `wrangler dev` must be the server — a second Playwright project or a separate `playwright.wrangler.config.ts` is needed. Decision: a `playwright.wrangler.config.ts` that starts `wrangler dev` on port 8787.
- Existing `tests/e2e/smoke.spec.ts` is a `pnpm dev` test; wrangler proof tests are a distinct execution context.

## Simplicity Ladder

- **SSE streaming** → rung 2 (native platform): `toServerSentEventsResponse()` is a TanStack Start/server primitive, already available in the installed `@tanstack/react-start`. No new library needed.
- **API route pattern** → rung 3 (reuse): `createAPIFileRoute` is the TanStack Start convention for API endpoints; already present in the installed package. Both the demo stream and the auth spike use this pattern.
- **TanStack AI client** → rung 4 (new code): `@tanstack/ai` is not yet installed. The package introduces the `openRouterText()` factory and the OpenAI-compatible adapter. No in-repo equivalent exists.
- **Mocked AI adapter** → rung 4 (new code): no mock harness exists. A simple factory that returns a `vi.fn()` stub conforming to the AI adapter interface is 10–15 lines; no library needed.
- **better-auth** → rung 4 (new code): `better-auth` is not yet installed. The D1 adapter is bundled with the package (no separate install). Per-request client creation is the documented pattern for Workers.
- **D1 local binding** → rung 2 (native platform): wrangler's `[[d1_databases]]` config with `wrangler dev` creates a local miniflare D1 instance automatically. No extra tooling needed.
- **Playwright for E2E proofs** → rung 3 (reuse): Playwright and its chromium browser are already installed (`@playwright/test 1.61.1`, browsers at `%LOCALAPPDATA%\ms-playwright`). A second config file reuses the same test runner against `wrangler dev`.

## Applied Learnings

No applicable learnings found. `.ai/solutions/INDEX.md` does not exist — this is the first workflow run in this project.

Repeat-deferral tripwire: `00-index.md` has one entry in `runtime-evidence-deferrals` — AC-F4 (CI gate) from the foundation slice, cleared by the first PR. No overlap with this slice's ACs.

## Likely Files / Areas to Touch

- `package.json` — add `@tanstack/ai`, `better-auth` (exact-pinned)
- `wrangler.jsonc` — add `[[d1_databases]]` binding for local D1 spike
- `src/routes/api/demo-stream.ts` — new: SSE demo route
- `src/lib/ai-client.ts` — new: AI client factory (native + fallback + mock)
- `src/lib/auth.ts` — new: better-auth per-request config factory
- `src/routes/api/auth/[...all].ts` — new: better-auth API route mount
- `tests/smoke/ai-tool-call.test.ts` — new: TanStack AI tool-call smoke + adapter-swap test
- `tests/e2e/sse-streaming.spec.ts` — new: SSE progressive-chunk Playwright proof
- `tests/e2e/d1-auth-spike.spec.ts` — new: D1 + better-auth Playwright spike
- `playwright.wrangler.config.ts` — new: second Playwright config driving `wrangler dev` on port 8787

(10 files: 8 new, 2 modified)

## Proposed Change Strategy

**Smallest-surface proofs.** Each proof adds only what is needed to answer its specific question — no production-quality error handling, no full auth schema, no real quota logic. The demo stream route emits five fixed strings. The auth spike mounts better-auth with the minimal D1 plugin only. The AI client file exposes the interface but leaves quota/fallback logic to the `ai-gateway` slice.

**Per-request, no module-scope state.** The `src/lib/auth.ts` factory and `src/routes/api/auth/[...all].ts` route explicitly demonstrate the per-request D1 client creation pattern that every subsequent Workers route must follow. This is the architectural contract the spike proves.

**Wrangler dev as the Workers runtime target.** Both Playwright proof tests run against `wrangler dev` (port 8787, workerd runtime), not the Vite dev server. This is the only way to prove SSE streaming and D1 bindings in the actual target runtime. A second Playwright config file (`playwright.wrangler.config.ts`) starts `wrangler dev` as its `webServer`.

## Step-by-Step Plan

1. **Install `@tanstack/ai` and `better-auth`.** Check the npm registry for the latest non-prerelease `@tanstack/ai` version and latest `better-auth` >= 1.6.23. Add both to `package.json` `dependencies` with exact version pins (no `^` or `~`). Run `pnpm install --frozen-lockfile=false` to generate updated lockfile. Re-run pin-check: verify no floating ranges were introduced.

2. **Add D1 binding to `wrangler.jsonc`.** Append a `[[d1_databases]]` entry:
   ```jsonc
   {
     // ...existing config...
     "d1_databases": [
       {
         "binding": "DB",
         "database_name": "waypoint-dev",
         "database_id": "00000000-0000-0000-0000-000000000000"
       }
     ]
   }
   ```
   The placeholder ID is valid for `wrangler dev` (miniflare creates a local DB automatically when the binding is present). A real ID is only needed for `wrangler d1 create` on a Cloudflare account — required only for the first production deploy, not for local proofs.

3. **Create the SSE demo route.** `src/routes/api/demo-stream.ts`:
   ```typescript
   import { createAPIFileRoute } from '@tanstack/react-start/server'

   export const APIRoute = createAPIFileRoute('/api/demo-stream')({
     GET: async () => {
       const encoder = new TextEncoder()
       const stream = new ReadableStream({
         async start(controller) {
           for (let i = 1; i <= 5; i++) {
             controller.enqueue(encoder.encode(`data: chunk-${i}\n\n`))
             await new Promise(r => setTimeout(r, 200))
           }
           controller.close()
         },
       })
       return new Response(stream, {
         headers: {
           'Content-Type': 'text/event-stream',
           'Cache-Control': 'no-cache',
           'Connection': 'keep-alive',
         },
       })
     },
   })
   ```
   **Note:** TanStack Start's `toServerSentEventsResponse()` is the preferred helper if it exports cleanly from `@tanstack/react-start/server`. If the import resolves, use it; otherwise use the manual `ReadableStream` + `Response` pattern above (which is a workerd-native SSE response and does not depend on any helper).

4. **Create the AI client factory.** `src/lib/ai-client.ts` — three exported functions:
   - `createOpenRouterClient(apiKey: string)`: creates a TanStack AI client using the native `openRouterText()` factory from `@tanstack/ai`.
   - `createOpenAIFallbackClient(apiKey: string)`: creates a TanStack AI client using the OpenAI-compatible adapter from `@tanstack/ai` with `baseURL: 'https://openrouter.ai/api/v1'` — the fallback pattern for when native tool calling is broken.
   - `createMockAIClient()`: returns a mock adapter that synchronously resolves a predefined tool-call round trip (model requests `echo_tool`, app returns `"pong"`, model consumes the result); used in unit tests without any network call.

   The interface for all three is identical: `{ complete(messages, tools): Promise<AIResponse> }`. This is the assertion the adapter-swap test relies on.

5. **Create the better-auth config factory.** `src/lib/auth.ts`:
   ```typescript
   import { betterAuth } from 'better-auth'
   import { d1 } from 'better-auth/adapters/d1'

   // Per-request factory: called inside the route handler, not at module scope.
   // `db` is the D1 binding from the cloudflare:workers context.
   export function createAuth(db: D1Database) {
     return betterAuth({
       database: d1(db),
       secret: process.env.BETTER_AUTH_SECRET ?? 'dev-secret-replace-in-prod',
       // Minimal config for the spike: no OAuth plugins yet (accounts-data-layer adds them)
     })
   }
   ```
   **Key constraint:** `createAuth()` is called inside the route handler on every request, never at module scope. This is the per-request pattern the shape mandated — verified by the spike test.

6. **Create the better-auth API route.** `src/routes/api/auth/[...all].ts`:
   ```typescript
   import { createAPIFileRoute } from '@tanstack/react-start/server'
   import { env } from 'cloudflare:workers'
   import { createAuth } from '#/lib/auth'

   export const APIRoute = createAPIFileRoute('/api/auth/$')({
     GET: ({ request }) => {
       const auth = createAuth((env as any).DB)
       return auth.handler(request)
     },
     POST: ({ request }) => {
       const auth = createAuth((env as any).DB)
       return auth.handler(request)
     },
   })
   ```
   The `cloudflare:workers` env import is the shape-mandated secret-access pattern for Workers SSR context (getContext('cloudflare') is empty during SSR; `import { env }` works).

7. **Create the AI tool-call smoke test.** `tests/smoke/ai-tool-call.test.ts`:
   - `// @vitest-environment node` annotation at top (overrides jsdom per-file).
   - Test 1 (`mocked tool-call round trip`): calls `createMockAIClient().complete(messages, [echoTool])`, asserts the response contains `tool_use` with `name: 'echo_tool'` and `input.text: 'pong'`. This is the schema validation.
   - Test 2 (`live OpenRouter tool call`, `test.skipIf(!process.env.OPENROUTER_API_KEY)`): calls `createOpenRouterClient(process.env.OPENROUTER_API_KEY!).complete(...)` and asserts the same schema on the real response.
   - Test 3 (`adapter-swap: OpenAI fallback`): constructs `createOpenAIFallbackClient('test-key')` instead of `createOpenRouterClient()`, passes the same `messages` and `tools`, and asserts the mock still returns the expected schema — proving the swap is transparent.

8. **Create the SSE streaming Playwright proof.** `tests/e2e/sse-streaming.spec.ts` with a second config file `playwright.wrangler.config.ts`:
   - `playwright.wrangler.config.ts`: `baseURL: 'http://localhost:8787'`, `webServer: { command: 'wrangler dev --port 8787', url: 'http://localhost:8787', reuseExistingServer: !process.env.CI }`, `projects: [{ name: 'chromium-wrangler', use: devices['Desktop Chrome'] }]`.
   - `tests/e2e/sse-streaming.spec.ts`: Opens `/api/demo-stream` via `page.goto()`; uses `page.on('response', ...)` to capture response timing. Asserts that the response body contains all five `data:` lines and that the time between first byte and last byte is at least 600ms (5 chunks × 200ms = 1000ms, so 600ms is a conservative lower bound that confirms progressive streaming rather than single-flush). Uses `page.evaluate(() => ...)` for the timing harness if needed.

9. **Create the D1 + better-auth Playwright spike.** `tests/e2e/d1-auth-spike.spec.ts` (uses the same `playwright.wrangler.config.ts`):
   - `test 1 (better-auth responds on createAPIFileRoute)`: GET to `/api/auth/session`; asserts HTTP 200 (unauthenticated session response, not 500).
   - `test 2 (no module-scope client leak)`: two sequential GET requests to `/api/auth/session`; asserts both succeed with 200 independently (proves the per-request factory doesn't leave state from request 1 affecting request 2).

10. **Run the proofs and commit.** Execute in order:
    - `pnpm install` — verify lockfile updated cleanly.
    - `pnpm typecheck` — zero TypeScript errors.
    - `pnpm test` — AI tool-call smoke test passes (mocked); live test skipped (no key in CI).
    - `pnpm exec playwright test --config playwright.wrangler.config.ts` — both wrangler proof tests pass.
    - Commit all 10 files to `feat/waypoint-app` with a message describing the platform verification results in product language.

## Verification Strategy

| AC | Tool / method + ladder rung | Environment need — satisfiable in target env? | What must be BUILT to make it verifiable | Fallback chain |
|----|------------------------------|-----------------------------------------------|------------------------------------------|----------------|
| AC-PP1: SSE chunks arrive progressively (observable) | `playwright.wrangler.config.ts` test suite, `sse-streaming.spec.ts` — network timing assertion (rung: web-1) | `wrangler dev` locally — **yes** (wrangler 4.110.0 already installed; Node 22.15.0 on PATH) | `src/routes/api/demo-stream.ts` + `playwright.wrangler.config.ts` + `tests/e2e/sse-streaming.spec.ts` | → `curl -N http://localhost:8787/api/demo-stream` with manual chunk-timing observation if Playwright fails |
| AC-PP2a: Mocked tool-call round trip validates schema (not observable) | Vitest, `tests/smoke/ai-tool-call.test.ts` test 1 (rung: unit) | Local Node environment — **yes** | `src/lib/ai-client.ts` createMockAIClient() + Vitest node env annotation | → Manual inspect of mock return value |
| AC-PP2b: Live tool-call passes real OpenRouter endpoint (not observable, residual) | Vitest, `tests/smoke/ai-tool-call.test.ts` test 2, gated on `OPENROUTER_API_KEY` (rung: integration) | OpenRouter API key — **pre-registered residual** (key is PO-provided secret) | `createOpenRouterClient()` factory + `test.skipIf` gate | → Mocked test (AC-PP2a) is the immediate evidence |
| AC-PP3: OpenAI-fallback adapter swap is zero-callsite (not observable) | Vitest, `tests/smoke/ai-tool-call.test.ts` test 3 (rung: unit) | Local Node environment — **yes** | `createOpenAIFallbackClient()` factory + same test assertions | → TypeScript compile check alone if Vitest skips |
| AC-PP4: D1 + better-auth responds on API route mount (not observable) | `playwright.wrangler.config.ts` test suite, `d1-auth-spike.spec.ts` (rung: integration) | `wrangler dev` + local miniflare D1 — **yes** (wrangler 4.110.0 + D1 binding in wrangler.jsonc) | `src/lib/auth.ts` + `src/routes/api/auth/[...all].ts` + `playwright.wrangler.config.ts` + `tests/e2e/d1-auth-spike.spec.ts` | → `curl http://localhost:8787/api/auth/session` manually |

**Constraint-resolutions:**

- **AC-PP1:** `constraint-resolution: po-accepted: wrangler dev environment confirmed available (wrangler 4.110.0 in devDependencies; workerd bundled)`
- **AC-PP2b (live smoke):** `constraint-resolution: proxy+deferral: cleared-by: tagged live-smoke run with OPENROUTER_API_KEY present (the mocked proof, AC-PP2a, is the immediate proxy evidence)`
- **AC-PP4:** `constraint-resolution: po-accepted: miniflare D1 via wrangler dev confirmed available; no external account credentials needed for local spike`

## Test / Verification Plan

### Automated checks

- **typecheck:** `pnpm typecheck` (tsc --noEmit) — zero errors required; `cloudflare:workers` and `@tanstack/ai` types must resolve cleanly.
- **unit tests (Vitest):** `pnpm test` — `tests/smoke/ai-tool-call.test.ts` must pass (tests 1 and 3); test 2 skipped if key absent; exit 0.
- **E2E / Workers proof tests (Playwright):** `pnpm exec playwright test --config playwright.wrangler.config.ts` — both `sse-streaming.spec.ts` and `d1-auth-spike.spec.ts` must pass.

### Interactive verification (human-in-the-loop)

**AC-PP1 — SSE chunks arrive progressively**
- **What to verify:** The demo streaming route emits five chunks separated by ~200ms delays (not a single buffered flush).
- **Platform & tool:** Web — `playwright.wrangler.config.ts` Playwright suite (automated evidence); or Claude_Browser for an interactive demonstration.
- **Steps:**
  1. Run `wrangler dev --port 8787` in the Waypoint root.
  2. Run `pnpm exec playwright test --config playwright.wrangler.config.ts tests/e2e/sse-streaming.spec.ts`.
  3. Alternatively: open Claude_Browser to `http://localhost:8787/api/demo-stream` and observe the progressive text appearance.
- **Evidence capture:** Playwright timing assertion passes (elapsed time ≥ 600ms); or Claude_Browser screenshot showing progressive text.
- **Pass criteria:** Response body contains five `data:` lines; elapsed time between first-byte and last-byte ≥ 600ms; HTTP 200; no workerd crash in the wrangler log.

No other AC in this slice requires interactive verification beyond the Playwright proofs — ACs PP2a, PP2b, PP3, PP4 are automated assertions.

## Risks / Watchouts

- **SSE under workerd may fail.** `toServerSentEventsResponse()` under the workerd runtime is inferred-not-documented. If the Workers runtime flushes the entire response buffer at once, AC-PP1 fails and the streaming architecture requires a shape-level discussion. Surface the failure immediately — do not add workarounds that hide it from the plan.
- **TanStack AI beta API surface.** `@tanstack/ai` is in beta. The `openRouterText()` API and the OpenAI-adapter interface may have changed between the shape's freshness research (July 10) and implement time. Resolve against the installed package's TypeScript types, not documentation assumptions. If the API surface has changed, update `src/lib/ai-client.ts` to match — the three proof goals (native round trip, fallback round trip, swap transparency) remain the same regardless of exact function names.
- **better-auth D1 adapter module path.** `better-auth/adapters/d1` is the documented import; the actual package may export it under a different path. Resolve at implement time from the installed package's `package.json` `exports` field.
- **`cloudflare:workers` env type in TypeScript.** The `import { env } from 'cloudflare:workers'` pattern gives `env` as `unknown` without a generated type file. The cast `(env as any).DB` in the auth route is acceptable for the spike; the `accounts-data-layer` slice will add `wrangler types` generation to provide the typed `Env` interface.
- **Wrangler dev port conflicts.** If port 8787 is in use, `playwright.wrangler.config.ts` will fail to start. Use `reuseExistingServer: !process.env.CI` to allow manual pre-start; document in the commit.
- **Pin-check after install.** Adding two new dependencies must not introduce any floating range. Re-run the pin-check script after `pnpm install` to confirm.

## Dependencies on Other Slices

- **foundation** (depends-on): The scaffold, `wrangler.jsonc`, pnpm setup, and test harnesses are the direct inputs. The Playwright `playwright.wrangler.config.ts` extends the pattern from `playwright.config.ts`.
- **accounts-data-layer** (enables): The D1 binding added here (`[[d1_databases]]` with `binding: "DB"`) is the same binding the accounts slice will use for its full schema. The per-request client creation pattern proven here is the architectural contract that accounts-data-layer inherits.
- **ai-gateway** (enables): `src/lib/ai-client.ts` establishes the adapter abstraction that the AI gateway slice will extend with quota enforcement, fallback chains, and instrumentation.

## Assumptions

All resolved autonomously per the autonomous override policy. Each records what was chosen and why.

1. **SSE response pattern → manual ReadableStream fallback if `toServerSentEventsResponse()` import is ambiguous.** The slice def mentions `toServerSentEventsResponse()` as the preferred API. If this function is not cleanly importable from `@tanstack/react-start/server` at implement time, the plan falls back to a `new Response(new ReadableStream({...}), { headers: { 'Content-Type': 'text/event-stream' } })` construction — which is the workerd-native equivalent and tests the same runtime behavior. The AC (chunks arrive progressively) does not depend on the helper function's existence. No user-observable consequence.

2. **Wrangler dev proof config → dedicated `playwright.wrangler.config.ts`.** The existing `playwright.config.ts` drives `pnpm dev` (the Vite dev server). The SSE and D1 proofs must run under `wrangler dev` (the Workers runtime). A second config file is the cleanest separation — it avoids coupling `pnpm dev` and `wrangler dev` into a single webServer entry, which would make both proof tests slower. No user-observable consequence.

3. **AI tool-call test environment → `// @vitest-environment node` per-file annotation.** The project's `vitest.config.ts` uses `jsdom` globally. Network calls and the `@tanstack/ai` package's internal `fetch` usage require the node environment. Per-file annotation is the correct narrow override rather than splitting into a second Vitest config. No user-observable consequence.

4. **D1 spike test approach → Playwright against `wrangler dev` rather than `@cloudflare/vitest-pool-workers`.** The slice defines the test as "automated test against the real local runtime (miniflare D1)". `@cloudflare/vitest-pool-workers` would provide in-process D1 testing but requires a new non-trivial config and is not in the confirmed stack. Playwright against `wrangler dev` exercises the real workerd runtime with the real miniflare D1, satisfies the proof requirement, and requires no new stack entry. If the `accounts-data-layer` slice needs in-process D1 unit tests, `@cloudflare/vitest-pool-workers` should be added to the stack at that point via shape. No user-observable consequence.

5. **D1 binding database_id → placeholder UUID for local proofs.** `wrangler dev` with miniflare does not require a real Cloudflare D1 database ID — the local runtime creates an ephemeral SQLite file regardless. The placeholder UUID `00000000-0000-0000-0000-000000000000` is valid for `wrangler dev` and will be replaced with the real ID (from `wrangler d1 create waypoint-dev`) when the first deploy is needed. No user-observable consequence.

6. **better-auth spike config → minimal (no OAuth plugins).** The platform proof only needs to verify mount + D1 read/write + no module-scope leak. Adding Google/GitHub OAuth plugins would require real client IDs and is the `accounts-data-layer` slice's job. The spike intentionally omits them. A GET to `/api/auth/session` on a fresh (unauthenticated) better-auth instance returns a valid 200 JSON response, which is sufficient to prove the mount and D1 round-trip. No user-observable consequence.

7. **`createOpenAIFallbackClient` test → mock-only in the adapter-swap test (test 3).** The adapter-swap test (AC-PP3) proves that the call-site code is identical between the native adapter and the OpenAI fallback adapter. Running test 3 live would require the same key as test 2 and would test the same OpenRouter endpoint — redundant evidence. The swap test uses the same mock infrastructure as test 1, substituting only the client factory. Live verification of the OpenAI fallback adapter is the residual cleared with the same `OPENROUTER_API_KEY` gate. No user-observable consequence.

8. **TanStack AI package name → `@tanstack/ai`.** The shape and slice documents consistently refer to "TanStack AI beta" and `openRouterText`. The npm package is assumed to be `@tanstack/ai`. If the package is named differently (e.g., `@tanstack/react-ai`) or has been restructured, resolve at implement time from `node_modules/@tanstack/`. The architectural goals (adapter abstraction, tool-call proof) do not depend on the exact package structure.

## Blockers

None. All AC environment dependencies are satisfiable locally (`wrangler dev`, miniflare D1, pre-installed Playwright browsers), or carry pre-registered constraint-resolutions (live OpenRouter smoke = residual, cleared on demand). No new stack entries are required; no PO decisions are outstanding for this slice.

## Freshness Research

The shape's freshness sweep (2026-07-10) covered the key facts for this slice:
- **TanStack AI beta / OpenRouter adapter tool-calling regression** (May 2026, reportedly fixed June 2026): the plan explicitly proofs both the native adapter and the OpenAI-baseURL fallback, so a regression at implement time only changes which adapter becomes the default — not whether the plan can deliver the AC.
- **better-auth >= 1.6.23** (CVE-2025-61928 patched): the plan pins to >= 1.6.23 and exact-pins at install time.
- **`@cloudflare/vite-plugin`** (not Nitro preset): confirmed already used in `vite.config.ts`; no new research needed.
- **workerd SSE streaming**: inferred-not-documented per shape — the only way to verify is to run it, which is exactly what this slice does.
- **D1 + better-auth on createAPIFileRoute**: the shape named this as one of three "sharp edges." No new documentation exists; the plan implements the known-correct pattern (per-request factory, `cloudflare:workers` env import) and proofs it.

No additional freshness research was conducted for this plan, as the shape's research is current and the plan's proof approach is specifically designed to replace documentation gaps with empirical evidence.

## Recommended Next Stage

- **Option A (default): implement platform-proofs** — The plan is complete, all ACs have verified resolution paths. Compact before implementing (`/compact` — state lives in the artifact files). The `wrangler dev` environment is available; `@tanstack/ai` and `better-auth` are ready to install.
- **Option B: plan accounts-data-layer** — Author the next slice's plan before coding if you prefer all plans written up front. Note that the D1 binding and better-auth patterns proven here directly inform that plan.
- **Option C: revisit slice** — Not indicated; no slice-boundary issues found. The scope is small and well-contained.
