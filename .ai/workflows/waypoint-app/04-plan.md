---
schema: sdlc/v1
type: plan-index
slug: waypoint-app
status: complete
stage-number: 4
created-at: "2026-07-11T00:13:07Z"
updated-at: "2026-07-12T05:12:38Z"
planning-mode: single
slices-planned: 11
slices-total: 12
implementation-order: [foundation, platform-proofs, accounts-data-layer, design-system-shell, lesson-renderer, sample-journey, ai-gateway, tutor-interview, roadmap-lesson-generation, quiz-fsrs, adaptation-progress, source-grounding]
conflicts-found: 0
tags: [greenfield, tanstack, ai-teaching]
refs:
  index: 00-index.md
  slice-index: 03-slice.md
next-command: wf-implement
next-invocation: "/wf implement waypoint-app design-system-shell"
---

# Plan Index

## Slice Plan Summaries

### `foundation`
- **Files to touch:** 20 new files across toolchain, scaffold, config, test harnesses, CI, and docs
- **Strategy:** Scaffold-then-audit. Use `@tanstack/cli create` (with manual fallback), audit and
  exact-pin all TanStack versions (avoiding three banned ranges), wire `@cloudflare/vite-plugin`,
  seed `wrangler.jsonc` with `observability: { enabled: true }`, install Vitest and Playwright
  smoke tests, create GitHub Actions CI workflow.
- **Key risk:** `@tanstack/cli create` is alpha; fallback path documented. CI gate (AC-F4) is
  deferred until a GitHub remote exists; proxy AC (local harnesses passing) is the immediate evidence.

### `platform-proofs`
- **Files to touch:** 10 files (8 new, 2 modified) across deps/config, SSE route, AI client,
  auth+D1 spike, and proof test suites
- **Strategy:** Smallest-surface proofs. Demo SSE route (5 timed chunks via Workers ReadableStream),
  TanStack AI factory (native OpenRouter + OpenAI-fallback + mock adapter), better-auth per-request
  D1 client on `createAPIFileRoute`, Playwright proofs against `wrangler dev` (separate config),
  Vitest AI smoke in node environment.
- **Key risk:** SSE streaming under workerd is inferred-not-documented — the demo route and
  Playwright timing test are the empirical answer. If it fails, surface immediately.

### `accounts-data-layer`
- **Files to touch:** 18 files (11 new, 7 modified) across deps, migrations, auth config,
  authorization guard, server functions, TanStack DB store, auth/account routes, and tests
- **Strategy:** Schema-whole. Full D1 schema in one migration (`0000_schema_v1.sql`) with
  `CREATE TABLE IF NOT EXISTS` for idempotency. better-auth expanded from spike config to full
  Google + GitHub OAuth. Authorization enforced at the server-function boundary via a pure-
  function guard. TanStack DB QueryCollection establishes the client-store pattern every later
  UI slice extends. Sign-in and account surfaces are minimal Tailwind; restyled by
  design-system-shell (accepted rework).
- **Key risk:** OAuth app registrations are PO-owned external prerequisites; seeded-session
  Playwright proxy keeps the build green. TanStack DB beta API may drift; fallback to plain
  TanStack Query documented per AC.

### `design-system-shell`
- **Files to touch:** 19 files (12 new, 7 modified/auto) across tokens/CSS, UI components, shell
  components, dashboard components, routes, and tests
- **Strategy:** Palette-first, then compose. Replace the teal prototype palette with the OKLCH
  warm-ember token set validated by a Vitest contrast test before any component work opens.
  Twelve React components across `ui/`, `shell/`, and `dashboard/` directories. A `_authenticated`
  pathless layout route provides the AppShell wrapper; sign-in sits outside it.
- **Visual contract:** `02c-craft.md` authored as part of this plan (image gate skipped per
  autonomous-override policy; direction fully specified in brief).
- **Key risk:** Token rename completeness — 25+ `.demo-*` CSS classes reference old token names;
  the pre/post-rename grep audit is the only gate. AC-DSS1/3/4 Playwright tests are behind the
  existing BETTER_AUTH_SECRET deferral wall (no new deferral entry needed).

### `lesson-renderer`
- **Files to touch:** 18 files (14 new, 4 modified) across schema types, widget registry,
  sanitization, lesson components, fixture route, styles, and tests
- **Strategy:** Schema-first. `LessonDocumentV1` TypeScript type authored and locked before any
  component code opens (3-slice contract consumed by sample-journey, roadmap-lesson-generation,
  quiz-fsrs). Widget registry as typed Map with type-guard validation. DOMPurify 3.x with SSR
  guard. Fixture route at `/_authenticated/lesson/fixture` drives all Playwright tests.
- **Key risk:** Lesson schema is a 3-slice contract — rename or type narrowing after consumer
  slices begin forces coordinated rework. Mitigated by `version: 1` discriminant + pre-review
  against all consumer slice definitions before implementing.

### `sample-journey`
- **Files to touch:** 15 files (10 new, 5 modified) across shell context extension, fixture
  content, quiz surface component, 6 sample journey routes, styles, and tests
