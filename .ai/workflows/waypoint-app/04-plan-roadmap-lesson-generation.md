---
schema: sdlc/v1
type: plan
slug: waypoint-app
slice-slug: roadmap-lesson-generation
status: complete
stage-number: 4
created-at: "2026-07-12T02:22:28Z"
updated-at: "2026-07-12T02:22:28Z"
metric-files-to-touch: 15
metric-step-count: 13
has-blockers: false
revision-count: 0
revisions: []
tags: [roadmap, lesson-generation, sse, streaming, resilience, concept-tagging]
stack-source: confirmed
refs:
  index: 00-index.md
  plan-index: 04-plan.md
  slice-def: 03-slice-roadmap-lesson-generation.md
  siblings:
    - 04-plan-foundation.md
    - 04-plan-platform-proofs.md
    - 04-plan-accounts-data-layer.md
    - 04-plan-design-system-shell.md
    - 04-plan-lesson-renderer.md
    - 04-plan-sample-journey.md
    - 04-plan-ai-gateway.md
    - 04-plan-tutor-interview.md
  implement: 05-implement-roadmap-lesson-generation.md
next-command: wf-implement
next-invocation: "/wf implement waypoint-app roadmap-lesson-generation"
---

# Plan: Roadmap & Lesson Generation

## The Plan

Eight slices of verified infrastructure finally converge here. The gateway is metered, the
renderer is hardened, the interview captures a learner record, and the DB schema has held
waypoints and lessons since day one — waiting for this. The loop closes in fifteen files
across two distinct generation paths that share almost everything: the gateway, the lesson
schema, the D1 tables, the progressive render surface, and the failure-resume machinery.

Roadmap generation is the faster path: one structured-output gateway call (gpt-4o-mini,
`roadmap` tier) emitting a JSON array of ordered waypoints against an explicit schema, one
re-ask if the model returns malformed JSON, then a bulk D1 insert. The sidebar lights up
with real waypoints. Lesson generation is the harder path: a streaming SSE API route that
pipes an OpenRouter lesson stream (claude-3.5-haiku) through an NDJSON line parser, emitting
one section event per completed line to a client-side EventSource consumer that feeds the
existing progressive `LessonView`. Resume-from-section is a D1-backed write per section —
each section is persisted the moment it completes, so reconnect reads stored progress and
continues from position N without re-sending the full prompt.

Fifteen files, thirteen steps. The top risk is real SSE cadence exposing line-boundary
splitting in the NDJSON parser — the mitigation is a line-accumulating buffer, unit-tested
against split-chunk fixtures, and the real-transport integration running as step 1 of
implementation rather than last.

## Current State

Eight slices implemented and reviewed:

- **`src/lib/ai/gateway.ts`** — `callGateway()` live; `roadmap` and `lesson` tiers
  configured in `src/lib/ai/tiers.ts` (gpt-4o-mini and claude-3.5-haiku respectively).
  Gateway drains the full stream internally — lesson SSE will use a parallel path
  (raw streaming adapter) rather than callGateway, since callGateway is designed for
  collected responses.
- **`src/lib/interview/prompts.ts`** — `ROADMAP_SYSTEM_PROMPT` and `LESSON_SYSTEM_PROMPT`
  drafted thin in the tutor-interview slice; this slice refines both.
- **`src/server/journeys.ts`** — waypoint read/write currently absent; `createJourney`,
  `getJourney`, `listJourneys`, `updateJourney` exist. `getJourneyWithWaypoints()` is new.
- **`src/server/lessons.ts`** — `getLesson()` exists; `upsertLesson()` for progressive
  writes is new.
- **`src/db/schema.ts`** — `Waypoint` and `Lesson` interfaces match the D1 schema exactly.
  `waypoints.concepts` stores a JSON array (the FSRS input contract for quiz-fsrs).
- **`migrations/0000_schema_v1.sql`** — `waypoints` and `lessons` tables created with
  `CREATE TABLE IF NOT EXISTS`; no migration needed for this slice.
