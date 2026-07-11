---
schema: sdlc/v1
type: shape
slug: waypoint-app
status: complete
stage-number: 2
created-at: "2026-07-10T22:10:52Z"
updated-at: "2026-07-10T22:10:52Z"
docs-needed: true
docs-types: [readme, explanation, reference]
augmentations-needed: [instrument]
tags: [greenfield, tanstack, ai-teaching, cloudflare-only, local-first, fsrs]
refs:
  index: 00-index.md
  intake: 01-intake.md
  design: 02b-design.md
  next: 03-slice.md
next-command: wf-slice
next-invocation: "/wf slice waypoint-app"
---

# Shape

## The Shape

The twenty questions this stage asked had one job: turn "an AI teaching app built on the teach/grill skills" into decisions someone can build against — and the answers reshaped the architecture twice. The first reshape was the backend. The intake carried ElectricSQL + Neon Postgres as the leading local-first candidate, and the PO killed it in one sentence: no third-party database service, Cloudflare options only, watch the costs. That constraint turns out to be a gift rather than a wound — TanStack DB works sync-engine-free over TanStack Query, D1 becomes the system of record behind Start server functions, and an official Durable Objects SQLite persistence adapter (published this month) keeps a real-time sync path open without adding a single vendor. The PO also asked, fairly, why "TanStack Store + DB" wasn't offered as the answer; the short version is that Store and DB are both client-side libraries, so they were never in competition with Postgres — the question was always what sits on the server, and now the answer is: only Cloudflare.

The second reshape was scope, and it moved in the opposite direction from what a trim round usually produces. Round 5 offered to defer source ingestion; the PO instead pulled it *into* v1 — Waypoint will fetch user-provided URLs and ground lessons in their actual content — and added something bigger: rewriting the teach and grill skills themselves into Waypoint's agent prompts is in scope, not just borrowing their spirit. Balanced against that, real-world task verification was genuinely deferred, and the riskiest idea on the table — AI-written JavaScript running in lessons — resolved itself when a freshness check confirmed TanStack AI's generative UI is exactly the safe pattern: the model invokes typed, developer-registered widgets and never writes executable code. Interactive lessons and a locked-down trust model stopped being a tradeoff.

What's left is a demanding but coherent v1: OAuth-only accounts, multiple journeys per learner, a chat-with-chips interview that produces an adaptive roadmap (changes proposed, never silently applied), progressively streamed lessons built from trusted widgets, AI-graded quizzes feeding a per-concept FSRS engine from day one, and a progress surface showing all of it — mastery, history, streaks, due counts. The top risk is honest to name: three beta/RC dependencies (Start RC, TanStack AI beta, TanStack DB beta) sit on the critical path simultaneously, and one of them (the OpenRouter adapter's tool calling) broke as recently as May. The spec pins versions, mandates the OpenAI-adapter-with-OpenRouter-baseURL fallback, and makes streaming-on-workerd an explicit early proof — but a greenfield app on three pre-1.0 libraries is a choice the PO made with eyes open, and slicing needs to front-load the proofs.

## Problem Statement

Matt Pocock's `teach` and grill skills implement genuinely good pedagogy — mission-grounded lessons, consent-gated interviews, retrieval practice, learning records driving zone-of-proximal-development — but they exist as markdown instructions for a CLI agent, usable only by people who run Claude in a terminal. Waypoint productizes that loop as a multi-user web application: a learner states a goal, an AI tutor interviews them, builds an adaptive course roadmap, teaches through beautiful interactive lessons, quizzes with AI grading, and remembers what each learner knows well enough to resurface fading material at the right time.

## Primary Actor / User

- **Learner** (primary): a curious adult learning anything — not just programming. Signs in with Google/GitHub, states goals, answers interview questions, reads/interacts with lessons, takes quizzes, tracks progress. Multi-user from day one; each learner's journeys, learner model, and quotas are isolated.
- **AI tutor agent** (system actor): runs the interview, fetches and grounds sources, generates roadmaps/lessons/quizzes via TanStack AI + OpenRouter, grades free-text answers, proposes roadmap adaptations, updates the FSRS learner model.
- **Operator** (secondary, = the PO for now): owns the OpenRouter key and Cloudflare account; needs cost/usage visibility per user.

## Desired Behavior

**The core loop (v1, web only, fully responsive):**

