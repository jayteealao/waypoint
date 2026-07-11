---
schema: sdlc/v1
type: plan
slug: waypoint-app
slice-slug: accounts-data-layer
status: complete
stage-number: 4
created-at: "2026-07-11T11:17:17Z"
updated-at: "2026-07-11T11:17:17Z"
metric-files-to-touch: 18
metric-step-count: 12
has-blockers: false
revision-count: 0
revisions: []
tags: [auth, d1, schema, tanstack-db, isolation, oauth, better-auth]
stack-source: confirmed
refs:
  index: 00-index.md
  plan-index: 04-plan.md
  slice-def: 03-slice-accounts-data-layer.md
  siblings:
    - 04-plan-foundation.md
    - 04-plan-platform-proofs.md
  implement: 05-implement-accounts-data-layer.md
next-command: wf-implement
next-invocation: "/wf implement waypoint-app accounts-data-layer"
---

# Plan: Accounts & Data Layer

## The Plan

The platform-proofs spike showed the per-request D1 client pattern works under workerd and that
better-auth mounts cleanly on `createAPIFileRoute`. This slice industrializes that proof into
a production-ready authentication layer and lays down the complete domain schema in one act.
Eighteen files, twelve steps. The schema ships whole and intentional — not because it is all
consumed now, but because the alternative (migrating D1 mid-build as each later slice adds its
tables) costs more than the speculative-column risk, which is mitigated by the rule that every
column maps to a named AC in a later slice.

The load-bearing decision is that isolation is enforced at the server-function boundary, not
in the UI. Every data-bearing server function calls `requireAuth()` to confirm a session, then
`requireOwnership()` to confirm the requesting user owns the resource — cross-account rows are
structurally unreachable, not just unrendered. On top sits the first TanStack DB QueryCollection:
a reactive, browser-persisted journey store that every subsequent UI slice reads through instead
of inventing its own fetch pattern. The sign-in screen and account surface are intentionally
minimal; the design-system-shell slice restyles them with design tokens (accepted rework,
one screen).

The OAuth prerequisite (Google + GitHub app registrations) is the only external blocker. The
test-proxy path — seeded sessions inserted directly into miniflare D1 — keeps the build green
and Playwright assertions immediate. The real OAuth sign-in residual is pre-registered per shape.
TanStack DB beta is the second risk; the fallback (plain TanStack Query) is documented per AC.

## Current State

Foundation and platform-proofs are complete and reviewed (verdict: SHIP). The codebase at the
start of this slice:

- **scaffold**: TanStack Start on `feat/waypoint-app`, `@cloudflare/vite-plugin` in
  `vite.config.ts`, `wrangler.jsonc` with `observability: { enabled: true }` and a D1 binding
  (`binding: "DB"`, placeholder UUID valid for `wrangler dev`).
- **auth spike**: `src/lib/auth.ts` is a minimal per-request factory (no OAuth plugins yet);
  `src/routes/api/auth/$.ts` mounts it with an `any` cast for the D1 binding.
  `src/cloudflare-workers.d.ts` in `src/` is a hand-written stub that notes it will be replaced
  by `wrangler types` in this slice.
- **AI client**: `src/lib/ai-client.ts` provides the adapter abstraction. Not touched by this slice.
- **test harnesses**: Vitest (jsdom default, node override via docblock), Playwright (two configs:
  `playwright.config.ts` for Vite dev, `playwright.wrangler.config.ts` for `wrangler dev` on
  port 8787). All passing.
- **installed packages**: `@tanstack/ai`, `@tanstack/ai-openrouter`, `@tanstack/ai-openai`,
  `better-auth 1.6.23` already in `dependencies`. `@tanstack/db` is **not yet installed**.
- **missing**: no migrations directory, no domain schema, no OAuth provider config, no
  client-side auth library, no authorization guard, no server functions, no TanStack DB store,
  no sign-in route, no account route.

## Simplicity Ladder

- **OAuth sign-in** → rung 2 (native platform): better-auth v1.6.23 with `socialProviders.google`
  and `socialProviders.github` is the standard pattern. No custom OAuth flow needed.
- **D1 schema migrations** → rung 2 (native platform): `wrangler d1 migrations apply` with a
  `migrations/` directory is the Cloudflare-native migration approach. No ORM or migration
  library needed.
- **TypeScript types for D1 bindings** → rung 2 (native platform): `wrangler types` generates
  `worker-configuration.d.ts` with `interface Env { DB: D1Database; ... }`. No manual type
  writing beyond the domain models in `src/db/schema.ts`.
