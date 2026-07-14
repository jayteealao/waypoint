---
schema: sdlc/v1
type: implement-index
slug: waypoint-app
status: in-progress
stage-number: 5
created-at: "2026-07-11T00:40:00Z"
updated-at: "2026-07-14T20:54:18Z"
slices-implemented: 21
slices-total: 21
metric-total-files-changed: 408
metric-total-lines-added: 39024
metric-total-lines-removed: 9067
tags: [bootstrap, ci, supply-chain, greenfield, de-risking, workerd, tanstack-ai, d1, better-auth, auth, schema, tanstack-db, isolation, oauth, design-system, tokens, app-shell, oklch, responsive, dashboard, lesson-rendering, widget-registry, sanitization, progressive-rendering, trust-model, ai-gateway, quotas, model-tiering, fallback, instrumentation, cost-attribution, adaptation, progress-surfaces, mastery, streaks, fsrs, responsive-sweep, source-grounding, url-fetch, citations, prompt-injection, workers-runtime, model-refresh, reasoning-effort, openrouter, dead-code, streaming, metering, refactor]
refs:
  index: 00-index.md
  plan-index: 04-plan.md
next-command: wf-verify
next-invocation: "/wf verify waypoint-app e2e-session-cookie-prefix"
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
  (or copy the pattern). NOTE (corrected by tanstack-start-request-access): the request is
  obtained via the framework primitive `getRequest()` from `@tanstack/react-start/server`
  inside a `type: 'function'` middleware — the earlier "`getWebRequest()` is NOT available"
  note was a misconception (`getWebRequest` was renamed `getRequest`; verified in
  `node_modules/@tanstack/start-server-core`). Do not reintroduce a `type: 'request'` shim
  to capture the request.

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

- **Quiz-fsrs: `ts-fsrs@5.4.1` required** — install before running code that imports `ts-fsrs`. Workers-compatible pure ESM, no Node builtins. Add to `package.json` with exact pin.

- **Quiz-fsrs: `QuizView` requires `mode` prop** — discriminated union `mode: 'sample' | 'journey'`. Any new usage of `QuizView` must specify mode; omitting it is a typecheck error.

- **Quiz-fsrs: server function route paths drop `_authenticated` prefix** — `Link to` and `router.navigate` must use `/journey/$journeyId/...`, not `/_authenticated/journey/$journeyId/...`. TanStack Router strips layout segment names from registered paths.

- **Quiz-fsrs: `generateQuiz` is on-demand** — Called only when `getQuizQuestions` returns an empty array (first visit to the quiz route). Never called during lesson generation or roadmap creation.

- **Quiz-fsrs: `gradeAnswer` returns `GradingOutput`** — `{ verdict: 'correct'|'incorrect'|'partial', score: 0|1|2, feedback: string }`. The FSRS rating mapping is: score=2 → `Rating.Good`, score=1 → `Rating.Hard`, score=0 → `Rating.Again`.

- **Quiz-fsrs: waypoint route moved to index file** — `src/routes/_authenticated/journey/$journeyId/waypoint/$waypointId.tsx` became `index.tsx` inside a `$waypointId/` subdirectory to allow the `quiz.tsx` child route.

- **Adaptation-progress: `onComplete(score, total)` replaces `onComplete()` in journey mode** — `QuizView`'s `JourneyModeProps.onComplete` now takes `(score: number, total: number)`. Any consumer of `QuizView mode="journey"` must update its `onComplete` callback signature. `SampleModeProps.onComplete` is unchanged (`() => void`).

- **Adaptation-progress: `adaptations` table ships in `migrations/0002_adaptations.sql`** — Additive-only. No prior migrations were modified. Future slices needing to read proposals use `WHERE status = 'proposed'` and can join through `journey_id`.

