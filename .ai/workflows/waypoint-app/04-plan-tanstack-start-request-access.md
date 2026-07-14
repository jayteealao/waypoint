---
schema: sdlc/v1
type: plan
slug: waypoint-app
slice-slug: tanstack-start-request-access
status: complete
stage-number: 4
created-at: "2026-07-14T11:55:25Z"
updated-at: "2026-07-14T11:55:25Z"
metric-files-to-touch: 9
metric-step-count: 7
has-blockers: false
revision-count: 0
revisions: []
tags: [tanstack, react-start, server-functions, tech-debt]
stack-source: confirmed
refs:
  index: 00-index.md
  plan-index: 04-plan.md
  slice-def: 03-slice-tanstack-start-request-access.md
  siblings: [04-plan-accounts-data-layer.md, 04-plan-ai-gateway.md]
  implement: 05-implement-tanstack-start-request-access.md
next-command: wf-verify
next-invocation: "/wf verify waypoint-app tanstack-start-request-access"
---

# Plan: TanStack Start request access (F1)

## The Plan
Nine files carry the same false note — *"TanStack Start v1.168.x does not expose `getWebRequest()`"* — and each hand-rolls a `createMiddleware({ type: 'request' })` shim to smuggle the raw `Request` into the server-function context. The premise is wrong for the installed version. Reading the installed source (`node_modules/@tanstack/start-server-core/dist/esm/request-response.js`) confirms `getRequest`, `getRequestHeader`, `getRequestHeaders`, `getCookie` are all exported and re-exported through `@tanstack/react-start/server`; `getWebRequest` was simply renamed `getRequest`. The fix is mechanical and behavior-preserving: rewrite the shared `withSession` middleware in each of the eight `src/server/*.ts` files to call `getRequest()` instead of destructuring `{ request }` from a request-type middleware, and inline `getRequest()` in the single-function `src/lib/get-session.ts` (dropping its middleware entirely). Auth semantics are untouched — `requireAuth`/`requireOwnership` in `src/lib/auth-guard.ts` keep their exact signatures.

The load-bearing decision is *keep the shared middleware, rewrite its body* — not mechanically inline `getRequest()` into all ~20 handlers. Inlining would multiply the `requireAuth` call across every function and worsen the duplication the slice exists to reduce; the shared `withSession` function-middleware is the idiomatic home for cross-cutting auth. The one deviation is `get-session.ts`, which has a single function that only needs request headers, so its one-line middleware earns deletion.

Top risk is low: `getRequest()` reads the request from a `node:async_hooks` `AsyncLocalStorage` populated by TanStack's own request handler, which only works when `nodejs_compat` is active. That flag is already set (`wrangler.jsonc`, compat date 2025-11-01), the app already runs on workerd, and Start's own request context depends on the same mechanism — so this is confirmed, not hoped. The existing seeded-session Playwright suite (green, `BETTER_AUTH_SECRET` present in `.dev.vars`) already drives authenticated routes through vite-dev/workerd end-to-end, exercising `getRequest()` in situ; `tsc --noEmit` catches the middleware-type change. No new harness, no new deferral.

## Current State
- **9 files** carry the workaround: `src/server/{ai,journeys,interview,quiz,roadmap,progress,adaptation,lessons}.ts` (each defines `const withSession = createMiddleware({ type: 'request' }).server(async ({ request, next }) => { const sessionData = await requireAuth(env, request); return next({ context: { session: sessionData } }) })`) and `src/lib/get-session.ts` (a `withRequest` variant injecting `{ request }` into context, then reading it in the handler).
- **False-premise comments** appear in `ai.ts` (L14–17), `journeys.ts` (L9–12, L19–21), and `get-session.ts` (L5–6). Grepping `getWebRequest` returns only these comment sites — no live call.
- **Installed API (verified in `node_modules`):** `getRequest()` → returns `getH3Event().req` (the raw `Request`); `getRequestHeaders()` → the request `Headers`. Both exported from `@tanstack/start-server-core` (`request-response.js` L54–60, barrel export L228) → re-exported by `@tanstack/react-start-server` (`export * from "@tanstack/start-server-core"`) → surfaced at `@tanstack/react-start/server`. Installed `@tanstack/react-start@1.168.27`.
- **Usage shape:** only `get-session.ts` reads `context.request` in a *handler*; all 8 server files use `request` solely inside the middleware and inject `session` into context. Handlers destructure `{ session }` only.
- **Runtime:** `wrangler.jsonc` sets `compatibility_flags: ["nodejs_compat"]`, `compatibility_date: "2025-11-01"` — `AsyncLocalStorage` fully available on workerd.

