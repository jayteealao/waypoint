---
schema: sdlc/v1
type: implement-index
slug: waypoint-app
status: in-progress
stage-number: 5
created-at: "2026-07-11T00:40:00Z"
updated-at: "2026-07-11T12:52:05Z"
slices-implemented: 3
slices-total: 12
metric-total-files-changed: 61
metric-total-lines-added: 17376
metric-total-lines-removed: 50
tags: [bootstrap, ci, supply-chain, greenfield, de-risking, workerd, tanstack-ai, d1, better-auth, auth, schema, tanstack-db, isolation, oauth]
refs:
  index: 00-index.md
  plan-index: 04-plan.md
next-command: wf-verify
next-invocation: "/wf verify waypoint-app accounts-data-layer"
---

# Implement Index

## Cross-Slice Integration Notes

- **Foundation is committed** — `src/` directory structure, `vite.config.ts`, exact-pinned
  `package.json`, and `wrangler.jsonc` are the baseline all subsequent slices build on.
  Sibling slices must NOT introduce floating ranges (`^`/`~`/`latest`) in devDependencies.

- **No `app/` directory** — The plan described `app/router.tsx` etc.; the scaffold uses `src/`.
  All sibling slices must use `src/` paths.

- **Tailwind CSS included** — Tailwind 4.3.2 is available; design-system-shell slice can use
  it immediately without re-installation.

- **`routeTree.gen.ts` is committed** — Route generation is handled by the Vite plugin in dev mode.
  CI does NOT need a separate `generate-routes` step as long as the committed gen file stays
  in sync. Any slice that adds routes must regenerate and commit `routeTree.gen.ts`.

- **Cloudflare observability foundation** — `wrangler.jsonc` has `observability: {enabled: true}`.
  All subsequent slices' `console.log` calls in Workers code are automatically collected via Logpush.
  No additional setup needed for log collection; instrumentation signals are just `console.log(JSON.stringify({...}))`.

- **Platform proofs: API route pattern** — `createFileRoute` from `@tanstack/react-router` with
  `server: { handlers: { GET, POST } }` is the correct API for server routes in TanStack Start v1.x.
  `createAPIFileRoute` from `@tanstack/react-start/server` does NOT exist. All subsequent slices
  adding API routes must use the `createFileRoute` + `server.handlers` pattern.

- **Platform proofs: TanStack AI provider packages** — `@tanstack/ai` core is activity-based.
  Provider adapters are in separate packages: `@tanstack/ai-openrouter` (native) and
  `@tanstack/ai-openai` (OpenAI-compatible). Both exact-pinned. The `AIClient` interface in
  `src/lib/ai-client.ts` is the abstraction the ai-gateway slice extends.

- **Platform proofs: D1 binding pattern** — `wrangler.jsonc` now has `d1_databases` with
  `binding: "DB"`. The per-request `createAuth(env['DB'])` factory pattern in
  `src/lib/auth.ts` + `src/routes/api/auth/$.ts` is the architectural contract for all
  Workers routes that touch the database. No module-scope D1 client state is permitted.

- **Platform proofs: `cloudflare:workers` type shim** — `src/cloudflare-workers.d.ts` provides
  the TypeScript module declaration for `import { env } from 'cloudflare:workers'`. The typed
  `Env` interface (via `wrangler types`) is deferred to accounts-data-layer.

- **Accounts-data-layer: full v1 D1 schema** — `migrations/0000_schema_v1.sql` ships the complete
  domain schema in one act. Every subsequent slice that writes to D1 reads from these tables.
  No schema migration is needed until a later slice requires a new column; when it does, a new
  `migrations/000N_*.sql` file is the correct approach.

- **Accounts-data-layer: `usage_events` schema matches `04b-instrument.md`** — The ai-gateway
  slice must insert into `usage_events` using the column names in `src/db/schema.ts` (not the
  plan's original simpler set): `user_id`, `journey_id`, `model`, `type`, `prompt_tokens`,
  `completion_tokens`, `cost_usd`, `duration_ms`, `outcome`, `at`.

- **Accounts-data-layer: TanStack DB API** — `@tanstack/db@0.6.14` uses `createCollection` (not
  `createReactCollection`). `@tanstack/react-db@0.1.92` provides `useLiveQuery` for React
  components. The syncer API is `{ sync: ({ begin, write, commit, markReady }) => void }`.
  Subsequent slices adding more collections must use this API.

- **Accounts-data-layer: `withSession` middleware** — All server functions that need the
  authenticated user must use the `withSession` middleware from `src/server/journeys.ts`
  (or copy the pattern). `getWebRequest()` is NOT available in `@tanstack/react-start@1.168.x`.

- **Accounts-data-layer: auth-guard.ts contract** — `requireAuth(env, request)` throws 401 Response;
  `requireOwnership(sessionUserId, resourceUserId)` throws 403 Response. Both are the exclusive
  entry points for session and ownership validation in server functions.

## Recommended Next Stage

- **Option A (default):** `/wf verify waypoint-app accounts-data-layer` — Smoke tests pass; E2E tests
  pass for UI-only assertions. Full seeded-session suite runs with `BETTER_AUTH_SECRET` set.
- **Option B:** `/wf review waypoint-app accounts-data-layer` — Skip verify if smoke tests and
  partial E2E evidence are sufficient.
- **Option C:** `/wf implement waypoint-app design-system-shell` — Implement the next slice once
  accounts-data-layer is verified/reviewed.