- **`src/routes/api/demo-stream.ts`** — the platform proof SSE pattern:
  `new ReadableStream({ async start(controller) {...} })` with Workers-native Response.
  The lesson SSE route follows this exact pattern.
- **`src/components/shell/Sidebar.tsx`** — reads `waypoints` from `ShellContext` via
  `useShell()`. Currently populated only for sample journey. This slice populates it
  from D1 for real journeys.
- **`src/routes/_authenticated/journey/$journeyId/interview.tsx`** — calls
  `completeInterview()` on stage='complete' but does not yet trigger roadmap generation
  or navigate to the first waypoint.

## Simplicity Ladder

- **Roadmap JSON parsing** → rung 1 stdlib — `JSON.parse()` with a try/catch and one
  re-ask; no JSON schema validation library needed. `validateRoadmap()` is 20 lines of
  pure TypeScript checks.
- **SSE delivery** → rung 2 native platform — Workers `ReadableStream` + native `Response`
  (`Content-Type: text/event-stream`), proven by the existing `demo-stream.ts` proof.
  No additional library. `EventSource` on the client side is a browser native.
- **NDJSON line buffering** → rung 1 stdlib — string accumulator + `split('\n')` in the
  stream's `transform` step. No streaming JSON parser library needed.
- **Waypoint D1 bulk insert** → rung 3 reuse — `env.DB.prepare().bind().run()` pattern
  used throughout `src/server/journeys.ts`. Reuse with extension (batch of inserts in a
  loop; D1 doesn't expose `executeBatch` for heterogeneous INSERT patterns, so serial
  awaited inserts inside a transaction is the idiomatic approach).
- **Progressive lesson rendering** → rung 3 reuse — `LessonView` + `PartialLessonDocument`
  already built in lesson-renderer; `useSimulatedStream` becomes unused; `LessonGeneratingView`
  replaces it with EventSource state.
- **Resume from last completed section** → rung 4 new code — no platform primitive for
  "resume a partial SSE stream from a known position". D1-backed section storage is new,
  but minimal: the `lessons.content` column holds a JSON array of completed sections,
  written on each section event. New code rationale: Workers are stateless; in-memory
  accumulation cannot survive reconnect. The D1 write-per-section pattern is the minimum
  viable implementation.
- **Reconnecting banner + error states** → rung 4 new code (UI) — no reuse candidate.
  Component is small (~35 lines) and isolated.

## Applied Learnings

No `.ai/solutions/INDEX.md` file exists in this repo. No applicable learnings found.

**Repeat-deferral tripwire:** The existing `runtime-evidence-deferrals` in `00-index.md`
include `BETTER_AUTH_SECRET` as the wall for all seeded-session Playwright tests (AC-ADL1,
AC-DSS1, AC-LR1, AC-SJ1). The roadmap-lesson-generation Playwright tests (AC-5, AC-6,
AC-12) use the same seeded-session wall. This is NOT a new wall — it is an accepted extension
of the existing AC-ADL1+AC-ADL5 deferral. No new deferral entry is needed; the existing
entry's `cleared-by` ("re-running E2E suite with BETTER_AUTH_SECRET set in .dev.vars")
covers these tests once cleared.

The AC-15 residual (first Cloudflare deploy) is constraint-resolved as
`po-accepted: deployment cost accepted at shape; the existing platform-proofs smoke covers
the workerd SSE proof; first deploy clears the residual at handoff time`.

**`harness-declined`:** The `OPENROUTER_API_KEY` live-smoke residual (AC-5 and AC-6 real
roadmap and lesson via live model) is pre-registered as
`harness-declined: the existing tagged-smoke suite pattern (NODE_ENV guard in server fn,
?smoke=1 param) is sufficient; no new harness infrastructure needed — the wall clears on
demand with the PO's key, identical to AC-PP2b`.