- **Authorization guard** → rung 4 (new code): no existing guard exists. A ~30-line helper
  (`requireAuth` + `requireOwnership`) is new code. Rungs 1–3 do not cover request-scoped
  session-backed ownership checks specific to this codebase.
- **Server functions** → rung 3 (reuse): `createServerFn` from `@tanstack/react-start` is
  installed and proven. The pattern is identical to how the platform-proofs spike used
  `createAPIFileRoute`. The server-function convention extends the proven pattern.
- **Client-side auth state** → rung 4 (new code): `better-auth/react` `createAuthClient` is
  a new install-time dependency export (bundled with `better-auth`, already installed). No
  additional package needed; call site is new.
- **TanStack DB QueryCollection** → rung 4 (new code): `@tanstack/db` is not yet installed.
  QueryCollections over server functions (no sync engine) is the shape-decided pattern.
  Rungs 1–3 do not cover client-side live queries with browser persistence.
- **Sign-in / account routes** → rung 4 (new code): new route files; TanStack Router already
  installed; no file-routing pattern reuse opportunity exists for these surfaces.

## Applied Learnings

No applicable learnings found. `.ai/solutions/INDEX.md` does not exist.

Repeat-deferral tripwire: `00-index.md` `runtime-evidence-deferrals` contains two entries:
- **AC-F4** (CI gate, foundation slice) — cleared by first PR to main. No overlap.
- **AC-PP2b** (live OpenRouter smoke, platform-proofs slice) — cleared by keyed environment run.
  No overlap with this slice's ACs.

No existing deferral wall fuzzy-matches this slice's OAuth prerequisite wall. The OAuth
prerequisite is a new wall; it is resolved via `proxy+deferral` per the Verification Strategy
below (seeded-session proxy; real OAuth cleared by first deployed sign-in).

## Likely Files / Areas to Touch

- `package.json` — add `@tanstack/db`, `@tanstack/react-db` (exact-pinned)
- `worker-configuration.d.ts` — new; generated by `wrangler types`
- `src/cloudflare-workers.d.ts` — update stub to reference generated typed Env
- `migrations/0000_schema_v1.sql` — new; full v1 D1 schema
- `wrangler.jsonc` — add `migrations_dir` to d1_databases entry
- `src/db/schema.ts` — new; TypeScript types for all domain tables
- `src/lib/auth.ts` — expand from spike config to full OAuth config
- `src/lib/auth-client.ts` — new; client-side better-auth client
- `src/routes/api/auth/$.ts` — replace `any` casts with typed Env
- `src/lib/auth-guard.ts` — new; `requireAuth` + `requireOwnership` helpers
- `src/server/journeys.ts` — new; journey CRUD server functions
- `src/lib/store/journeys.ts` — new; TanStack DB QueryCollection for journeys
- `src/routes/sign-in.tsx` — new; minimal sign-in screen
- `src/routes/account.tsx` — new; account surface with sign-out
- `tests/smoke/auth-guard.test.ts` — new; auth guard unit tests
- `tests/smoke/schema.test.ts` — new; SQL schema parse and shape assertions
- `tests/smoke/db-collections.test.ts` — new; TanStack DB collection smoke
- `tests/e2e/auth-flow.spec.ts` — new; Playwright auth + isolation E2E

(18 files: 11 new, 7 modified)

## Proposed Change Strategy

**Schema whole, not piecemeal.** The full domain schema ships as a single migration
(`0000_schema_v1.sql`). Every table is `CREATE TABLE IF NOT EXISTS` for idempotency. Every
table comment cites the slice AC that consumes it — the rule that prevents speculative columns.

**Auth expanded in place.** The existing `src/lib/auth.ts` factory grows from a spike stub into
a full OAuth-aware factory. The per-request calling contract (created inside the route handler,
never at module scope) is unchanged; only the `betterAuth(...)` config object expands.

**Guard as a pure function.** `requireAuth` and `requireOwnership` are extracted as pure
(or near-pure) helpers that do not require Workers runtime injection. This lets them be unit-tested
in regular Vitest (no `@cloudflare/vitest-pool-workers` needed) while still being called from
server functions that run in workerd.

**TanStack DB as the client store foundation.** The QueryCollection for journeys is the first
use of TanStack DB in the project. It establishes the server-function syncer pattern that every
subsequent UI slice extends. If TanStack DB beta proves unstable at install time, the fallback
(plain TanStack Query) meets the same AC with a direct-fetch-on-mount approach.

