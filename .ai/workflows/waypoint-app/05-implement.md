---
schema: sdlc/v1
type: implement-index
slug: waypoint-app
status: in-progress
stage-number: 5
created-at: "2026-07-11T00:40:00Z"
updated-at: "2026-07-12T02:43:03Z"
slices-implemented: 9
slices-total: 12
metric-total-files-changed: 164
metric-total-lines-added: 25753
metric-total-lines-removed: 486
tags: [bootstrap, ci, supply-chain, greenfield, de-risking, workerd, tanstack-ai, d1, better-auth, auth, schema, tanstack-db, isolation, oauth, design-system, tokens, app-shell, oklch, responsive, dashboard, lesson-rendering, widget-registry, sanitization, progressive-rendering, trust-model, ai-gateway, quotas, model-tiering, fallback, instrumentation, cost-attribution]
refs:
  index: 00-index.md
  plan-index: 04-plan.md
next-command: wf-verify
next-invocation: "/wf verify waypoint-app sample-journey"
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

- **Sample-journey: `ShellWaypoint` type and `waypoints`/`setWaypoints` context** — `ShellContextValue`
  now includes `waypoints: ShellWaypoint[]` and `setWaypoints`. All shell consumers (`Sidebar`, `DrawerNav`)
  render the waypoint list when `waypoints.length > 0`. The `roadmap-lesson-generation` slice will populate
  real journey waypoints using this same infrastructure. Do not duplicate waypoint state in child components.

- **Sample-journey: `wp:sample-progress` custom event bus** — the sample layout route listens for this
  event and recomputes completion state from localStorage. Child routes dispatch it via `setTimeout(0)`
  after writing to localStorage. Future sample-journey route additions must follow the same pattern.

- **Sample-journey: `wp-quiz` CSS namespace** — `.wp-quiz*` classes appended to `src/styles.css`.
  The quiz-fsrs slice extending `QuizView` must append new states to this namespace, not introduce a
  separate class prefix. Existing `.wp-quiz-option--correct/--incorrect` are reusable for real quiz grading.

- **Sample-journey: `SAMPLE_JOURNEY_VISITED_KEY` is the first-login gate** — `JourneysDashboard`
  redirects new users to `/sample` when `localStorage.getItem('wp:sample-visited') !== 'true'` and
  `journeys.length === 0`. The sample layout sets the key on mount. Future slices that create journeys
  for new users must account for this gate (e.g., `journeys.length > 0` suppresses the redirect naturally).

- **Sample-journey: `SampleQuizQuestion` interface** — exported from `src/fixtures/sample-journey.ts`.
  The quiz-fsrs slice's real quiz question type should be a superset of (or compatible with) this
  interface. `QuizView` is parameterised on `SampleQuizQuestion[]`; if the real question type is
  compatible, `QuizView` can be reused directly.

- **AI-gateway: `callGateway()` is the exclusive LLM entry point** — `tutor-interview`,
  `roadmap-lesson-generation`, `quiz-fsrs`, and `adaptation-progress` MUST call `callGateway()`
  from `src/lib/ai/gateway.ts`. Direct use of `createOpenRouterClient` / `createOpenAIFallbackClient`
  / `createMockAIClient` from `src/lib/ai-client.ts` is only for unit tests and the gateway's own
  fallback chain internals. Consumer slices that bypass `callGateway()` silently skip quota enforcement
  and usage recording.

- **AI-gateway: `GenerationType` is `'interview' | 'lesson' | 'quiz' | 'roadmap'`** — matches the
  `usage_events.type` CHECK constraint in D1. Slices must use one of these four values as `type` in
  their `callGateway()` call. Adding a new generation type requires both a `tiers.ts` entry AND a
  D1 schema migration updating the CHECK constraint.

- **AI-gateway: `getQuotaStatus` returns `QuotaStatusSerialized`** — `resetAt` is an ISO-8601 string
  (not a `Date`) for JSON transport across the server function boundary. Route loaders that use the
  result must `new Date(status.resetAt)` before passing to components. The `quota-fixture.tsx` route
  shows the canonical deserialization pattern.

- **AI-gateway: `QuotaCard` expects `QuotaStatus` (Date, not string)** — the component takes
  `{ status: QuotaStatus }` where `resetAt` is a `Date`. Always deserialize before rendering.

- **AI-gateway: `checkQuota` takes an optional `requestType`** — the third arg is `GenerationType | undefined`
  and is included in the `quota.rejected` signal for attribution. Consumer slices must pass `type` as the third arg.

- **AI-gateway: quota card `data-testid="quota-card"` is on a wrapper `<div>`** — not on the inner `<Card>`.