- **Strategy:** Shell extension first, then fixture content, then quiz surface, then routes.
  Fixture lessons authored against `LessonDocumentV1`; quiz surface born here against
  fixture questions with localStorage attempt persistence; first-login routing via
  `useEffect` in `JourneysDashboard`; sidebar waypoint list seam filled via ShellContext
  extension (`waypoints` + `setWaypoints`).
- **Key risk:** Fixture content quality — sample lessons are most users' first impression;
  equal-length MC options enforced by a Vitest lint test at `pnpm test` time.

### `ai-gateway`
- **Files to touch:** 10 files (7 new, 3 modified) across gateway core, quota engine, UI card, server
  function, test harness route, and extended test suite
- **Strategy:** Gateway wraps, not replaces. `src/lib/ai-client.ts` adapter factories stay untouched;
  `gateway.ts` adds quota gate + model tiering + retry/fallback + usage recording + instrumentation above
  them. Quota unit: cost_usd (daily window, $0.50/day default). Quota card is a warm blocking component
  with reset time — no paywall language.
- **Key risk:** OpenRouter `usage.total_cost` absent from adapter payload — fallback to token-count
  recomputation handled; unit test covers both paths. Structured+tool-call separation enforced as a
  TypeScript discriminated union + runtime TypeError.

### `tutor-interview`
- **Files to touch:** 15 files (13 new, 2 modified) across DB migration, types, state machine,
  prompt suite, server functions, 4 UI components, 2 routes, styles, and 2 test files
- **Strategy:** State-machine-first. `InterviewStateMachine` enforces the one-Q-per-turn
  contract structurally (first-question-extraction regex); `prompts.ts` carries the full
  prompt suite (interview fully exercised; lesson/quiz/roadmap drafted thin with fidelity notes);
  `server/interview.ts` routes through `callGateway({ type: 'interview' })`. Non-streaming
  turns (gpt-4o-mini fast enough for < 3s NFR). Stage-defined client-side chips. New
  `interview_records` table via additive migration.
- **Key risk:** Prompt iteration time — voice quality (warm, encouraging, one-question) is
  only observable in live-model runs; mocked tests pin structure. BETTER_AUTH_SECRET deferral
  wall absorbed into existing AC-ADL1+AC-ADL5 entry.

### `roadmap-lesson-generation`
- **Files to touch:** 15 files (9 new, 6 modified) across prompts, roadmap schema, server
  functions, SSE API route, generation UI components, waypoint route, layout loader, styles,
  and test files.
- **Strategy:** Two-phase. Phase 1 (roadmap): refine ROADMAP_SYSTEM_PROMPT with explicit JSON
  schema, author `src/lib/roadmap/schema.ts` + `src/server/roadmap.ts` (one re-ask on malformed
  JSON, D1 batch insert), wire trigger in interview route. Phase 2 (lesson SSE): refine
  LESSON_SYSTEM_PROMPT for NDJSON per-section, build SSE API route with line-buffer NDJSON parser
  + per-section D1 writes (resume path), build `LessonGeneratingView` EventSource consumer,
  build `ReconnectingBanner` (content-preserving on failure). Concept tags added as optional
  field on LessonSection (additive, no version bump).
- **Key risk:** NDJSON chunk boundary splitting — line-buffer accumulator mandatory, unit-tested
  with split-chunk fixtures. Real-transport integration (wrangler dev + real stream) scheduled
  as step 1 of implementation to catch cadence issues early.

### `quiz-fsrs`
- **Files to touch:** 14 files (8 new, 6 modified) across ts-fsrs dependency, prompts,
  quiz schema + FSRS scheduler library, 5 server functions, QuizView extension, quiz route,
  waypoint route update, styles, and 4 test files.
- **Strategy:** Scheduler-first. ts-fsrs FSRS bridge and unit tests written before any
  gateway call. `generateQuiz` server function creates concepts, initialises FSRS cards,
  appends up to 2 resurfacing review questions, calls `callGateway` once per concept. Grading
  is synchronous per-question (immediate feedback). FSRS update fires after each graded
  question. QuizView extended with FRQ textarea + "checking…" state under `mode='journey'`;
  sample-journey MC flow preserved byte-for-byte.
- **Key risk:** Grading quality is the fuzziest surface — rubric prompt + 6-fixture corpus
  bound it in CI; live quality is a tagged smoke test. FSRS bridge unit-tested for field-
  name mapping correctness (camelCase ↔ snake_case round-trip).

### `adaptation-progress`
- **Files to touch:** 15 files (9 new, 6 modified) across DB migration, schema, pure metrics
  library, server functions, UI components (ProgressPanel, AdaptationCard), routes, styles, and tests
- **Strategy:** Migration-first, then pure metrics library (fully unit-testable), then server
  functions, then UI components. Adaptation proposals are LLM-free — computed from FSRS + quiz
  data as "Review: ${weakestConceptName}". One pending proposal per journey. Accept path uses a D1
  batch (UPDATE positions, then INSERT) to shift later waypoints. Dashboard JourneyCard receives
  `masteryPct` from a new loader; progress surface lives at a dedicated `progress` route.
