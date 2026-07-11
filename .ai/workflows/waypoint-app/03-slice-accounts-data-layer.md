---
schema: sdlc/v1
type: slice
slug: waypoint-app
slice-slug: accounts-data-layer
status: defined
stage-number: 3
created-at: "2026-07-10T22:43:12Z"
updated-at: "2026-07-10T22:43:12Z"
complexity: l
depends-on: [platform-proofs]
tags: [auth, d1, schema, tanstack-db, isolation]
refs:
  index: 00-index.md
  slice-index: 03-slice.md
  siblings: [03-slice-foundation.md, 03-slice-platform-proofs.md, 03-slice-design-system-shell.md, 03-slice-lesson-renderer.md, 03-slice-sample-journey.md, 03-slice-ai-gateway.md, 03-slice-tutor-interview.md, 03-slice-roadmap-lesson-generation.md, 03-slice-quiz-fsrs.md, 03-slice-adaptation-progress.md, 03-slice-source-grounding.md]
  plan: 04-plan-accounts-data-layer.md
  implement: 05-implement-accounts-data-layer.md
---

# Slice: Accounts & Data Layer

## The Slice

This is the persistent backbone: who you are, and where everything you do is stored. It turns the auth spike into real OAuth sign-in (Google + GitHub via better-auth, no passwords anywhere), and lays down the full D1 schema in one act — journeys, waypoints, lessons, quizzes, attempts, concepts, FSRS cards, usage events — even though most tables stay empty for several slices. Designing the schema whole rather than table-by-table is a deliberate choice: the FSRS card shape (seven fields, per ts-fsrs), the multi-journey model, and the future `task` question type the shape says not to foreclose all constrain each other, and migrating D1 mid-build is more expensive than reviewing a complete schema now.

The load-bearing decision is that isolation is enforced at the server-function boundary, not in the UI: every data access derives its user from the session and refuses to cross accounts, and the tests prove denial, not just success. On top sits the client half of local-first — TanStack DB QueryCollections over those server functions — so every later UI slice reads from a reactive local store instead of inventing its own fetching. The known tension: better-auth's D1/Kysely fit and TanStack DB's collection design are both young; if either fights the schema, the schema wins and the adapter layer absorbs the friction.

## Goal

OAuth-only sign-in with hard per-user isolation, the complete v1 D1 schema, and a TanStack DB client-store foundation every later slice reads through.

## Why This Slice Exists

AC-1 is the multi-user promise of the whole product, and the shape's constraint #4 (FSRS can proceed once the data model lands) plus the PO's "multi-journey data model from day one" both hang off the schema shipping early and complete.

## Scope

- **In:** better-auth ≥ 1.6.23 with Google + GitHub OAuth on `createAPIFileRoute` (D1-backed sessions/users); documented OAuth-app registration steps for the PO (the external prerequisite); full D1 schema v1 + migrations (users/sessions per better-auth, journeys, waypoints, lessons, quiz questions/attempts, concepts, concept-FSRS cards, usage/quota events); server functions with a per-user authorization guard as the single data gateway; TanStack DB QueryCollections wired over those server functions with browser persistence; a minimal settings/account surface (identity display, sign-out); sign-in screen (warm, minimal — full design tokens arrive next slice, so this screen gets restyled then; accepted rework, one screen).
- **Out:** the sample-journey first-login *content* (sample-journey slice — this slice routes first-login to a placeholder destination); design tokens/app shell (design-system-shell); quota *enforcement* logic (ai-gateway — the events table lands here, the engine there); any generation.

## Acceptance Criteria

- Given a new visitor, When they sign in with Google or GitHub, Then an account is created and a session persists across reload; And given a second account in a separate browser context, When it browses the app, Then none of the first account's journeys or data are visible or reachable. *(AC-1)*
  <!-- observable: true — sign-in and isolation are user-experienced outcomes; observed with two isolated browser contexts -->
  verify: { method: playwright two browser contexts, env: local dev + dev-configured OAuth apps or better-auth test provider (OAuth app registration is the PO prerequisite; test-provider path keeps CI green without it), fixture: two seeded test identities, rung: auth-1 (test-credential seeding); residual — first real Google+GitHub sign-in on a deployed env, pre-registered per shape }
- Given any data-bearing server function, When it is invoked with a session belonging to user A but a resource id belonging to user B, Then the call is rejected with an authorization error and no data crosses.
  <!-- observable: false — cross-user denial is fully provable by integration tests against the real local D1 path; per the backend ladder this runs on miniflare D1, not mocks -->
- Given the D1 migrations, When applied to a fresh local database, Then the full v1 schema materializes (all domain tables incl. FSRS card fields and a quiz-question `type` column extensible to a future `task` type) and a second apply is a no-op.
  <!-- observable: false — schema shape and migration idempotency are static/automated assertions -->
- Given a signed-in user with seeded journeys, When the client store hydrates, Then journey data is served from the TanStack DB collection (reactive read, no per-render network round trip) and a server-side change appears after refetch.
  <!-- observable: false — store-layer behavior provable by component/integration tests; the user-visible dashboard built on it is design-system-shell's AC -->
- Given a signed-in user, When they open the account/settings surface, Then they see their identity (provider, name/avatar) and can sign out, landing back at sign-in with the session cleared.
  <!-- observable: true — a rendered surface + navigation outcome -->
  verify: { method: playwright, env: local dev, fixture: one seeded identity, rung: auth-1 }
- Given a GitHub account with a private email, When it signs in, Then the account is still created per better-auth's flow (no crash, no blocked signup).
  <!-- observable: false — provable with a mocked provider profile fixture in the auth flow tests; the live-GitHub variant rides the pre-registered OAuth residual above -->

## Dependencies on Other Slices

- `platform-proofs`: the D1 + better-auth mount pattern (per-request clients, `cloudflare:workers` env) this slice industrializes.

## Risks

- OAuth app registrations are PO-owned external actions; the test-provider path de-risks the build, but the residual (real provider sign-in on a deployed env) stays open until ship — pre-registered in shape, restated here.
- Whole-schema-up-front risks speculative columns; mitigation is that every table maps to a named AC in a later slice — nothing schema'd that no slice consumes.
- TanStack DB beta: if QueryCollections + browser persistence misbehave, fall back to plain TanStack Query per-feature and reintroduce DB where it earns its keep (adoption matrix already flags DB as the biggest beta bet after AI).