- **Tutor-interview: `CapturedRecord` is the interview → roadmap contract** — `src/types/interview.ts:CapturedRecord` (`mission`, `scope`, `priorKnowledge`, `sourceUrls`, `bestEffort`) is what `completeInterview()` returns and what `roadmap-lesson-generation` receives as input. Do not change its shape without updating the roadmap slice.

- **Tutor-interview: `InterviewStateMachine` is pure and re-instantiable** — Takes `initialStage` in its constructor. Each server function call creates a new instance from the stored D1 `stage` field. No in-memory state survives across Workers invocations.

- **Tutor-interview: `STAGE_CHIPS` is the authoritative chip set** — exported from `src/types/interview.ts`. If the interview stage sequence changes, update `STAGE_CHIPS` and the `InterviewStateMachine.transition()` accordingly. Do not hardcode chip labels in route or component files.

- **Tutor-interview: `?mock=1` on the interview route** — `validateSearch` in `interview.tsx` exposes `mock: boolean`. The `sendTurn` server function honors `mock: true` only when `NODE_ENV !== 'production'`. E2E tests use this seam; never use it in production configurations.

- **Tutor-interview: `interview_records.turns` is JSON** — serialized `InterviewTurn[]`. Slices reading this column must call `JSON.parse(record.turns)` with a try/catch. `parseTurns()` in `src/server/interview.ts` provides the safe parser; import and reuse it if needed.

- **Tutor-interview: dashboard CTA now points to `/journey/new`** — `JourneysDashboard` `EmptyState` links to `/journey/new` (sdlc-debt comment removed). The first-login redirect in `useEffect` still goes to `/sample` for users who haven't visited it. These two behaviours are independent.

- **Tutor-interview: prompt suite lives in `src/lib/interview/prompts.ts`** — `LESSON_SYSTEM_PROMPT`, `QUIZ_SYSTEM_PROMPT`, `ROADMAP_SYSTEM_PROMPT` are drafted thin with `// FIDELITY-NOTE:` comments. Consuming slices (`roadmap-lesson-generation`, `quiz-fsrs`) should import from this file and refine wording rather than authoring a new prompt file.
  Playwright selectors must use `[data-testid="quota-card"]` not a Card class selector.

- **Roadmap-lesson-generation: `concept_tags?` on all `LessonSection` types** — `src/types/lesson-document.ts` adds `concept_tags?: string[]` to all five section union members (`ProseSection`, `CodeSection`, `HeadingSection`, `CitationSection`, `WidgetSection`). This is additive and backward-compatible. The quiz-fsrs slice reads these tags; if absent, it should default to the waypoint's concept list.

- **Roadmap-lesson-generation: `generateRoadmap` returns `{ firstWaypointId, waypointCount }`** — The interview route navigates to `/journey/$journeyId/waypoint/$waypointId` using `firstWaypointId`. All waypoints are inserted atomically via `DB.batch([DELETE_OLD, ...INSERTs])`. Prior roadmaps are replaced, not appended.

- **Roadmap-lesson-generation: SSE route bypasses callGateway** — `src/routes/api/journey/$journeyId/lesson.ts` calls `createOpenRouterText()` + `chat()` directly (streaming, not drained). It still calls `checkQuota()` and records to `usage_events`. Consumer slices adding streaming paths should follow this same pattern.

- **Roadmap-lesson-generation: `upsertLesson()` is a plain async** — NOT a createServerFn. Called directly from the SSE route's ReadableStream controller. The `content` column stores `JSON.stringify(LessonSection[])` (accumulated sections). The `sources` column stores `JSON.stringify({ sources, recommended_primary_source })`.

- **Roadmap-lesson-generation: Journey layout route** — `src/routes/_authenticated/journey/$journeyId.tsx` loads `getJourneyWithWaypoints()` and sets ShellContext waypoints via `useEffect`. All journey-scoped child routes benefit from this automatically. The waypoints are cleared when leaving the journey context (cleanup in useEffect).

- **Roadmap-lesson-generation: `data-testid="waypoint-link"`** — Added to each `<Link>` in `Sidebar.tsx` for Playwright E2E. The attribute is alongside the existing `data-waypoint={wp.id}` attribute.

## Recommended Next Stage

- **Option A (default):** `/wf verify waypoint-app roadmap-lesson-generation` — 20 Vitest unit tests (roadmap schema + NDJSON parser) + 4 Playwright E2E tests (seeded-session, BETTER_AUTH_SECRET deferral applies). BETTER_AUTH_SECRET deferral absorbed into existing AC-ADL1+AC-ADL5 entry.
- **Option B:** `/wf review waypoint-app roadmap-lesson-generation` — Skip verify if unit tests + typecheck are sufficient. Not recommended given SSE path complexity.
