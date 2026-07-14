---
schema: sdlc/v1
type: plan
slug: waypoint-app
slice-slug: tanstack-router-typed-context
status: complete
stage-number: 4
created-at: "2026-07-14T14:20:06Z"
updated-at: "2026-07-14T14:26:42Z"
metric-files-to-touch: 4
metric-step-count: 6
has-blockers: false
revision-count: 0
revisions: []
tags: [tanstack, react-router, type-safety, tech-debt]
stack-source: confirmed
refs:
  index: 00-index.md
  plan-index: 04-plan.md
  slice-def: 03-slice-tanstack-router-typed-context.md
  siblings: [04-plan-tanstack-data-layer-unification.md]
  implement: 05-implement-tanstack-router-typed-context.md
next-command: wf-implement
next-invocation: "/wf implement waypoint-app tanstack-router-typed-context"
---

# Plan: TanStack Router typed context (F6)

## The Plan
The root route hands `auth` to every child through `beforeLoad`, but the type never rides along — so `_authenticated.tsx` and `sign-in.tsx` each reach into `context.auth` through a hand-written `context as { auth?: … }` cast. This plan replaces plain `createRootRoute` with the framework's own dependency-injection primitive, `createRootRouteWithContext<RouterContext>()`, so the `auth` field is typed at every `beforeLoad`/`loader` and the two casts delete cleanly. Four files, all modified, no new files, no new dependency.

The one setup hazard is real and confirmed against installed source, not memory (RIM-E3): once the root context type is concrete, `createRouter` makes its `context` option **required** — omitting it fails typecheck. So `getRouter()` must seed an initial `context: { auth: null }`; the root `beforeLoad` overwrites it with the real session on every navigation. The change sits on the root route (every navigation), so the load-bearing verification is behavioral parity — the existing seeded-session auth-redirect suite must stay green and hydration must not mismatch (RIM-E6, adjudicated low-risk, typing-only). The `src/server/*.ts` `context as { session }` casts look similar but belong to a different DI chain (server-function middleware) and are explicitly out of scope.

## Current State
- `src/routes/__root.tsx` uses `createRootRoute({ beforeLoad: async () => ({ auth: await getSession() }) })`. The context type is never declared, so it is inferred loosely and does not flow to children.
- `src/router.tsx` calls `createTanStackRouter({ routeTree, … })` with **no** `context` option (legal today because the root context type is unconstrained).
- Two route guards read the context through a cast:
  - `src/routes/_authenticated.tsx:13` — `const auth = (context as { auth?: { session: unknown } | null }).auth`
  - `src/routes/sign-in.tsx:9` — same cast on the reverse (already-signed-in → `/`) redirect.
- `src/lib/get-session.ts` — `getSession` is a `createServerFn().handler` returning `result ?? null` (i.e. `{ session, user } | null`). This is the exact type `context.auth` should carry.

**Installed-source verification (RIM-E3 mandate):**
- `node_modules/@tanstack/react-router/dist/esm/route.d.ts:96` — `createRootRouteWithContext<TRouterContext extends {}>()` returns the route factory; options are optional, so the `beforeLoad` stays as-is.
- `node_modules/@tanstack/router-core/dist/esm/router.d.ts:461-465` — `RouterContextOptions<TRouteTree>` is `AnyContext extends InferRouterContext ? { context?: … } : { context: … }`. A concrete context type lands in the **required** branch → `getRouter()` MUST pass `context`. This is the source-of-truth for the initial-context step and closes RIM-E6's "missing initial context is a common setup error" hazard.

## Simplicity Ladder
- **Typed router context DI → rung 2 (native platform / framework primitive).** `createRootRouteWithContext<RouterContext>()` is TanStack Router's intended, documented DI extension point (the `router-core-type-safety` and `router-core-auth-and-guards` skills prescribe exactly this shape). No new code beyond wiring the framework primitive; the two casts are *removed*, not replaced with new abstraction.
- **RouterContext type → rung 1 (language built-in).** Derived with `Awaited<ReturnType<typeof getSession>>` — pure TypeScript utility types over the existing session function; no hand-authored duplicate of the session shape that could drift.

