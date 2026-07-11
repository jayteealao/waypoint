# Product Owner Answers — waypoint-app

Cumulative log of product-owner Q&A across all stages.

## 2026-07-10 — Stage 1 (intake) — initial request

**Raw request (verbatim):**
> we are going to build a web app, mobile and desktop native + pwa, using tanstack libraries. research in detail all available tanstack libraries and tooling and which we can or should be using. Our app called waypoint is an ai teaching app built upon the mattpocock teach and grill-me-with-doc skills. it works as follows, user wants to learn something tells the agent what he wants to learn, agent asks if it cann ask further questions, decides if necessary and explores users current knowledge, scope of knowledge and what they want to learn if there is any particular sources they want to learn. we create the learning html output in full rendered into the app, we create detailed quizes, track our knowledge of the users, their quiz pass rate, and other similar progress. in quiz we bring up questions in earlier chapters in later quizes. this is the base idea, we can take this further as needed

**Facts established from request:**
- App name: Waypoint. Domain: AI-driven teaching/learning.
- Targets: web app, mobile native, desktop native, plus PWA.
- Stack directive: TanStack ecosystem; wants detailed research of all TanStack libraries/tooling and a should-use recommendation.
- Pedagogy foundation: Matt Pocock's `teach` and grill-style skills (cloned at `.scratch/mattpocock-skills`): mission-grounded learning, HTML lessons as the unit of teaching, learning records, zone of proximal development, storage strength over fluency (retrieval practice, spacing, interleaving).
- Core loop: user states learning goal → agent optionally asks clarifying questions (consent-gated) → explores current knowledge, scope, desired sources → app renders full HTML learning output → detailed quizzes → tracks user knowledge model, quiz pass rate, progress → spaced repetition: earlier-chapter questions resurface in later quizzes.
- Scope posture: "this is the base idea, we can take this further as needed."

## 2026-07-10T21:00Z — Stage 1 (intake) — Batch A (structured)

- **Branch strategy:** Dedicated — git init the repo, feature branch `feat/waypoint-app` off `main` (defaults pending confirmation), PR at handoff.
- **Appetite:** Large — multi-day/week greenfield build; needs slicing and incremental delivery.
- **Review scope:** Per slice.

## 2026-07-10T21:21Z — Stage 1 (intake) — Batch B (freeform, verbatim)

1. **Audience & accounts:** "multiuser with accounts/auth"
2. **v1 success criteria:** "core loop end to end on one platform"
3. **Non-goals:** "social/community features, marketplace, collaborative learning"
4. **AI backend:** "AI backend built upon Tanstack AI. since it ships adapters, we will start off with the openrouter Adapter and choose a good llm. check the openrouter mcp is available"
   → Checked: no OpenRouter MCP in session. Not required at runtime — OpenRouter is consumed via the TanStack AI adapter + API key. Adapter existence verified on tanstack.com/ai (OpenRouter listed alongside OpenAI, Anthropic, Gemini, Ollama, Groq).
5. **Platform priority:** "web platform only for now, design needs to be well designed for all viewpoints and be perfectly responsive"
6. **Persistence/hosting:** "local-first with sync, cloudflare for hosting needs if works well with tanstack. cloudflare codemode mcp is available"
   → Confirmed: `cloudflare-api` code-mode MCP (docs / spec search / execute) is available in session, scoped to the PO's account.
7. **Stack corrections:** "pencil not needed, research official tanstack skills and tooling, use pnpm. what is tanstack intent"
   → pencil removed from the stack's available-tooling list; pnpm recorded as package manager; TanStack Intent/CLI agent-skills research carried into shape. (Intent explained in chat: alpha meta-tooling that ships agent skills alongside npm packages so coding agents use the libraries correctly — dev-time, not runtime.)
8. **Dependency posture:** "i have no issues with using tanstack libraries that are RC, beta or alpha. just pin dependencies"
9. Invited further questions — remaining decision points (LLM model, auth provider, sync backend, learner-model depth, HTML sandboxing) carried into shape as its opening questions.

## 2026-07-10T22:10Z — Stage 2 (shape) — Discovery interview (5 rounds × 4 questions)

### Round 1 — What the core loop does

1. **Course model:** "upfront roadmap with adaptive rolling updates based on user progress and failures and successes" — full roadmap generated after the interview, then revised as the learner model updates.
2. **Interview UX:** Chat + quick-reply chips (recommended option accepted).
3. **Lesson format:** Interactive lessons — runnable/interactive elements plus in-flow checkpoints, not just readable documents.
4. **Quiz formats:** "MC + short free text, AI-graded, real world tests with verification or similar, not limited to learning programming."

### Round 2 — How it behaves

