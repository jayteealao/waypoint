---
schema: sdlc/v1
type: implement
slug: waypoint-app
slice-slug: tanstack-router-typed-context
status: complete
stage-number: 5
created-at: "2026-07-14T14:26:42Z"
updated-at: "2026-07-14T14:26:42Z"
metric-files-changed: 4
metric-lines-added: 13
metric-lines-removed: 4
metric-deviations-from-plan: 0
metric-review-fixes-applied: 0
commit-sha: "PENDING"
tags: [tanstack, react-router, type-safety, tech-debt]
refs:
  index: 00-index.md
  implement-index: 05-implement.md
  slice-def: 03-slice-tanstack-router-typed-context.md
  plan: 04-plan-tanstack-router-typed-context.md
  siblings: [05-implement-foundation.md, 05-implement-accounts-data-layer.md]
  verify: 06-verify-tanstack-router-typed-context.md
next-command: wf-verify
next-invocation: "/wf verify waypoint-app tanstack-router-typed-context"
---

# Implement: TanStack Router typed context (F6)

## The Implementation
For months the root route handed an `auth` object to every navigation, but the
type never rode along with it — so the two guards that actually read it,
`_authenticated.tsx` and `sign-in.tsx`, each reached through a hand-written
`context as { auth?: … }` cast to pull the field back out. This slice swaps plain
`createRootRoute` for the framework's own dependency-injection primitive,
`createRootRouteWithContext<RouterContext>()`, and the two casts delete cleanly.
`RouterContext` is a one-liner —
`{ auth: Awaited<ReturnType<typeof getSession>> }` — deriving the field from the
session function's return type so it can never drift from the real shape.

The one real hazard was confirmed against installed source, not memory (RIM-E3):
once the root context type is concrete, `@tanstack/router-core`'s
`RouterContextOptions` flips `createRouter`'s `context` option from optional to
**required** (`router.d.ts:461-465`). So `getRouter()` now seeds
`context: { auth: null } satisfies RouterContext`; the root `beforeLoad`
overwrites it with the real session on every navigation, including initial SSR.
Four files touched, thirteen lines added, four removed, zero new files, zero new
dependency, zero new casts. `tsc --noEmit` is green — which is the whole proof of
AC1 (typed `context.auth`, no cast) and AC2 (matching initial context), since the
type system rejects a missing or mismatched seed at compile time.

The auth *mechanism* is untouched — better-auth's session load stays exactly where
it was in the root `beforeLoad`. This is a typing/DI change only, so the
load-bearing risk is behavioral parity on the root route (every navigation);
AC3 (seeded-session auth-redirect + hydration parity) is a runtime concern that
belongs to verify, and its harness (`tests/e2e/auth-flow.spec.ts` +
`BETTER_AUTH_SECRET` in `.dev.vars`) already exists and passes — no seam to build.

## Summary of Changes
- Root route now uses `createRootRouteWithContext<RouterContext>()` and exports the
  `RouterContext` type (single source of truth for context shape).
- Router factory seeds the now-required initial `context: { auth: null }`.
- Both auth guards (`_authenticated`, `sign-in`) destructure typed `context.auth`
  instead of casting.

## Files Changed
- `src/routes/__root.tsx`: import `createRootRoute` → `createRootRouteWithContext`;
  add `export type RouterContext = { auth: Awaited<ReturnType<typeof getSession>> }`;
  change `createRootRoute({…})` → `createRootRouteWithContext<RouterContext>()({…})`.
  `beforeLoad` / `head` / `shellComponent` unchanged.
- `src/router.tsx`: `import type { RouterContext } from './routes/__root'`; add
  `context: { auth: null } satisfies RouterContext` as the first `createTanStackRouter`
  option (required by the concrete context type).
- `src/routes/_authenticated.tsx`: replace the cast with `const { auth } = context`;
  redirect logic unchanged.
- `src/routes/sign-in.tsx`: replace the cast with `const { auth } = context`;
  reverse-redirect logic unchanged.

## Shared Files (also touched by sibling slices)
- `src/routes/__root.tsx` and `src/router.tsx` are owned by `foundation`; the
  `_authenticated` guard originates in `accounts-data-layer`. This slice makes a
  narrow, additive typing change to each — no behavioral surface altered.

