---
schema: sdlc/v1
type: implement-index
slug: waypoint-app
status: in-progress
stage-number: 5
created-at: "2026-07-11T00:40:00Z"
updated-at: "2026-07-11T19:15:37Z"
slices-implemented: 5
slices-total: 12
metric-total-files-changed: 103
metric-total-lines-added: 20411
metric-total-lines-removed: 369
tags: [bootstrap, ci, supply-chain, greenfield, de-risking, workerd, tanstack-ai, d1, better-auth, auth, schema, tanstack-db, isolation, oauth, design-system, tokens, app-shell, oklch, responsive, dashboard, lesson-rendering, widget-registry, sanitization, progressive-rendering, trust-model]
refs:
  index: 00-index.md
  plan-index: 04-plan.md
next-command: wf-verify
next-invocation: "/wf verify waypoint-app design-system-shell"
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

- **Design-system-shell: OKLCH ember token set** — `src/styles.css` is the canonical token source.
  Token names: `--paper`, `--paper-mid`, `--surface`, `--surface-raised`, `--ink`, `--ink-muted`,
  `--ink-faint`, `--ember`, `--ember-dark`, `--ember-subtle`, `--border`, `--border-strong`,
  `--shadow-card`, `--shadow-overlay`. Radius tokens: `--radius-sm/md/lg/xl/pill`. Motion tokens:
  `--motion-fast/default/slow`. All subsequent slices must use these names; introducing new hardcoded
  colour values is a lint failure. The WCAG AA test in `tests/smoke/contrast.test.ts` must stay green.

- **Design-system-shell: `wp-*` CSS namespace** — Component classes follow the `wp-` prefix convention.
  Slices adding new UI components must add classes to `src/styles.css` under `wp-<component-name>`
  before writing JSX. Component classes live in `src/styles.css`; no separate CSS module files.

- **Design-system-shell: pathless layout route** — `src/routes/_authenticated.tsx` is the single auth
  gate. All pages requiring auth must be placed in `src/routes/_authenticated/`. Adding a route at
  `src/routes/` root level creates a public (unauthenticated) page. New authenticated pages must NOT
  add per-route `beforeLoad` auth guards; the layout route handles it.

- **Design-system-shell: `AppShell` and `ShellContext`** — Authenticated pages are wrapped in
  `AppShell`. The `ShellContext` (from `src/components/shell/AppShell.tsx`) provides
  `{ drawerOpen, toggleDrawer, closeDrawer }` for any component that needs to control the mobile
  drawer. Do not call `useState` for drawer state in child components; use `useShell()` instead.

- **Design-system-shell: `useJourneys()` return-type** — `useLiveQuery` in `@tanstack/react-db@0.1.92`
  returns `any`. The `JourneysDashboard` component normalises both `Journey[]` and `{journeys:Journey}[]`
  return shapes. Slices building new collection consumers must include the same normalisation until the
  library ships typed return values.

- **Design-system-shell: Fraunces typeface** — `font-family: "Fraunces", Georgia, serif` is loaded via
  the Google Fonts import in `src/styles.css`. Apply it with the `.display-title` utility class for
  display-size headings (brand name, journey name, section titles). Body copy uses the system font stack.

- **Design-system-shell: `prefers-reduced-motion` gates** — Every CSS transition and `@keyframes`
  animation must be wrapped in `@media (prefers-reduced-motion: no-preference)` with an explicit
  `transition: none` / `animation: none` override in the `reduce` branch. The contrast and motion
  smoke tests verify both branches.

- **Lesson-renderer: `LessonDocumentV1` is the 3-slice contract** — `src/types/lesson-document.ts`
  is consumed by sample-journey (fixture authoring), roadmap-lesson-generation (AI output schema),
  and quiz-fsrs (checkpoint-question concept tagging). The `version: 1` discriminant allows additive
  changes safely. Rename/delete/narrow fields requires a `version: 2` migration.

- **Lesson-renderer: widget registry** — `resolveWidget(type, props)` in
  `src/lib/lesson/widget-registry.ts` is the only interactivity path. New widget types must be
  registered there with a `validate` type-guard and a React component. The registry is a module
  singleton; registrations happen at import time.

- **Lesson-renderer: `sanitizeHtml` + `sanitizerReady`** — `src/lib/lesson/sanitize.ts` exports
  both. Prose content from AI output must go through `sanitizeHtml()` before `dangerouslySetInnerHTML`.
  Tests that call `sanitizeHtml` must `await sanitizerReady` in `beforeAll` (jsdom environment required
  for DOMPurify).

- **Lesson-renderer: `getLesson` server function** — Returns raw `Lesson` with `content: string | null`.
  Callers parse with `JSON.parse(row.content) as LessonDocumentV1`. TanStack Start's serialization
  validator rejects `Record<string, unknown>` so parsing is deferred to the route loader.

- **Lesson-renderer: fixture route** — `/_authenticated/lesson/fixture` serves the canonical
  FIXTURE_LESSON. `?stream=simulate` activates `useSimulatedStream` for progressive-rendering tests.
  Not exposed in the sidebar nav; dev/E2E use only.

- **Lesson-renderer: CSS wp-lesson namespace** — `.wp-lesson`, `.wp-checkpoint`, `.wp-flipcard` class
  families are appended to `src/styles.css`. No existing classes were modified.

- **Lesson-renderer: `getLesson` does NOT parse content** — returns `Lesson` (content: string | null).
  Route loaders call `JSON.parse(row.content) as LessonDocumentV1` after receiving the row.

## Recommended Next Stage

- **Option A (default):** `/wf verify waypoint-app lesson-renderer` — AC-LR4 unit tests pass on
  every `pnpm test` run. Playwright ACs deferred under existing ADL deferral
  (BETTER_AUTH_SECRET wall); proxy evidence recorded.
- **Option B:** `/wf review waypoint-app lesson-renderer` — Skip verify if proxy evidence is
  sufficient for the code review gate.
- **Option C:** `/wf implement waypoint-app sample-journey` — Can start immediately since
  `LessonDocumentV1` schema and `LessonView` component are both available.