1. **Sign-in**: OAuth-only (Google + GitHub) via better-auth. First login lands in a **pre-baked guided sample journey** ("How Waypoint works") — rendered lessons and a sample quiz with zero LLM spend — with a clear CTA to start a real journey.
2. **Goal intake + interview**: The learner states what they want to learn. The tutor asks permission to probe, then interviews **one question at a time** (the grilling contract) in a chat surface with quick-reply chips + free text: current knowledge, scope, mission ("why do you want this?" — pushback on vagueness per MISSION-FORMAT), constraints, and preferred sources (URLs accepted).
3. **Source grounding**: Provided URLs are fetched and their content extracted; lesson generation is grounded in that material and cites it. Every lesson also names a recommended primary source.
4. **Roadmap generation**: The agent produces a journey roadmap — an ordered sequence of waypoints (chapters), each with a title, goal, and concept list — rendered as the persistent sidebar navigation.
5. **Lessons**: Opening a waypoint streams its lesson with progressive rendering. Lessons are structured content (typographically excellent prose, code samples, citations) interleaved with **trusted interactive widgets** invoked by the model via TanStack AI generative UI / tool calls: inline checkpoint questions, flipcards, and similar. No AI-authored JS ever executes.
6. **Quizzes**: Each waypoint ends in a quiz: multiple-choice (equal-length answer options — no formatting clues, per the source skill) plus short free-text answers graded by the LLM against a rubric with feedback. Immediate per-question feedback (tight feedback loop).
7. **Learner model (FSRS)**: Lessons and quiz questions are tagged to concepts. Every graded answer updates that concept's FSRS card (ts-fsrs, FSRS-6). Later quizzes interleave due/fading concepts from earlier waypoints alongside new material.
8. **Adaptation (soft gate, propose + confirm)**: Weak quiz results make the agent propose a roadmap change ("You struggled with X — insert a review waypoint?"); the learner accepts or declines and can always proceed. Accepted changes update the roadmap visibly.
9. **Progress**: Per journey: waypoint completion states on the roadmap, per-concept mastery meters (from FSRS retrievability), quiz history with pass rates, streaks, and review-due counts.
10. **Multiple journeys**: A learner can run several journeys concurrently; a journeys dashboard lists them.
11. **Quotas & resilience**: Generation runs on the app's OpenRouter key with per-user quotas; exhaustion shows a friendly blocking state. Mid-stream generation failures retry through a model fallback chain and resume from the last completed section — partial content is never lost.

**Explicitly in scope beyond the loop**: adapting the teach/grill/grill-with-docs skill texts into Waypoint's agent prompt suite (the pedagogy contract is a rewrite target, not just inspiration); the TanStack adoption matrix (below, in Dependencies); per-user cost tracking.

## Acceptance Criteria

Verification method per criterion: `automated` (unit/integration test), `interactive` (drive the running app — tool + evidence stated), or `manual` (human judgement).

**AC-1 — Auth & isolation.** Given a new visitor, when they sign in with Google or GitHub, then an account is created and they land in the sample journey; a second account sees none of the first account's journeys or progress. — `interactive` (Playwright: two browser contexts, OAuth against dev-configured OAuth apps or better-auth test provider; screenshot evidence) + `automated` (server-function authorization tests: cross-user data access rejected).

**AC-2 — Sample journey.** Given a first-ever login, when the learner explores the sample journey, then at least two pre-baked lessons and one working sample quiz render fully, and no OpenRouter call is made. — `interactive` (Playwright: drive sample journey; assert zero outbound LLM requests via network log; screenshots at 375/768/1280px).

**AC-3 — Consent-gated interview.** Given a learner starts a new journey and states a goal, when the interview begins, then the agent asks permission before probing, asks exactly one question per turn, offers quick-reply chips plus free text, and captures mission, scope, prior knowledge, and preferred sources into the journey record. — `interactive` (Playwright or Claude_Browser: run a scripted interview; verify captured journey record via UI or debug endpoint) + `automated` (interview state-machine unit tests).

**AC-4 — Source grounding.** Given the learner supplied a URL during the interview, when the roadmap and first lesson are generated, then the fetched source's content demonstrably grounds the output (lesson cites the source; content reflects material present in the source but absent from a no-source control). — `automated` (fixture: serve a local test page with distinctive content; assert citation + content markers in generated output with a mocked-then-live adapter) + `manual` (spot-check grounding quality).