5. **Progression:** Soft gate — weak quiz results trigger a recommendation + roadmap adaptation, but the learner can always push on.
6. **Adaptivity UX:** Propose + confirm — the agent announces proposed roadmap changes and the learner accepts or declines (consent-gated, matching the source skills' ethos).
7. **Generation timing:** Stream + progressive render — lessons render progressively while later sections generate.
8. **Concurrency:** Multiple journeys per learner, each with its own roadmap, lessons, and learner model.

### Round 3 — What it looks like

9. **App shell:** Roadmap sidebar + content pane; tutor chat as slide-over/dock; sidebar collapses to progress bar + drawer on mobile.
10. **Progress UI (multi-select — ALL selected):** roadmap completion state; per-concept mastery meters; quiz history & pass rates; streaks & review-due counts.
11. **First-run:** Guided sample journey — a pre-baked demo journey so new users see rendered lessons/quizzes before spending LLM tokens.
12. **Design tone:** Warm & encouraging — friendly, rounded, softly colorful; approachable like Duolingo but less gamified.

### Round 4 — What can go wrong

13. **AI cost model:** App key + per-user quotas — Waypoint's OpenRouter key funds usage; per-user daily/monthly quotas and cost tracking are v1 scope.
14. **Lesson trust model:** "Check if tanstack AI has generative UI, can use trusted widget library otherwise."
    → Checked (2026-07-10): TanStack AI is AG-UI compliant; its generative-UI pattern is tool-call → developer-registered typed React components (AI picks components + props; never writes JS). This IS the trusted-widget-library architecture — both branches converge. Decision recorded: TanStack AI generative UI driving a Waypoint-owned widget library; no AI-authored JS executes.
15. **Generation failure:** Auto-fallback + resume — silent retry through a model fallback chain, resuming from last completed section; partial content never lost.
16. **Auth surface:** OAuth-only (Google + GitHub) — no passwords, no reset flows.

### Round 5 — Boundaries & scope restraint

17. **Sources scope:** "Fetch + ground v1 + rewriting both skills to work appropriately for our goals, is within scope of our work" — v1 fetches user-provided URLs and grounds lesson generation in their content (RAG-lite), AND adapting/rewriting the teach + grill skill prompts into Waypoint's agent prompts is explicitly in scope.
18. **Learner-model depth:** FSRS per-concept from day one (ts-fsrs; concept-tagging pipeline in lesson/quiz generation).
19. **Sync backend:** "Investigate all tanstack libraries, why is 'Tanstack Store + DB' not the option here. i dont want neon postgres as a dependency. thats another service. only allowed backend is cloudflare options. keep an eye on costs."
    → Constraint recorded: **Cloudflare-only backend** — no Neon/Supabase/Electric Cloud/third-party DB services. Cost-consciousness is a standing requirement.
    → Store-vs-DB question answered in 02-shape.md (§ Dependencies): Store/DB are client-side libraries; the open question was the server side. Resolution: TanStack DB QueryCollections on the client + Cloudflare D1 as system of record via Start server functions; Durable Objects (official `@tanstack/cloudflare-durable-objects-db-sqlite-persistence` adapter exists) as the later real-time sync path. ElectricSQL is off the table (Postgres-only).
20. **Real-world tests:** Deferred to roadmap — v1 quizzes are MC + short free-text AI-graded only (revises the Round-1 answer's real-world-tests portion into an explicit deferral).

## 2026-07-10T22:43Z — Stage 3 (slice) — Decomposition strategy (structured, 1 round × 4)

1. **Post-proofs ordering:** Visible milestone next (recommended option accepted) — after bootstrap + platform proofs, build design system + app shell + pre-baked sample journey before the generation machinery. Rationale offered: demoable warm-designed artifact early; sample journey exercises the widget registry with zero LLM spend.
2. **Granularity:** Medium (~9–12 slices) — each slice one coherent subsystem; fewer review cycles (reviews are per-slice), each slice independently demoable.
3. **Walking skeleton:** No — subsystem-by-subsystem. Each slice builds its part to full shipped quality in dependency order; the loop first closes end-to-end when generation slices land. PO accepted the late-integration tradeoff over skeleton rework.
4. **Late-slice candidates (source grounding / adaptation / quotas / multiple journeys):** "[No preference]" — sequencing of late-landing features delegated to the slice stage.

## 2026-07-10T23:55Z — Post-slice — Adoption-matrix revision (freeform, verbatim)

**PO (on the shape matrix's DON'T verdicts):** "the only one i agree with is react Charts and maybe workflows, the rest should be likely."
→ Recorded: **Config, Ranger, and Hotkeys move from DON'T to LATER ("likely")** in the TanStack adoption matrix. **React Charts stays DON'T** (deprecated). **Workflow stays DON'T for v1, flagged watch** (pre-alpha; candidate for future lesson-gen pipelines). No v1 slice is affected — none of the three reclassified libraries appears in any slice scope; this changes the roadmap posture only. The 02-shape.md matrix formally picks this up at its next revision; this log entry is the authoritative record until then.

**Related fact update (web-verified 2026-07-10):** since June 18, 2026, PlanetScale Postgres/MySQL can be provisioned from the Cloudflare dashboard and billed to the Cloudflare account (via Hyperdrive). This softens the shape's "Cloudflare doesn't host Postgres" fact — Cloudflare-billed but PlanetScale-hosted. PO has not ruled on whether this satisfies the "Cloudflare options only" constraint; v1 architecture (D1 + QueryCollections, DO sync as roadmap) is unchanged.