- **Key risk:** Streak arithmetic is timezone-sensitive (UTC day boundary); unit tests pin
  midnight explicitly. Waypoint position shifting on accept requires correct UPDATE-before-INSERT
  ordering (D1 batch guarantees sequential execution).

### Plans not yet written (1 remaining slice)
Plan for slice 12 (source-grounding) will be authored before or during its implement stage.
It follows the same sub-agent research + autonomous-override pattern.

## Cross-Cutting Concerns

- **Supply-chain pins:** The foundation's exact-pinning policy (`.npmrc` `save-exact=true` + CI
  pin-check) applies to every subsequent slice. Any new dependency added in a later slice must be
  exact-pinned; the CI gate enforces this from the first push.
- **Cloudflare Workers observability:** `observability: { enabled: true }` in `wrangler.jsonc`
  (seeded in foundation) is the instrumentation backbone for all generation-consuming slices.
  No additional logging infrastructure is needed in those slices; structured `console.log` calls
  are sufficient.
- **Playwright smoke pattern:** The foundation's `playwright.config.ts` with `webServer` is the
  template for every E2E test in later slices. Later slices add test files; the config is extended,
  not replaced.
- **`.env.example`:** The foundation documents all three external prerequisites. Later slices
  that add new env vars must update `.env.example` as part of their implementation step.
- **Windows path-length:** `node-linker=hoisted` in `.npmrc` is the project-wide mitigation.
  Slices must not introduce deeply-nested `node_modules` dependencies that bypass this.

## Integration Points Between Slices

- **foundation → platform-proofs:** The scaffold, `wrangler.jsonc`, and `pnpm dev` server
  are the direct inputs to the platform-proofs slice's SSE streaming and D1 tests.
- **foundation → accounts-data-layer:** The D1 binding in `wrangler.jsonc` is configured in
  accounts-data-layer; foundation's `wrangler.jsonc` provides the base file to extend.
- **foundation → all UI slices:** The Playwright config and `webServer` setup are reused
  across all UI-bearing slices; the foundation's pattern is the shared template.
- **platform-proofs → accounts-data-layer:** The D1 binding, per-request `createAuth` factory,
  and `cloudflare:workers` env import pattern proven in platform-proofs are the direct inputs
  to accounts-data-layer's OAuth expansion and typed Env generation.
- **accounts-data-layer → all later slices:** The complete D1 schema (8 domain tables), the
  authorization guard, and the TanStack DB QueryCollection pattern are shared infrastructure
  that every subsequent slice consumes without modification.

## Recommended Implementation Order

1. `foundation` — zero dependencies; everything else depends on it.
2. `platform-proofs` — immediate next: de-risks the three beta dependencies while the codebase
   is still minimal enough to diagnose failures clearly.
3. `accounts-data-layer` — full D1 schema early, so no later slice migrates mid-build.
4. `design-system-shell` — design tokens and responsive shell before any content surface.
5. `lesson-renderer` — trust model and progressive rendering proven AI-free.
6. `sample-journey` — the visible milestone: demoable product on zero LLM spend.
7. `ai-gateway` — the metered AI gateway before any generation feature.
8. `tutor-interview` — prompt-suite rewrite and the loop's front door.
9. `roadmap-lesson-generation` — the riskiest slice; runs when every input is proven.
10. `quiz-fsrs` — the learner model and quiz engine.
11. `adaptation-progress` — the learner model made visible; whole-app closes.
12. `source-grounding` — lowest-coupling slice; layers onto a finished pipeline.

## Conflicts Found

None across the three planned slices. The accounts-data-layer plan reviewed against both
sibling plans — no shared file conflicts (accounts-data-layer is additive: it touches
`package.json`, `wrangler.jsonc`, and `src/lib/auth.ts` which neither sibling plan modified
after their initial writes). The D1 binding added in platform-proofs is extended, not replaced.

## Freshness Research

Shape's seven-source freshness sweep (2026-07-10) remains current for the foundation slice.
No new dependency research was required — the foundation slice installs only confirmed-current
toolchain packages (TanStack Start RC, @cloudflare/vite-plugin, Vitest, Playwright).

Key facts carried forward from shape:
- Compromised versions: `@tanstack/react-start` 1.167.68/.71; router 1.169.5/.8; 1.142.x middleware.
- Correct adapter: `@cloudflare/vite-plugin` (not Nitro preset).
- CI audit: `pnpm audit --audit-level=high`.

## Recommended Next Stage

- **Option A (default): implement design-system-shell** — Foundation, platform-proofs, and
  accounts-data-layer are fully implemented and reviewed (all verdict: SHIP). The design-system-shell
  plan is now complete; visual contract (`02c-craft.md`) authored. All ACs resolved, no blockers.
  Consider `/compact` before implementing — four slice planning cycles of research are in context.
- **Option B: plan lesson-renderer** — Author the lesson-renderer plan in parallel while
  design-system-shell implements; not blocked, though lesson-renderer renders inside the AppShell
  so its plan benefits from the shell being implemented first.
- **Option C: revisit slice** — Not indicated; no slice-boundary issues found.
