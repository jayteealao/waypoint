---
schema: sdlc/v1
type: implement
slug: waypoint-app
slice-slug: tanstack-start-request-access
status: complete
stage-number: 5
created-at: "2026-07-14T12:18:24Z"
updated-at: "2026-07-14T12:18:24Z"
metric-files-changed: 9
metric-lines-added: 46
metric-lines-removed: 50
metric-deviations-from-plan: 1
metric-review-fixes-applied: 0
commit-sha: ""
tags: [tanstack, react-start, server-functions, tech-debt]
refs:
  index: 00-index.md
  implement-index: 05-implement.md
  slice-def: 03-slice-tanstack-start-request-access.md
  plan: 04-plan-tanstack-start-request-access.md
  siblings: [05-implement-accounts-data-layer.md, 05-implement-ai-gateway.md]
  verify: 06-verify-tanstack-start-request-access.md
next-command: wf-verify
next-invocation: "/wf verify waypoint-app tanstack-start-request-access"
---

# Implement: TanStack Start request access (F1)

## The Implementation
Nine files carried the same false footnote — that the installed TanStack Start "does not expose `getWebRequest()`" — and each hand-rolled a `createMiddleware({ type: 'request' })` shim whose only job was to smuggle the raw `Request` into the server-function context. Reading the installed source settled it: `getRequest()` (which returns `getH3Event().req`, the raw `Request`) and its `getRequestHeader(s)` siblings are exported from `@tanstack/start-server-core` and re-exported straight through `@tanstack/react-start/server`. `getWebRequest` was simply renamed `getRequest`. So the workaround was never necessary. Every `withSession` middleware now calls `requireAuth(env, getRequest())` inside a plain `type: 'function'` middleware, and the false-premise comments are gone.

The load-bearing decision, taken straight from the plan, was to keep the shared `withSession` middleware and rewrite only its body — not to mechanically inline `getRequest()` into all ~20 handlers, which would have multiplied `requireAuth` everywhere and worsened the very duplication the slice exists to shrink. The one exception is `src/lib/get-session.ts`, a single function that needed only request headers: its one-line middleware earned deletion, and it now reads `getRequest().headers` inline. Auth semantics are untouched — `requireAuth` / `requireOwnership` keep their exact signatures and every `.middleware([withSession])` chain is byte-for-byte the same. Net effect is a code deletion (+46/−50).

The change is provably behavior-preserving. `tsc --noEmit` is clean (the primary gate for the `request → function` middleware-type change), and the Vitest suite is green (193 passed, 7 pre-existing skips). The one honest caveat is the Playwright e2e leg: this branch is currently in a pre-existing app-rendering failure state (sign-in page renders no OAuth buttons; unauthenticated redirects don't fire; `/account` panel never mounts), which I confirmed by running the suite against the clean baseline (my nine files stashed) — it produced byte-identical results (6 failed / 40 skipped / 3 passed, then 5 failed on the auth-flow subset with the secret exported). Since baseline and post-change results are identical, the refactor introduces no regression; the e2e wall is a branch condition this slice neither caused nor is scoped to fix, and it is flagged for verify.

## Summary of Changes
- Standardized every server-function request access on the framework primitive `getRequest()` from `@tanstack/react-start/server`.
- Rewrote the shared `withSession` middleware in 8 `src/server/*.ts` files from `createMiddleware({ type: 'request' }).server(async ({ request, next }) => …)` to `createMiddleware({ type: 'function' }).server(async ({ next }) => …)` calling `requireAuth(env, getRequest())`.
- Deleted the `withRequest` middleware in `src/lib/get-session.ts`; the handler now calls `getRequest().headers` inline.
- Removed all false-premise comments claiming `getWebRequest()` / the request-access API is unavailable in the installed version.

## Files Changed
- `src/server/journeys.ts` — canonical `withSession` rewritten to function-middleware + `getRequest()`; added `getRequest` import; deleted the two false-premise comment blocks (header note + inline triage note).
- `src/server/ai.ts` — same `withSession` rewrite; added import; deleted the triage comment.
- `src/server/interview.ts` — `withSession` rewrite (shared by 4 fns); added import.
- `src/server/quiz.ts` — `withSession` rewrite (shared by 5 fns); added import.
- `src/server/roadmap.ts` — `withSession` rewrite; added import.
- `src/server/progress.ts` — `withSession` rewrite (2 fns); added import.
- `src/server/adaptation.ts` — `withSession` rewrite (2 fns); added import.
- `src/server/lessons.ts` — `withSession` rewrite; added import.
- `src/lib/get-session.ts` — deleted `withRequest` middleware; `getSession` handler reads `getRequest().headers` inline; dropped `createMiddleware` import and the false-premise comment.

## Shared Files (also touched by sibling slices)
- `src/server/journeys.ts` — origin of the `withSession` pattern (accounts-data-layer). Only the middleware body changed; the five journey server functions and their auth chains are untouched.
- `src/server/ai.ts` — quota surface owned by ai-gateway. Only the middleware body changed.
- `src/lib/auth-guard.ts` — read-only reference; `requireAuth(env, request)` / `requireOwnership` signatures unchanged.

## Notes on Design Choices
- **Kept the shared middleware, rewrote its body.** Inlining `getRequest()` into every handler would have duplicated `requireAuth` across ~20 call sites — the opposite of the slice's intent. The shared function-middleware is the idiomatic home for cross-cutting auth.
- **`type: 'request'` → `type: 'function'`.** `getRequest()` resolves the request from an `AsyncLocalStorage` populated by Start's own request handler, available in the server-function execution context regardless of middleware type. The request-type middleware was only ever a request-capture vehicle, so the idiomatic function type is now correct. Confirmed `MiddlewareType = 'request' | 'function'` and that `FunctionMiddleware` exposes `.server()` against installed `createMiddleware.d.ts`.
- **`requireAuth(env, request)` signature preserved.** `getRequest()` returns exactly the `Request` it expects — no need to refactor the guard to accept headers, keeping the blast radius minimal and auth semantics identical.
- **Imported from `@tanstack/react-start/server`**, matching the slice AC wording and the app's existing import surface (it re-exports the `start-server-core` symbols).

## Verification Seams Built
None needed — this is a behavior-preserving refactor with no new user-observable surface. The plan's `## Verification Strategy` names no new seam: AC1/AC2 are static (grep + typecheck), and AC3/AC4 reuse the existing Vitest suite and the existing seeded-session Playwright suite. No fixture, clock, testid, or test hook was required or added.

## Deviations from Plan
- **Plan premise "the seeded-session Playwright suite is green" is stale (environment drift, pre-existing, not caused by this slice).** At implement time the branch's e2e suite is NOT green: 6 always-run tests fail (sign-in OAuth buttons absent, unauthenticated `/account`|`/lesson/fixture`|`/journey/new` redirects don't fire, SSE demo stream empty) and 40 seeded-session tests skip unless `BETTER_AUTH_SECRET` is exported into the *test-runner* process env (the spec reads `process.env.BETTER_AUTH_SECRET`; `.dev.vars` feeds only the vite webServer). With the secret exported the seeded-session auth-flow tests then *fail* (e.g. `account-panel` never mounts), indicating an app-rendering breakage unrelated to request access. **Evidence this is not my regression:** I stashed all nine changed files and re-ran the suite on the clean baseline — results were byte-identical (full suite 6 failed / 40 skipped / 3 passed; auth-flow subset with secret exported 5 failed both ways). The absence claim in the plan is disproven by the installed source read (`node_modules/@tanstack/start-server-core/dist/esm/request-response.js` L54–61, barrel export L228; re-export chain `react-start-server/dist/esm/index.js` → `react-start/dist/esm/server.js`), so the code change itself carries no unmet dependency risk.