**AC-5 — Roadmap.** Given a completed interview, when generation finishes, then a roadmap of ordered waypoints (title, goal, concepts) renders in the sidebar and persists across reload and re-login. — `interactive` (Playwright: complete interview → assert sidebar waypoints → reload → assert persistence).

**AC-6 — Streaming lesson with widgets.** Given the learner opens an ungenerated waypoint, when the lesson generates, then content renders progressively (first content visible well before generation completes), includes at least one interactive checkpoint widget the learner can answer in-flow, and no AI-authored script executes (widgets are app-registered components only). — `interactive` (Playwright: observe progressive DOM growth during stream; interact with checkpoint; evidence: timestamps + screenshots) + `automated` (widget-registry test: unknown/malformed tool calls are rejected; any HTML-ish content passes DOMPurify ≥ 3.4.7).

**AC-7 — Quiz + AI grading.** Given a completed lesson, when the learner takes its quiz, then MC options are equal-length (no formatting clues), free-text answers receive LLM-graded verdicts with feedback, each question shows immediate feedback, and the attempt (score, per-question results) is recorded. — `interactive` (Playwright: take quiz end-to-end; screenshots) + `automated` (grading-schema validation; MC equal-length lint on generated quizzes).

**AC-8 — FSRS learner model.** Given graded quiz answers tagged to concepts, when grading completes, then each concept's FSRS card (due, stability, difficulty, reps, lapses, state, lastReview) updates per ts-fsrs; and given concepts from earlier waypoints are due, when a later quiz is generated, then it includes review questions for those due concepts. — `automated` (ts-fsrs integration tests with simulated answer histories; resurfacing-selection tests with clock control).

**AC-9 — Soft gate + propose/confirm adaptation.** Given a failed quiz (below threshold), when results display, then the agent proposes a specific roadmap change which the learner can accept (roadmap visibly updates) or decline (roadmap unchanged), and the next waypoint remains accessible either way. — `interactive` (Playwright: force a failing quiz; exercise both accept and decline paths).

**AC-10 — Progress surfaces.** Given accumulated activity, when the learner views their journey/dashboard, then they see waypoint completion states, per-concept mastery meters, quiz history with pass rates, current streak, and review-due count, each consistent with the underlying data. — `interactive` (Playwright: seed known activity; assert each surface) + `automated` (metric-derivation unit tests, e.g. mastery from retrievability).

**AC-11 — Quotas & cost tracking.** Given a learner exhausts their generation quota, when they request generation, then a friendly quota state appears and no LLM call is made; and given any generation, then its token usage and cost (from the OpenRouter usage payload) are recorded against the user. — `automated` (quota-enforcement tests; usage-recording tests with mocked adapter) + `interactive` (drive the quota-reached state; screenshot).

**AC-12 — Failure resilience.** Given a mid-stream generation failure (injected), when the app recovers, then it retries via the model fallback chain and resumes from the last completed section without losing already-rendered content, showing at most a brief reconnecting state. — `automated` (fault-injection integration test on the generation pipeline) + `interactive` (observe recovery UX).

**AC-13 — Multiple journeys.** Given an existing journey, when the learner starts a second, then both appear on the dashboard with independent roadmaps, learner models, and progress. — `interactive` (Playwright).

**AC-14 — Responsive.** Given each core screen (dashboard, interview, lesson, quiz, progress), when rendered at 375px, 768px, and 1280px, then layout is usable and unbroken: sidebar collapses to progress bar + drawer on mobile; no horizontal overflow; touch targets ≥ 44px. — `interactive` (Playwright screenshot sweep at all three widths across all five screens) + `manual` (design-quality judgement against 02b-design.md).

**AC-15 — Streaming on Workers (platform proof).** Given the app deployed (or `wrangler dev`) on the Cloudflare Workers runtime, when a lesson generates, then SSE streaming via `toServerSentEventsResponse()` works under `workerd` end-to-end. — `interactive` (drive one generation against the Workers runtime early in the build; network-trace evidence). *This is a de-risking proof, not a ship gate — see Verification Strategy.*

## Non-Functional Requirements