## Applied Learnings
- `.ai/workflows/discover-tanstack-usage-audit/01-discover.md` (F6, the slice's source) + memory `tanstack-assume-missing-antipattern` — **Learning:** Waypoint has a recurring habit of hand-rolling around TanStack APIs assumed missing, instead of reading installed source. **What this plan does differently:** the initial-context requirement and the `createRootRouteWithContext` signature are both read from `node_modules/@tanstack/*/dist/esm/*.d.ts` and cited inline above; no step rests on a recalled API shape, and no `as any`/`@ts-ignore` is introduced (the whole point is to *delete* casts).
- **Repeat-deferral tripwire:** this slice's AC3 verification names the seeded-session (BETTER_AUTH_SECRET) dependency that earlier slices deferred on (AC-ADL1/5 and successors). That wall is already **cleared** — the secret is present in `.dev.vars` and the `tests/e2e/auth-flow.spec.ts` seeded-session harness already exists and passes. No wall is re-paid and no new harness is scoped: the AC verifies now on the existing infrastructure.

## Likely Files / Areas to Touch
- `src/routes/__root.tsx` (modified) — swap to `createRootRouteWithContext<RouterContext>()`; declare and export `RouterContext`.
- `src/router.tsx` (modified) — import the `RouterContext` type; pass the now-required initial `context: { auth: null }`.
- `src/routes/_authenticated.tsx` (modified) — delete the cast; destructure typed `context.auth`.
- `src/routes/sign-in.tsx` (modified) — delete the cast; destructure typed `context.auth`.
- **Out of scope (do NOT touch):** every `src/server/*.ts` `context as { session }` cast — those are `createServerFn`/`createMiddleware` context, a separate DI chain the slice explicitly excludes.

## Proposed Change Strategy
Type-then-consume, smallest surface. Declare `RouterContext` once at the root route where the context is produced, export it, seed the router with the type-required initial value, then delete the two now-unnecessary casts. No behavior changes — the auth mechanism (better-auth session load in the root `beforeLoad`) is untouched; only the type flows. `RouterContext` lives in `__root.tsx` (dependency flows `router.tsx → __root.tsx`, never the reverse — no import cycle) rather than a new shared module, keeping blast radius to zero new files.

## Step-by-Step Plan
1. In `src/routes/__root.tsx`: add `export type RouterContext = { auth: Awaited<ReturnType<typeof getSession>> }` (import `getSession` as a type; the value import already exists). Change the import `createRootRoute` → `createRootRouteWithContext`, and `createRootRoute({…})` → `createRootRouteWithContext<RouterContext>()({…})`. Leave `beforeLoad`, `head`, and `shellComponent` unchanged.
2. In `src/router.tsx`: `import type { RouterContext } from './routes/__root'` and add `context: { auth: null } satisfies RouterContext,` as the first option to `createTanStackRouter({ … })`. (Required per `router-core/dist/esm/router.d.ts:463-464` for a concrete context type.)
3. In `src/routes/_authenticated.tsx`: replace the cast line with `const { auth } = context`. The `if (!auth?.session)` redirect logic is unchanged.
4. In `src/routes/sign-in.tsx`: replace the cast line with `const { auth } = context`. The `if (auth?.session)` reverse-redirect is unchanged.
5. Run `pnpm typecheck` (`tsc --noEmit`) — proves AC1 (typed `context.auth`, no cast) and AC2 (initial context matches; a missing/mismatched seed fails here) and confirms no new `as`/`any`.
6. Run the auth-redirect verification (AC3) — the seeded-session Playwright suite (`tests/e2e/auth-flow.spec.ts`) plus a manual hydration smoke on `pnpm dev`; behavior must be byte-for-byte the same as before.

## Verification Strategy

| AC | Tool / method + ladder rung | Environment need — satisfiable in target env? | What must be BUILT to make it verifiable | Fallback chain |
|----|------------------------------|-----------------------------------------------|------------------------------------------|----------------|
| AC1 — `context.auth` typed, no cast, typecheck passes | `tsc --noEmit` (static/typecheck rung) | Node + pnpm toolchain — yes, present | Nothing — existing typecheck script | grep assertion that no `context as` remains in the two route files |
| AC2 — root uses `createRootRouteWithContext` + router seeded with matching initial context | `tsc --noEmit` + source grep (static rung) | same — yes | Nothing — the type system enforces the match (concrete context ⇒ required `context` option) | manual read of `__root.tsx` + `router.tsx` |
| AC3 — auth-gated navigation (sign-in redirect via `_authenticated`) behaves exactly as before | in-repo Playwright seeded-session suite (runtime rung) | Chromium + `BETTER_AUTH_SECRET` in `.dev.vars` — **yes, secret present (deferral cleared)** | Nothing new — `tests/e2e/auth-flow.spec.ts` already exercises unauthenticated `/account`→`/sign-in` and seeded-session gates | signed-out Playwright case (always-run, no secret) → manual `pnpm dev` walk-through → pre-registered deferral (not needed) |

**Per-AC constraint resolution:**
- AC3 — `constraint-resolution: prerequisite-slice: none-needed` — the seeded-session harness (`tests/e2e/auth-flow.spec.ts`) and its `BETTER_AUTH_SECRET` credential already exist and pass in the target env (the earlier AC-ADL1/5 deferral is cleared). No harness to scope, no wall to re-pay.

No user-observable AC depends on an unresolved environment wall; the force-scope hard gate is satisfied. No outcome-metric AC. No shape-mandated mitigation in this slice (pure typing/DI change — nothing to fault-inject).

## Test / Verification Plan

### Automated checks
- **lint/typecheck:** `pnpm typecheck` (primary gate — carries AC1 + AC2) and `pnpm lint` (oxlint).
- **unit tests:** `pnpm test` (Vitest) — no new units needed; run the suite to confirm no regression.
- **integration/E2E:** `pnpm test:e2e` scoped to `auth-flow.spec.ts` (carries AC3).

### Interactive verification (human-in-the-loop)
- **What to verify:** (a) a signed-out visit to an `/_authenticated` child (e.g. `/account`) redirects to `/sign-in`; (b) a signed-in visit to `/sign-in` redirects to `/`; (c) the root document server-renders and hydrates with no console hydration mismatch after the context change (RIM-E6).
- **Platform & tool:** Web — in-repo Playwright suite, `tests/e2e/auth-flow.spec.ts` (seeded session). Ad-hoc hydration check via the dev server.
- **Companion skills:** `verify` / `run` (from `stack.available-skills`) to drive the app.
- **Steps:**
  1. `pnpm typecheck` — must pass with zero errors and zero remaining `context as` casts in the two route files.
  2. `pnpm test:e2e tests/e2e/auth-flow.spec.ts` — unauthenticated redirect + seeded-session gate must pass.
  3. `pnpm dev`, open `/` signed-out (expect `/sign-in`), sign in, revisit `/sign-in` (expect `/`); watch the browser console for hydration warnings.
- **Evidence capture:** Playwright HTML report + a dev-server console screenshot showing no hydration mismatch.
- **Pass criteria:** all auth-flow tests green; redirect behavior identical to pre-change; no hydration warning in console.

## Risks / Watchouts
- **Required initial context (medium, mitigated):** concrete context type makes `createRouter`'s `context` mandatory (`router-core/dist/esm/router.d.ts:463-464`). Step 2 supplies `{ auth: null }`; typecheck (AC2) is the guard.
- **Root-route blast radius (low, RIM-E6):** every navigation runs the root `beforeLoad`. Change is typing-only; AC3 + hydration smoke are the parity proof before commit.
- **Scope bleed (low):** the `src/server/*.ts` `context as { session }` casts are a *different* context (server-fn middleware). Leave them untouched — they are explicitly out of this slice's scope.
- **Import direction:** `RouterContext` is exported from `__root.tsx` and imported (type-only) by `router.tsx`; dependency flows one way, so no cycle is introduced.

## Dependencies on Other Slices
- **`foundation`** — owns `__root.tsx` / `router.tsx` (both already implemented). No coordination needed; those files are stable.
- **`accounts-data-layer`** — owns the `_authenticated` guard and the session shape `RouterContext` carries. This plan consumes that shape via `getSession`'s return type; no change to it.
- **`tanstack-data-layer-unification`** (sibling, later) — if it adds a `queryClient`/collection handle to router context, it should **extend** `RouterContext` rather than redefine it. Land this slice first (smaller) so the data layer builds on an already-typed context — matches RIM-E6's adjudicated sequencing.

## Assumptions
Recorded per the autonomous-override policy (each is an implementation-detail decision, `class: implementation-detail` — none touches user-observable scope, a public contract, persisted data, or a migration):
- **RouterContext type shape** — `{ auth: Awaited<ReturnType<typeof getSession>> }`, deriving the field from `getSession`'s return rather than re-declaring `{ session, user } | null`. *Why:* single source of truth; `getSession` already returns `… | null`, so no separate `| null` is needed and the type can't drift from the function. Least-code option that satisfies AC1.
- **Where RouterContext lives** — exported from `src/routes/__root.tsx`, imported type-only into `src/router.tsx`. *Why:* zero new files (smallest blast radius); dependency flows `router → __root` only, so no import cycle. A dedicated `src/lib/router-context.ts` was considered and rejected as unnecessary indirection for a one-line type.
- **Initial context seed value** — `context: { auth: null } satisfies RouterContext` in `getRouter()`. *Why:* the root `beforeLoad` populates the real session on every navigation (including initial SSR), so the seed only needs to type-check and represent the pre-load "no session yet" state; `null` is the honest and valid initial value. Required by the installed `RouterContextOptions` type, verified above.
- **Cast-removal form** — `const { auth } = context` in both guard files. *Why:* minimal diff; the downstream `auth?.session` logic is unchanged, preserving behavior for AC3.
- **Server-middleware casts left untouched** — the ~20 `context as { session }` in `src/server/*.ts` are out of scope. *Why:* they are `createServerFn`/`createMiddleware` context, not router context; the slice Scope (Out) excludes the auth mechanism. Retyping them would broaden scope beyond the slice.

## Blockers
- None. No user-observable AC depends on an unresolved environment wall; the seeded-session credential and E2E harness AC3 needs are already present and passing. Plan status: complete, has-blockers: false.

## Freshness Research
- **Installed source read (authoritative, over web):** `@tanstack/react-router` `route.d.ts` and `@tanstack/router-core` `router.d.ts` in `node_modules` — the `createRootRouteWithContext` signature and the conditional-required `context` option were read directly from the pinned installed versions (RIM-E3), which supersedes remembered API shapes and general web docs for a pre-1.0 package. Takeaway: the required-initial-context behavior is a type-level fact in this exact installed version, not a version-dependent guess.
- **First-party guidance:** the `router-core-type-safety` and `router-core-auth-and-guards` TanStack skills (installed in `.claude/skills/`) document `createRootRouteWithContext<RouterContext>()` as the intended DI shape and the "never cast, never annotate inferred values" philosophy — this plan is the idiomatic realization of both.

## Recommended Next Stage
- **Option A (default):** `/wf implement waypoint-app tanstack-router-typed-context` — the plan is execution-ready; 4 modified files, no new dependency, typecheck is the primary gate. Consider `/compact` first — planning research is noise for implementation; workflow state lives in the artifacts.