## Likely Files / Areas to Touch

- `src/lib/interview/prompts.ts` — ROADMAP_SYSTEM_PROMPT + LESSON_SYSTEM_PROMPT refinement
- `src/lib/roadmap/schema.ts` — **new** — Waypoint output type, JSON schema, validation
- `src/server/roadmap.ts` — **new** — generateRoadmap server function
- `src/server/lessons.ts` — extend with upsertLesson + getLessonByWaypointId
- `src/server/journeys.ts` — extend with getJourneyWithWaypoints
- `src/routes/api/journey/$journeyId/lesson.ts` — **new** — SSE streaming API route
- `src/routes/_authenticated/journey/$journeyId/waypoint/$waypointId.tsx` — **new** — lesson route
- `src/routes/_authenticated/journey/$journeyId/interview.tsx` — wire roadmap trigger + nav
- `src/routes/_authenticated.tsx` — wire waypoints into ShellContext for real journeys
- `src/components/generation/RoadmapPendingCard.tsx` — **new**
- `src/components/generation/ReconnectingBanner.tsx` — **new**
- `src/components/generation/LessonGeneratingView.tsx` — **new** — SSE consumer
- `src/styles.css` — generation state styles
- `tests/smoke/roadmap-generation.test.ts` — **new** — schema validation unit tests
- `tests/e2e/roadmap-lesson-generation.spec.ts` — **new** — Playwright E2E

## Proposed Change Strategy

**Phase 1 — Roadmap path (structured output, simpler):**

Refine `ROADMAP_SYSTEM_PROMPT` to include an explicit JSON schema block so the model
understands the exact shape. Author `src/lib/roadmap/schema.ts` with the `WaypointOutput`
TypeScript type, the `WAYPOINT_JSON_SCHEMA` object passed as `responseFormat` to
`callGateway`, and `validateRoadmap()` with the one-re-ask logic. Author
`src/server/roadmap.ts` as a server function following the established `withSession +
requireOwnership` pattern. Wire the trigger in the interview route.

**Phase 2 — Sidebar population:**

Extend `src/server/journeys.ts` with `getJourneyWithWaypoints()`, update the
`_authenticated.tsx` layout loader to populate `ShellContext.waypoints` for real journeys.
The sidebar already knows how to render waypoints — it just needs D1 data.

**Phase 3 — Lesson streaming path (SSE, harder):**

Refine `LESSON_SYSTEM_PROMPT` to emit NDJSON — one JSON line per content unit:
- Line 1: `{"type":"header","title":"...","summary":"..."}` 
- Lines 2-N: each section as a typed JSON object matching `LessonSection` variants
- Final line: `{"type":"sources","sources":[...],"recommended_primary_source":{...}}`