## Notes on Design Choices
- **`RouterContext` lives in `__root.tsx`**, exported and imported type-only by
  `router.tsx`. Dependency flows one way (`router → __root`), so no import cycle; a
  dedicated `src/lib/router-context.ts` was rejected as unnecessary indirection for
  a one-line type (zero new files = smallest blast radius).
- **`auth` derived, not re-declared** — `Awaited<ReturnType<typeof getSession>>`
  reuses `getSession`'s `{ session, user } | null` return so the context type cannot
  drift from the function. No separate `| null` needed; the awaited type already
  carries it.
- **Initial seed `{ auth: null }`** is the honest pre-load "no session yet" state;
  the root `beforeLoad` populates the real session on every navigation.
- No UI markup changed (pure typing/DI), so the design floor has no new surface to
  hold — `sign-in.tsx`'s JSX is byte-for-byte unchanged.

## Verification Seams Built
- **AC1 (typed `context.auth`, no cast) → none needed** — carried by the existing
  `pnpm typecheck` script; the type system is the seam. Verified green this run.
- **AC2 (root uses `createRootRouteWithContext` + matching seeded context) → none
  needed** — enforced by the type system (concrete context ⇒ required `context`
  option); a missing/mismatched seed fails `tsc`. Verified green this run.
- **AC3 (auth-gated navigation parity) → none needed** — the seeded-session
  Playwright harness `tests/e2e/auth-flow.spec.ts` and its `BETTER_AUTH_SECRET`
  credential (`.dev.vars`) already exist and pass; the earlier AC-ADL1/5 deferral is
  cleared. verify runs this suite plus a hydration smoke; no new fixture scoped.

## Deviations from Plan
- None. All six plan steps executed as written; the installed-source signatures
  (`react-router/route.d.ts:96`, `router-core/router.d.ts:461-465`) matched the
  plan's citations exactly on re-read this run.

## Anything Deferred
- **AC3 runtime proof** (seeded-session auth-redirect suite + `pnpm dev` hydration
  smoke) is deferred to the verify stage by design — implement does not run the
  behavioral gate. No `sdlc-debt:` shortcut was taken; nothing was simplified past
  a known ceiling.

## Known Risks / Caveats
- **Root-route blast radius (low, RIM-E6, adjudicated).** Every navigation runs the
  root `beforeLoad`; this change is typing-only and the seed represents the same
  pre-load state the loose inference produced before, so no runtime behavior shifts.
  The parity proof (AC3 + hydration) is owned by verify.
- **Server-middleware casts intentionally left** — the ~20 `context as { session }`
  in `src/server/*.ts` are `createServerFn`/`createMiddleware` context (a different
  DI chain), explicitly out of this slice's scope. Retyping them would broaden scope.

## Freshness Research
- **Installed-source read (authoritative, RIM-E3):** re-confirmed this run against
  the pinned installed versions —
  `node_modules/@tanstack/react-router/dist/esm/route.d.ts:96`
  (`createRootRouteWithContext<TRouterContext extends {}>()` returns the factory;
  options optional, so `beforeLoad` stays as-is) and
  `node_modules/@tanstack/router-core/dist/esm/router.d.ts:461-465`
  (`RouterContextOptions` → concrete context lands in the **required** `context`
  branch). These are type-level facts in this exact installed version, superseding
  any recalled API shape.

## Recommended Next Stage
- **Option A (default):** `/wf verify waypoint-app tanstack-router-typed-context` —
  the change sits on the root route (every navigation); AC3 needs the seeded-session
  auth-redirect suite plus a hydration smoke to prove behavioral parity. AC1/AC2 are
  already green via typecheck this run, but the runtime parity leg is verify-owned.
  Consider `/compact` first — implementation research is noise for verification;
  workflow state lives in the artifacts.
- **Option B:** `/wf review waypoint-app tanstack-router-typed-context` — only if the
  root-route parity is judged already covered by the green typecheck; generally a
  change on every navigation warrants the runtime auth-flow leg first.
