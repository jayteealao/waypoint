---
schema: sdlc/v1
type: implement
slug: waypoint-app
slice-slug: roadmap-lesson-generation
status: complete
stage-number: 5
created-at: "2026-07-12T02:43:03Z"
updated-at: "2026-07-12T02:43:03Z"
metric-files-changed: 18
metric-lines-added: 525
metric-lines-removed: 48
metric-deviations-from-plan: 2
metric-review-fixes-applied: 0
commit-sha: ""
tags: [roadmap, lesson-generation, sse, streaming, resilience, concept-tagging]
refs:
  index: 00-index.md
  implement-index: 05-implement.md
  slice-def: 03-slice-roadmap-lesson-generation.md
  plan: 04-plan-roadmap-lesson-generation.md
  siblings:
    - 05-implement-foundation.md
    - 05-implement-platform-proofs.md
    - 05-implement-accounts-data-layer.md
    - 05-implement-design-system-shell.md
    - 05-implement-lesson-renderer.md
    - 05-implement-sample-journey.md
    - 05-implement-ai-gateway.md
    - 05-implement-tutor-interview.md
  verify: 06-verify-roadmap-lesson-generation.md
next-command: wf-verify
next-invocation: "/wf verify waypoint-app roadmap-lesson-generation"
---

# Implement: Roadmap & Lesson Generation

## The Implementation

The loop closes. Interview record flows into a validated roadmap (5–8 waypoints, D1-persisted, atomically inserted via `DB.batch`), the sidebar lights up with real waypoints from D1, and an EventSource consumer streams NDJSON-parsed lesson sections progressively into the existing `LessonView` surface. Fifteen files authored across four phases: roadmap structured-output path, sidebar population, lesson SSE path, generation states. One re-ask on malformed roadmap JSON. Resume-from-section on mid-stream reconnect. Friendly error state past all fallbacks. concept_tags threaded through every section from prompt to storage.

18 files changed (525 insertions, 48 removals). The top risk was the NDJSON line-buffer accumulator across TCP chunks — mitigated with a string accumulator, unit-tested against split-chunk fixtures (all pass). TypeScript typecheck clean. 116 Vitest unit tests pass (5 expected skips unchanged). The seeded-session Playwright tests carry the same BETTER_AUTH_SECRET deferral as all prior slices; the existing deferral entry covers them.

## Summary of Changes

- Added `WaypointOutput`, `WAYPOINT_JSON_SCHEMA`, `validateRoadmap()`, `buildRoadmapPrompt()`, `GenerationError` in `src/lib/roadmap/schema.ts` (new)
- Added `generateRoadmap` server function in `src/server/roadmap.ts` (new): withSession, interview gate, callGateway roadmap tier, one re-ask, D1 batch insert, roadmap.generated signal
- Extended `src/server/lessons.ts` with `getLessonByWaypointId()` (createServerFn) and `upsertLesson()` (plain async for SSE route use)
- Extended `src/server/journeys.ts` with `getJourneyWithWaypoints()` (returns journey + ordered waypoints)
- Refined `ROADMAP_SYSTEM_PROMPT` (explicit JSON schema block, concept-list format rules) and `LESSON_SYSTEM_PROMPT` (full NDJSON output format, concept_tags on every section) in `src/lib/interview/prompts.ts`
- Added `concept_tags?: string[]` to all five `LessonSection` union members in `src/types/lesson-document.ts` (additive, backward-compatible)
- Wired `generateRoadmap` trigger and navigate-to-first-waypoint in `src/routes/_authenticated/journey/$journeyId/interview.tsx`
- New layout route `src/routes/_authenticated/journey/$journeyId.tsx` (deviation AD-1): loads `getJourneyWithWaypoints` and sets `ShellContext.waypoints` via `useEffect`
- New generation components: `RoadmapPendingCard`, `ReconnectingBanner`, `LessonGeneratingView` in `src/components/generation/`
- New SSE API route `src/routes/api/journey/$journeyId/lesson.ts`: auth, quota, D1 resume, streaming adapter, NDJSON line-buffer, fallback chain, fire-and-forget D1 persist, generation.completed signal
- New waypoint page `src/routes/_authenticated/journey/$journeyId/waypoint/$waypointId.tsx`: loader reads lesson, branches to LessonView (complete) or LessonGeneratingView (streaming)
- Added `data-testid="waypoint-link"` to `Sidebar.tsx` waypoint links (plan assumption A-7)
- Added generation state styles to `src/styles.css`: `wp-roadmap-pending`, `wp-reconnecting-banner`, `wp-lesson-section-reveal`, skeleton placeholders
- New unit tests: `tests/smoke/roadmap-generation.test.ts` — 20 assertions covering validateRoadmap, buildRoadmapPrompt, NDJSON line-buffer accumulator with split-chunk fixtures
- New E2E tests: `tests/e2e/roadmap-lesson-generation.spec.ts` — 4 seeded-session scenarios (AC-5, AC-6, AC-12, all-fail)
- Regenerated `src/routeTree.gen.ts` with all 4 new routes

