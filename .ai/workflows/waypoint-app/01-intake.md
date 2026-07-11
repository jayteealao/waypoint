---
schema: sdlc/v1
type: intake
slug: waypoint-app
status: complete
stage-number: 1
created-at: "2026-07-10T21:00:44Z"
updated-at: "2026-07-10T21:21:57Z"
tags: [greenfield, tanstack, ai-teaching, multi-platform, pwa]
refs:
  index: 00-index.md
  next: 02-shape.md
next-command: wf-shape
next-invocation: "/wf shape waypoint-app"
revision-count: 1
revisions:
  - rev: 1
    at: "2026-07-10T21:21:57Z"
    trigger: answers-returned
    because: "PO answered all seven Batch B questions in chat"
    changed: "Resolved every open question (audience, success criteria, non-goals, AI backend, platform priority, persistence, stack); status awaiting-input → complete; scoped v1 to web-only responsive"
---

# Intake

## The Intake

Waypoint is a greenfield, multi-platform AI teaching app — the product-ization of Matt Pocock's `teach` and grill-style Claude skills, which today live as markdown instructions driving a CLI agent. The repo currently contains nothing but a reference clone of those skills; everything, from `git init` up, is to be built. The user has made one firm technical commitment — the TanStack ecosystem — and explicitly wants a detailed survey of every TanStack library and tool with a use/don't-use recommendation before architecture is settled. A freshness sweep of the ecosystem (18 libraries, verified 2026-07-10) is folded in below — the headline: the stable core (Router, Query, Form, Table, Virtual) covers the web/PWA target well, TanStack DB (beta) + ElectricSQL is a compelling local-first fit for learner progress including React Native, but Router/Start have no native story, so mobile means Expo with TanStack as the data layer, and desktop means a Tauri v2 wrapper.

The product's core loop is well-articulated for an intake: a learner states what they want to learn; the agent asks permission to probe, then explores their current knowledge, the scope of what they want, and any preferred sources; the app renders complete HTML lessons in-app; detailed quizzes follow; and the system maintains a model of the learner — pass rates, progress, and spaced repetition that resurfaces earlier chapters' questions in later quizzes. The pedagogy (mission-grounded learning, zone of proximal development, storage strength over fluency) is inherited from the source skills.