**Minimal UI, accepted rework.** Sign-in and account routes use raw Tailwind utility classes
without design tokens. The design-system-shell slice will restyle them. This rework is budgeted
in the slice definition and costs less than deferring sign-in until design tokens land.

## Step-by-Step Plan

1. **Install new dependencies.**
   Check npm for the latest stable/beta `@tanstack/db` and `@tanstack/react-db` versions.
   Add both to `package.json` `dependencies` with exact pins (no `^` or `~`). Run
   `pnpm install --frozen-lockfile=false`. Re-run the existing pin-check to confirm no floating
   ranges were introduced.

2. **Run `wrangler types` to generate the typed Env interface.**
   Run `pnpm exec wrangler types` (or `wrangler types --env-interface Env`) from the project
   root. This writes `worker-configuration.d.ts` (or `env.d.ts`, depending on wrangler version —
   resolve at implement time). Update `src/cloudflare-workers.d.ts` to import and re-export the
   generated `Env` type so the existing `cloudflare:workers` module declaration becomes typed.
   Verify `tsc --noEmit` passes with the new types.

3. **Write the D1 migration `migrations/0000_schema_v1.sql`.**
   Create the `migrations/` directory. Write the full schema in one SQL file:
   - `user`, `session`, `account` tables per better-auth's D1 schema documentation (run
     `betterAuth(...).api.generateSchema()` or copy the documented DDL — resolve at implement time).
   - Domain tables (all with `CREATE TABLE IF NOT EXISTS`):
     - `journeys (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, goal TEXT, status TEXT DEFAULT 'active', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`
     - `waypoints (id TEXT PRIMARY KEY, journey_id TEXT NOT NULL REFERENCES journeys(id), position INTEGER NOT NULL, title TEXT NOT NULL, goal TEXT, concepts TEXT DEFAULT '[]')`
     - `lessons (id TEXT PRIMARY KEY, waypoint_id TEXT NOT NULL REFERENCES waypoints(id), content TEXT, sources TEXT DEFAULT '[]', created_at INTEGER NOT NULL)`
     - `quiz_questions (id TEXT PRIMARY KEY, waypoint_id TEXT NOT NULL REFERENCES waypoints(id), type TEXT NOT NULL DEFAULT 'mc', question TEXT NOT NULL, options TEXT DEFAULT '[]', correct_answer TEXT, concept_id TEXT, rubric TEXT)`
     - `quiz_attempts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, quiz_question_id TEXT NOT NULL REFERENCES quiz_questions(id), response TEXT, score REAL, feedback TEXT, created_at INTEGER NOT NULL)`
     - `concepts (id TEXT PRIMARY KEY, journey_id TEXT NOT NULL REFERENCES journeys(id), name TEXT NOT NULL, description TEXT)`
     - `concept_fsrs_cards (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, concept_id TEXT NOT NULL REFERENCES concepts(id), due INTEGER, stability REAL, difficulty REAL, reps INTEGER DEFAULT 0, lapses INTEGER DEFAULT 0, state TEXT DEFAULT 'New', last_review INTEGER)`
     - `usage_events (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, event_type TEXT NOT NULL, tokens_used INTEGER, cost_usd REAL, model_id TEXT, created_at INTEGER NOT NULL)`
   - Each table has an inline comment citing the slice AC that consumes it.
   - Update `wrangler.jsonc` d1_databases entry to include `"migrations_dir": "migrations"`.

4. **Write `src/db/schema.ts`.**
   TypeScript interfaces mirroring every domain table (not the better-auth tables — those are
   typed by the `better-auth` package itself). Export `Journey`, `Waypoint`, `Lesson`,
   `QuizQuestion`, `QuizAttempt`, `Concept`, `ConceptFsrsCard`, `UsageEvent`. Use D1's column
   type conventions (TEXT → string, INTEGER → number, REAL → number). Mark nullable columns
   with `| null`.