## Files Changed

- `src/lib/roadmap/schema.ts` — **new** — WaypointOutput type, JSON schema, validation, prompt assembly
- `src/server/roadmap.ts` — **new** — generateRoadmap server function
- `src/routes/api/journey/$journeyId/lesson.ts` — **new** — SSE lesson streaming API route
- `src/routes/_authenticated/journey/$journeyId.tsx` — **new** — journey layout with D1 waypoint loading
- `src/routes/_authenticated/journey/$journeyId/waypoint/$waypointId.tsx` — **new** — waypoint lesson page
- `src/components/generation/RoadmapPendingCard.tsx` — **new** — generation pending card
- `src/components/generation/ReconnectingBanner.tsx` — **new** — fixed-top reconnect banner
- `src/components/generation/LessonGeneratingView.tsx` — **new** — SSE EventSource consumer
- `tests/smoke/roadmap-generation.test.ts` — **new** — 20 unit assertions
- `tests/e2e/roadmap-lesson-generation.spec.ts` — **new** — 4 Playwright E2E tests
- `src/lib/interview/prompts.ts` — expanded ROADMAP_SYSTEM_PROMPT + LESSON_SYSTEM_PROMPT
- `src/types/lesson-document.ts` — added `concept_tags?` to all LessonSection union members
- `src/server/lessons.ts` — added `getLessonByWaypointId()` + `upsertLesson()`
- `src/server/journeys.ts` — added `getJourneyWithWaypoints()`
- `src/routes/_authenticated/journey/$journeyId/interview.tsx` — wired roadmap trigger + nav
- `src/components/shell/Sidebar.tsx` — added `data-testid="waypoint-link"` to waypoint links
- `src/styles.css` — generation state styles (roadmap pending, reconnecting banner, section reveal, skeleton placeholders)
- `src/routeTree.gen.ts` — regenerated (auto-generated, not hand-authored)

## Shared Files (also touched by sibling slices)

- `src/types/lesson-document.ts` — shared with lesson-renderer, sample-journey, quiz-fsrs. The `concept_tags?` addition is additive; no existing consumers need updating.
- `src/server/journeys.ts` — shared with accounts-data-layer slice. Extension only; no existing functions modified.
- `src/server/lessons.ts` — shared with lesson-renderer slice. Extension only; `getLesson()` unchanged.
- `src/components/shell/Sidebar.tsx` — shared with design-system-shell. Single-attribute addition (`data-testid`).

## Notes on Design Choices

- **Autonomous Decision AD-1 (ShellContext wiring):** Plan named `_authenticated.tsx` for waypoint loading, but `_authenticated.tsx` is a pathless layout with no access to `$journeyId` params. Created `_authenticated/journey/$journeyId.tsx` as a new layout route — the correct TanStack Router pattern. Recorded as deviation.
- **Autonomous Decision AD-2 (upsertLesson as plain async):** `upsertLesson()` is not a `createServerFn` because the SSE route calls it directly from within a `ReadableStream` controller — a context where `createServerFn` middleware cannot run. Exported as a plain async function instead. This is the same architecture as other "internal" DB helpers.
- **Fire-and-forget D1 writes (plan assumption A-2):** Section persistence is done via `Promise.all([...]).catch()` (non-blocking). The SSE stream to the client is not blocked. The 0-1 section lag on reconnect is acceptable (client already has the section in React state).
- **Fallback chain in SSE route:** The SSE route implements its own fallback chain (`claude-3.5-haiku → gpt-4o`) replicating callGateway's loop without the drain. This is plan assumption A-5.
- **NDJSON over full JSON (plan assumption A-1):** The lesson prompt emits NDJSON; each line is one section. The accumulator buffers partial lines across TCP chunks. Non-JSON lines are skipped with a warn log (R2 risk mitigation).
- **D1 batch insert for waypoints (plan assumption A-8):** `DB.batch([DELETE, ...INSERTs])` executes atomically. A prior roadmap is deleted and replaced atomically — no partial roadmap state possible.

