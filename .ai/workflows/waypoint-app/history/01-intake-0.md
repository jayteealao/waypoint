---
schema: sdlc/v1
type: intake
slug: waypoint-app
status: awaiting-input
stage-number: 1
created-at: "2026-07-10T21:00:44Z"
updated-at: "2026-07-10T21:12:00Z"
tags: [greenfield, tanstack, ai-teaching, multi-platform, pwa]
refs:
  index: 00-index.md
  next: 02-shape.md
next-command: wf-intake
next-invocation: "/wf intake waypoint-app"
---

# Intake

## The Intake

Waypoint is a greenfield, multi-platform AI teaching app — the product-ization of Matt Pocock's `teach` and grill-style Claude skills, which today live as markdown instructions driving a CLI agent. The repo currently contains nothing but a reference clone of those skills; everything, from `git init` up, is to be built. The user has made one firm technical commitment — the TanStack ecosystem — and explicitly wants a detailed survey of every TanStack library and tool with a use/don't-use recommendation before architecture is settled. A freshness sweep of the ecosystem (18 libraries, verified 2026-07-10) is folded in below — the headline: the stable core (Router, Query, Form, Table, Virtual) covers the web/PWA target well, TanStack DB (beta) + ElectricSQL is a compelling local-first fit for learner progress including React Native, but Router/Start have no native story, so mobile means Expo with TanStack as the data layer, and desktop means a Tauri v2 wrapper.

The product's core loop is well-articulated for an intake: a learner states what they want to learn; the agent asks permission to probe, then explores their current knowledge, the scope of what they want, and any preferred sources; the app renders complete HTML lessons in-app; detailed quizzes follow; and the system maintains a model of the learner — pass rates, progress, and spaced repetition that resurfaces earlier chapters' questions in later quizzes. The pedagogy (mission-grounded learning, zone of proximal development, storage strength over fluency) is inherited from the source skills.

Batch A decisions are in: dedicated branch strategy (`feat/waypoint-app` off `main`, requiring `git init`), large appetite with slicing, per-slice reviews. The stage is awaiting Batch B answers — audience/success criteria, non-goals, the AI backend choice, native-shell preferences, and stack-fingerprint confirmation. The top risk if misunderstood: "web + mobile native + desktop native + PWA" is a four-target matrix that can sink a greenfield project; slicing must establish a primary target first.

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

- **Learner** (primary): states goals, consumes rendered lessons, takes quizzes.
- **AI tutor agent** (system actor): interviews, generates lessons/quizzes, updates the learner model.
- (Open question: is the initial audience just the product owner, or a multi-user product?)

## Known Constraints

- Stack: TanStack ecosystem is a directive, not a suggestion. Research must justify which pieces are used.
- Platforms: web + mobile native + desktop native + PWA.
- Pedagogy contract inherited from source skills: HTML lessons as the unit of teaching; mission-grounded; retrieval practice / spacing / interleaving; learning records driving zone-of-proximal-development.
- Repo is empty (no git, no manifests) — everything bootstraps from zero.

## Assumptions

- TypeScript/React implied by the TanStack directive (most TanStack libs are framework-agnostic but the ecosystem's center of gravity is React + TS).
- AI generation is LLM-API-backed (provider TBD in Batch B).
- Lessons are AI-generated HTML documents rendered in-app (sandboxing/sanitization will be a design concern for shape).
- "Mobile/desktop native" likely means React Native/Expo and Tauri/Electron class shells rather than per-platform Swift/Kotlin rewrites — to be confirmed.

## Product Owner Questions Asked

- Batch A: branch strategy; appetite; review scope (answered — see below).
- Batch B (pending): audience and v1 success criteria; non-goals; AI provider/backend + budget; native shell preferences and platform priority order; backend/sync/auth posture; stack fingerprint confirmation.

## Product Owner Answers

- **Branch strategy:** Dedicated — `git init`, branch `feat/waypoint-app`, base `main`, PR at handoff.
- **Appetite:** Large — multi-day/week; slicing and incremental delivery required.
- **Review scope:** Per slice.
- (Batch B pending — see Unknowns.)

## Unknowns / Open Questions

1. **Audience & accounts** — personal tool for the owner first, or multi-user from day one (auth, profiles)?
2. **v1 success criteria** — what must demonstrably work to call the first release a success?
3. **Non-goals** — e.g. social/wisdom features, marketplace, collaborative learning, offline authoring?
4. **AI backend** — which provider/model (Claude API?), server-side proxy vs BYO-key, cost ceiling?
5. **Native shells & platform priority** — Expo/React Native for mobile? Tauri vs Electron for desktop? Which platform ships first?
6. **Backend/persistence posture** — local-first with sync? hosted DB? self-host vs Cloudflare/other cloud?
7. **Stack fingerprint confirmation** — greenfield confirmed; any tooling that is missing, wrong, or off-limits?

## Dependencies / External Factors

- TanStack library maturity/stability (freshness sweep in progress; some libs may be alpha/beta).
- LLM API availability, latency, and cost — lesson/quiz generation is the app's hot path.
- Source skills at `.scratch/mattpocock-skills` (reference material defining the pedagogy contract).
- App-store distribution requirements if native mobile ships (signing, review policies).

## Risks if Misunderstood

- **Platform matrix explosion:** treating all four targets as simultaneous v1 requirements would stall a greenfield build; a primary target must be sliced first.
- **"Built upon the skills" ambiguity:** porting the *spirit* of teach/grill vs literally executing the skill markdown via an agent runtime are very different architectures.
- **Rendering AI HTML:** full-fidelity HTML lessons in-app implies sandboxing, styling, and asset decisions that ripple through every platform target.
- **Learner-model scope:** "track our knowledge of the users" could mean simple quiz stats or a full knowledge-graph/spaced-repetition engine (SM-2 class); cost differs by an order of magnitude.

## Success Criteria

- (Pending Batch B — placeholder from the request itself:) the core loop works end-to-end: goal intake → consent-gated probing → rendered HTML lesson → quiz → recorded pass rate → later quiz resurfaces earlier material.
- A written TanStack adoption matrix: every current TanStack library/tool evaluated with use / don't-use / later, justified.

## Out of Scope for Now

- (Pending Batch B; nothing explicitly excluded by the request yet.)

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

- **Option C (current): Blocked — awaiting Batch B answers** → re-run `/wf intake waypoint-app` after answering (or just answer in chat; the resume folds them in).
- **Option A (after answers, default):** `/wf shape waypoint-app` — significant behavioral ambiguity (learner model, quiz engine, agent interview UX, platform priorities) makes shaping mandatory. The stack fingerprint has a UI layer by construction (greenfield web/native app), so shape will also author the design brief (`02b-design.md`); plan authors the visual contract.
- **Option B: Skip to plan** — not viable; this is a large greenfield build, not a ≤3-file change.