- **Adaptation-progress: `getProgressForDashboard` is the mastery overlay** — Returns `Record<journeyId, masteryPct 0–100>`. The dashboard route loader calls it after `listJourneys()`. The TanStack DB `useJourneys()` collection continues to be the authoritative journey list; `getProgressForDashboard` is an overlay only. Do not replace `useJourneys()` with a server-function loader without also rebuilding the first-login redirect logic.

- **Adaptation-progress: one pending proposal per journey invariant** — `proposeAdaptation` guards with `SELECT COUNT(*) WHERE status='proposed'` before inserting. Any code path that creates an adaptation row must honor this invariant or proposals will stack.

- **Adaptation-progress: `src/lib/progress/metrics.ts` is pure stdlib** — `computeStreak`, `computePassRate`, `groupMasteryByWaypoint`. No D1 or network dependency; safe to import in unit tests without a Workers runtime.

- **Adaptation-progress: progress route path is `/_authenticated/journey/$journeyId/progress`** — Registered in `routeTree.gen.ts`. TanStack Router strips the `_authenticated` layout prefix from the `to` prop: use `to="/journey/$journeyId/progress"` in `Link` and `router.navigate`. Sidebar "Progress" link uses this path.

- **Adaptation-progress: `JourneyProgress` interface is the full payload** — Exported from `src/server/progress.ts`. Fields: `waypoints`, `completionStatus`, `masteryByWaypoint`, `quizHistory` (max 20), `streak`, `dueCount`, `pendingAdaptation`. The `source-grounding` slice (if it uses quiz data) should treat this interface as the source of truth for per-journey status.

- **Source-grounding: `buildSourceMaterialBlock()` is the injection-safe grounding helper** — Exported from `src/lib/interview/prompts.ts`. Always use this helper (not ad-hoc string concatenation) when injecting fetched source content into any generation prompt. The function returns an empty string for an empty array, so callers can safely append without a length check.

- **Source-grounding: `captured_source_content` column ships in `migrations/0003_source_grounding.sql`** — Additive `ALTER TABLE interview_records ADD COLUMN captured_source_content TEXT NOT NULL DEFAULT '[]'`. Apply with `wrangler d1 execute waypoint-dev --local --file migrations/0003_source_grounding.sql` before running the app against local D1 after pulling this branch.

- **Source-grounding: URL fetch runs in all modes (including mock=1)** — `fetchSourceUrl` is NOT suppressed by mock mode. Only the AI gateway call is suppressed. This allows E2E tests to exercise the fetch-failure conversational path with a deliberately failing URL (`.nonexistent.invalid` domain) while mock mode keeps AI costs zero.

- **Source-grounding: `fetchSourceUrl` type union** — Returns `SourceFetchResult` from `src/lib/source-fetch.ts`. Callers MUST check `result.ok` before accessing content fields. Reasons: `'timeout'`, `'network_error'`, `'bad_content_type'`, `'too_large'`. All failure modes are non-throwing.

- **Model-refresh: `TierConfig.reasoningEffort` is the per-tier reasoning knob** — Optional `'low' | 'medium' | 'high'` on `src/lib/ai/tiers.ts`. When set, the gateway (`drainStream`) and the lesson SSE route both forward it as `modelOptions: { reasoning: { effort } }`; when unset, no reasoning field is sent (the model's own default applies, e.g. grok-4.5's mandatory `high`). Any new tier or new model-invocation path must honor the same conditional-passthrough pattern — do not hardcode an effort inline.

- **Model-refresh: current tier table (2026-07-12 OpenRouter, PO-ratified)** — interview/lesson/quiz = `z-ai/glm-5.2` (fallbacks `openai/gpt-5.6-luna` / `google/gemini-3.5-flash` / `deepseek/deepseek-v4-pro`); roadmap = `x-ai/grok-4.5` (fallback `openai/gpt-5.6-luna`). Every fallback is a different provider than its primary. `pricingPer1MTokens` matches the primary's live figures. No consumer hardcodes model IDs — all resolve from `TIERS`.