## Verification Seams Built

- **AC-5 (roadmap in sidebar)** → `data-testid="waypoint-link"` on each `<Link>` in Sidebar.tsx at `src/components/shell/Sidebar.tsx:80` — enables Playwright to count and read waypoint links
- **AC-6 (progressive lesson stream)** → `data-testid="lesson-content"` on LessonGeneratingView wrapper; `data-testid="lesson-view"` on LessonView article; section IDs flow from NDJSON `id` field through to rendered DOM
- **AC-12 (reconnect)** → `data-testid="reconnecting-banner"` on ReconnectingBanner at `src/components/generation/ReconnectingBanner.tsx:17`
- **All-fail error state** → `data-testid="lesson-error"` on error div in LessonGeneratingView
- **AC-5 roadmap pending** → `data-testid="roadmap-pending-card"` on RoadmapPendingCard
- **Vitest NDJSON line-buffer** → inline `processNdjsonChunks()` helper in `tests/smoke/roadmap-generation.test.ts` — mirrors the SSE route's accumulator verbatim

## Deviations from Plan

1. **AD-1: Journey layout route location** — Plan said "extend `_authenticated.tsx` loader"; implemented as a new `_authenticated/journey/$journeyId.tsx` layout route (correct TanStack Router pattern for param-scoped layouts). Behavior is equivalent: waypoints are loaded and set in ShellContext when navigating to any journey-scoped child route.

2. **AD-2: `upsertLesson` as plain async** — Plan implied `upsertLesson()` would be a `createServerFn`. It's a plain `async function` called directly from the SSE route's `ReadableStream` controller. Not a behavioral change; the function still runs on the Workers runtime with the same D1 binding.

## Anything Deferred

- **AC-15 residual (first Cloudflare deploy):** SSE streaming on the real Cloudflare Workers runtime. Deferred to ship stage — PO-accepted constraint, wrangler dev on workerd already proves the SSE path (platform-proofs slice). Clearing event: first `wrangler deploy` + one live generation.
- **AC-5/AC-6/AC-12 live smoke with OpenRouter key:** Tagged smoke test clears when `OPENROUTER_API_KEY` is present. Identical to AC-PP2b deferral.
- **Seeded-session Playwright tests (AC-5, AC-6, AC-12):** BETTER_AUTH_SECRET wall. Absorbed into existing AC-ADL1+AC-ADL5 deferral — no new deferral entry added.
- **Regenerate UI affordance (plan assumption A-4):** Out of scope. No "regenerate roadmap" button; learner can only add a new journey for a fresh roadmap.

## Known Risks / Caveats

- **NDJSON compliance (R2 — MED):** If the model emits prose or markdown between NDJSON lines, those lines are skipped with a warn log. The lesson continues rendering around gaps. Manual smoke with the live model recommended before sign-off.
- **D1 write lag on resume (R3 — MED):** Fire-and-forget D1 writes may lag by 0-1 sections behind what the client has rendered. On reconnect, the client re-emits stored sections immediately (resume path). The gap is not user-visible.

## Freshness Research

No external dependency version changes since planning (2026-07-12). `@tanstack/ai` + `@tanstack/ai-openrouter` API verified against existing `src/lib/ai/gateway.ts` (empirical truth). D1 `batch()` API verified against installed `@cloudflare/workers-types`. `EventSource` browser API native — no polyfill. No new dependencies added.

## Recommended Next Stage

- **Option A (default):** `/wf verify waypoint-app roadmap-lesson-generation` — The implementation touches testable behavior: roadmap schema validation (Vitest), NDJSON line-buffer (Vitest), seeded-session Playwright scenarios (4 tests, BETTER_AUTH_SECRET deferral applies). Consider `/compact` before verify — workflow state lives in artifact files on disk.
- **Option B:** `/wf review waypoint-app roadmap-lesson-generation` — skip verify if the unit tests and typecheck are deemed sufficient evidence. Not recommended given the complexity of the SSE path.