All product-owner questions are answered and intake is complete. The platform-matrix risk resolved itself the right way: **v1 is web-only**, with the design required to be fully responsive across all viewports — mobile and desktop native remain roadmap, not v1 scope. Waypoint is a **multi-user product with accounts/auth** from day one. Success for v1 is the core loop working end-to-end on the web platform. The AI backend is decided: **TanStack AI (beta) with its OpenRouter adapter** (adapter existence verified on tanstack.com), model choice deferred to shape. Persistence is **local-first with sync**, with **Cloudflare as the hosting preference** if it plays well with TanStack (Start deploys to Cloudflare Workers via Nitro; the sync-backend specifics — ElectricSQL needs Postgres, which Cloudflare doesn't host natively — are a shape question). Delivery decisions: dedicated branch (`feat/waypoint-app` off `main`, requiring `git init`), large appetite with slicing, per-slice reviews, **pnpm**, and pre-1.0 TanStack libraries are acceptable so long as dependencies are pinned. Explicit non-goals: social/community features, marketplace, collaborative learning.

## Restated Request

Build **Waypoint**, an AI teaching application, targeting web, native mobile, native desktop, and PWA, on the TanStack library ecosystem. Before/while building, research in detail all available TanStack libraries and tooling and determine which the project can or should use. The app operationalizes Matt Pocock's `teach` + grill (`grill-me`/`grill-with-docs`) skills:

1. User tells the agent what they want to learn.
2. Agent asks whether it may ask further questions; decides if probing is necessary; explores the user's current knowledge, scope of knowledge, learning goals, and preferred sources.
3. App generates full HTML learning output, rendered inside the app.
4. App generates detailed quizzes.
5. App tracks its knowledge of the user: quiz pass rate and similar progress metrics.
6. Quizzes practice spaced repetition — questions from earlier chapters resurface in later quizzes.

The stated idea is a base; scope can grow as needed.

## Intended Outcome

A working multi-platform learning app where an AI tutor plans, teaches, quizzes, and tracks a learner over time — turning the existing CLI-skill workflow into a real product with persistent learner state.

## Primary User / Actor

- **Learner** (primary): states goals, consumes rendered lessons, takes quizzes. **Multi-user product with accounts/auth from day one** — not a single-owner tool.
- **AI tutor agent** (system actor): interviews, generates lessons/quizzes, updates the learner model.

## Known Constraints

- Stack: TanStack ecosystem is a directive, not a suggestion. Research must justify which pieces are used.
- **v1 platform: web only**, but the design must be well-designed for all viewports and perfectly responsive. Mobile native, desktop native, and PWA remain on the roadmap (they informed the research, and shape should avoid architecture that forecloses them).
- **AI backend: TanStack AI (beta) with the OpenRouter adapter**; a good LLM to be chosen (shape decision). Adapter verified to exist (tanstack.com/ai lists OpenRouter alongside OpenAI, Anthropic, Gemini, Ollama, Groq).
- **Persistence: local-first with sync.** Cloudflare preferred for hosting needs if it works well with TanStack. The Cloudflare code-mode MCP (`cloudflare-api`: docs/spec-search/execute) is available in-session for provisioning and docs.
- **Package manager: pnpm.** Pre-1.0 TanStack libraries (RC/beta/alpha) are acceptable — **pin dependencies**.
- Multi-user: accounts and auth are v1 scope (provider TBD in shape).
- Pedagogy contract inherited from source skills: HTML lessons as the unit of teaching; mission-grounded; retrieval practice / spacing / interleaving; learning records driving zone-of-proximal-development.
- Repo is empty (no git, no manifests) — everything bootstraps from zero.
- Design tooling: `pencil` MCP explicitly not wanted. Official TanStack agent skills/tooling (TanStack Intent, `@tanstack/cli` agent-skills install) should be researched and likely adopted for the dev workflow.

## Assumptions

- TypeScript/React (TanStack's center of gravity; consistent with every PO answer).
- Lessons are AI-generated HTML documents rendered in-app (sandboxing/sanitization will be a design concern for shape).
- No OpenRouter MCP exists in this session (checked) — but none is needed at runtime: OpenRouter is consumed via the TanStack AI adapter with an API key. Session MCPs are dev-time tooling only.
- "Local-first with sync" implies a sync backend decision in shape: TanStack DB (beta v0.6) is the obvious client store; the sync layer (ElectricSQL requires Postgres — not natively hosted by Cloudflare; alternatives: Neon/Supabase Postgres behind Hyperdrive, or a Durable-Objects-based sync) is open.

## Product Owner Questions Asked

- Batch A: branch strategy; appetite; review scope.
- Batch B: audience/accounts; v1 success criteria; non-goals; AI backend; native shells + platform priority; persistence/hosting posture; stack fingerprint confirmation (incl. tooling corrections).

## Product Owner Answers

- **Branch strategy:** Dedicated — `git init`, branch `feat/waypoint-app`, base `main`, PR at handoff.
- **Appetite:** Large — multi-day/week; slicing and incremental delivery required.
- **Review scope:** Per slice.
- **Audience:** multi-user with accounts/auth.
- **v1 success:** core loop end-to-end on one platform.
- **Non-goals:** social/community features, marketplace, collaborative learning.
- **AI backend:** built on TanStack AI, starting with the OpenRouter adapter; choose a good LLM. (OpenRouter MCP requested — not available in session; not required at runtime.)
- **Platform:** web only for now; design must be well-designed for all viewports and perfectly responsive.
- **Persistence/hosting:** local-first with sync; Cloudflare for hosting if it works well with TanStack; Cloudflare code-mode MCP available.
- **Stack corrections:** pencil not needed; research official TanStack skills/tooling; use pnpm.
- **Dependency posture:** RC/beta/alpha TanStack libraries fine — pin dependencies.

## Unknowns / Open Questions

*(All intake-blocking questions are resolved; the following are carried forward as shape inputs.)*

1. **LLM model choice on OpenRouter** — which model(s) for lesson generation vs quiz generation vs the interview loop; cost/latency tradeoffs.
2. **Auth provider** — Clerk / better-auth / Cloudflare Access / roll-your-own; must fit TanStack Start and multi-user local-first sync.
3. **Sync backend** — ElectricSQL + external Postgres (Neon/Supabase via Hyperdrive) vs Cloudflare-native (D1/Durable Objects) sync for TanStack DB.
4. **Learner-model depth** — simple pass-rate stats vs a spaced-repetition engine (SM-2 class) with per-concept knowledge tracking.
5. **Lesson HTML sandboxing** — how AI-generated HTML is rendered safely (iframe sandbox, sanitization, CSP) and styled consistently.
6. **Official TanStack agent tooling** — evaluate TanStack Intent + `@tanstack/cli` agent skills for the dev workflow.

## Dependencies / External Factors

- TanStack library maturity/stability (freshness sweep in progress; some libs may be alpha/beta).
- LLM API availability, latency, and cost — lesson/quiz generation is the app's hot path.
- Source skills at `.scratch/mattpocock-skills` (reference material defining the pedagogy contract).
- App-store distribution requirements if native mobile ships (signing, review policies).

## Risks if Misunderstood

- **Roadmap foreclosure:** v1 is web-only (resolved by the PO), but choices that hard-couple to web-DOM everywhere (e.g. Virtual in shared code, Router-coupled data layer) would make the roadmap's Expo/Tauri targets expensive later; shape should keep the data layer (Query/Form/DB/Store) shell-agnostic.
- **"Built upon the skills" ambiguity:** porting the *spirit* of teach/grill vs literally executing the skill markdown via an agent runtime are very different architectures.
- **Rendering AI HTML:** full-fidelity HTML lessons in-app implies sandboxing, styling, and asset decisions that ripple through every platform target.
- **Learner-model scope:** "track our knowledge of the users" could mean simple quiz stats or a full knowledge-graph/spaced-repetition engine (SM-2 class); cost differs by an order of magnitude.

## Success Criteria

- **The core loop works end-to-end on the web platform** (PO-confirmed v1 bar): goal intake → consent-gated probing → rendered HTML lesson → quiz → recorded pass rate → later quiz resurfaces earlier-chapter material.
- Multi-user: accounts/auth functional (a second user gets their own learning state).
- The UI is well-designed and perfectly responsive across all viewports.
- A written TanStack adoption matrix: every current TanStack library/tool evaluated with use / don't-use / later, justified.

## Out of Scope for Now

- Social/community features, marketplace, collaborative learning (explicit PO non-goals).
- Mobile native and desktop native shells (roadmap; architecture should not foreclose them).
- PWA packaging is deferred with the platform decision — web-responsive is the v1 bar (shape may confirm whether a basic manifest/service-worker is cheap enough to include given Router SPA mode).

## Freshness Research

- Source: Background web-research sweep of tanstack.com/libraries, official GitHub repos, and ElectricSQL docs (verified 2026-07-10).
  Why it matters: the stack directive requires knowing every current TanStack library, its stability, and platform support (React Native, SSR/PWA, desktop) before architecture is settled in shape.
  Takeaway: 18 libraries inventoried (full matrix below). Headline findings: **Router/Query/Table/Form/Virtual stable**; **Start is RC** (SSR + server functions, but `vite-plugin-pwa` is currently broken with Start — Router SPA mode is the low-friction PWA path); **TanStack DB is beta v0.6** with SQLite persistence incl. **Expo/React Native** and official ElectricSQL sync — a strong local-first fit for progress/spaced-repetition data; **TanStack AI (beta)** is a unified multi-provider LLM SDK; **Router/Start have no React Native story** — mobile means Expo + Expo Router with TanStack Query/Form/DB/Store as the shared data layer (Virtual does not work on RN); desktop's natural path is **Tauri v2** (stable); scaffolding is `npx @tanstack/cli create` (alpha; `create-tsrouter-app` is deprecated).

### TanStack library inventory (as of 2026-07-10)

| Library | Purpose | Status | Waypoint relevance |
|---------|---------|--------|--------------------|
| Router | Type-safe routing (React/Solid), SPA + SSR modes | Stable v1.x | HIGH — core routing, easiest PWA path (SPA mode + vite-plugin-pwa) |
| Start | Full-stack framework on Router: SSR, streaming, `createServerFn` RPCs | RC | HIGH — SSR web delivery; PWA plugin currently incompatible; web only |
| Query | Async server-state caching | Stable v5.x | HIGH — official RN/Expo support |
| Table | Headless datagrid | Stable v8.x (v9 alpha) | MEDIUM — progress dashboards |
| Form | Headless type-safe forms | Stable (newly) | HIGH — quizzes/onboarding; RN-compatible |
| Virtual | List virtualization | Stable v3.x | MEDIUM — lesson lists; web-DOM only (RN: FlashList) |
| DB | Reactive client-first store, live queries, SQLite persistence | Beta v0.6 (2026-03) | HIGH — local-first progress/lessons; Expo/RN + browser; ElectricSQL sync (`@tanstack/electric-db-collection`, write-path stays your API) |
| AI | Unified AI SDK (Anthropic, OpenAI, …), agentic tool calls | Beta | HIGH — LLM abstraction for tutor agent |
| Store | Framework-agnostic reactive store | Alpha | MEDIUM — light client state; works on RN |
| Pacer | Debounce/throttle/rate-limit/queue | Beta | LOW-MED — AI streaming rate control |
| Ranger | Headless range sliders | Stable | LOW |
| Hotkeys | Type-safe keyboard shortcuts | Alpha | LOW — desktop |
| Config | Lint/build/test/publish tooling | Stable | LOW |
| Devtools | Unified devtools panel | Alpha | MEDIUM — DX |
| CLI (`@tanstack/cli`) | Scaffolding + MCP server + agent skills | Alpha | MEDIUM — project setup (`create-tsrouter-app` deprecated) |
| Intent | Ships agent skills with npm packages | Alpha | LOW — meta-tooling |
| Workflow | Durable execution for agents (resumable runs) | Pre-Alpha | LOW-MED — future lesson-gen pipelines |
| React Charts | Charts | Deprecated | NONE |

### Platform-story facts that will drive shape

- **PWA:** Router SPA mode + `vite-plugin-pwa` works today; Start + PWA needs a custom Serwist/Workbox workaround (open issue `vite-pwa/vite-plugin-pwa#786`).
- **Mobile native:** no Start/Router RN story; pattern = Expo (Expo Router/React Navigation) + Query/Form/DB/Store shared data layer.
- **Desktop native:** Tauri v2 (stable, small binaries, native webview) is the natural wrapper; Electron and experimental Deno Desktop (`deno desktop`, Deno 2.9) also proven with Start.
- **Start deploy targets** via Nitro: Node, Cloudflare Workers, Netlify, Vercel, AWS, Fly.io, Bun, static output. RSC not yet supported.
- Key sources: tanstack.com/libraries · tanstack.com/start docs · electric-sql.com/blog (DB 0.6, 2026-03-25) · tanstack.com/db electric-collection docs · TanStack/router#4988 · github.com/TanStack/create-tsrouter-app · docs.deno.com/runtime/desktop

## Recommended Next Stage

- **Option A (default):** `/wf shape waypoint-app` — significant behavioral ambiguity remains (learner model depth, quiz engine, agent interview UX, sync backend, auth provider, LLM choice) and shape owns the TanStack adoption matrix the PO asked for. The product has a UI layer by construction, and the PO set a high bar ("well designed for all viewpoints, perfectly responsive"), so shape also authors the design brief (`02b-design.md`); plan authors the visual contract (`02c-craft.md`).
- **Option B: Skip to plan** — not viable; this is a large greenfield build, not a ≤3-file change.