5. **Expand `src/lib/auth.ts` to full OAuth config.**
   Replace the spike stub with a factory that accepts the full `Env` binding and configures:
   - `socialProviders.google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }`
   - `socialProviders.github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET }`
   - `baseURL`: derived from `env.BETTER_AUTH_BASE_URL ?? 'http://localhost:3000'`
   - `secret: env.BETTER_AUTH_SECRET`
   - `trustedOrigins`: set from env or default to localhost origins
   The factory signature changes from `createAuth(db: unknown)` to `createAuth(env: Env)`.
   Update `src/routes/api/auth/$.ts` to pass `env` (fully typed from `worker-configuration.d.ts`)
   rather than `(env as any).DB`.
   Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`,
   `BETTER_AUTH_BASE_URL` to `.env.example` with placeholder values and registration instructions.

6. **Create `src/lib/auth-client.ts`.**
   ```typescript
   import { createAuthClient } from 'better-auth/react'
   import type { Auth } from '#/lib/auth'

   export const authClient = createAuthClient<Auth>({
     baseURL: '/api/auth',
   })

   export const { useSession, signIn, signOut } = authClient
   ```
   The `Auth` type is exported from `src/lib/auth.ts` via `typeof betterAuth(...)` inference.

7. **Create `src/lib/auth-guard.ts`.**
   Two exported helpers:
   - `requireAuth(request: Request): Promise<Session>` — calls
     `createAuth(env).api.getSession({ headers: request.headers })`; throws
     `new Response(null, { status: 401 })` if no session. Returns the session object.
   - `requireOwnership(sessionUserId: string, resourceUserId: string): void` — throws
     `new Response(null, { status: 403 })` if `sessionUserId !== resourceUserId`. Pure synchronous
     function; no Workers runtime needed for its logic (testable in regular Vitest).
   Note: `requireAuth` needs the `Env` context to call `createAuth(env)`. The server function
   calling convention passes the request through TanStack Start's `getWebRequest()`. Factor
   `requireAuth` to accept `(env: Env, request: Request)` so the server function can supply both.

8. **Create `src/server/journeys.ts`.**
   Four server functions using `createServerFn` from `@tanstack/react-start`:
   - `listJourneys()`: calls `requireAuth(env, request)`, queries
     `SELECT * FROM journeys WHERE user_id = ? ORDER BY created_at DESC`, returns `Journey[]`.
   - `getJourney(id: string)`: calls `requireAuth`, queries journey by id, calls
     `requireOwnership(session.user.id, journey.user_id)`, returns `Journey | null`.
   - `createJourney(input: { title: string; goal?: string })`: calls `requireAuth`, inserts
     with `user_id = session.user.id`, returns the new `Journey`.
   - `updateJourney(id: string, patch: Partial<Pick<Journey, 'title' | 'goal' | 'status'>>)`:
     calls `requireAuth`, fetches and calls `requireOwnership`, applies patch, returns updated
     `Journey`.
   Each function obtains `env` via `import { env } from 'cloudflare:workers'` at the top of the
   server function body (Workers runtime only; safe in server functions that run in workerd).

9. **Create `src/lib/store/journeys.ts`.**
   A TanStack DB QueryCollection wrapping `listJourneys`:
   ```typescript
   import { createCollection } from '@tanstack/db'
   import { createReactCollection } from '@tanstack/react-db'
   import { listJourneys } from '#/server/journeys'
   import type { Journey } from '#/db/schema'

   export const journeysCollection = createReactCollection<Journey>({
     id: 'journeys',
     // Server-function syncer: QueryCollection calls this on mount and on invalidation
     syncer: {
       sync: async (params) => {
         const rows = await listJourneys()
         return { rows, isSynced: true }
       },
     },
     // Browser persistence via IndexedDB — keeps journeys available across hard reloads
     persistence: { type: 'indexeddb', name: 'waypoint-journeys-v1' },
     schema: { id: 'id' },
   })

   // React hook for components
   export function useJourneys() {
     return journeysCollection.useQuery()
   }
   ```
   If the exact TanStack DB `createReactCollection` / `createCollection` API differs from this
   at install time, resolve against the installed package types. The key contract is:
   (a) server function as the syncer, (b) IndexedDB persistence, (c) a `useJourneys()` hook.

10. **Create `src/routes/sign-in.tsx`.**
    TanStack Router file-based route at `/sign-in`. Renders:
    - A centered card with the app name and a brief one-liner.
    - "Continue with Google" and "Continue with GitHub" buttons that call
      `signIn.social({ provider: 'google', callbackURL: '/' })` and
      `signIn.social({ provider: 'github', callbackURL: '/' })` respectively.
    - A `loader` that redirects to `/` if the user is already signed in (via `useSession()`
      or a server-side session check to avoid flash).
    Minimal Tailwind layout (card centered in full-screen flex); no design token classes yet.

11. **Create `src/routes/account.tsx`.**
    TanStack Router file-based route at `/account`. Uses `beforeLoad` to check session:
    - If no session → `redirect({ to: '/sign-in' })`.
    Renders:
    - User avatar (img with `src={session.user.image}` guarded for null), display name,
      email (if available), OAuth provider name.
    - "Sign out" button: calls `signOut({ callbackURL: '/sign-in' })`.
    Minimal Tailwind layout.

12. **Write tests and run the full check suite.**
    - **`tests/smoke/auth-guard.test.ts`**: unit tests for `requireOwnership` (cross-user throws
      403, same-user passes, empty string mismatches throw). Also tests the shape of the 401
      response from a mock `requireAuth` when no session is returned. Run: `pnpm test`.
    - **`tests/smoke/schema.test.ts`**: reads `migrations/0000_schema_v1.sql` as a string; asserts
      expected table names present, `CREATE TABLE IF NOT EXISTS` used throughout (no bare
      `CREATE TABLE`), FSRS columns present (`due`, `stability`, `difficulty`, `reps`, `lapses`,
      `state`, `last_review`), `quiz_questions.type` column present. Run: `pnpm test`.
    - **`tests/smoke/db-collections.test.ts`**: mocks `listJourneys` to return two fixture
      journeys; creates the QueryCollection with the mock syncer; asserts the collection's
      query returns the two rows after the first sync. Run: `pnpm test`.
    - **`tests/e2e/auth-flow.spec.ts`**: uses `playwright.config.ts` (pnpm dev); two browser
      contexts; test helper seeds user-A and user-B plus sessions directly into D1 via
      `wrangler d1 execute --local` or a seeding API endpoint; asserts context-A sees only its
      journeys, account surface shows correct identity, sign-out redirects to `/sign-in`. Run:
      `pnpm exec playwright test tests/e2e/auth-flow.spec.ts`.
    - Run full suite: `pnpm typecheck && pnpm test && pnpm exec playwright test
      tests/e2e/auth-flow.spec.ts`.
    - Commit all 18 files to `feat/waypoint-app`.

## Verification Strategy

| AC | Tool / method + ladder rung | Environment need — satisfiable in target env? | What must be BUILT to make it verifiable | Fallback chain |
|----|------------------------------|-----------------------------------------------|------------------------------------------|----------------|
| AC-ADL1: Sign-in with Google or GitHub creates account; session persists across reload; second account sees none of first account's data (observable) | Playwright `tests/e2e/auth-flow.spec.ts` — two `browser.newContext()` contexts, seeded-session proxy (rung: web-1 integration) | `pnpm dev` (Vite) locally — **yes**; real OAuth app registration (Google + GitHub) is PO-prerequisite — **proxy path** available | `src/routes/sign-in.tsx`, seeded-session test helper (direct D1 insert via `wrangler d1 execute --local` in test beforeAll), `tests/e2e/auth-flow.spec.ts` | → Manual two-browser-window test with real OAuth apps on deployed env → pre-registered residual |
| AC-ADL2: Cross-user server-function denial (not observable) | Vitest `tests/smoke/auth-guard.test.ts` — unit test of `requireOwnership` (rung: unit) | Local Node environment — **yes**; guard logic is a pure function testable in jsdom/node Vitest | `src/lib/auth-guard.ts` `requireOwnership` as a pure function | → Static TypeScript type check (throwable interface) |
| AC-ADL3: D1 migrations apply + idempotency (not observable) | Vitest `tests/smoke/schema.test.ts` — SQL parse + shape assertions; `wrangler d1 migrations apply --local` twice in beforeAll (rung: integration via wrangler CLI) | `wrangler dev` / wrangler CLI locally — **yes** (wrangler 4.110.0) | `migrations/0000_schema_v1.sql`, `wrangler.jsonc` migrations_dir config | → SQL file manual review; `wrangler d1 migrations apply --local` once + table inspection |
| AC-ADL4: TanStack DB collection reactive read (not observable) | Vitest `tests/smoke/db-collections.test.ts` — collection + mock server fn (rung: unit/integration) | Local Node environment — **yes** (collection tested with mocked syncer; no Workers runtime needed for the collection layer) | `src/lib/store/journeys.ts`, `src/server/journeys.ts`, mock syncer in test | → Plain TanStack Query hook if DB collection fails (fallback path) |
| AC-ADL5: Account surface shows identity + sign-out works (observable) | Playwright `tests/e2e/auth-flow.spec.ts` — same E2E file; account route + sign-out flow (rung: web-1) | `pnpm dev` locally — **yes** (seeded-session proxy for automated path) | `src/routes/account.tsx`, seeded-session helper (same as AC-ADL1) | → Manual browser drive with seeded session |
| AC-ADL6: GitHub private-email sign-in creates account (not observable) | Vitest `tests/smoke/auth-guard.test.ts` — fixture with `email: undefined` OAuth profile passed through better-auth's session normalization (rung: unit) | Local Node environment — **yes** | Mock OAuth profile fixture in test file | → better-auth docs confirm the behavior; code path review |

**Constraint-resolutions per AC:**

- **AC-ADL1**: `constraint-resolution: proxy+deferral: cleared-by: first successful real Google + GitHub sign-in on a deployed environment (pre-registered in shape)`
- **AC-ADL2**: `constraint-resolution: po-accepted: requireOwnership is a pure function; cross-user denial is fully exercised by the unit test without a Workers runtime`
- **AC-ADL3**: `constraint-resolution: po-accepted: schema idempotency is verifiable by SQL content assertions + wrangler local apply; production migration apply is a deployment step`
- **AC-ADL4**: `constraint-resolution: po-accepted: TanStack DB collection behavior (syncer call + reactive update) is testable in node with a mocked syncer; live QueryCollection behavior on a real D1 is exercised by the E2E test in AC-ADL1`
- **AC-ADL5**: `constraint-resolution: proxy+deferral: cleared-by: same clearing event as AC-ADL1 (real OAuth on deployed env)`
- **AC-ADL6**: `constraint-resolution: po-accepted: better-auth v1.6.23 documented behavior for missing email in OAuth profile; confirmed by mocked profile fixture`

## Test / Verification Plan

### Automated checks

- **lint/typecheck**: `pnpm typecheck` (tsc --noEmit) — zero errors required; typed Env interface
  must resolve `DB: D1Database`, OAuth env vars typed as strings.
- **unit tests (Vitest)**:
  - `tests/smoke/auth-guard.test.ts` — `requireOwnership` pure-function tests; 6 cases.
  - `tests/smoke/schema.test.ts` — SQL shape assertions; 5 assertions.
  - `tests/smoke/db-collections.test.ts` — QueryCollection mock-syncer smoke; 2 cases.
  Run: `pnpm test` — all pass, exit 0.
- **E2E (Playwright, pnpm dev)**:
  - `tests/e2e/auth-flow.spec.ts` — two-context isolation + account surface + sign-out.
  Run: `pnpm exec playwright test tests/e2e/auth-flow.spec.ts` — all assertions pass.
- **pnpm audit**: `pnpm audit --audit-level=high` — clean (no new high/critical CVEs from the
  two new packages).

### Interactive verification (human-in-the-loop)

**AC-ADL1 + AC-ADL5 — OAuth sign-in + account surface**
- **What to verify**: A visitor arrives at `/sign-in`, clicks a provider button, is redirected
  through OAuth, lands at `/`, can navigate to `/account` and see their identity, and sign-out
  returns them to `/sign-in` with no active session.
- **Platform & tool**: Web — Playwright (`playwright.config.ts`, pnpm dev) for the automated
  seeded-session proxy. Real OAuth requires dev-configured OAuth apps or the deployed environment;
  that is the pre-registered residual.
- **Companion skills**: none (no observability skill needed for auth flows).
- **Steps (proxy path)**:
  1. Start `pnpm dev`.
  2. Run `pnpm exec playwright test tests/e2e/auth-flow.spec.ts`.
  3. Observe: two contexts both reach `/` after session seeding; context-A's `/account` page
     shows user-A's name; context-B sees no data from context-A.
- **Evidence capture**: Playwright screenshots at sign-in, `/`, and `/account` for each context;
  network log confirms no cross-account API responses.
- **Pass criteria**: Both contexts pass all assertions; sign-out returns to `/sign-in` with
  no valid session cookie; cross-account data access assertions pass (AC-ADL2 is an inner layer
  of the same isolation proof).

**Real OAuth residual (cleared by deployment)**:
- Register Google OAuth app at `console.cloud.google.com` (authorized redirect URI:
  `<deploy-url>/api/auth/callback/google`).
- Register GitHub OAuth app at `github.com/settings/applications` (callback URL:
  `<deploy-url>/api/auth/callback/github`).
- Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`,
  `BETTER_AUTH_SECRET` as Cloudflare Worker secrets (`wrangler secret put`).