Build the SSE API route at `src/routes/api/journey/$journeyId/lesson.ts`. The route:
1. Checks quota via `checkQuota()` (reuse from ai-gateway).
2. Reads existing lesson from D1 (resume path: if sections exist, emit them immediately).
3. Opens an OpenRouter stream directly (bypassing `callGateway`'s drain pattern) using
   `createOpenRouterText()` from `@tanstack/ai-openrouter`.
4. Accumulates bytes in a line buffer; on each `\n`, attempts `JSON.parse()`.
5. On success: emits `data: <json>\n\n` to the SSE stream; calls `upsertLesson()` with
   the completed section (non-blocking via `ctx.waitUntil()` or fire-and-forget).
6. On all-fallbacks fail: emits `data: {"type":"error","message":"..."}\n\n` then closes.

Build `LessonGeneratingView` as the client-side EventSource consumer. Build the waypoint
route at `/_authenticated/journey/$journeyId/waypoint/$waypointId`.

**Phase 4 — Failure states + resume:**

`ReconnectingBanner` is shown when EventSource fires `onerror`. The banner persists until
reconnection succeeds. On reconnect, the route reads D1-stored sections (may be 0-1 behind
due to fire-and-forget lag — acceptable). Already-rendered sections remain in React state
during reconnect; no content loss.

**Concept-tagging:**

The `LESSON_SYSTEM_PROMPT` will be refined to include the waypoint's `concepts` list in the
system context, instructing the model to tag each section with the concept(s) it covers
(`concept_tags: ["Async/Await", "Promises"]` field added to each NDJSON section line).
Concept tags are stored in the section JSON (part of `LessonDocumentV1.sections`) — the
`LessonSection` base type will receive an optional `concept_tags?: string[]` field (additive,
backward-compatible). quiz-fsrs reads these tags to create FSRS cards.

**Note on `LessonDocumentV1` extension:**

Adding `concept_tags?: string[]` to `LessonSection` is a backward-compatible additive change
(optional field, no version bump required). Existing sample-journey fixtures remain valid.

## Step-by-Step Plan

1. **Refine prompts** — Update `src/lib/interview/prompts.ts`: expand `ROADMAP_SYSTEM_PROMPT`
   to include explicit JSON schema documentation + concept-list format requirements (2–5
   concepts per waypoint, string array, no duplicates); expand `LESSON_SYSTEM_PROMPT` to
   emit NDJSON with concept_tags per section.

2. **Author roadmap schema** — Write `src/lib/roadmap/schema.ts`: `WaypointOutput` TypeScript
   type; `WAYPOINT_JSON_SCHEMA` JSON schema object (for responseFormat); `validateRoadmap()`
   that checks it's an array, 1–20 waypoints, each has `title: string`, `goal: string`,
   `concepts: string[]` with 1+ items. Also export `buildRoadmapPrompt(capturedRecord)` that
   assembles the user message from the interview capture (mission, scope, priorKnowledge,
   sourceUrls).

3. **Author `src/server/roadmap.ts`** — `generateRoadmap` server function: withSession
   middleware; reads `interview_records` for the journeyId (status must be 'complete' or
   'best_effort'); calls `callGateway({type:'roadmap', responseFormat: WAYPOINT_JSON_SCHEMA,
   messages: [system + buildRoadmapPrompt(capture)]}`; on JSON parse failure or validation
   failure: one re-ask (append error context, call again); on second failure: throws
   `GenerationError`; on success: `env.DB.batch([...inserts])` using D1 batch API
   for atomic waypoint insertion; updates `journeys.status` to 'roadmap_ready'; emits
   `roadmap.generated` instrumentation signal.

4. **Extend `src/server/lessons.ts`** — Add `upsertLesson()` (INSERT OR REPLACE, scoped
   to waypointId) and `getLessonByWaypointId()` (reads `lessons WHERE waypoint_id = ?`);
   the content column stores `JSON.stringify(sections[])` where sections accumulate.

5. **Extend `src/server/journeys.ts`** — Add `getJourneyWithWaypoints()` server function
   that returns `{ journey: Journey; waypoints: Waypoint[] }` with waypoints ordered by
   `position ASC`.

6. **Wire roadmap trigger in interview route** — In
   `src/routes/_authenticated/journey/$journeyId/interview.tsx`, after `handleComplete('complete')`:
   show `<RoadmapPendingCard/>`, await `generateRoadmap({data: journeyId})`, then navigate
   to `/_authenticated/journey/$journeyId/waypoint/FIRST_WAYPOINT_ID` (returned from
   generateRoadmap).

7. **Wire ShellContext for real journeys** — In `src/routes/_authenticated.tsx`: extend the
   loader to call `getJourneyWithWaypoints({ data: journeyId })` when `$journeyId` param is
   present; map waypoints to `ShellContextWaypoint[]` shape (id, label=title, href, completed=false
   for now); pass into ShellContext provider.

8. **Build generation components** — Author `RoadmapPendingCard.tsx` (spinner + message),
   `ReconnectingBanner.tsx` (fixed-top, ember-accented, data-testid="reconnecting-banner",
   auto-dismiss on reconnect), `LessonGeneratingView.tsx` (opens EventSource, manages
   PartialLessonDocument state, handles section/error/complete events, shows reconnecting
   banner on EventSource onerror, preserves rendered content across reconnects).

9. **Build SSE lesson API route** — Author
   `src/routes/api/journey/$journeyId/lesson.ts`: GET handler; auth via
   `requireAuth(env, request)`; quota check via `checkQuota(env.DB, userId, 'lesson')`; read
   existing lesson sections from D1 (resume); open streaming adapter; line-buffer NDJSON
   parser; per-section SSE emit + D1 write; fallback chain (lesson tier: claude-3.5-haiku
   → gpt-4o); all-fallbacks-fail terminal error event; `concept_tags` passthrough on each
   section event.

10. **Build waypoint route** — Author
    `src/routes/_authenticated/journey/$journeyId/waypoint/$waypointId.tsx`:
    loader reads `getLesson({ lessonId, waypointId })` — if content exists, render `LessonView`
    with parsed `LessonDocumentV1`; if null, render `LessonGeneratingView`. Add
    `data-testid="waypoint-page"`, `data-testid="lesson-content"` seams.

11. **Add generation styles** — Append to `src/styles.css`: `.wp-reconnecting-banner`
    (position:fixed, top:0, ember background, slide-in keyframe, `prefers-reduced-motion`
    suppresses animation); `.wp-roadmap-pending` (centered spinner card); `.wp-lesson-section`
    fade-in on reveal.

12. **Write Vitest unit tests** — `tests/smoke/roadmap-generation.test.ts`: validateRoadmap
    accepts valid 5-waypoint + 8-waypoint fixtures; rejects missing title/goal/concepts;
    rejects empty concepts array; rejects non-array; concept_tags schema check in lesson
    section NDJSON parser; NDJSON line-buffer handles split chunks (two calls with partial line
    then rest = one valid parse).

13. **Write Playwright E2E tests** — `tests/e2e/roadmap-lesson-generation.spec.ts`:
    (a) roadmap scenario: seeded session + mocked generateRoadmap → assert 5 waypoint links
    in sidebar, assert persistence on page reload; (b) lesson stream scenario: seeded session
    + mock SSE endpoint → assert `data-testid="lesson-content"` grows progressively, first
    section visible ≤ 5s, widget renders and is answerable; (c) fault-injected reconnect:
    mock SSE fails at section 3, assert reconnecting-banner, assert section 1–2 still
    rendered, assert completes after retry; (d) all-fail error state: all-fail mock → assert
    friendly error message.

## Verification Strategy

| AC | Tool / method + ladder rung | Environment need — satisfiable? | What must be built | Fallback chain |
|---|---|---|---|---|
| AC-5 Roadmap persists in sidebar after reload | Playwright seeded-session (web-1) | local dev (wrangler dev) + BETTER_AUTH_SECRET — same deferral as AC-ADL1 | mock `generateRoadmap` server fn response; `data-testid="waypoint-link"` on sidebar items | BETTER_AUTH_SECRET deferral (existing entry); live residual: tagged smoke with real roadmap generation |
| AC-6 Lesson streams progressively, widget interactive | Playwright + DOM-growth timestamps (web-1) | local dev + mock SSE endpoint + BETTER_AUTH_SECRET | mock `/api/journey/*/lesson` SSE adapter (chunk cadence 200ms); `data-testid="lesson-section-N"` per section; `data-testid="checkpoint-question"` | BETTER_AUTH_SECRET deferral; live residual: tagged smoke via OpenRouter key |
| AC-12 Mid-stream failure: reconnect, content preserved | Playwright fault-inject (web-1) | local dev + fault-scripted mock SSE | fault-SSE mock (fail at section 3, succeed retry); `data-testid="reconnecting-banner"` | proxy+deferral: manual observation of reconnecting state if Playwright timing is flaky |
| AC (terminal failure, friendly state) | Playwright all-fail mock (web-1) | local dev + all-fail mock SSE | all-fail SSE mock; `data-testid="lesson-error"` | visual inspection |
| AC (concept tags consistent with roadmap) | Vitest schema check (automated) | none — pure unit test over generated fixture | `concept_tags` field in NDJSON section fixture; `buildRoadmapPrompt` exports concepts for cross-check | none needed |
| AC-15 residual: SSE on real Cloudflare Workers | Claude_Browser against deployed env (staging-deploy rung) | Cloudflare account + OpenRouter key + `wrangler deploy` | first deploy; one live generation | po-accepted: deployment cost accepted at shape; wrangler dev workerd proof already exists (platform-proofs) |

**Constraint resolutions per AC:**

- AC-5: `constraint-resolution: proxy+deferral: BETTER_AUTH_SECRET` — accepted into existing
  AC-ADL1+AC-ADL5 deferral entry; clearing event: re-running E2E suite with
  BETTER_AUTH_SECRET set in .dev.vars.
- AC-6: same as AC-5.
- AC-12: `constraint-resolution: proxy+deferral: fault-inject-timing` — if Playwright
  timing races on the reconnect window, fall back to a manual observation of the banner
  state (proxy AC: unit test confirming ReconnectingBanner renders on onerror event);
  cleared by stable E2E run across 3 consecutive runs.
- AC-15 residual: `constraint-resolution: po-accepted: Cloudflare deployment and OpenRouter
  live-smoke cost accepted at shape; wrangler dev on workerd already proves the SSE path.`

## Test / Verification Plan

### Automated checks

- **lint/typecheck:** `pnpm typecheck` — concept_tags optional field, new server functions,
  new route types must all pass. SSE route uses `env` from `cloudflare:workers`; same
  pattern as all other API routes.
- **unit tests:** `pnpm test -- --reporter=verbose tests/smoke/roadmap-generation.test.ts` —
  ~12 assertions across schema validation, NDJSON parser, prompt assembly.
- **integration/e2e tests:** `pnpm playwright test roadmap-lesson-generation` — 4 test
  scenarios described in Step 13.
- **pnpm audit:** no new dependencies; existing packages unchanged.

### Interactive verification (human-in-the-loop)

**AC-5 — Roadmap in sidebar:**
- Platform: web, local dev (wrangler dev / `pnpm run dev`).
- Tool: Playwright seeded-session (same as AC-ADL1 cleared run).
- Steps: seed a user + completed interview record in wrangler D1; navigate to
  `/_authenticated/journey/$journeyId/interview?mock=1` and complete; assert sidebar shows
  5 waypoint links (`data-testid="waypoint-link"`); reload; assert waypoints still present.
- Pass criteria: 5 waypoint links visible in sidebar before and after reload.

**AC-6 — Progressive lesson stream + widget:**
- Platform: web, local dev.
- Tool: Playwright with mock SSE adapter injected via route handler.
- Steps: navigate to `/_authenticated/journey/$journeyId/waypoint/$waypointId`; assert
  skeleton visible immediately; record timestamp T0; assert first `data-testid="lesson-section-0"`
  appears within 5s; interact with `data-testid="checkpoint-question"` (click option, assert
  feedback visible); assert `data-testid="lesson-content"` grows on each SSE section event.
- Pass criteria: first section visible < 5s; widget interaction produces feedback; no
  `<script>` in DOM from lesson content.

**AC-12 — Reconnect on failure:**
- Platform: web, local dev.
- Tool: Playwright with fault-injected mock SSE (fail at section 3, recover on retry).
- Steps: navigate to lesson page; wait for sections 1–2 to render; assert `data-testid="reconnecting-banner"` appears; assert sections 1–2 still in DOM; wait for banner to dismiss; assert remaining sections render.
- Pass criteria: banner visible during failure window; rendered content preserved; lesson
  completes on retry.

**AC-15 residual (deferred to handoff/ship):**
- Platform: Cloudflare Workers deployed env.
- Tool: Claude_Browser or manual drive against the deployed URL.
- Steps: `wrangler deploy`; navigate to the deployed app; complete an interview;
  observe lesson SSE stream in Network tab; assert chunks arrive progressively.
- Evidence: network trace screenshot showing SSE chunks with timestamps.

## Risks / Watchouts

- **Chunk boundary splitting in NDJSON parser (R1 — HIGH):** The line-buffer accumulator
  is mandatory; naive per-chunk parsing will silently drop sections. Schedule the
  real-transport integration test (wrangler dev + real stream) as step 1 of implementation
  to catch this early.
- **Model NDJSON compliance (R2 — MED):** claude-3.5-haiku may emit markdown fences or
  prose between NDJSON lines. Parser must skip non-JSON lines gracefully (log warn, continue).
  Manual smoke with the real model before sign-off.
- **D1 write-per-section latency (R3 — MED):** Fire-and-forget pattern avoids blocking
  the SSE stream; the SSE client gets sections as fast as the model generates them.
  The 0-1 section lag on reconnect is acceptable.
- **Lesson schema extension (`concept_tags`):** Optional field — no migration needed.
  The quiz-fsrs slice reads these tags; if a section has no concept_tags the FSRS card
  defaults to the waypoint's concept list (defensive fallback in quiz-fsrs, not here).
- **Sidebar waypoints for real journeys:** The `_authenticated.tsx` layout currently uses
  ShellContext. The loader extension to `getJourneyWithWaypoints()` only fires when
  `$journeyId` is present in params — routes without a journeyId (dashboard, account)
  are unaffected.

## Dependencies on Other Slices

- **`tutor-interview` (completed):** `completeInterview()` returns the `CapturedRecord`
  this slice uses to seed `buildRoadmapPrompt()`. `interview_records.status = 'complete'`
  is the gate for `generateRoadmap()`.
- **`lesson-renderer` (completed):** `LessonView` + `PartialLessonDocument` are the render
  surface. `LessonDocumentV1` is the contract `LessonGeneratingView` builds from SSE events.
  The `concept_tags` field addition is the only change to the shared type.
- **`ai-gateway` (completed, transitive):** `checkQuota()` is called by the SSE route
  directly (not via `callGateway` — the SSE route needs a raw streaming adapter). The quota
  signal (`quota.rejected`) is emitted by `checkQuota()` itself.
- **Sibling: `quiz-fsrs` (not started):** Depends on `concept_tags` in stored lesson
  sections. This slice establishes that field; quiz-fsrs reads it.
- **Sibling: `source-grounding` (not started):** Layers onto the lesson generation
  pipeline after this slice. No dependency in this direction.

## Assumptions

- **A-1 (Autonomous — NDJSON over full JSON):** The lesson generation prompt is designed to
  emit NDJSON (one section per line) rather than a single-pass full JSON document. This
  enables per-section progressive rendering without a streaming JSON parser. Chosen because
  it is simpler to implement and more tolerant of chunk boundaries. Risk: model may not
  comply reliably. Mitigation: malformed lines are skipped; the lesson continues rendering
  around gaps. Alternative (full JSON with streaming parser like `jsonparse-even-better`)
  was rejected as rung 4 new dependency with no clear advantage over NDJSON.
- **A-2 (Autonomous — fire-and-forget D1 writes):** Each completed section is written to
  D1 non-blockingly (fire-and-forget, or `ctx.waitUntil()` if available in the route
  context). The SSE stream to the client is not blocked by D1 write latency. Acceptable
  because the resume lag (at most 1 section) is not user-visible — the client already
  has the section in React state.
- **A-3 (Autonomous — one re-ask for roadmap):** On malformed roadmap JSON, one re-ask
  is sent: append `"The previous response was not valid JSON. Return ONLY a JSON array."` and
  call the gateway again. On second failure, throw `GenerationError` and surface a friendly
  retry state. The slice spec says "one re-ask on malformed output" — this is the minimal
  implementation.
- **A-4 (Autonomous — no regenerate affordance):** The slice spec notes "regenerate-once
  affordance if the learner rejects the first roadmap is a plan decision." Autonomous
  decision: out of scope for this plan. Rationale: lowest-cost, smallest blast radius.
  The learner can decline the roadmap implicitly by not opening waypoints; explicit
  regeneration UI would require a new button, server function, and waypoint replacement
  logic — scope expansion beyond what the ACs require. If the PO wants this, it is a
  separate sub-slice.
- **A-5 (Autonomous — `callGateway` bypass for SSE):** The lesson SSE API route does NOT
  use `callGateway()` for streaming. It calls `createOpenRouterText()` directly and pipes
  the stream. Rationale: `callGateway()` drains the full stream before returning; SSE
  requires chunk-by-chunk delivery. The route still calls `checkQuota()` and writes a
  usage event manually — the gateway's quota and usage-recording behaviour is replicated
  inline, not bypassed. The lesson tier config (`TIERS.lesson`) is still read from
  `src/lib/ai/tiers.ts`.
- **A-6 (Autonomous — concept_tags as optional LessonSection field):** `concept_tags?: string[]`
  is added to the `LessonSection` base union members. This is additive and backward-compatible.
  No version bump to `LessonDocumentV1`. The quiz-fsrs slice reads this field; if absent,
  it defaults to the waypoint's concept list.
- **A-7 (Autonomous — sidebar waypoints as data-testid links):** Waypoint items in the
  sidebar will carry `data-testid="waypoint-link"` for Playwright. The existing
  `data-waypoint={wp.id}` attribute is already present in `Sidebar.tsx`; adding a testid
  is a trivial one-liner.
- **A-8 (Autonomous — D1 batch insert for waypoints):** Waypoints are inserted using
  `env.DB.batch([...])` with multiple prepared statements. D1's `batch()` API executes
  all statements atomically. If the batch fails, no waypoints are inserted (all-or-nothing).
  This is correct: a partial roadmap in the sidebar is worse than no roadmap.

## Blockers

None. All dependencies are implemented and reviewed. Stack is confirmed. No missing tools.

## Freshness Research

- **`@tanstack/ai` + `@tanstack/ai-openrouter` version:** Installed at beta; the
  `createOpenRouterText()` signature and `chat()` stream events (`TEXT_DELTA`, `USAGE`)
  verified from `src/lib/ai/gateway.ts` which is already exercised in production.
  No freshness check needed — gateway.ts IS the empirical truth for this version.
- **D1 `batch()` API:** Cloudflare Workers D1 `DB.batch([...])` is the documented multi-statement
  API. Verified present in the installed `@cloudflare/workers-types` via `src/cloudflare-workers.d.ts`.
  No new research needed.
- **`EventSource` browser API:** Native in all modern browsers; no polyfill needed for
  the confirmed web platform (`stack.platforms: [web]`). TanStack Router routes render
  in a browser context; `new EventSource(url)` is available.
- **FSRS-6 `ts-fsrs` input shape:** Not consumed by this slice; quiz-fsrs owns the FSRS
  integration. The `concept_tags` field is a string array — format is deliberately simple
  to avoid a coupling dependency on `ts-fsrs` types here.

## Recommended Next Stage

- **Option A (default): implement this slice** — The plan is complete, all dependencies
  are verified, no blockers. Start with Step 1 (refine prompts) and run the real-transport
  integration test early (Step 9 SSE route + wrangler dev) to surface chunk-boundary issues
  before the full test suite is wired.
- **Option B: revisit slice** — Not indicated. The sanctioned split (roadmap-generation
  vs lesson-streaming) is available if implementation reveals the lesson SSE path is too
  risky to close in one pass. Record in 05-implement if the split is invoked.
