---
schema: sdlc/v1
type: slice
slug: waypoint-app
slice-slug: tanstack-start-request-access
status: complete
stage-number: 3
created-at: "2026-07-12T11:39:46Z"
updated-at: "2026-07-14T12:18:24Z"
complexity: s
depends-on: [accounts-data-layer, ai-gateway]
source: extension
source-ref: ".ai/workflows/discover-tanstack-usage-audit/01-discover.md (F1)"
extension-round: 2
tags: [tanstack, react-start, server-functions, tech-debt]
refs:
  index: 00-index.md
  slice-index: 03-slice.md
  source: ".ai/workflows/discover-tanstack-usage-audit/01-discover.md"
  plan: 04-plan-tanstack-start-request-access.md
  implement: 05-implement-tanstack-start-request-access.md
---

# Slice: TanStack Start request access (F1)

## Goal
Replace the per-file `createMiddleware({ type: 'request' })` "withSession" workaround with the request-access API that actually ships in the installed TanStack Start — `getRequest()` / `getRequestHeader()` from `@tanstack/react-start/server` — and remove the false-premise notes that claim it doesn't exist.

## Why This Slice Exists
The discover audit (F1) found that **~9 files** carry the same note — *"TanStack Start v1.168.x does not expose `getWebRequest()`"* — and each hand-rolls a `type: 'request'` middleware to capture the `Request` and inject the session. That premise is **wrong for the installed version**: `getRequest`, `getRequestHeader`, `getRequestHeaders`, `getCookie`, etc. are all exported from `@tanstack/start-server-core` and re-exported through `@tanstack/react-start/server` (verified in `node_modules` and confirmed by the `start-core-server-functions` skill — `getWebRequest` was simply renamed `getRequest`). This slice removes the misconception and its boilerplate, standardizing on the real API.

## Scope
- **In:**
  - Files carrying the workaround/note: `src/server/ai.ts`, `src/server/journeys.ts`, `src/server/interview.ts`, `src/server/quiz.ts`, `src/server/roadmap.ts`, `src/server/progress.ts`, `src/server/adaptation.ts`, `src/server/lessons.ts`, `src/lib/get-session.ts`.
  - Decide per-file between (a) calling `getRequest()` directly inside the handler, or (b) **keeping a middleware for cross-cutting auth** but rewriting it to use `getRequest()` and deleting the false-premise comment. (Middleware-based auth is idiomatic; the fix is the wrong-premise + boilerplate, not the middleware pattern itself.)
  - Remove/replace all "getWebRequest does not exist" comments so the codebase stops propagating the misconception to future slices.
- **Out:**
  - No change to auth *semantics* — every server function that touches private data keeps its handler/middleware auth (the audit confirmed this is secure; do not weaken it).
  - No data-layer, router, or AI-gateway changes (separate slices).

## Acceptance Criteria
- Given any server function that needs the request, When it runs, Then it obtains the request via `getRequest()`/`getRequestHeader()` from `@tanstack/react-start/server` (directly or inside a single shared auth middleware), with no `createMiddleware({ type: 'request' })` used solely to smuggle the request in.
- Given the codebase, When grepped for "getWebRequest", Then no comment claims the API is unavailable in the installed version.
- Given the full test suite (Vitest + Playwright) and typecheck, When run after the change, Then they pass unchanged (behavior-preserving refactor).
- Given every private-data server function, When reviewed, Then auth enforcement is present and unchanged.

## Dependencies on Other Slices
- `accounts-data-layer`: origin of the `withSession` pattern (`journeys.ts`, `get-session.ts`) this slice rewrites.
- `ai-gateway`: `src/server/ai.ts` quota surface uses the same pattern.
- (No dependency on the other extension-round-2 slices — can be planned independently.)

## Risks
- A shared auth middleware may still be the cleanest home for `requireAuth`; over-eager inlining of `getRequest()` into every handler could *increase* duplication. Plan should choose the lower-boilerplate shape, not mechanically inline.
- `getRequest()` relies on Start's async request context — confirm it resolves correctly on `workerd`/Cloudflare (the deploy target) during plan/verify, not just in Node tests.