- Drive sign-in flow once per provider on the deployed URL; screenshot as the clearing evidence.

## Risks / Watchouts

- **OAuth app registrations are PO-owned.** The test-proxy path (seeded sessions) keeps
  development green, but the real sign-in flow cannot be tested without registering OAuth apps.
  The residual is pre-registered and cleared by the first deployed sign-in.
- **TanStack DB beta API drift.** `@tanstack/db` v0.6 is beta. If `createReactCollection` /
  `createCollection` has changed its syncer signature or persistence configuration, resolve
  against the installed package types. Fallback to `useQuery` from `@tanstack/react-query` if
  the API is broken or missing key features.
- **better-auth D1 schema generation.** better-auth's D1 adapter may generate its own schema
  via `migrate()` on first request, or may require the DDL to be in the migrations file. Resolve
  at implement time: either generate the DDL via the CLI, or let better-auth run its migration
  on startup and exclude the auth tables from `0000_schema_v1.sql`.
- **`wrangler types` output path.** The generated file name (`worker-configuration.d.ts` vs
  `env.d.ts`) depends on the wrangler version (4.110.0). Resolve at implement time.
- **Server function + `cloudflare:workers` env import.** `createServerFn` runs in the Workers
  runtime, so `import { env } from 'cloudflare:workers'` works inside the function body.
  TypeScript may flag this without a proper tsconfig path. Confirm the tsconfig includes the
  generated type declaration at implement time.