- **Model-refresh: live smoke needs a generous per-test timeout** — `tests/smoke/ai-tool-call.test.ts`'s gated live cases carry a `180_000` per-test timeout because reasoning-model tiers are slower than the prior non-reasoning models and time out under Vitest's 5 s default. Any new live-model smoke case must set its own timeout.

- **Tanstack-start-request-access: `getRequest()` is the request-access primitive** — All server functions obtain the incoming `Request` via `getRequest()` from `@tanstack/react-start/server` (returns the raw `Request`; `getRequest().headers` for headers), inside a `type: 'function'` middleware. There is NO `createMiddleware({ type: 'request' })` request-capture shim anywhere in `src/` and NO comment claiming `getWebRequest()` is unavailable. Any new server function that needs the request must call `getRequest()` — do not resurrect the request-middleware workaround. Auth is still enforced by the shared `withSession` middleware calling `requireAuth(env, getRequest())`; `src/lib/get-session.ts` calls `getRequest().headers` inline (no middleware).

- **Tanstack-ai-gateway-hygiene: `src/lib/ai/model-stream.ts` is the single AI streaming engine** —
  `runModelWithFallback` (fallback loop + `@tanstack/ai` chunk parsing + usage accumulation),
  `computeCost` (prefer `usage.total_cost`, else recompute from tier pricing), and `recordUsage`
  (the `usage_events` INSERT) live here once. BOTH `src/lib/ai/gateway.ts` (buffered — `onTextDelta`
  appends to a string) and `src/routes/api/journey/$journeyId/lesson.ts` (SSE — `onTextDelta` runs the
  NDJSON line-buffer + `controller.enqueue`) consume it. Any new AI call path must route through this
  helper, not re-implement the fallback/chunk/metering loop. This **supersedes** the earlier
  Roadmap-lesson-generation note ("SSE route bypasses callGateway … calls `createOpenRouterText()` +
  `chat()` directly") and the Model-refresh note referencing `drainStream` (removed): the SSE route no
  longer imports `chat()`/`createOpenRouterText` directly, and `drainStream` no longer exists.

- **Tanstack-ai-gateway-hygiene: no provider structured-output surface** — `GatewayInput` is now
  `GatewayCallWithTools | GatewayCallText` (no `responseFormat` arm, no `TypeError` guard). Quiz and
  roadmap produce JSON from their **system prompts** + a validate-and-one-re-ask loop, not a provider
  `responseFormat`/`outputSchema` parameter. `@tanstack/ai@0.40` has no `responseFormat` param (real API
  is `outputSchema`); do not reintroduce `responseFormat`. The `QUIZ_QUESTION_JSON_SCHEMA` /
  `GRADING_JSON_SCHEMA` / `WAYPOINT_JSON_SCHEMA` constants were deleted (they never reached the model).

- **Tanstack-ai-gateway-hygiene: `src/lib/ai-client.ts` deleted; `@tanstack/ai-openai` removed** —
  This **supersedes** the Platform-proofs note naming `src/lib/ai-client.ts` / the `AIClient` interface
  as the ai-gateway abstraction and the AI-gateway note referencing `createOpenRouterClient` /
  `createOpenAIFallbackClient` / `createMockAIClient`. Those factories are gone. `callGateway()` (via
  `model-stream.ts`) is the sole LLM entry point; unit tests use inline mocks, not a shared wrapper.
  `@tanstack/ai-openai` is no longer a dependency (−188 transitive packages).

- **Tanstack-router-typed-context: `RouterContext` is the one router-context type** —
  `src/routes/__root.tsx` now exports `type RouterContext = { auth: Awaited<ReturnType<typeof getSession>> }`
  and the root route uses `createRootRouteWithContext<RouterContext>()`. `src/router.tsx`'s `getRouter()`
  seeds the now-**required** initial `context: { auth: null } satisfies RouterContext` (concrete context
  type flips `createRouter`'s `context` option to mandatory — `router-core/router.d.ts:461-465`). Every
  route `beforeLoad`/`loader` reads `context.auth` typed; the `context as { auth?: … }` casts in
  `_authenticated.tsx` and `sign-in.tsx` are deleted. **Any slice that adds a new router-context field
  (e.g. `tanstack-data-layer-unification` adding a `queryClient`/collection handle) MUST extend
  `RouterContext` in `__root.tsx` and update the `getRouter()` seed to match — do not redefine the type
  or reintroduce a cast.** The `src/server/*.ts` `context as { session }` casts are a *different* DI chain
  (server-fn middleware) and are intentionally untouched.

- **Tanstack-data-layer-unification: `defineDomainCollection` is the one collection factory** —
  `src/lib/db/collection-factory.ts` (`defineDomainCollection` + `seedStorage` + lazy per-user
  registry) is the shape for EVERY client-read collection. Journeys lives in `src/lib/store/journeys.ts`;
  the other 7 client entities in `src/lib/store/collections.ts`. Rules any future collection must follow:
  (1) carry a Zod v4 `schema` from `src/lib/db/schemas.ts` so `useLiveQuery` types flow with no `as any`;
  (2) persist under `wp:<userId>:<entity>` via `storageKey()` and be purged by `purgeUserCache()` on
  sign-out; (3) be created lazily per-user — NEVER a module singleton (a server-cached collection bleeds
  users across a warm isolate); (4) SEED via `getXCollection(userId, loaderRows)` which writes the
  localStorage blob directly (LWW-by-`updated_at`) — do NOT `collection.insert` loader data (that flushes
  it back to D1). **This supersedes the two earlier `useJourneys()`/`createCollection` notes**
  (Accounts-data-layer "TanStack DB API" and Design-system-shell "`useJourneys()` return-type"): the
  `{ sync: … markReady }` fire-and-forget syncer, the `as any`, and the `Journey[] | {journeys:Journey}[]`
  normalisation are all gone. SSR renders from route loaders (D1), never from a collection (shape D3).
- **Tanstack-data-layer-unification: Query bridge removed** — `@tanstack/react-query` +
  `@tanstack/react-router-ssr-query` are no longer dependencies (−189 packages); `zod@4.4.3` is a direct
  exact-pin. No `src/` code may import either query package. `defaultPreloadStaleTime` is `30_000` (not `0`).
- **Tanstack-data-layer-unification: write path stays on server commands** — quiz-attempts/FSRS writes go
  through `recordAttemptAndUpdateFsrs` (a coupled grading command), NOT optimistic collection inserts;
  those collections are read caches. Future optimistic-write wiring needs a client-id-honoring insert fn.

- **Health-endpoint: `runHealthCheck` + `REQUIRED_SECRETS` are the deploy-gate source of truth** —
  `src/lib/health.ts` exports `REQUIRED_SECRETS` (the single required-secret list, RIM-E4 anti-drift)
  and a pure `runHealthCheck(env)` (one `SELECT 1` D1 probe + non-empty-string secret assertion,
  logging failing component names to logs only). The public `GET /health` route
  (`src/routes/health.ts`, outside `_authenticated`) maps it to an opaque `200 {"status":"ok"}` /
  `503 {"status":"degraded"}` body with `Cache-Control: no-store`. Any future slice that adds a
  required Worker secret MUST add it to `REQUIRED_SECRETS`; a future boot-time secret validator MUST
  import this constant rather than re-list. The response body is a PO-ratified opaque contract — never
  add a `checks`/inventory object to it (AC-HE4 regression). This is the endpoint the ship-plan v5
  post-publish smoke targets; the CD smoke wiring is owned by the ship pipeline, not this slice.

- **Precommit-gitleaks-resilience: `scripts/secret-scan.mjs` is the local secret-scan entry point** —
  the `lefthook.yml` `pre-commit.secret-scan` step runs `node scripts/secret-scan.mjs`, not the raw
  `gitleaks` binary. The wrapper exports `secretScan(spawn = spawnSync, log = console.error)`: it degrades
  to exit 0 + a stderr warning ONLY on launch failure (`result.error`/`ENOENT`), and otherwise propagates
  the running scanner's `status ?? 1` verbatim (a real finding still fails the commit; a signal-killed
  scanner is treated as failure). This is a LOCAL convenience only — CI's `gitleaks/gitleaks-action@v2`
  in `.github/workflows/ci.yml` is untouched and stays authoritative. Any future external-binary hook
  step should follow the same Node-wrapper + injectable-spawn pattern rather than a shell one-liner
  (cross-platform: no sh-vs-cmd-vs-PowerShell branching). No ruleset / `.gitleaks.toml` change.

- **Repo-format-baseline: the tree is conformed to `.oxfmtrc.json`; `.prettierignore` owns the
  format-exclusion set** — the whole tree now passes `pnpm exec oxfmt --check .` (baseline commit
  `4274839`, 139 files, formatting-only). `.oxfmtrc.json` and `.prettierignore` are now **tracked**.
  Two git-tracked machine-generated files (`src/routeTree.gen.ts`, `worker-configuration.d.ts`) are
  excluded in `.prettierignore` — any future slice that adds a git-tracked generated file MUST add it
  there too or the baseline will churn on regen. Any commit that reformats a file must keep the diff
  formatting-only; mixing logic into a format sweep breaks the AC-RFB2 discipline. This slice is the
  clearing event for the sibling `AC-GLR3 residual` deferral (precommit-gitleaks-resilience): the full
  pre-commit gate (secret-scan + lint + format-check + commitlint) now passes without `--no-verify`.

- **E2e-session-cookie-prefix: the seeded-session cookie name is `__Secure-better-auth.session_token`
  / `secure:true`** — every Playwright spec that injects a seeded better-auth session MUST use this
  cookie shape (the app resolves the session under the `__Secure-` prefix for the secure-context base
  URL). `auth-flow.spec.ts` and `design-system.spec.ts` were the last two stale holdouts; they now match
  the proven `adaptation-progress.spec.ts` / `data-layer-ssr.spec.ts` / `lesson-renderer` /
  `sample-journey` / `tutor-interview` pattern. Two test-fidelity seams established as reusable idioms:
  (1) seed `localStorage` `wp:sample-visited="true"` via `page.addInitScript` before navigating a
  zero-journey user to `/` so the dashboard first-login redirect to `/sample` does not fire; (2) gate
  any post-navigation interaction (clicks) behind React-19 hydration by waiting for the client-only
  "Open TanStack Devtools" button — an un-gated click can be a pre-hydration no-op. This slice cleared
  the AC-ADL1/AC-ADL5 and AC-DSS1/3/4/5 runtime-evidence deferral clusters (real green 12/12 run). A
  pre-existing, unrelated `tutor-interview.spec.ts` AC-TI1 failure was surfaced by the full-suite
  regression (out of this slice's scope — flagged separately).

## Recommended Next Stage

- **(current) Option A (default):** `/wf verify waypoint-app e2e-session-cookie-prefix` — e2e
  seeded-session cookie-prefix fix (round-5 test slice). AC-ECP1 (both specs authenticate, no `/sign-in`)
  and AC-ECP2 (AC-DSS3 empty state) proven by a real green 12/12 target-spec run under the present
  `BETTER_AUTH_SECRET`; AC-ECP3 (deferral clusters flipped to `cleared`) is a doc-state AC gated behind
  that run. verify should independently re-drive the two specs and confirm the deferral-clearing
  lawfulness. Consider `/compact` first — workflow state lives in the artifact files.

- **(prior) Option A (default):** `/wf verify waypoint-app repo-format-baseline` — repo-wide oxfmt
  format baseline (round-5 devex tooling). All three ACs verifiable now, no deferral: AC-RFB1 by
  `pnpm run format:check` exit 0 over the post-reformat tree, AC-RFB2 by `git show --stat 4274839`
  (139 files, formatting-only, `.oxfmtrc.json`/`.prettierignore` tracked) backed by a green
  `tsc --noEmit` + 229-pass Vitest suite, AC-RFB3 by a subsequent one-file commit flowing through the
  `format-check` pre-commit step without `--no-verify`. The baseline commit already exercised the full
  gate (secret-scan + lint + format-check + commitlint) green. This slice clears the sibling
  `AC-GLR3 residual` deferral. Consider `/compact` first — reformat context is noise for verification.

- **(prior) Option A (default):** `/wf verify waypoint-app precommit-gitleaks-resilience` — local
  secret-scan pre-commit resilience (round-5 devex tooling). All three ACs verifiable now, no deferral:
  AC-GLR1 by real `node scripts/secret-scan.mjs` spawn in this gitleaks-absent env (exit 0 + warning),
  AC-GLR2 by fault injection on the exported `secretScan` seam, AC-GLR3 by the atomic commit flowing
  through the now-resilient hook without `--no-verify`. Wrapper suite 4/4, oxlint/oxfmt/tsc clean.

- **(prior) Option A (default):** `/wf verify waypoint-app health-endpoint` — net-new public
  `GET /health` deploy-gate endpoint. All five ACs verifiable this round with no deferral: AC-HE2/HE3/
  HE4 via 14 Vitest cases (`tests/smoke/health.test.ts`), AC-HE1/HE4/HE5 via a passing Playwright spec
  (`tests/e2e/health-endpoint.spec.ts`) against `vite dev`. Typecheck/lint clean.

- **(prior) Option A (default):** `/wf verify waypoint-app tanstack-data-layer-unification` — DB-everywhere
  data-layer unification (F2+F3+F7+F8). Automated ACs green now (typecheck/lint clean; 211 Vitest pass;
  AC-DLU2/3/4/5 grep-verified); verify owns the interactive half (AC-DLU1 single-fetch, AC-DLU6 per-entity
  SSR/hydration at 3 breakpoints, AC-DLU7 two-identity isolation, AC-DLU8 optimistic UI) — `BETTER_AUTH_SECRET`
  present so the seeded-session harness runs, no seam to build. RIM-E7 (nine-entity local-first big-bang)
  makes runtime SSR/isolation proof load-bearing.

- **(prior) Option A:** `/wf verify waypoint-app tanstack-router-typed-context` — typing/DI change on
  the root route (every navigation). AC1/AC2 are green via `pnpm typecheck` at implement; verify owns AC3
  (seeded-session auth-redirect suite `tests/e2e/auth-flow.spec.ts` + a `pnpm dev` hydration smoke, RIM-E6
  parity). The auth harness and `BETTER_AUTH_SECRET` already exist — no seam to build.

- **(prior) Option A:** `/wf verify waypoint-app tanstack-ai-gateway-hygiene` — behavior-preserving
  F4+F5+F9 hygiene pass. RIM-E5 demands runtime before/after proof that the SSE path still flushes
  token-by-token and the zero-outbound-when-quota-exhausted invariant holds on both consumption modes.
  Typecheck/lint/Vitest (200 pass, incl. 4 new helper unit tests + F9 no-regress) + audit are green now;
  verify owns the SSE e2e + tagged live-smoke legs (keys present in `.dev.vars`).
- **Option B:** `/wf review waypoint-app tanstack-ai-gateway-hygiene` — only if the SSE-incrementality
  and quota-invariant runtime evidence is judged already covered by the helper unit tests + the existing
  `sse-streaming.wrangler.spec.ts`; a refactor of two live code paths generally warrants verify first.
- Prior: `/wf verify waypoint-app tanstack-start-request-access` (the previous extension-round-2 slice; its verify/review is tracked separately).
