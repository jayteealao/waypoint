---
schema: sdlc/v1
type: slice
slug: waypoint-app
slice-slug: tanstack-router-typed-context
status: complete
stage-number: 3
created-at: "2026-07-12T11:39:46Z"
updated-at: "2026-07-14T14:26:42Z"
complexity: s
depends-on: [foundation, accounts-data-layer]
source: extension
source-ref: ".ai/workflows/discover-tanstack-usage-audit/01-discover.md (F6)"
extension-round: 2
tags: [tanstack, react-router, type-safety, tech-debt]
refs:
  index: 00-index.md
  slice-index: 03-slice.md
  source: ".ai/workflows/discover-tanstack-usage-audit/01-discover.md"
  plan: 04-plan-tanstack-router-typed-context.md
  implement: 05-implement-tanstack-router-typed-context.md
---

# Slice: TanStack Router typed context (F6)

## Goal
Type the router context end-to-end with `createRootRouteWithContext<{ auth }>()` so consumers stop casting `context as { auth?: … }`.

## Why This Slice Exists
The discover audit (F6) found the root route uses plain `createRootRoute` and injects `auth` via `beforeLoad` returning `{ auth }`, but the context type never flows: `src/routes/_authenticated.tsx:12` casts `context as { auth?: { session } | null }` to read it. TanStack Router's idiomatic DI pattern — `createRootRouteWithContext<RouterContext>()` — makes `beforeLoad`/`loader` context typed everywhere and removes the casts. The `router-core-type-safety` and `router-core-auth-and-guards` skills document this as the intended shape.

## Scope
- **In:**
  - Define a `RouterContext` type (at minimum `{ auth: Awaited<ReturnType<typeof getSession>> | null }`).
  - Switch `src/routes/__root.tsx` to `createRootRouteWithContext<RouterContext>()`; ensure `getRouter()` in `src/router.tsx` supplies the initial `context` if required by the API.
  - Remove context casts in `src/routes/_authenticated.tsx` (and any other route reading `context.auth`).
- **Out:**
  - No change to the auth *mechanism* (better-auth session load stays in the root `beforeLoad`); this is a typing/DI change only.
  - No addition of unrelated context (e.g. a queryClient) — that belongs to the data-layer-unification slice if that strategy needs it.

## Acceptance Criteria
- Given any route `beforeLoad`/`loader`, When it reads `context.auth`, Then the field is typed (no `as`/`any` cast) and typecheck passes.
- Given the root route, When inspected, Then it uses `createRootRouteWithContext<RouterContext>()` and the router is created with a matching initial context.
- Given the full test suite, When run, Then auth-gated navigation (sign-in redirect via `_authenticated`) behaves exactly as before.

## Dependencies on Other Slices
- `foundation`: owns `__root.tsx` / `router.tsx`.
- `accounts-data-layer`: owns the `_authenticated` guard and session shape this context carries.
- **Coordinate with `tanstack-data-layer-unification`** — if that slice adds a `queryClient`/collection handle to router context, the two should agree on the `RouterContext` shape. Recommend landing this slice first (smaller) and letting the data-layer slice extend the type.

## Risks
- `createRootRouteWithContext` may require the router factory to pass an initial `context` object; missing that is a common setup error — verify against the installed `router-core` source during plan.
- Low blast radius, but touches the root route (every navigation) — verify hydration/SSR still works after the change.