- **Session seeding for E2E tests.** Inserting test sessions directly via `wrangler d1 execute
  --local` requires knowing better-auth's session table schema. Generate the schema first
  (Step 3), then write the seeding helper against it.

## Dependencies on Other Slices

- **platform-proofs** (depends-on): the D1 binding, per-request `createAuth` factory pattern,
  and `cloudflare:workers` env import pattern are all proven here. The migration from `(env as any)`
  to typed `Env` is this slice's contribution.
- **design-system-shell** (enables): the sign-in screen and account surface built here are
  restyled there with design tokens; that rework is budgeted.
- **ai-gateway** (enables): `usage_events` table lands here; the quota engine in ai-gateway
  inserts into it.
- **tutor-interview + roadmap-lesson-generation + quiz-fsrs** (enables): `journeys`, `waypoints`,
  `lessons`, `quiz_questions`, `quiz_attempts`, `concepts`, `concept_fsrs_cards` tables all
  land here; every subsequent generation slice writes into these tables.
- **adaptation-progress** (enables): the `useJourneys()` collection hook established here is
  the prototype for the QueryCollections those slices build.

## Assumptions

All resolved autonomously per the autonomous-override policy. Each records the choice and why.

1. **TanStack DB package names → `@tanstack/db` + `@tanstack/react-db`.** The shape documents
   "TanStack DB" with `createCollection` / QueryCollections. The npm packages are assumed to be
   `@tanstack/db` (core) and `@tanstack/react-db` (React bindings with `useQuery`). If the
   packages are differently named (e.g., `@tanstack/query-db`), resolve from npm at implement
   time. No user-observable consequence.