- **Security**: No AI-authored executable code, ever (widget registry is the only interactivity path). Any raw HTML string rendered from model output is sanitized with DOMPurify ≥ 3.4.7 (no `SAFE_FOR_XML`/`IN_PLACE` modes). better-auth ≥ 1.6.23. All TanStack dependencies pinned exactly (CVE-2026-45321 supply-chain lesson); `pnpm audit` in CI. Server functions enforce per-user authorization on every data access. Fetched external source content is treated as untrusted data — it grounds lesson content but its embedded instructions are never followed (prompt-injection posture documented in the agent prompts).
- **Cost**: Cloudflare-only backend (Workers, D1, KV/DO as needed) — no third-party data services. Model tiering keeps hot-path costs down (cheap/fast model for interview turns; premium model only for lesson generation). Per-user quotas cap worst-case spend. Target: infra fixed cost ≤ Workers paid plan (~$5/mo) at v1 scale; LLM cost visible per user.
- **Performance**: First streamed lesson content visible < 5s after generation starts (perceived latency; the stream is the loading state). Local-first reads — journey/roadmap/progress render from the client store without a network round trip after first load. Interview turn round-trip < 3s on the cheap model.
- **Accessibility**: Core loop operable by keyboard; WCAG AA contrast on all text (the warm palette must be validated, not assumed); quiz interactions screen-reader usable; `prefers-reduced-motion` respected.
- **Privacy**: Learner data (missions, answers, learner model) is personal — never sent to any service other than OpenRouter (for generation) and never used across accounts.
- **Pedagogy fidelity**: The rewritten agent prompts preserve the source skills' operative rules: one-question-at-a-time, mission pushback on vagueness, equal-length MC options, knowledge-then-skill lesson sequencing, learning-record supersession semantics.

## Edge Cases / Failure Modes

- **Unfetchable/paywalled source URL** → interview acknowledges the failure, offers to continue without it or accept another source; never silently drops it.
- **Malicious/prompt-injecting source content** → grounding treats source text as data; agent prompts include injection resistance; widget registry + sanitization bound the blast radius.
- **Model returns malformed structured output** (quiz/roadmap JSON) → OpenRouter Response Healing (non-streaming structured calls) + schema validation + one re-ask before surfacing an error.
- **Tool-calling regression on the OpenRouter adapter** (broke May 2026) → adapter abstraction allows swapping to the OpenAI adapter with OpenRouter baseURL without touching call sites.
- **Learner abandons interview mid-way** → partial interview state persists; journey resumes at the pending question.
- **Learner declines probing consent entirely** → agent generates a best-effort roadmap from the stated goal alone and says so.
- **Quiz free-text answer is gibberish/empty** → graded as incorrect with gentle feedback; no crash, no wasted re-grade loops.
- **Concurrent sessions (two tabs/devices)** → last-write-wins at minimum; no data corruption; documented behavior.
- **Quota exhausted mid-lesson** → the in-flight generation completes (or resumes free) but no new generation starts; clear messaging.
- **OpenRouter outage / all fallbacks fail** → surfaced error with retry; previously generated content remains fully usable offline-ish (local store).
- **Sample journey drift** → pre-baked content is versioned fixture data in the repo, not generated at deploy time.
- **Clock skew and FSRS** → scheduling uses server time; client display tolerates skew.
- **OAuth account with no email visibility (GitHub private email)** → handled per better-auth flow; account still created.

## Affected Areas

Greenfield — everything is created, nothing modified. From Explore sub-agent 1:

- Repo root contains only `.ai/` (workflow artifacts) and `.scratch/mattpocock-skills/` (reference clone — read-only input, becomes the source text for the agent-prompt rewrite).
- No git repo yet: `git init` + `feat/waypoint-app` branch off `main` is the first act (per intake branch strategy).
- The pedagogy contract extracted from the source skills (see Freshness Research → Pedagogy) is the input to the agent-prompt suite; `MISSION-FORMAT`, `LEARNING-RECORD-FORMAT`, the grilling one-question rule, and the equal-length-MC rule translate directly into Waypoint data models and prompt rules.

## Dependencies / Sequencing Notes

**The TanStack adoption matrix (PO deliverable — decision recorded here):**