## Simplicity Ladder
- **Request access** → **rung 2 (native platform / framework primitive):** `getRequest()` from `@tanstack/react-start/server` — the framework's own request-access API. Replaces the hand-rolled `type: 'request'` middleware shim. This is the whole point of the slice; no lower rung applies because the capability *is* a framework primitive.
- **Cross-cutting auth** → **rung 3 (reuse as-is):** `requireAuth` / `requireOwnership` in `src/lib/auth-guard.ts` — reused unchanged. The shared `withSession` middleware is also reused; only its body is rewritten.
- **New capability code:** none. The slice net-removes code (each `withSession` shrinks; `get-session.ts`'s middleware is deleted). Ladder outcome: no rung-4 new code.

## Applied Learnings
- **User-memory note — TanStack "assume-missing" anti-pattern** (`~/.claude/.../memory/tanstack-assume-missing-antipattern.md`): "read node_modules source before working around any @tanstack API; in-code 'version lacks X' notes have been wrong." Applied directly — this slice *is* the corrective for exactly that anti-pattern, and the plan's API claims are grounded in the installed `request-response.js`, not recall (satisfies RIM-E3).
- No `.ai/solutions/INDEX.md` corpus exists in-repo and `.ai/sdlc-config.json` sets no `solutions.globalDir` → no other applicable learnings.
- **Repeat-deferral tripwire:** the slug's recurring runtime-evidence wall is `BETTER_AUTH_SECRET`-gated seeded-session Playwright. Every such entry in `00-index.md` is already **cleared** (`BETTER_AUTH_SECRET` present in `.dev.vars`). This slice's verification reuses that same green suite → the wall is already retired, not re-paid. No new harness required, no `harness-declined` needed.

## Likely Files / Areas to Touch
- `src/server/journeys.ts` — canonical `withSession`; rewrite body + delete false-premise comments (L9–12, L19–21).
- `src/server/ai.ts` — `withSession` rewrite + delete triage comment (L14–17).
- `src/server/interview.ts` — `withSession` rewrite (shared by 4 fns).
- `src/server/quiz.ts` — `withSession` rewrite (shared by 5 fns).
- `src/server/roadmap.ts` — `withSession` rewrite.
- `src/server/progress.ts` — `withSession` rewrite.
- `src/server/adaptation.ts` — `withSession` rewrite.
- `src/server/lessons.ts` — `withSession` rewrite.
- `src/lib/get-session.ts` — delete `withRequest` middleware; call `getRequest().headers` in the handler; delete comment (L5–6).
- `src/lib/auth-guard.ts` — **read-only reference**; signatures unchanged.

## Proposed Change Strategy
Standardize on the framework's request-access primitive with the smallest possible diff and zero behavior change.

**Per multi-function server file (`src/server/*.ts`):** replace
```ts
const withSession = createMiddleware({ type: 'request' }).server(
  async ({ request, next }) => {
    const sessionData = await requireAuth(env, request)
    return next({ context: { session: sessionData } })
  },
)
```
with
```ts
import { getRequest } from '@tanstack/react-start/server'
const withSession = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const sessionData = await requireAuth(env, getRequest())
    return next({ context: { session: sessionData } })
  },
)
```
The `.middleware([withSession])` chains and all handlers stay untouched (they only read `{ session }`).

**`src/lib/get-session.ts`:** drop the middleware; call the primitive inline —
```ts
import { getRequest } from '@tanstack/react-start/server'
export const getSession = createServerFn().handler(async () => {
  const auth = createAuth(env)
  const result = await auth.api.getSession({ headers: getRequest().headers })
  return result ?? null
})
```

**Middleware type:** switch `{ type: 'request' }` → `{ type: 'function' }` (the idiomatic type for server-function cross-cutting middleware). `getRequest()` resolves via `AsyncLocalStorage` in the server-function execution context regardless of middleware type, so a request-type middleware is no longer needed to obtain the request. The implementer confirms the exact `createMiddleware` type argument against `node_modules/@tanstack/start-client-core/dist/esm/createMiddleware.d.ts` at edit time (`MiddlewareType = 'request' | 'function'`).

**`requireAuth` signature:** kept as `requireAuth(env, request)` — do NOT refactor to accept headers. Rationale: smallest blast radius, no auth-semantics change (a slice hard-constraint), and `getRequest()` returns exactly the `Request` it expects.

**Comment hygiene:** replace each false-premise comment with a one-line accurate note (or delete). Post-change `grep getWebRequest src/` must return zero claims that the API is unavailable.

## Step-by-Step Plan
1. Rewrite `src/server/journeys.ts` `withSession` to the function-middleware + `getRequest()` shape; add the `getRequest` import; delete the false-premise comments (L9–12, L19–21).
2. Apply the identical `withSession` rewrite to `ai.ts`, `interview.ts`, `quiz.ts`, `roadmap.ts`, `progress.ts`, `adaptation.ts`, `lessons.ts` (add import, drop `{ request }` destructure + `type: 'request'`, delete any false-premise comment).
3. Rewrite `src/lib/get-session.ts`: delete `withRequest`, call `getRequest().headers` in the handler, add import, delete the L5–6 comment.
4. Run `pnpm typecheck` (`tsc --noEmit`) — primary gate for the middleware-type change; fix any residual `context` typing fallout (expected: none).
5. Run `pnpm lint` (`oxlint`) and `pnpm format:check` (`oxfmt`) — no new lint/format debt.
6. Run `pnpm test` (Vitest) — full smoke/unit suite must pass unchanged (behavior-preserving).
7. Run `pnpm test:e2e` (Playwright, seeded-session) with `BETTER_AUTH_SECRET` present — authenticated routes drive the rewritten `withSession` server functions through vite-dev/workerd; must pass unchanged. Final `grep getWebRequest src/` = no availability-denial comments (AC2).

## Verification Strategy
All four ACs are developer-facing regression/quality checks on a behavior-preserving refactor; every one is satisfiable in the target environment now (`BETTER_AUTH_SECRET` present, `nodejs_compat` on). No user-observable behavior changes, no live-outcome metric, no external service, no device, no deferral.

| AC | Tool / method + ladder rung | Environment need — satisfiable in target env? | What must be BUILT to make it verifiable | Fallback chain |
|----|------------------------------|-----------------------------------------------|------------------------------------------|----------------|
| AC1 — request obtained via `getRequest()`/`getRequestHeader()`, no `type:'request'` used to smuggle the request | Static grep (`grep -rn "type: 'request'" src/`) + `tsc --noEmit` (rung 2, framework-primitive) + Playwright e2e exercising the path (rung: runtime) | Local toolchain — yes; workerd via vite-dev — yes (nodejs_compat on) | Nothing new — existing seeded-session e2e already drives these fns | grep+typecheck alone if e2e infra down → but e2e is available |
| AC2 — no comment claims the API is unavailable | `grep -rn getWebRequest src/` returns no availability-denial (rung 1, static) | Local shell — yes | Nothing | none needed |
| AC3 — full test suite (Vitest + Playwright) + typecheck pass unchanged | `pnpm typecheck` + `pnpm test` + `pnpm test:e2e` (rung: runtime) | `BETTER_AUTH_SECRET` in `.dev.vars` for seeded-session e2e — **present** (cleared) | Nothing new — suites exist and are green | run Vitest + typecheck as proxy if e2e env regresses (would be a new deferral) |
| AC4 — every private-data server fn keeps auth, unchanged | Code review of unchanged `.middleware([withSession])` chains + `requireAuth` calls + auth-guard smoke (`tests/smoke/auth-guard.test.ts`) + e2e auth-redirect (rung: runtime) | Local + workerd — yes | Nothing new | auth-guard Vitest unit as proxy |

Per-AC constraint-resolution (force-scope rule):
- **AC3** — `constraint-resolution: po-accepted` is unnecessary; the only environment dependency (`BETTER_AUTH_SECRET` for seeded-session Playwright) is **already satisfied** (present in `.dev.vars`, cleared across prior slices in `00-index.md`). No wall on the critical path. If the secret were ever absent at verify, the pre-registered fallback is the already-cleared shared deferral entry — but it is not expected to trigger.
- **AC1/AC2/AC4** — no environment dependency (static + local runtime).

No mandated-mitigation ACs (this slice mandates no fallback/kill-switch). No outcome-metric ACs.

## Test / Verification Plan

### Automated checks
- **lint/typecheck:** `pnpm typecheck` (`tsc --noEmit`) is the primary gate — proves the request/function middleware-type change and context typing hold. `pnpm lint` (`oxlint`) + `pnpm format:check` (`oxfmt`) for style.
- **unit tests:** `pnpm test` (Vitest, `tests/smoke/**` + `src/**/*.test.ts`) — must pass unchanged. `tests/smoke/auth-guard.test.ts` directly covers `requireAuth`/`requireOwnership` (AC4).
- **integration/e2e:** `pnpm test:e2e` (Playwright) — seeded-session suite drives `/_authenticated/*` routes that call `listJourneys`, `getSession`, quiz/lesson/interview/progress server functions, exercising every rewritten `withSession` on workerd.

### Interactive verification (human-in-the-loop)
- **What to verify:** authenticated data flows (list journeys, load a lesson, run a quiz turn, load progress) still work after the middleware rewrite — i.e., `getRequest()` resolves the session identically to the old `{ request }` capture.
- **Platform & tool:** Web — in-repo **Playwright** suite (`stack.testing: [playwright]`), run via `pnpm test:e2e` against `pnpm vite dev` (workerd through `@cloudflare/vite-plugin`). This is the confirmed stack tooling; no new driver introduced.
- **Companion skills:** none required.
- **Steps:** (1) ensure `BETTER_AUTH_SECRET` + `OPENROUTER_API_KEY` in `.dev.vars`; (2) `pnpm test:e2e`; (3) confirm the seeded-session authenticated flows pass. For an ad-hoc manual pass, `pnpm dev` and sign in, then load a journey/lesson/quiz.
- **Evidence capture:** Playwright HTML report + pass/fail counts (per runtime-adapter web layout under `tests/e2e/`).
- **Pass criteria:** e2e suite pass count unchanged from pre-refactor baseline; no auth-redirect regressions; `grep getWebRequest src/` clean.

## Risks / Watchouts
- **`getRequest()` on workerd (low):** relies on `nodejs_compat`-backed `AsyncLocalStorage`. Confirmed on (`wrangler.jsonc`). Verify via the e2e run on vite-dev/workerd, not just Node.
- **Over-inlining (low):** do not inline `getRequest()` into every handler — keep the shared `withSession`. Only `get-session.ts` drops its middleware.
- **Middleware-type typing (low):** `request → function` could surface a context type error if a handler read `request`; verified none do (except get-session, which is rewritten). `tsc --noEmit` is the gate.
- **Comment drift (trivial):** ensure every false-premise comment is removed, not just the code — AC2 greps for it.

## Dependencies on Other Slices
- **`accounts-data-layer`** (implemented) — origin of the `withSession` pattern (`journeys.ts`, `get-session.ts`). Both files exist and are green; this slice rewrites them without touching data-layer semantics. See `04-plan-accounts-data-layer.md`.
- **`ai-gateway`** (implemented) — `src/server/ai.ts` quota surface uses the same pattern. See `04-plan-ai-gateway.md`.
- No dependency on other extension-round-2 slices; plannable and implementable independently.

## Assumptions
Autonomous implementation-detail decisions made in lieu of the discovery interview (this was run fully autonomously; each is `class: implementation-detail` — none change user-observable scope, a public API surface, persisted data shape, user-visible behavior, or add a migration, so none is intent-bearing). No `carried` intent-risk in `00-index.md` is touched (RIM-E3, the governing risk, is `adjudicated` and this plan *satisfies* it by reading installed source).

1. **Keep the shared `withSession` middleware; rewrite its body — do not inline `getRequest()` into every handler.** Why: inlining would duplicate `requireAuth` across ~20 handlers and worsen the duplication the slice targets; the shared function-middleware is the idiomatic home for cross-cutting auth. Directly follows the slice's own risk guidance ("choose the lower-boilerplate shape, not mechanically inline"). `class: implementation-detail`.
2. **`src/lib/get-session.ts` is the one exception — delete its `withRequest` middleware and call `getRequest().headers` inline.** Why: a single function that needs only headers; a one-line middleware there is pure overhead. `class: implementation-detail`.
3. **Switch middleware type `request` → `function` (explicit `{ type: 'function' }`).** Why: `getRequest()` resolves via `AsyncLocalStorage` in the server-fn context regardless of middleware type, so the request-type middleware is no longer needed; function middleware is idiomatic for server-fn auth. Implementer confirms the exact type arg against installed `createMiddleware.d.ts`. `class: implementation-detail`.
4. **Keep `requireAuth(env, request)` signature unchanged — pass `getRequest()`; do not refactor to accept headers.** Why: smallest blast radius, honors the slice's "no auth-semantics change" constraint, avoids touching `auth-guard.ts` and its callers. `class: implementation-detail`.
5. **Import from `@tanstack/react-start/server`** (not `@tanstack/start-server-core` directly). Why: matches the slice AC wording and the app's existing import surface; it re-exports the same symbols. `class: implementation-detail`.
6. **Verification uses the existing Vitest + seeded-session Playwright suites; no new test harness.** Why: behavior-preserving refactor already covered by green suites; `BETTER_AUTH_SECRET` is present so the seeded-session wall is already retired. `class: implementation-detail`.
7. **No UI / design-contract work.** Why: pure server-side refactor with zero visual surface; `stack.ui` is non-empty but this slice touches no component, so `02b`/`02c` design canon is N/A. `class: implementation-detail`.

## Blockers
- None. All ACs satisfiable in the target environment; no unresolved tooling or credential wall.

## Freshness Research
- **`@tanstack/react-start@1.168.27` request-access API (installed-source read, 2026-07-14):** `getRequest`, `getRequestHeader`, `getRequestHeaders`, `getCookie`, `getRequestHost`, `getRequestIP`, `getRequestUrl` exported from `@tanstack/start-server-core` (`dist/esm/request-response.js` L228) and re-exported via `@tanstack/react-start-server` → `@tanstack/react-start/server`. `getRequest()` = `getH3Event().req`, backed by a `node:async_hooks` `AsyncLocalStorage`. Takeaway: the slice premise is confirmed correct against the *installed* version — `getWebRequest` was renamed `getRequest`; the workaround is unnecessary. Source: `node_modules/@tanstack/start-server-core/dist/esm/request-response.js`, `.../createStartHandler.d.ts` L30 (documents `getRequest()` usage).
- **`createMiddleware` types (installed-source read):** `MiddlewareType = 'request' | 'function'`; `FunctionMiddleware` exposes `.server()`. Source: `node_modules/@tanstack/start-client-core/dist/esm/createMiddleware.d.ts`. Takeaway: `{ type: 'function' }` is a valid, idiomatic middleware for server functions and supports `.server()`.
- **Workerd `AsyncLocalStorage`:** available under `nodejs_compat` (set in `wrangler.jsonc`, compat date 2025-11-01). Takeaway: no runtime blocker for `getRequest()` on the deploy target; already exercised by Start's own request context on workerd (platform-proofs slice).

## Recommended Next Stage
- **Option A (default):** `/wf implement waypoint-app tanstack-start-request-access` — plan is complete, mechanical, and behavior-preserving; ready to execute. Consider `/compact` first (planning research is noise for implementation; state lives in artifact files).
