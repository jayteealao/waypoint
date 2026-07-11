---
schema: sdlc/v1
type: plan-index
slug: waypoint-app
status: complete
stage-number: 4
created-at: "2026-07-11T00:13:07Z"
updated-at: "2026-07-11T09:17:42Z"
planning-mode: single
slices-planned: 2
slices-total: 12
implementation-order: [foundation, platform-proofs, accounts-data-layer, design-system-shell, lesson-renderer, sample-journey, ai-gateway, tutor-interview, roadmap-lesson-generation, quiz-fsrs, adaptation-progress, source-grounding]
conflicts-found: 0
tags: [greenfield, tanstack, ai-teaching]
refs:
  index: 00-index.md
  slice-index: 03-slice.md
next-command: wf-implement
next-invocation: "/wf implement waypoint-app platform-proofs"
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

### Plans not yet written (10 remaining slices)
Plans for slices 3–12 will be authored before or during their respective implement stages.
Each will follow the same sub-agent research + autonomous-override pattern.

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

None — only the foundation slice is planned at this stage. Cross-slice conflict analysis
will be performed as additional slice plans are authored.

## Freshness Research

Shape's seven-source freshness sweep (2026-07-10) remains current for the foundation slice.
No new dependency research was required — the foundation slice installs only confirmed-current
toolchain packages (TanStack Start RC, @cloudflare/vite-plugin, Vitest, Playwright).

Key facts carried forward from shape:
- Compromised versions: `@tanstack/react-start` 1.167.68/.71; router 1.169.5/.8; 1.142.x middleware.
- Correct adapter: `@cloudflare/vite-plugin` (not Nitro preset).
- CI audit: `pnpm audit --audit-level=high`.

## Recommended Next Stage

- **Option A (default): implement foundation** — Plan is complete, all ACs resolved. Compact
  before implementing: state lives in the artifact files and the hook re-reads them after compaction.
- **Option B: plan platform-proofs** — Author the next slice's plan before coding if you prefer
  all plans up front.
- **Option C: revisit slice** — Not indicated; no slice-boundary issues found.