2. **D1 migration approach → `wrangler d1 migrations apply` with plain SQL.** The shape confirms
   Cloudflare-only backend. `wrangler` already installed. Raw SQL in `migrations/` is the
   platform-native approach (rung 2). No migration library (Drizzle, Kysely migrations) is added.
   The risk is that schema changes in later slices need additional migration files — that is
   the correct behavior, not a limitation. No user-observable consequence.

3. **better-auth table schema → inline in `0000_schema_v1.sql` OR migrated by better-auth on startup.**
   Two valid approaches: (a) copy the better-auth D1 DDL into the migration file so everything
   is in one place, or (b) let better-auth run its own `migrate()` on startup and put only the
   domain tables in the SQL file. The plan chooses (a) for visibility — one migration file
   describes the full schema. If better-auth's `migrate()` and the explicit DDL conflict,
   switch to (b) at implement time. No user-observable consequence.

4. **Cross-user denial tests → pure unit test in regular Vitest (no `@cloudflare/vitest-pool-workers`).**
   The platform-proofs plan flagged `@cloudflare/vitest-pool-workers` as a potential need for
   in-process D1 testing at this slice. The guard (`requireOwnership`) is extracted as a pure
   synchronous function whose logic does not require the Workers runtime. The full data isolation
   (that `listJourneys` actually filters by `user_id` in D1) is covered by the Playwright E2E
   test against `wrangler dev`. This avoids adding a new stack entry. No user-observable consequence.

5. **Sign-in screen placement → `/sign-in` as a top-level file-based route.**
   The route is at `src/routes/sign-in.tsx`, producing the URL `/sign-in`. It is a public route
   (no `beforeLoad` guard). The account route (`/account`) uses its own `beforeLoad` redirect
   to protect itself. This is simpler than introducing a layout-route auth wrapper for this
   slice; the full nav shell and layout wrapper are design-system-shell's job. No user-observable
   consequence beyond the URL shape (which is correct for the product).