| Library | Status | Verdict for Waypoint v1 | Why |
|---|---|---|---|
| Router | Stable v1 | **USE** | Core routing (via Start) |
| Start | RC (v1.154+) | **USE** | Full-stack framework; server functions; Cloudflare Workers via `@cloudflare/vite-plugin` (NOT the old Nitro preset) |
| Query | Stable v5 | **USE** | Server-state layer under DB QueryCollections |
| DB | Beta v0.6 | **USE** | Client store: live queries, optimistic mutations, browser persistence; QueryCollections over server functions (no sync engine in v1) |
| AI | Beta | **USE** | LLM abstraction; OpenRouter adapter (`openRouterText`, stable form); AG-UI generative UI drives the widget registry |
| Form | Stable | **USE** | Interview inputs, quiz forms |
| Store | Alpha | **LATER/AS-NEEDED** | Client-only UI state if Router/DB don't already cover it — not a persistence answer (see PO Q19 note below) |
| Pacer | Beta | **LATER** | Rate-limiting/queueing of generation calls if quota engineering wants it |
| Table | Stable v8 | **LATER** | Quiz-history tables if they outgrow simple lists |
| Virtual | Stable v3 | **LATER** | Long lesson lists; web-DOM only |
| Devtools | Alpha | **USE (dev-only)** | DX |
| CLI (`@tanstack/cli`) | Alpha | **USE (dev-time)** | Scaffolding (`create`), `--json` doc search |
| Intent | Alpha | **USE (dev-time)** | `npx @tanstack/intent install` — agent skills track installed versions; prevents stale-pattern suggestions |
| Config | Stable | **DON'T** | Monorepo publishing tooling — not our shape |
| Ranger / Hotkeys / Workflow / React Charts | various | **DON'T (v1)** | No range inputs; shortcuts later; Workflow pre-alpha; React Charts deprecated |

**The Store + DB question (PO, Round 5), answered.** TanStack Store and TanStack DB are both *client-side* libraries — Store is a small reactive-state primitive, DB is the collection/live-query layer (built above Query, optionally above a sync engine). Neither stores data on a server, so neither competes with Postgres; the Round-5 options were about the *server* side. With the Cloudflare-only constraint the architecture is: **TanStack DB on the client (QueryCollections + browser persistence) ⇄ Start server functions ⇄ D1 (SQLite) as the system of record**, with better-auth also on D1. ElectricSQL is off the table (Postgres-only, and Electric Cloud is a third-party service). The real-time upgrade path stays open without new vendors: the official `@tanstack/cloudflare-durable-objects-db-sqlite-persistence` adapter (v0.1.11, July 2026) and the community `tanstack-do-db-collection` (WebSocket DO sync) are roadmap options. Cost check: D1 free tier is generous; the paid Workers plan (~$5/mo) is the expected fixed cost; DOs only if/when real-time sync ships.

**Sequencing constraints for `slice`:**