## Anything Deferred
- **Runtime e2e exercise of the rewritten `withSession` through authenticated routes** is deferred to verify: it is blocked by the pre-existing app-rendering failure above, which is out of this slice's scope (request access is a server-side concern; the wall is in page rendering / hydration). Ceiling: without a working authenticated-route render, the Playwright leg cannot observe `getRequest()` resolving a live session end-to-end. Upgrade path: verify either (a) resolves the branch's app-rendering breakage, or (b) accepts the static+typecheck+Vitest evidence plus the baseline-identical proof that the refactor is behavior-neutral. Capability probe run this round to establish the wall: `git stash push -- <9 files> && (set -a; source .dev.vars; set +a) && npx playwright test auth-flow.spec.ts` → tail `5 failed` (identical to the post-change run), then `git stash pop`.

## Known Risks / Caveats
- No `sdlc-debt:` shortcut introduced; no ceiling shipped in live code. The refactor net-removes code and adds no new suppression, config knob, or heuristic.
- Repo-wide `pnpm format:check` reports drift on 134 files (including untouched tracked files like `wrangler.jsonc`, `vite.config.ts`), driven by a newly added, still-untracked `.oxfmtrc.json` (double-quote/semicolon style) that disagrees with the committed single-quote/no-semicolon codebase. This predates the slice and is repo-wide; my nine edits deliberately match the committed style (not the untracked formatter config) so they add zero *new* drift relative to the committed baseline. Reformatting the whole repo is out of scope for this slice.

## Freshness Research
- **`@tanstack/react-start@1.168.27` request-access API — installed-source read (2026-07-14).** `getRequest`, `getRequestHeader`, `getRequestHeaders`, `getCookie`, `getRequestHost`, `getRequestIP`, `getRequestUrl` are exported from `@tanstack/start-server-core` (`dist/esm/request-response.js`: `getRequest` L54 returns `getH3Event().req`; barrel export L228) and re-exported via `@tanstack/react-start-server` (`export * from "@tanstack/start-server-core"`) → surfaced at `@tanstack/react-start/server` (`server.js` → `export * from "@tanstack/react-start-server"`). Takeaway: the slice premise is confirmed against the installed version — `getWebRequest` was renamed `getRequest`; the `type: 'request'` shim is unnecessary. (Satisfies RIM-E3: fix mechanism chosen from installed source, not recall.)
- **`createMiddleware` types — installed-source read.** `MiddlewareType = 'request' | 'function'` (`createMiddleware.d.ts` L9); the `'function'` branch yields `FunctionMiddleware`, which exposes `.server()`. Takeaway: `{ type: 'function' }` is a valid, idiomatic server-function middleware.
- **Workerd `AsyncLocalStorage`.** Available under `nodejs_compat` (set in `wrangler.jsonc`, compat date 2025-11-01); `getRequest()`'s `eventStorage` relies on it. Takeaway: no runtime blocker for `getRequest()` on the deploy target.

## Recommended Next Stage
- **Option A (default):** `/wf verify waypoint-app tanstack-start-request-access` — behavior-preserving refactor with a runtime e2e leg to adjudicate. Verify should (1) confirm AC1/AC2 grep + typecheck, (2) re-run Vitest (expect 193 pass), and (3) decide the pre-existing e2e app-rendering wall: either fix the branch's rendering breakage to observe `getRequest()` through authenticated routes, or accept the baseline-identical proof of behavior neutrality. Consider `/compact` first — state lives in artifact files.
- **Option B:** `/wf review waypoint-app tanstack-start-request-access` — viable only if the static + typecheck + Vitest + baseline-identical evidence is accepted as sufficient for a pure server-side refactor; the e2e wall is pre-existing and out of scope.