6. **Account route protection → route-level `beforeLoad`, not root-level redirect.**
   `src/routes/account.tsx` adds `beforeLoad: async () => { const s = await getSession(); if (!s) throw redirect({ to: '/sign-in' }) }`. `__root.tsx` is not modified in this slice. A root-level
   auth redirect is design-system-shell's responsibility when the full navigation shell is added.
   No user-observable consequence.

7. **OAuth test proxy → seeded sessions via `wrangler d1 execute --local`.**
   Real Google/GitHub OAuth cannot run in a headless test environment. The proxy seeds two users
   and their sessions directly into the local miniflare D1 database at test startup (using
   `wrangler d1 execute --local --command "INSERT INTO ..."` in the Playwright `globalSetup`).
   This bypasses the OAuth redirect flow but exercises the session validation and data isolation
   exactly as production would. The proxy is explicitly pre-approved per the constraint-resolution
   `proxy+deferral` entry above. The residual (real OAuth on a deployed environment) is cleared
   at the PO's next deployment step.

8. **FSRS columns in `concept_fsrs_cards` → plain SQL columns (no ts-fsrs install in this slice).**
   The `ts-fsrs` library is the scheduling engine; it is the quiz-fsrs slice's dependency.
   This slice only needs the seven FSRS fields as SQL columns (due INTEGER, stability REAL,
   difficulty REAL, reps INTEGER, lapses INTEGER, state TEXT, last_review INTEGER). No `ts-fsrs`
   install is needed here; the TypeScript type in `src/db/schema.ts` mirrors the columns
   directly. No user-observable consequence.

9. **`wrangler types` output → project root, not `src/`.** `wrangler types` writes to the
   project root by default (e.g., `worker-configuration.d.ts`). The existing
   `src/cloudflare-workers.d.ts` stub is updated to import the generated `Env` interface and
   re-export it into the `cloudflare:workers` module augmentation, so existing code using
   `import { env } from 'cloudflare:workers'` gains the typed `Env` automatically. No
   user-observable consequence.

## Blockers

None. All AC environment dependencies are satisfiable locally (`pnpm dev`, `wrangler dev`,
miniflare D1, pre-installed Playwright browsers), or carry pre-registered constraint-resolutions.
The OAuth prerequisite is the only external dependency; its proxy path (seeded sessions) keeps
the full verification suite runnable without PO action.

No new stack entries that require shape approval are introduced. `@tanstack/db` and
`@tanstack/react-db` were confirmed in the shape adoption matrix as `USE`. The addition of these
packages is an anticipated implementation step, not a new stack decision.

## Freshness Research

The shape's seven-source freshness sweep (2026-07-10) covered the key facts for this slice:

- **better-auth ≥ 1.6.23**: patched CVE-2025-61928; D1 adapter bundled; per-request factory
  pattern confirmed. No new advisory found between shape and plan. Pin confirmed at 1.6.23.
- **TanStack DB v0.6 beta**: QueryCollections + server functions (no sync engine) is the confirmed
  pattern. The official `@tanstack/cloudflare-durable-objects-db-sqlite-persistence` (v0.1.11)
  keeps real-time sync on the roadmap without any v1 action. The shape's freshness check did not
  surface a stable v1 release of `@tanstack/db`; expect to install a beta at implement time.
- **ts-fsrs v5.4.1 (FSRS-6)**: not installed in this slice; seven-column schema is confirmed
  from shape's research. `last_review` maps to ts-fsrs's `lastReview` field (camelCase in the
  library, snake_case in SQL — the TypeScript type bridges them).
- **CVE-2026-45321 (TanStack supply-chain)**: exact pinning + `pnpm audit` in CI remains the
  mitigation. Two new packages must pass the audit check.
- **wrangler 4.110.0**: `wrangler types` and `wrangler d1 migrations apply --local` both exist
  in this version. No new wrangler research needed.

No additional freshness research was conducted; the shape's sweep is current for this slice's
scope and the platform-proofs review confirmed the D1 + better-auth pattern works under workerd.

## Recommended Next Stage

- **Option A (default): implement accounts-data-layer** — Plan is complete, all ACs have verified
  resolution paths, no blockers. Consider `/compact` before implementing — workflow state lives
  in the artifact files and the hook re-reads after compaction.
- **Option B: plan design-system-shell** — Author the next slice's plan before coding if you
  prefer plans ahead of implementation. The design brief (`02b-design.md`) is present; the
  design-system-shell plan will author the visual contract (`02c-craft.md`) per the conditional-
  input rule in the plan reference.
- **Option C: revisit slice** — Not indicated. The accounts-data-layer scope is well-contained
  and all dependency interfaces (D1 binding, better-auth mount pattern) are proven.