1. **Bootstrap first**: git init → `@tanstack/cli create` scaffold → pnpm, exact pins (avoid `@tanstack/react-start` 1.167.68/1.167.71 — compromised; avoid 1.142.x Cloudflare middleware break) → `@cloudflare/vite-plugin` + `wrangler.jsonc` → CI with `pnpm audit`.
2. **Platform proofs early** (each cheap, each de-risks a beta dependency): SSE streaming under `workerd` (AC-15); TanStack AI OpenRouter adapter tool-calling smoke (with the OpenAI-adapter-baseURL fallback ready); D1 + better-auth on an API file route (`createAPIFileRoute`, not `createServerFn`; clients created per-request, not module scope; `import { env } from 'cloudflare:workers'` for SSR-context secrets).
3. **Agent-prompt suite** (the teach/grill rewrite) precedes roadmap/lesson/quiz generation slices — it is their shared foundation.
4. **FSRS engine** is independent of generation and can proceed in parallel once the data model lands.
5. **Design system + widget registry** precede lesson rendering; the sample journey (fixture content) can then be authored against real components.
6. **External prerequisites (PO actions — force-scoped, see Verification Strategy)**: Google + GitHub OAuth app registrations; an OpenRouter API key; Cloudflare account access (available via the session's `cloudflare-api` MCP, PO-confirmed).

**Model tiering (v1 defaults, config-swappable):** interview turns → Claude Haiku 4.5 or Gemini 3 Flash; lesson generation → Claude Sonnet 4.6 (Gemini 3.1 Pro fallback); quiz/roadmap structured output → Gemini 2.5 Flash (`thinkingBudget: 0`) or Haiku 4.5, non-streaming + Response Healing. Fallback chain per tier; never combine structured output + tool calls in one request.

## Questions Asked This Stage

Twenty questions across five rounds (core interaction; behavior/dynamics; surface/states/design tone; failure modes/cost/auth/trust; boundaries/scope-restraint), logged verbatim with answers in `po-answers.md` under "Stage 2 (shape) — Discovery interview". Two answer-driven follow-ups were researched in-stage: TanStack AI generative-UI existence (confirmed — AG-UI tool-call → registered components) and Cloudflare-only sync viability (confirmed — D1 + official DO persistence adapter).

## Answers Captured This Stage

All twenty, appended to `po-answers.md` (2026-07-10T22:10Z). Load-bearing: adaptive rolling roadmap with propose+confirm; chat+chips interview; interactive lessons via trusted widget registry (TanStack AI generative UI); MC + AI-graded free text; soft gate; stream+progressive render; multiple journeys; roadmap sidebar shell; all four progress surfaces; pre-baked sample journey first-run; warm & encouraging design; app-funded quotas; auto-fallback+resume; OAuth-only; **fetch+ground sources in v1 AND rewrite the teach/grill skills as Waypoint's prompts**; FSRS per-concept day one; **Cloudflare-only backend, cost-watched**; real-world tasks deferred.

## Out of Scope

Deferred by the Round-5 restraint pass and standing PO non-goals — logged decisions, not silent drops:

- **Real-world task verification** (AI-evaluated submissions / self-report) — deferred by PO in Round 5; v1 quizzes are MC + short free-text. The quiz data model should not foreclose a future `task` question type.
- **AI-written JS lesson sandbox** ("custom interactives") — widget registry only in v1; a hardened sandbox is a roadmap experiment.
- **Real-time multi-device sync** — v1 is QueryCollections over server functions (local-first *feel*); DO-based live sync is roadmap (adapter exists).
- **PWA packaging** — `vite-plugin-pwa` is broken with Start (issue #4988); Serwist workaround is roadmap, not v1 (intake already leaned this way).
- **BYOK** (user-supplied OpenRouter keys) — roadmap; v1 is app-funded with quotas.
- **Mobile/desktop native shells** — roadmap (intake decision); data layer stays shell-agnostic (Query/Form/DB/Store are RN-compatible; Virtual is not — keep it out of shared code).
- **Social/community, marketplace, collaborative learning** — standing intake non-goals.

## Definition of Done

- All 15 acceptance criteria verified by their stated methods on the web platform.
- The core loop demonstrably runs end-to-end for two independent accounts (the intake success bar).
- Design quality meets 02b-design.md at all three breakpoints (human judgement, AC-14).
- Dependencies pinned exactly; `pnpm audit` clean or triaged; the three external prerequisites (OAuth apps, OpenRouter key, Cloudflare account) wired via documented env vars.
- Documentation Plan artifacts written; TanStack adoption matrix recorded (done — this file).
- Instrumentation (cost/usage/failure signals) live per the Augmentation Plan.

## Verification Strategy

**Target verification environment.** Development and primary verification happen on the PO's Windows 11 machine: Node v22.15.0, pnpm 10.26.2 on PATH; **Playwright browsers already installed globally** (`%LOCALAPPDATA%\ms-playwright`: chromium ×3 versions, firefox, webkit) so `@playwright/test` as a dev dep is near-zero setup; the session's Claude_Browser MCP can drive the dev server interactively for agent-verified checks. The Cloudflare Workers runtime is reachable two ways: locally via `wrangler dev` (workerd) and deployed via the PO's Cloudflare account (`cloudflare-api` MCP available). No Android/iOS targets in v1. Live LLM calls require the PO's OpenRouter key; automated tests default to a mocked TanStack AI adapter, with a small tagged live-smoke suite run on demand.

**Observation model (per headline outcome).** Core-loop ACs are observed by driving the real app in a real browser (Playwright headless/headed on the pre-installed browsers; Claude_Browser for agent-run evidence), with screenshots at 375/768/1280px as the responsive evidence format and network logs as the no-LLM-call/streaming evidence format. FSRS, quota, grading-schema, and authorization behavior are observed via Vitest unit/integration tests (deterministic, clock-controlled). Workers-runtime behavior (AC-15) is observed against `wrangler dev` first, then once against a real deploy.

**Force-scoped environment dependencies** (constraints engineered, not documented):

1. **OAuth apps (Google + GitHub)** — external registrations only the PO can create. *Candidate prerequisite slice*: auth slice includes a documented OAuth-app setup step; **pre-deploy proxy**: automated auth tests run against better-auth test/mock provider flows, and Playwright drives a dev-configured OAuth app; **residual cleared by**: first successful real Google + GitHub sign-in on a deployed environment.
2. **OpenRouter API key** — PO-provided secret. *Pre-deploy proxy*: mocked adapter for all automated tests + fixture-based generation assertions; **residual cleared by**: the tagged live-smoke suite passing with the real key (one interview turn, one lesson stream, one structured quiz call).
3. **Workers runtime streaming** — infrastructure behavior not provable from unit tests. Engineered into scope as **AC-15**, an early platform-proof slice against `wrangler dev`; **residual cleared by**: the same check against the first real deploy.
4. **Live model quality drift** (grading/grounding quality is an outcome metric). *Pre-deploy proxy*: fixture-corpus assertions — a recorded set of quiz answers and source pages with expected grading verdicts/citation markers, run against the mocked adapter and, on demand, live; **residual cleared by**: the live-smoke suite on real models.

**Automated checks** (Vitest + Testing Library; CI on every push): FSRS scheduling and resurfacing selection (clock-controlled); quota enforcement + usage recording; grading and roadmap schema validation; MC equal-length lint; widget-registry rejection of unknown/malformed tool calls; DOMPurify sanitization paths; server-function authorization (cross-user denial); interview state machine; fault-injection resume logic.

**Interactive verification** (Playwright `@playwright/test`, CI-runnable; Claude_Browser for agent-driven evidence): the AC-1→AC-14 flows above — two-account isolation, sample journey with zero-LLM network assertion, scripted interview, progressive-stream observation, quiz end-to-end, accept/decline adaptation, progress surfaces, responsive sweep (5 screens × 3 widths screenshot grid), quota-reached state, recovery UX. Evidence: screenshots, network traces, timestamped DOM-growth logs.

**Human-in-the-loop checks**: design quality against 02b-design.md (AC-14's judgement half); grounding quality spot-checks (AC-4); pedagogy-fidelity review of the rewritten agent prompts against the source skills' operative rules.

## Documentation Plan

- **README update** (create) — type: readme; audience: maintainer/contributor (and the PO's future self); must cover: what Waypoint is, the stack, local dev setup (pnpm, wrangler, env vars for the three prerequisites), how to run tests; must NOT cover: pedagogy theory (points to the explanation doc); location: `README.md`.
- **Explanation** — type: explanation; audience: maintainer; must cover: the architecture (Cloudflare-only local-first, TanStack layer roles, widget-registry trust model, model tiering) and the pedagogy model (how teach/grill rules map to Waypoint mechanics, FSRS concept model); must NOT cover: API-level detail; location: `docs/architecture.md` + `docs/pedagogy.md`.
- **Reference** — type: reference; audience: maintainer; must cover: environment variables/secrets, the widget catalog (each registered widget: name, schema, behavior), quota configuration; must NOT cover: tutorials; location: `docs/reference.md`.
- No tutorial: the app's own sample journey is the user-facing onboarding; a written tutorial would duplicate it.

## Augmentation Plan

`augmentations-needed: [instrument]`

- **instrument** — the quota decision (Round 4) makes usage observability load-bearing: the app's own OpenRouter key funds all users, so silent cost or failure drift is a real dark path. Signals: per-generation token usage + cost (from the OpenRouter `usage` payload) attributed to user + generation type; generation duration; failure and fallback-trigger counts per model; quota-rejection events; interview-turn latency. `plan` folds signal design into the relevant slices (artifact `04b-instrument.md`); `implement` wires it; Cloudflare Workers `observability: enabled` plus a queryable usage table in D1.
- **experiment** — none: greenfield with no existing users; there is nothing to A/B against and no traffic to canary. Rollout risk is handled by the platform-proof slices instead.
- **benchmark** — none: no baseline exists to regress; the perf NFRs (first-content < 5s, turn < 3s) are absolute budgets verified interactively, not comparative benchmarks. Revisit if a hot path emerges (e.g., FSRS bulk rescheduling).
- **profile** — none flagged; `/wf probe` remains available ad-hoc.

## Freshness Research

Two Explore sub-agents ran in parallel with the discovery interview (full reports in stage transcript; load-bearing takeaways below).

- Source: `.scratch/mattpocock-skills` deep read (sub-agent 1).
  Why it matters: the PO put *rewriting* these skills in scope — their operative rules are requirements, not inspiration.
  Takeaway: the contract is precise — mission pushback on vagueness (MISSION-FORMAT), one-question-at-a-time grilling, equal-length MC options, knowledge-then-skill lesson sequencing ("difficulty is the enemy" then "difficulty is the tool"), ADR-style learning records with supersession (`superseded by LR-NNNN`), lessons as beautiful self-contained HTML with citations + a recommended primary source + a follow-up reminder, shared stylesheet across lessons, storage strength over fluency. These map directly into Waypoint's data models (journeys ≈ workspace, learning records ≈ FSRS concept cards + record log) and agent prompts.
- Source: tanstack.com/ai docs + GitHub (Discussion #342, Issue #526/PR #527); openrouter.ai docs.
  Why it matters: TanStack AI beta is the AI backbone; its sharp edges are spec constraints.
  Takeaway: use stable `openRouterText`; tool calling on the OpenRouter adapter regressed in May 2026 (reported fixed June) — keep the OpenAI-adapter-with-OpenRouter-baseURL fallback wired; `structuredOutputStream()` exists but non-streaming structured output + Response Healing is the reliable quiz path; AG-UI compliance gives tool-call → registered-component generative UI (the lesson trust model). Workers compatibility for SSE streaming is inferred, not documented → AC-15.
- Source: TanStack DB 0.6 blog, npm (`@tanstack/cloudflare-durable-objects-db-sqlite-persistence` 0.1.11), electric-sql.com, developers.cloudflare.com.
  Why it matters: the PO's Cloudflare-only constraint had to be architecture-checked.
  Takeaway: viable without third-party services — QueryCollections need no sync engine; D1 as system of record; official DO SQLite persistence adapter + community DO WebSocket collection keep real-time sync on the roadmap. Electric requires Postgres → excluded by constraint.
- Source: better-auth docs/issues (v1.6.23+), CVE-2025-61928; TanStack postmortem CVE-2026-45321; DOMPurify advisories (3.4.7).
  Why it matters: auth and supply-chain choices carry recent, concrete CVEs.
  Takeaway: better-auth ≥ 1.6.23 mounted on `createAPIFileRoute`; avoid the `api-key` plugin below 1.3.26; avoid compromised `@tanstack/react-start` 1.167.68/.71 and router 1.169.5/.8; DOMPurify ≥ 3.4.7 with `SAFE_FOR_XML`/`IN_PLACE` off; exact pins + `pnpm audit` in CI.
- Source: ts-fsrs (v5.4.1, FSRS-6) docs; open-spaced-repetition benchmarks.
  Why it matters: the learner-model decision (Round 5) rests on the engine being a solved problem.
  Takeaway: FSRS is the modern default (Anki switched; 20-30% fewer reviews at equal retention); schema is seven fields per card (due, stability, difficulty, reps, lapses, state, lastReview); `request_retention: 0.85`, `enable_fuzz: true`; compute retrievability, don't store it. Concept-tagging in generation is Waypoint's work; the math is the library's.
- Source: developers.cloudflare.com TanStack Start guide; TanStack Router issues #4988/#6185; workers-sdk #13952.
  Why it matters: Start-on-Workers has active breakage to route around.
  Takeaway: `@cloudflare/vite-plugin` (not the Nitro preset); watch 1.142.x middleware break; `getContext("cloudflare")` empty during SSR → use `cloudflare:workers` env import; per-request client creation; PWA plugin still broken → deferred.
- Source: openrouter.ai model catalog + Response Healing announcement (mid-2026).
  Why it matters: model tiering is a cost NFR.
  Takeaway: Sonnet 4.6 ($3/$15 per M) for lessons; Haiku 4.5 / Gemini 3 Flash for interview turns; Gemini 2.5 Flash (`thinkingBudget: 0`) for structured output; Response Healing fixes malformed JSON on non-streaming calls only; 5.5% credit fee is the only OpenRouter markup.

## Recommended Next Stage

- **Option A (default): `/wf slice waypoint-app`** — this is a large-appetite greenfield build with at least eight distinguishable delivery increments (bootstrap/platform proofs, auth, data model + FSRS, agent-prompt suite, interview, roadmap+lesson generation with widgets, quiz+grading, progress surfaces, sample journey, quotas+instrumentation, source grounding, design system). Slicing is where the sequencing constraints above become shippable increments. The design brief (02b-design.md) is authored; `plan` will resolve the visual-direction gates and author 02c-craft.md per slice.
- **Option B: `/wf plan waypoint-app`** — not viable; nothing about this is a single coherent ≤5-file unit.
- **Option C: `/wf intake waypoint-app`** — not needed; shape confirmed and sharpened the intake rather than contradicting it. The one intake-level change (Neon/Electric out, Cloudflare-only in) is a constraint narrowing recorded here and in po-answers.md, not a brief rewrite.
