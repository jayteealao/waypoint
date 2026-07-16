---
schema: sdlc/v1
type: index
slug: waypoint-app
title: "Waypoint — AI teaching app (web + mobile + desktop native + PWA) on TanStack"
status: active
current-stage: review
stage-number: 7
created-at: "2026-07-10T21:00:44Z"
updated-at: "2026-07-16T17:43:28Z"
selected-slice: "fix-continue-button"
branch-strategy: dedicated
branch: "feat/waypoint-app"
base-branch: "main"
review-scope: per-slice
pr-url: ""
pr-number: 0
open-questions: []
intent-risks:
  - id: RIM-E1
    risk: "tanstack-data-layer-unification narrows the PO's chosen 'TanStack DB everywhere' back to loaders / a single entity under pre-1.0 type friction and Cloudflare SSR pain (already happened once — AC-13 reverted off the DB collection)."
    severity: high
    status: adjudicated
    adjudicated-by: "02-shape-tanstack-data-layer-unification.md"
    decision: "Resolved by the scoped design pass: the PO ratified the FULL entity set (all 9, enumerated in the migration plan), so 'everywhere' cannot silently shrink to 'journeys only' — the narrowing risk is closed. usage_events flagged for keep-server-only confirm; the ratification inverted the risk toward over-reach, tracked as RIM-E7."
    po-ratified: true
  - id: RIM-E2
    risk: "model-refresh silently degrades the PO's benchmarked tier selection to a weaker/costlier fallback when a days-old primary (grok-4.5, gpt-5.6-luna) is delisted — the exact silent-fallback failure that created the slice."
    severity: high
    status: adjudicated
    adjudicated-by: "02-shape.md#extension-intent-risks-rim-ledger"
    decision: "Model selection is PO-owned (round-1 answers); a persistent model.fallback_triggered is a dark path 04b-instrument must alarm as a config incident, not silent degradation; fallbacks stay pinned to different providers than primaries."
    po-ratified: true
  - id: RIM-E3
    risk: "The round-2 TanStack fix slices repeat the assume-missing anti-pattern — written from recalled API shapes rather than installed source, they reintroduce the same class of defect the discover audit found."
    severity: medium
    status: adjudicated
    adjudicated-by: "02-shape.md#extension-intent-risks-rim-ledger"
    decision: "Every extension-round-2 slice's plan MUST read installed node_modules source via study-sources before choosing a fix mechanism; per-slice risk notes elevated to a standing wave constraint. Enforces PO round-2 intent; alters no PO directive."
    po-ratified: not-required
  - id: RIM-E4
    risk: "/health presence-only secret check gives a false-green deploy gate — a wrong secret value passes, or the hard-coded asserted list drifts behind the app's real required-secret set."
    severity: medium
    status: adjudicated
    adjudicated-by: "02-shape.md#extension-intent-risks-rim-ledger"
    decision: "Presence-only + opaque body are PO-ratified (round-3 answers 1-2) with staging→production promotion as the value-correctness control; a shared REQUIRED_SECRETS constant reused by boot validation is MANDATED (not merely suggested) to stop list drift. Live validity probe refused on purpose (cost/latency/flakiness on a per-deploy gate)."
    po-ratified: true
  - id: RIM-E5
    risk: "The F9 streaming-path consolidation regresses token-by-token SSE lesson UX or the zero-outbound-when-quota-exhausted invariant, under the banner of a DRY refactor."
    severity: medium
    status: adjudicated
    adjudicated-by: "02-shape.md#extension-intent-risks-rim-ledger"
    decision: "F9 is behavior-preserving; verify MUST prove both consumption modes (buffered drain unchanged; SSE still token-by-token) AND the pre-flight quota invariant with explicit before/after evidence. The shared helper parameterizes streaming vs. buffered; it does not unify them."
    po-ratified: not-required
  - id: RIM-E6
    risk: "tanstack-router-typed-context breaks SSR/hydration or auth-gated navigation on the root route (a missing initial context is a common createRootRouteWithContext setup error), affecting every navigation."
    severity: low
    status: adjudicated
    adjudicated-by: "02-shape.md#extension-intent-risks-rim-ledger"
    decision: "Typing/DI-only change (auth mechanism unchanged); verify hydration + the _authenticated auth redirect against installed router-core source before commit; land before tanstack-data-layer-unification so the data layer extends an already-typed context."
    po-ratified: not-required
  - id: RIM-E7
    risk: "The all-9, localStorage-primary local-first big-bang (PO-ratified over the narrower option) destabilizes SSR/hydration on Cloudflare or the read-consistency model — the inverse of RIM-E1's narrowing risk."
    severity: high
    status: adjudicated
    adjudicated-by: "02-shape-tanstack-data-layer-unification.md#chosen-architecture"
    decision: "Contained by design: collections are client-only so SSR renders from request-scoped D1 loaders (no server-side collection singleton → no cross-user isolate bleed) and the loader's D1 result seeds the collection (no hydration mismatch, no first-paint-from-empty-store); per-entity migration sequencing (D8) with per-entity SSR + no-regress gates (AC-DLU6/AC-DLU9); LWW-by-updated_at is the named consistency mechanism. Two dispositions (SSR-seed reconciliation; usage_events server-only) flagged for PO confirm at plan."
    po-ratified: true
runtime-evidence-deferrals:
  - ac: "AC-F4 — CI gates run on push (lint, typecheck, tests, pnpm audit)"
    slice: foundation
    reason: "No GitHub remote / no PR to main exists; the CI workflow only triggers on PRs targeting main, and yolo never opens PRs. Plan pre-authorized constraint-resolution: proxy+deferral. Local proxies (typecheck, lint, Vitest 1/1, Playwright e2e 1/1, pnpm audit clean, exact-pin check) all pass; .github/workflows/ci.yml structurally complete with all required gates."
    cleared-by: "first PR targeting main (at handoff) triggering a green GitHub Actions run"
    recorded-at: "2026-07-11T08:30:00Z"
  - ac: "AC-PP2b — live OpenRouter tool-call smoke"
    slice: platform-proofs
    status: cleared
    reason: "OPENROUTER_API_KEY now present in .dev.vars. Tagged live smoke run: tests/smoke/ai-tool-call.test.ts 9/9 pass against real OpenRouter (interview-tier tool-call round trip, all 3 gateway tiers, single-question interview). NOTE: clearing surfaced two real bugs the mocked proxy had masked — see 06-verify-live-ai.md."
    cleared-by: "tagged live-smoke run with OPENROUTER_API_KEY present — passed 2026-07-12"
    recorded-at: "2026-07-11T10:30:00Z"
    cleared-at: "2026-07-12T00:00:00Z"
  - ac: "AC-ADL1 + AC-ADL5 — seeded-session proxy tests (session persistence, cross-account isolation, identity display, sign-out)"
    slice: accounts-data-layer
    status: cleared
    reason: "BETTER_AUTH_SECRET not set in .dev.vars; seeded-session Playwright tests require this secret for HMAC-SHA-256 cookie signing. Ladder climbed: (rung 1) 2 always-run Playwright tests pass (sign-in UI, account redirect); (rung 2) BETTER_AUTH_SECRET env var checked — absent; (rung 3) seeded-session proxy requires the secret — residual: 3 proxy tests skip by design. Real OAuth flow is the original pre-registered plan residual. Plan pre-authorized constraint-resolution: proxy+deferral."
    cleared-by: "re-running E2E suite with BETTER_AUTH_SECRET set in .dev.vars, OR first deployed Google+GitHub sign-in on deployed environment"
    recorded-at: "2026-07-11T13:04:46Z"
    cleared-at: "2026-07-14T20:54:18Z"
    cleared-note: "CLEARED by the e2e-session-cookie-prefix fix + present BETTER_AUTH_SECRET (len 64 in .dev.vars). auth-flow.spec.ts now injects the seeded session under __Secure-better-auth.session_token / secure:true (the app's real cookie name for the secure-context base URL); all 5 auth-flow tests pass with no /sign-in redirect, including the two-account cross-user isolation test (distinct identities) and sign-out. Seeded-session automated coverage satisfied (the OR condition met). The real-OAuth-on-deployed residual remains its own separate track."
  - ac: "AC-DSS1 + AC-DSS3 + AC-DSS4 + AC-DSS5 — seeded-session design system Playwright tests (responsive layout, empty state, keyboard nav, reduced-motion drawer)"
    slice: design-system-shell
    status: cleared
    reason: "BETTER_AUTH_SECRET not set in .dev.vars; seeded-session Playwright tests require HMAC-SHA-256 cookie signing. AC-DSS5 reclassified from auth-free to auth-required (DrawerNav lives inside AppShell). Proxy evidence: AC-DSS2 contrast smoke test (13 WCAG AA assertions) passes; typecheck clean; pnpm test 29/30 passing. Plan pre-authorized constraint-resolution: accepted into existing AC-ADL1+AC-ADL5 deferral entry."
    cleared-by: "re-running E2E suite with BETTER_AUTH_SECRET set in .dev.vars"
    recorded-at: "2026-07-11T14:08:04Z"
    cleared-at: "2026-07-14T20:54:18Z"
    cleared-note: "CLEARED by the e2e-session-cookie-prefix fix + present BETTER_AUTH_SECRET. design-system.spec.ts makeAuthContext now injects __Secure-better-auth.session_token / secure:true; all 7 authenticated design-system tests pass (responsive 375/768/1280, empty state, keyboard nav, reduced-motion drawer), plus the AC-DSS2 proxy. Two verification seams built this slice made the cluster observable: (1) an addInitScript localStorage guard (wp:sample-visited='true') on the AC-DSS3 empty-state test so the dashboard's zero-journey first-login redirect to /sample does not fire; (2) a React-hydration gate (wait for the client-only 'Open TanStack Devtools' button) before the AC-DSS5 hamburger click — the cookie fix unmasked a latent hydration-timing no-op that was previously hidden behind the /sign-in redirect. Full 12/12 target-spec run green."
  - ac: "AC-LR1 + AC-LR2 + AC-LR3 — seeded-session lesson renderer Playwright tests (reading experience at 3 breakpoints, widget interaction, progressive rendering)"
    slice: lesson-renderer
    reason: "BETTER_AUTH_SECRET not set in .dev.vars; seeded-session Playwright tests for /_authenticated/lesson/fixture require HMAC-SHA-256 cookie signing (same wall as AC-ADL1/5 and AC-DSS1/3/4/5). AC-LR4 (security/trust-model) fully covered by 19 adversarial Vitest unit tests (all passing). Plan pre-authorized constraint-resolution: accepted into existing AC-ADL1+AC-ADL5 deferral entry."
    cleared-by: "re-running E2E suite with BETTER_AUTH_SECRET set in .dev.vars"
    recorded-at: "2026-07-11T19:15:37Z"
    cleared-at: "2026-07-11T19:49:36Z"
    cleared-note: "CLEARED — verify run confirmed BETTER_AUTH_SECRET present in .dev.vars; all 6 Playwright tests pass after cookie prefix fix (__Secure- required for HTTPS base URL) and React 19 hydration fix; commit 5b6cde1"
  - ac: "AC-SJ1 + AC-SJ2 + AC-SJ3 + AC-SJ4 — seeded-session sample journey Playwright tests (first-login redirect, lesson rendering, quiz walkthrough, returning-user scenario)"
    slice: sample-journey
    reason: "BETTER_AUTH_SECRET not set in .dev.vars; seeded-session Playwright tests for /sample/* require HMAC-SHA-256 cookie signing (same wall as AC-ADL1/5, AC-DSS1/3/4/5, AC-LR1/2/3). Proxy evidence: 11 Vitest unit tests pass (equal-length-options lint, quiz scoring logic, attempt format validation). Plan pre-authorized constraint-resolution: accepted into existing AC-ADL1+AC-ADL5 deferral entry."
    cleared-by: "re-running E2E suite with BETTER_AUTH_SECRET set in .dev.vars"
    recorded-at: "2026-07-11T20:51:58Z"
    cleared-at: "2026-07-11T21:30:00Z"
    cleared-note: "CLEARED — verify run confirmed BETTER_AUTH_SECRET present in .dev.vars; all 5 sample-journey Playwright tests pass after 3 test-infra fixes (React effects timing guard, strict-mode selector scope, serial mode for beforeAll seeding); commit 96743b5"
  - ac: "AC-15 residual — first Cloudflare Workers deploy with live SSE lesson generation"
    slice: roadmap-lesson-generation
    reason: "OPENROUTER_API_KEY now present in .dev.vars (the credential half of this blocker is resolved; live lesson-tier generation is proven by the gateway smoke). The remaining blocker is the DEPLOY itself: this AC requires the first Cloudflare Workers deploy driving live SSE end-to-end. wrangler dev on workerd already proves the SSE transport (platform-proofs, commit 7da0ab7)."
    cleared-by: null
    cleared-note: "pending DEPLOY — key now present; clearing event: first wrangler deploy + one live lesson generation"
    recorded-at: "2026-07-12T03:11:02Z"
  - ac: "AC-SG-citation + AC-SG-fetch-failure — seeded-session source-grounding Playwright tests"
    slice: source-grounding
    reason: "BETTER_AUTH_SECRET confirmed present in .dev.vars (cleared with AC-LR1-3). Both Playwright tests pass: citation rendering (fixture lesson cit-mdn section visible) and unfetchable URL fetch-failure conversational path. No active deferral — this entry is informational."
    cleared-by: "already cleared — BETTER_AUTH_SECRET present; both tests pass"
    recorded-at: "2026-07-12T07:04:18Z"
    cleared-at: "2026-07-12T07:04:18Z"
    cleared-note: "CLEARED — BETTER_AUTH_SECRET present in .dev.vars; both source-grounding E2E tests pass"
  - ac: "AC-4 residual — live-model grounding quality spot-check (OPENROUTER_API_KEY)"
    slice: source-grounding
    status: cleared
    reason: "OPENROUTER_API_KEY now present. Live lesson-tier smoke feeds a distinctive source marker (ZBQ-Widget-9137) and asserts the generated prose reflects it — passes against real anthropic/claude-haiku-4.5. Fixture-marker tests already proved the data flow; this proves live-model reflection."
    cleared-by: "tagged live-model smoke — tests/smoke/ai-tool-call.test.ts grounding case, passed 2026-07-12"
    recorded-at: "2026-07-12T07:04:18Z"
    cleared-at: "2026-07-12T00:00:00Z"
  - ac: "AC-7 residual — live-graded quiz smoke (OPENROUTER_API_KEY)"
    slice: quiz-fsrs
    status: cleared
    reason: "OPENROUTER_API_KEY now present. Live grading smoke replicates gradeAnswer's core (grading prompt -> quiz-tier structured call -> parse -> validateGrading) against real OpenRouter; a correct free-response answer grades verdict != incorrect, score >= 1. Passes."
    repeat-of: "AC-PP2b (platform-proofs)"
    cleared-by: "tagged live-smoke run — tests/smoke/ai-tool-call.test.ts live-graded case, passed 2026-07-12"
    recorded-at: "2026-07-12T05:45:00Z"
    cleared-at: "2026-07-12T00:00:00Z"
  - ac: "AC-9 + AC-10 + AC-13 + AC-14 — seeded-session adaptation-progress Playwright tests"
    slice: adaptation-progress
    reason: "BETTER_AUTH_SECRET not set in .dev.vars; seeded-session Playwright tests for /_authenticated/journey/$journeyId/progress and the quiz completion overlay require HMAC-SHA-256 cookie signing (same wall as AC-ADL1/5, AC-DSS1/3/4/5, AC-LR1/2/3, AC-SJ1–4, AC-7). Proxy evidence: 20 Vitest progress-metrics unit tests pass (computeStreak, computePassRate, groupMasteryByWaypoint — all edge cases including UTC midnight boundary); typecheck clean. Plan pre-authorized constraint-resolution: accepted into existing AC-ADL1+AC-ADL5 deferral entry."
    cleared-by: "re-running E2E suite with BETTER_AUTH_SECRET set in .dev.vars"
    recorded-at: "2026-07-12T05:44:00Z"
    cleared-at: "2026-07-12T07:00:00Z"
    cleared-note: "CLEARED — verify run confirmed BETTER_AUTH_SECRET present in .dev.vars; all 6 Playwright tests pass after 1 fix round (3 test-infra fixes: React 19 hydration guard for adapt-accept + adapt-decline, AC-13 rewritten to use progress route loaders instead of TanStack DB collection); commit 93a2f94"
  - ac: "AC-GLR3 residual — literal '--no-verify'-free whole-gate commit clause"
    slice: precommit-gitleaks-resilience
    reason: "This slice's owned deliverable — the secret-scan pre-commit gate no longer blocking — is fully evidenced live (real `node scripts/secret-scan.mjs` → exit 0 + skip warning; real `lefthook run pre-commit --command secret-scan --force` → ✔️ secret-scan exit 0, no exit 127). Rungs climbed and probe run THIS round: full `pnpm exec lefthook run pre-commit --force` → secret-scan ✔️ + lint ✔️ but format-check 🥊 exit 1 over ~145 pre-existing unformatted files. Residual: a whole-gate commit without --no-verify is walled SOLELY by the `format-check` step, which is the sibling slice `repo-format-baseline`'s scope (Scope-Out here — reformatting 145 files would breach this slice's boundary). Not an environment wall and not a code defect of this slice."
    status: cleared
    cleared-by: "sibling slice `repo-format-baseline` verify run 1 — commit 4274839 (oxfmt baseline) landed and a verify-stage probe commit (615460f) flowed through the full pre-commit gate (secret-scan ✔️ lint ✔️ format-check ✔️ commitlint ✔️) with NO --no-verify, then was reverted; format-check now exits 0 over 155 files"
    needed-by: precommit-gitleaks-resilience
    deferred-at: "2026-07-14T19:29:56Z"
    cleared-at: "2026-07-14T20:18:40Z"
tags: [greenfield, tanstack, ai-teaching, multi-platform, pwa]
stack:
  detected-at: "2026-07-10T21:00:44Z"
  platforms: [web]
  languages: [typescript]
  ui: [react]
  build: [vite, cloudflare-workers]
  package-managers: [pnpm]
  testing: [vitest, playwright]
  observability: [cloudflare-logpush]
  integrations: []
  available-skills:
    - {name: frontend-design, hint: "Distinctive production-grade frontend interfaces"}
    - {name: dataviz, hint: "Charts/dashboards design system (progress tracking UI)"}
    - {name: deep-research, hint: "Multi-source fact-checked research harness"}
    - {name: anthropic-skills:tech-research-enforcer, hint: "Forces current-docs research for library/framework choices"}
    - {name: claude-api, hint: "Claude API / Anthropic SDK reference (AI tutor backend)"}
    - {name: verify, hint: "End-to-end behavior verification of changes"}
    - {name: run, hint: "Launch and drive the app to confirm changes"}
    - {name: code-review, hint: "Diff review for correctness and quality"}
  tanstack-intent:
    installed-at: "2026-07-11"
    guidance-file: "none — AGENTS.md removed; skills are installed natively in .claude/skills/ instead"
    list-command: "pnpm dlx @tanstack/intent@latest list"
    load-command: "pnpm dlx @tanstack/intent@latest load <package>#<skill>"
    note: "Skills ship inside node_modules and version with the pinned packages. All 31 are copied into .claude/skills/ (flattened names, e.g. start-core-server-functions) for automatic Claude Code triggering. Re-sync after bumping @tanstack/* deps: node scripts/sync-tanstack-skills.mjs"
    packages:
      - {name: "@tanstack/router-core", skills: 10, hint: "router-core + sub-skills: navigation, data-loading, search-params, path-params, auth-and-guards, code-splitting, ssr, type-safety, not-found-and-errors"}
      - {name: "@tanstack/start-client-core", skills: 7, hint: "start-core + sub-skills: server-functions, server-routes, middleware, execution-model, deployment, auth-server-primitives"}
      - {name: "@tanstack/react-start", skills: 3, hint: "react-start (createStart/StartClient/useServerFn), react-start/server-components, lifecycle/migrate-from-nextjs"}
      - {name: "@tanstack/devtools", skills: 4, hint: "devtools-app-setup, devtools-plugin-panel, devtools-production, devtools-marketplace"}
      - {name: "@tanstack/devtools-event-client", skills: 3, hint: "devtools-event-client, devtools-bidirectional, devtools-instrumentation"}
      - {name: "@tanstack/devtools-vite", skills: 1, hint: "devtools-vite-plugin (must be first Vite plugin; console piping, source inspection, removeDevtoolsOnBuild)"}
      - {name: "@tanstack/router-plugin", skills: 1, hint: "router-plugin (file-based route generation config)"}
      - {name: "@tanstack/start-server-core", skills: 1, hint: "start-server-core (server entry/runtime)"}
      - {name: "@tanstack/virtual-file-routes", skills: 1, hint: "virtual-file-routes (programmatic route tree definition)"}
  available-mcp:
    - {name: Claude_Browser, hint: "In-app browser for driving/verifying the web app"}
    - {name: web-search-prime / web-reader, hint: "Web search + page reading for research"}
    - {name: zread, hint: "Read external GitHub repo structure/files"}
    - {name: cloudflare-api, hint: "Cloudflare code-mode MCP (docs/spec/execute) — PO-confirmed for hosting needs"}
  user-confirmed: true
next-command: wf-handoff
next-invocation: "/wf handoff waypoint-app"
augmentations:
  - type: instrument
    artifact: 04b-instrument.md
    status: complete
    created-at: "2026-07-11T00:13:07Z"
compressed-slices:
  - slug: fix-continue-button
    slice-type: fix
    created-at: "2026-07-15T21:23:44Z"
workflow-files:
  - 00-index.md
  - 00-sync.md
  - 01-intake.md
  - po-answers.md
  - 02-shape.md
  - 02-shape-tanstack-data-layer-unification.md
  - 02b-design.md
  - 03-slice.md
  - 03-slice-foundation.md
  - 03-slice-platform-proofs.md
  - 03-slice-accounts-data-layer.md
  - 03-slice-design-system-shell.md
  - 03-slice-lesson-renderer.md
  - 03-slice-sample-journey.md
  - 03-slice-ai-gateway.md
  - 03-slice-tutor-interview.md
  - 03-slice-roadmap-lesson-generation.md
  - 03-slice-quiz-fsrs.md
  - 03-slice-adaptation-progress.md
  - 03-slice-source-grounding.md
  - 03-slice-model-refresh.md
  - 03-slice-tanstack-start-request-access.md
  - 03-slice-tanstack-ai-gateway-hygiene.md
  - 03-slice-tanstack-router-typed-context.md
  - 03-slice-tanstack-data-layer-unification.md
  - 03-slice-health-endpoint.md
  - 03-slice-cloudflare-ai-gateway.md
  - 03-slice-fix-continue-button.md
  - 05-implement-fix-continue-button.md
  - 06-verify-fix-continue-button.md
  - 07-review-fix-continue-button.md
  - 07-review-fix-continue-button-correctness.md
  - 07-review-fix-continue-button-security.md
  - 07-review-fix-continue-button-code-simplification.md
  - 07-review-fix-continue-button-frontend-accessibility.md
  - 07-review-fix-continue-button-intent-fidelity.md
  - src/components/dashboard/JourneyCard.test.ts
  - skip-slice-cloudflare-ai-gateway.md
  - 04-plan.md
  - 04-plan-health-endpoint.md
  - 04-plan-health-endpoint.yaml
  - 04-plan-health-endpoint.html.fragment
  - 04-plan-foundation.md
  - 04-plan-foundation.yaml
  - 04-plan-foundation.html.fragment
  - 04-plan-platform-proofs.md
  - 04-plan-platform-proofs.yaml
  - 04-plan-platform-proofs.html.fragment
  - 04-plan-accounts-data-layer.md
  - 04-plan-accounts-data-layer.yaml
  - 04-plan-accounts-data-layer.html.fragment
  - 02c-craft.md
  - 02c-craft.yaml
  - 02c-craft.html.fragment
  - 04-plan-design-system-shell.md
  - 04-plan-design-system-shell.yaml
  - 04-plan-design-system-shell.html.fragment
  - 04b-instrument.md
  - 04b-instrument.yaml
  - 05-implement.md
  - 05-implement-foundation.md
  - 05-implement-platform-proofs.md
  - 05-implement-accounts-data-layer.md
  - 05-implement-design-system-shell.md
  - 05-implement-health-endpoint.md
  - 06-verify-health-endpoint.md
  - 06-verify-platform-proofs.md
  - 06-verify.md
  - 06-verify-foundation.md
  - 06-verify-accounts-data-layer.md
  - 06-verify-design-system-shell.md
  - 07-review-foundation-correctness.md
  - 07-review-foundation-correctness.yaml
  - 07-review-foundation-correctness.html.fragment
  - 07-review-foundation-security.md
  - 07-review-foundation-security.yaml
  - 07-review-foundation-security.html.fragment
  - 07-review-foundation-code-simplification.md
  - 07-review-foundation-code-simplification.yaml
  - 07-review-foundation-code-simplification.html.fragment
  - 07-review-foundation-testing.md
  - 07-review-foundation-testing.yaml
  - 07-review-foundation-testing.html.fragment
  - 07-review-foundation-supply-chain.md
  - 07-review-foundation-supply-chain.yaml
  - 07-review-foundation-supply-chain.html.fragment
  - 07-review-foundation-ci.md
  - 07-review-foundation-ci.yaml
  - 07-review-foundation-ci.html.fragment
  - 07-review-foundation-maintainability.md
  - 07-review-foundation-maintainability.yaml
  - 07-review-foundation-maintainability.html.fragment
  - 07-review-foundation-reliability.md
  - 07-review-foundation-reliability.yaml
  - 07-review-foundation-reliability.html.fragment
  - 07-review-foundation-docs.md
  - 07-review-foundation-docs.yaml
  - 07-review-foundation-docs.html.fragment
  - 07-review-foundation.md
  - 07-review-foundation.yaml
  - 07-review-foundation.html.fragment
  - 07-review-platform-proofs-correctness.md
  - 07-review-platform-proofs-correctness.yaml
  - 07-review-platform-proofs-correctness.html.fragment
  - 07-review-platform-proofs-security.md
  - 07-review-platform-proofs-security.yaml
  - 07-review-platform-proofs-code-simplification.md
  - 07-review-platform-proofs-code-simplification.yaml
  - 07-review-platform-proofs-code-simplification.html.fragment
  - 07-review-platform-proofs-testing.md
  - 07-review-platform-proofs-testing.yaml
  - 07-review-platform-proofs-maintainability.md
  - 07-review-platform-proofs-maintainability.yaml
  - 07-review-platform-proofs-reliability.md
  - 07-review-platform-proofs-reliability.yaml
  - 07-review-platform-proofs-backend-concurrency.md
  - 07-review-platform-proofs-backend-concurrency.yaml
  - 07-review-platform-proofs-supply-chain.md
  - 07-review-platform-proofs-supply-chain.yaml
  - 07-review-platform-proofs-privacy.md
  - 07-review-platform-proofs-privacy.yaml
  - 07-review-platform-proofs-api-contracts.md
  - 07-review-platform-proofs-api-contracts.yaml
  - 07-review-platform-proofs-infra.md
  - 07-review-platform-proofs-infra.yaml
  - 07-review-platform-proofs-architecture.md
  - 07-review-platform-proofs-architecture.yaml
  - 07-review-platform-proofs.md
  - 07-review-platform-proofs.yaml
  - 07-review-platform-proofs.html.fragment
  - 07-review-accounts-data-layer-correctness.md
  - 07-review-accounts-data-layer-correctness.yaml
  - 07-review-accounts-data-layer-correctness.html.fragment
  - 07-review-accounts-data-layer-reliability.md
  - 07-review-accounts-data-layer-reliability.yaml
  - 07-review-accounts-data-layer-reliability.html.fragment
  - 07-review-accounts-data-layer-security.md
  - 07-review-accounts-data-layer-security.yaml
  - 07-review-accounts-data-layer-security.html.fragment
  - 07-review-accounts-data-layer-code-simplification.md
  - 07-review-accounts-data-layer-code-simplification.yaml
  - 07-review-accounts-data-layer-code-simplification.html.fragment
  - 07-review-accounts-data-layer-testing.md
  - 07-review-accounts-data-layer-testing.yaml
  - 07-review-accounts-data-layer-testing.html.fragment
  - 07-review-accounts-data-layer-data-integrity.md
  - 07-review-accounts-data-layer-data-integrity.yaml
  - 07-review-accounts-data-layer-data-integrity.html.fragment
  - 07-review-accounts-data-layer-maintainability.md
  - 07-review-accounts-data-layer-maintainability.yaml
  - 07-review-accounts-data-layer-privacy.md
  - 07-review-accounts-data-layer-privacy.yaml
  - 07-review-accounts-data-layer-migrations.md
  - 07-review-accounts-data-layer-migrations.yaml
  - 07-review-accounts-data-layer-api-contracts.md
  - 07-review-accounts-data-layer-api-contracts.yaml
  - 07-review-accounts-data-layer-supply-chain.md
  - 07-review-accounts-data-layer-supply-chain.yaml
  - 07-review-accounts-data-layer-architecture.md
  - 07-review-accounts-data-layer-architecture.yaml
  - 07-review-accounts-data-layer-backend-concurrency.md
  - 07-review-accounts-data-layer-backend-concurrency.yaml
  - 07-review-accounts-data-layer-accessibility.md
  - 07-review-accounts-data-layer-accessibility.yaml
  - 07-review-accounts-data-layer.md
  - 07-review-accounts-data-layer.yaml
  - 07-review-accounts-data-layer.html.fragment
  - 07-review-design-system-shell-correctness.md
  - 07-review-design-system-shell-correctness.yaml
  - 07-review-design-system-shell-security.md
  - 07-review-design-system-shell-security.yaml
  - 07-review-design-system-shell-code-simplification.md
  - 07-review-design-system-shell-code-simplification.yaml
  - 07-review-design-system-shell-testing.md
  - 07-review-design-system-shell-testing.yaml
  - 07-review-design-system-shell-maintainability.md
  - 07-review-design-system-shell-maintainability.yaml
  - 07-review-design-system-shell-reliability.md
  - 07-review-design-system-shell-reliability.yaml
  - 07-review-design-system-shell-accessibility.md
  - 07-review-design-system-shell-accessibility.yaml
  - 07-review-design-system-shell-frontend-accessibility.md
  - 07-review-design-system-shell-frontend-accessibility.yaml
  - 07-review-design-system-shell-frontend-performance.md
  - 07-review-design-system-shell-frontend-performance.yaml
  - 07-review-design-system-shell-interface-craft.md
  - 07-review-design-system-shell-interface-craft.yaml
  - 07-review-design-system-shell-ux-copy.md
  - 07-review-design-system-shell-ux-copy.yaml
  - 07-review-design-system-shell-design-audit.md
  - 07-review-design-system-shell-design-audit.yaml
  - 07-review-design-system-shell-design-critique.md
  - 07-review-design-system-shell-design-critique.yaml
  - 07-review-design-system-shell-motion.md
  - 07-review-design-system-shell-motion.yaml
  - 07-review-design-system-shell-refactor-safety.md
  - 07-review-design-system-shell-refactor-safety.yaml
  - 07-review-design-system-shell.md
  - 07-review-design-system-shell.yaml
  - 07-review-design-system-shell.html.fragment
  - 04-plan-lesson-renderer.md
  - 04-plan-lesson-renderer.yaml
  - 04-plan-sample-journey.md
  - 04-plan-sample-journey.yaml
  - 04-plan-sample-journey.html.fragment
  - 04-plan-ai-gateway.md
  - 04-plan-ai-gateway.yaml
  - 04-plan-ai-gateway.html.fragment
  - 04-plan-tutor-interview.md
  - 04-plan-tutor-interview.yaml
  - 04-plan-tutor-interview.html.fragment
  - 04-plan-roadmap-lesson-generation.md
  - 04-plan-roadmap-lesson-generation.yaml
  - 04-plan-roadmap-lesson-generation.html.fragment
  - 04-plan-quiz-fsrs.md
  - 04-plan-quiz-fsrs.yaml
  - 04-plan-quiz-fsrs.html.fragment
  - 05-implement-lesson-renderer.md
  - 06-verify-lesson-renderer.md
  - 07-review-lesson-renderer-correctness.md
  - 07-review-lesson-renderer-correctness.yaml
  - 07-review-lesson-renderer-correctness.html.fragment
  - 07-review-lesson-renderer-security.md
  - 07-review-lesson-renderer-security.yaml
  - 07-review-lesson-renderer-security.html.fragment
  - 07-review-lesson-renderer-code-simplification.md
  - 07-review-lesson-renderer-code-simplification.yaml
  - 07-review-lesson-renderer-code-simplification.html.fragment
  - 07-review-lesson-renderer-accessibility.md
  - 07-review-lesson-renderer-accessibility.yaml
  - 07-review-lesson-renderer-accessibility.html.fragment
  - 07-review-lesson-renderer-frontend-accessibility.md
  - 07-review-lesson-renderer-frontend-accessibility.yaml
  - 07-review-lesson-renderer-frontend-accessibility.html.fragment
  - 07-review-lesson-renderer-frontend-performance.md
  - 07-review-lesson-renderer-frontend-performance.yaml
  - 07-review-lesson-renderer-frontend-performance.html.fragment
  - 07-review-lesson-renderer-interface-craft.md
  - 07-review-lesson-renderer-interface-craft.yaml
  - 07-review-lesson-renderer-interface-craft.html.fragment
  - 07-review-lesson-renderer-ux-copy.md
  - 07-review-lesson-renderer-ux-copy.yaml
  - 07-review-lesson-renderer-ux-copy.html.fragment
  - 07-review-lesson-renderer-testing.md
  - 07-review-lesson-renderer-testing.yaml
  - 07-review-lesson-renderer-testing.html.fragment
  - 07-review-lesson-renderer-maintainability.md
  - 07-review-lesson-renderer-maintainability.yaml
  - 07-review-lesson-renderer-reliability.md
  - 07-review-lesson-renderer-reliability.yaml
  - 07-review-lesson-renderer-reliability.html.fragment
  - 07-review-lesson-renderer-motion.md
  - 07-review-lesson-renderer-motion.yaml
  - 07-review-lesson-renderer-architecture.md
  - 07-review-lesson-renderer-architecture.yaml
  - 07-review-lesson-renderer-architecture.html.fragment
  - 07-review-lesson-renderer-design-audit.md
  - 07-review-lesson-renderer-design-audit.yaml
  - 07-review-lesson-renderer-design-critique.md
  - 07-review-lesson-renderer-design-critique.yaml
  - 07-review-lesson-renderer.md
  - 07-review-lesson-renderer.yaml
  - 07-review-lesson-renderer.html.fragment
  - 05-implement-sample-journey.md
  - 06-verify-sample-journey.md
  - 05-implement-ai-gateway.md
  - 06-verify-ai-gateway.md
  - 05-implement-tutor-interview.md
  - 06-verify-tutor-interview.md
  - 05-implement-roadmap-lesson-generation.md
  - 06-verify-roadmap-lesson-generation.md
  - 05-implement-quiz-fsrs.md
  - 06-verify-quiz-fsrs.md
  - 05-implement-adaptation-progress.md
  - 06-verify-adaptation-progress.md
  - 07-review-ai-gateway-correctness.md
  - 07-review-ai-gateway-correctness.yaml
  - 07-review-ai-gateway-security.md
  - 07-review-ai-gateway-security.yaml
  - 07-review-ai-gateway-code-simplification.md
  - 07-review-ai-gateway-code-simplification.yaml
  - 07-review-ai-gateway-testing.md
  - 07-review-ai-gateway-testing.yaml
  - 07-review-ai-gateway-maintainability.md
  - 07-review-ai-gateway-maintainability.yaml
  - 07-review-ai-gateway-reliability.md
  - 07-review-ai-gateway-reliability.yaml
  - 07-review-ai-gateway-backend-concurrency.md
  - 07-review-ai-gateway-backend-concurrency.yaml
  - 07-review-ai-gateway-performance.md
  - 07-review-ai-gateway-performance.yaml
  - 07-review-ai-gateway-data-integrity.md
  - 07-review-ai-gateway-data-integrity.yaml
  - 07-review-ai-gateway-privacy.md
  - 07-review-ai-gateway-privacy.yaml
  - 07-review-ai-gateway-api-contracts.md
  - 07-review-ai-gateway-api-contracts.yaml
  - 07-review-ai-gateway-cost.md
  - 07-review-ai-gateway-cost.yaml
  - 07-review-ai-gateway-observability.md
  - 07-review-ai-gateway-observability.yaml
  - 07-review-ai-gateway.md
  - 07-review-ai-gateway.yaml
  - 07-review-ai-gateway.html.fragment
  - 07-review-sample-journey-correctness.md
  - 07-review-sample-journey-correctness.yaml
  - 07-review-sample-journey-correctness.html.fragment
  - 07-review-sample-journey-security.md
  - 07-review-sample-journey-security.yaml
  - 07-review-sample-journey-code-simplification.md
  - 07-review-sample-journey-code-simplification.yaml
  - 07-review-sample-journey-accessibility.md
  - 07-review-sample-journey-accessibility.yaml
  - 07-review-sample-journey-accessibility.html.fragment
  - 07-review-sample-journey-frontend-accessibility.md
  - 07-review-sample-journey-frontend-accessibility.yaml
  - 07-review-sample-journey-frontend-accessibility.html.fragment
  - 07-review-sample-journey-frontend-performance.md
  - 07-review-sample-journey-frontend-performance.yaml
  - 07-review-sample-journey-interface-craft.md
  - 07-review-sample-journey-interface-craft.yaml
  - 07-review-sample-journey-ux-copy.md
  - 07-review-sample-journey-ux-copy.yaml
  - 07-review-sample-journey-testing.md
  - 07-review-sample-journey-testing.yaml
  - 07-review-sample-journey-maintainability.md
  - 07-review-sample-journey-maintainability.yaml
  - 07-review-sample-journey-reliability.md
  - 07-review-sample-journey-reliability.yaml
  - 07-review-sample-journey.md
  - 07-review-sample-journey.yaml
  - 07-review-sample-journey.html.fragment
  - 07-review-tutor-interview-correctness.md
  - 07-review-tutor-interview-correctness.yaml
  - 07-review-tutor-interview-security.md
  - 07-review-tutor-interview-security.yaml
  - 07-review-tutor-interview-code-simplification.md
  - 07-review-tutor-interview-code-simplification.yaml
  - 07-review-tutor-interview-code-simplification.html.fragment
  - 07-review-tutor-interview-testing.md
  - 07-review-tutor-interview-testing.yaml
  - 07-review-tutor-interview-maintainability.md
  - 07-review-tutor-interview-maintainability.yaml
  - 07-review-tutor-interview-reliability.md
  - 07-review-tutor-interview-reliability.yaml
  - 07-review-tutor-interview-accessibility.md
  - 07-review-tutor-interview-accessibility.yaml
  - 07-review-tutor-interview-frontend-accessibility.md
  - 07-review-tutor-interview-frontend-accessibility.yaml
  - 07-review-tutor-interview-frontend-performance.md
  - 07-review-tutor-interview-frontend-performance.yaml
  - 07-review-tutor-interview-interface-craft.md
  - 07-review-tutor-interview-interface-craft.yaml
  - 07-review-tutor-interview-backend-concurrency.md
  - 07-review-tutor-interview-backend-concurrency.yaml
  - 07-review-tutor-interview-data-integrity.md
  - 07-review-tutor-interview-data-integrity.yaml
  - 07-review-tutor-interview-ux-copy.md
  - 07-review-tutor-interview-ux-copy.yaml
  - 07-review-tutor-interview.md
  - 07-review-tutor-interview.yaml
  - 07-review-tutor-interview.html.fragment
  - 07-review-roadmap-lesson-generation-security.md
  - 07-review-roadmap-lesson-generation-security.yaml
  - 07-review-roadmap-lesson-generation-correctness.md
  - 07-review-roadmap-lesson-generation-correctness.yaml
  - 07-review-roadmap-lesson-generation-reliability.md
  - 07-review-roadmap-lesson-generation-reliability.yaml
  - 07-review-roadmap-lesson-generation-backend-concurrency.md
  - 07-review-roadmap-lesson-generation-backend-concurrency.yaml
  - 07-review-roadmap-lesson-generation-accessibility.md
  - 07-review-roadmap-lesson-generation-accessibility.yaml
  - 07-review-roadmap-lesson-generation-frontend-accessibility.md
  - 07-review-roadmap-lesson-generation-frontend-accessibility.yaml
  - 07-review-roadmap-lesson-generation-frontend-performance.md
  - 07-review-roadmap-lesson-generation-frontend-performance.yaml
  - 07-review-roadmap-lesson-generation-interface-craft.md
  - 07-review-roadmap-lesson-generation-interface-craft.yaml
  - 07-review-roadmap-lesson-generation-ux-copy.md
  - 07-review-roadmap-lesson-generation-ux-copy.yaml
  - 07-review-roadmap-lesson-generation-testing.md
  - 07-review-roadmap-lesson-generation-testing.yaml
  - 07-review-roadmap-lesson-generation-privacy.md
  - 07-review-roadmap-lesson-generation-privacy.yaml
  - 07-review-roadmap-lesson-generation-cost.md
  - 07-review-roadmap-lesson-generation-cost.yaml
  - 07-review-roadmap-lesson-generation-code-simplification.md
  - 07-review-roadmap-lesson-generation-code-simplification.yaml
  - 07-review-roadmap-lesson-generation-maintainability.md
  - 07-review-roadmap-lesson-generation-maintainability.yaml
  - 07-review-roadmap-lesson-generation-api-contracts.md
  - 07-review-roadmap-lesson-generation-api-contracts.yaml
  - 07-review-roadmap-lesson-generation.md
  - 07-review-roadmap-lesson-generation.yaml
  - 07-review-roadmap-lesson-generation.html.fragment
  - 07-review-quiz-fsrs-correctness.md
  - 07-review-quiz-fsrs-correctness.yaml
  - 07-review-quiz-fsrs-security.md
  - 07-review-quiz-fsrs-security.yaml
  - 07-review-quiz-fsrs-security.html.fragment
  - 07-review-quiz-fsrs-code-simplification.md
  - 07-review-quiz-fsrs-code-simplification.yaml
  - 07-review-quiz-fsrs-testing.md
  - 07-review-quiz-fsrs-testing.yaml
  - 07-review-quiz-fsrs-maintainability.md
  - 07-review-quiz-fsrs-maintainability.yaml
  - 07-review-quiz-fsrs-reliability.md
  - 07-review-quiz-fsrs-reliability.yaml
  - 07-review-quiz-fsrs-accessibility.md
  - 07-review-quiz-fsrs-accessibility.yaml
  - 07-review-quiz-fsrs-frontend-performance.md
  - 07-review-quiz-fsrs-frontend-performance.yaml
  - 07-review-quiz-fsrs-interface-craft.md
  - 07-review-quiz-fsrs-interface-craft.yaml
  - 07-review-quiz-fsrs-ux-copy.md
  - 07-review-quiz-fsrs-ux-copy.yaml
  - 07-review-quiz-fsrs-data-integrity.md
  - 07-review-quiz-fsrs-data-integrity.yaml
  - 07-review-quiz-fsrs-performance.md
  - 07-review-quiz-fsrs-performance.yaml
  - 07-review-quiz-fsrs-privacy.md
  - 07-review-quiz-fsrs-privacy.yaml
  - 07-review-quiz-fsrs-supply-chain.md
  - 07-review-quiz-fsrs-supply-chain.yaml
  - 07-review-quiz-fsrs-cost.md
  - 07-review-quiz-fsrs-cost.yaml
  - 07-review-quiz-fsrs.md
  - 07-review-quiz-fsrs.yaml
  - 07-review-quiz-fsrs.html.fragment
  - 04-plan-adaptation-progress.md
  - 04-plan-adaptation-progress.yaml
  - 04-plan-adaptation-progress.html.fragment
  - 07-review-adaptation-progress-correctness.md
  - 07-review-adaptation-progress-correctness.yaml
  - 07-review-adaptation-progress-security.md
  - 07-review-adaptation-progress-security.yaml
  - 07-review-adaptation-progress-code-simplification.md
  - 07-review-adaptation-progress-code-simplification.yaml
  - 07-review-adaptation-progress-testing.md
  - 07-review-adaptation-progress-testing.yaml
  - 07-review-adaptation-progress-maintainability.md
  - 07-review-adaptation-progress-maintainability.yaml
  - 07-review-adaptation-progress-reliability.md
  - 07-review-adaptation-progress-reliability.yaml
  - 07-review-adaptation-progress-data-integrity.md
  - 07-review-adaptation-progress-data-integrity.yaml
  - 07-review-adaptation-progress-migrations.md
  - 07-review-adaptation-progress-migrations.yaml
  - 07-review-adaptation-progress-performance.md
  - 07-review-adaptation-progress-performance.yaml
  - 07-review-adaptation-progress-privacy.md
  - 07-review-adaptation-progress-privacy.yaml
  - 07-review-adaptation-progress-backend-concurrency.md
  - 07-review-adaptation-progress-backend-concurrency.yaml
  - 07-review-adaptation-progress-accessibility.md
  - 07-review-adaptation-progress-accessibility.yaml
  - 07-review-adaptation-progress-frontend-accessibility.md
  - 07-review-adaptation-progress-frontend-accessibility.yaml
  - 07-review-adaptation-progress-frontend-performance.md
  - 07-review-adaptation-progress-frontend-performance.yaml
  - 07-review-adaptation-progress-interface-craft.md
  - 07-review-adaptation-progress-interface-craft.yaml
  - 07-review-adaptation-progress.md
  - 07-review-adaptation-progress.yaml
  - 07-review-adaptation-progress.html.fragment
  - 04-plan-source-grounding.md
  - 04-plan-source-grounding.yaml
  - 04-plan-source-grounding.html.fragment
  - 05-implement-source-grounding.md
  - 06-verify-source-grounding.md
  - 07-review-source-grounding-correctness.md
  - 07-review-source-grounding-correctness.yaml
  - 07-review-source-grounding-security.md
  - 07-review-source-grounding-security.yaml
  - 07-review-source-grounding-security.html.fragment
  - 07-review-source-grounding-code-simplification.md
  - 07-review-source-grounding-code-simplification.yaml
  - 07-review-source-grounding-code-simplification.html.fragment
  - 07-review-source-grounding-testing.md
  - 07-review-source-grounding-testing.yaml
  - 07-review-source-grounding-maintainability.md
  - 07-review-source-grounding-maintainability.yaml
  - 07-review-source-grounding-maintainability.html.fragment
  - 07-review-source-grounding-reliability.md
  - 07-review-source-grounding-reliability.yaml
  - 07-review-source-grounding-backend-concurrency.md
  - 07-review-source-grounding-backend-concurrency.yaml
  - 07-review-source-grounding-data-integrity.md
  - 07-review-source-grounding-data-integrity.yaml
  - 07-review-source-grounding-migrations.md
  - 07-review-source-grounding-migrations.yaml
  - 07-review-source-grounding-privacy.md
  - 07-review-source-grounding-privacy.yaml
  - 07-review-source-grounding-logging.md
  - 07-review-source-grounding-logging.yaml
  - 07-review-source-grounding.md
  - 07-review-source-grounding.yaml
  - 07-review-source-grounding.html.fragment
  - 04-plan-model-refresh.md
  - 04-plan-model-refresh.yaml
  - 04-plan-model-refresh.html.fragment
  - 04-plan-tanstack-start-request-access.md
  - 04-plan-tanstack-start-request-access.yaml
  - 04-plan-tanstack-start-request-access.html.fragment
  - 04-plan-tanstack-ai-gateway-hygiene.md
  - 04-plan-tanstack-ai-gateway-hygiene.yaml
  - 04-plan-tanstack-ai-gateway-hygiene.html.fragment
  - 05-implement-model-refresh.md
  - 05-implement-tanstack-start-request-access.md
  - 05-implement-tanstack-ai-gateway-hygiene.md
  - 06-verify-tanstack-ai-gateway-hygiene.md
  - 06-verify-tanstack-start-request-access.md
  - 06-verify-model-refresh.md
  - 07-review-model-refresh.md
  - 07-review-model-refresh.yaml
  - 07-review-model-refresh.html.fragment
  - 07-review-model-refresh-correctness.md
  - 07-review-model-refresh-correctness.yaml
  - 07-review-model-refresh-security.md
  - 07-review-model-refresh-security.yaml
  - 07-review-model-refresh-code-simplification.md
  - 07-review-model-refresh-code-simplification.yaml
  - 07-review-model-refresh-intent-fidelity.md
  - 07-review-model-refresh-intent-fidelity.yaml
  - 07-review-model-refresh-testing.md
  - 07-review-model-refresh-testing.yaml
  - 07-review-model-refresh-testing.html.fragment
  - 07-review-model-refresh-maintainability.md
  - 07-review-model-refresh-maintainability.yaml
  - 07-review-model-refresh-reliability.md
  - 07-review-model-refresh-reliability.yaml
  - 07-review-model-refresh-reliability.html.fragment
  - 07-review-model-refresh-backend-concurrency.md
  - 07-review-model-refresh-backend-concurrency.yaml
  - 07-review-model-refresh-cost.md
  - 07-review-model-refresh-cost.yaml
  - 07-review-model-refresh-cost.html.fragment
  - 07-review-tanstack-start-request-access.md
  - 07-review-tanstack-start-request-access.yaml
  - 07-review-tanstack-start-request-access.html.fragment
  - 07-review-tanstack-start-request-access-correctness.md
  - 07-review-tanstack-start-request-access-correctness.yaml
  - 07-review-tanstack-start-request-access-security.md
  - 07-review-tanstack-start-request-access-security.yaml
  - 07-review-tanstack-start-request-access-code-simplification.md
  - 07-review-tanstack-start-request-access-code-simplification.yaml
  - 07-review-tanstack-start-request-access-code-simplification.html.fragment
  - 07-review-tanstack-start-request-access-intent-fidelity.md
  - 07-review-tanstack-start-request-access-intent-fidelity.yaml
  - 07-review-tanstack-start-request-access-testing.md
  - 07-review-tanstack-start-request-access-testing.yaml
  - 07-review-tanstack-start-request-access-maintainability.md
  - 07-review-tanstack-start-request-access-maintainability.yaml
  - 07-review-tanstack-start-request-access-reliability.md
  - 07-review-tanstack-start-request-access-reliability.yaml
  - 07-review-tanstack-start-request-access-backend-concurrency.md
  - 07-review-tanstack-start-request-access-backend-concurrency.yaml
  - 07-review-tanstack-start-request-access-refactor-safety.md
  - 07-review-tanstack-start-request-access-refactor-safety.yaml
  - 07-review-tanstack-ai-gateway-hygiene.md
  - 07-review-tanstack-ai-gateway-hygiene.yaml
  - 07-review-tanstack-ai-gateway-hygiene.html.fragment
  - 07-review-tanstack-ai-gateway-hygiene-correctness.md
  - 07-review-tanstack-ai-gateway-hygiene-correctness.yaml
  - 07-review-tanstack-ai-gateway-hygiene-security.md
  - 07-review-tanstack-ai-gateway-hygiene-security.yaml
  - 07-review-tanstack-ai-gateway-hygiene-code-simplification.md
  - 07-review-tanstack-ai-gateway-hygiene-code-simplification.yaml
  - 07-review-tanstack-ai-gateway-hygiene-intent-fidelity.md
  - 07-review-tanstack-ai-gateway-hygiene-intent-fidelity.yaml
  - 07-review-tanstack-ai-gateway-hygiene-testing.md
  - 07-review-tanstack-ai-gateway-hygiene-testing.yaml
  - 07-review-tanstack-ai-gateway-hygiene-testing.html.fragment
  - 07-review-tanstack-ai-gateway-hygiene-maintainability.md
  - 07-review-tanstack-ai-gateway-hygiene-maintainability.yaml
  - 07-review-tanstack-ai-gateway-hygiene-reliability.md
  - 07-review-tanstack-ai-gateway-hygiene-reliability.yaml
  - 07-review-tanstack-ai-gateway-hygiene-reliability.html.fragment
  - 07-review-tanstack-ai-gateway-hygiene-refactor-safety.md
  - 07-review-tanstack-ai-gateway-hygiene-refactor-safety.yaml
  - 07-review-tanstack-ai-gateway-hygiene-backend-concurrency.md
  - 07-review-tanstack-ai-gateway-hygiene-backend-concurrency.yaml
  - 07-review-tanstack-ai-gateway-hygiene-architecture.md
  - 07-review-tanstack-ai-gateway-hygiene-architecture.yaml
  - 07-review-tanstack-ai-gateway-hygiene-data-integrity.md
  - 07-review-tanstack-ai-gateway-hygiene-data-integrity.yaml
  - 07-review-tanstack-ai-gateway-hygiene-cost.md
  - 07-review-tanstack-ai-gateway-hygiene-cost.yaml
  - 07-review-tanstack-ai-gateway-hygiene-cost.html.fragment
  - 07-review-tanstack-ai-gateway-hygiene-observability.md
  - 07-review-tanstack-ai-gateway-hygiene-observability.yaml
  - 07-review-tanstack-ai-gateway-hygiene-supply-chain.md
  - 07-review-tanstack-ai-gateway-hygiene-supply-chain.yaml
  - 04-plan-tanstack-router-typed-context.md
  - 04-plan-tanstack-router-typed-context.yaml
  - 04-plan-tanstack-router-typed-context.html.fragment
  - 05-implement-tanstack-router-typed-context.md
  - 06-verify-tanstack-router-typed-context.md
  - 07-review-tanstack-router-typed-context.md
  - 07-review-tanstack-router-typed-context.yaml
  - 07-review-tanstack-router-typed-context.html.fragment
  - 07-review-tanstack-router-typed-context-correctness.md
  - 07-review-tanstack-router-typed-context-correctness.yaml
  - 07-review-tanstack-router-typed-context-security.md
  - 07-review-tanstack-router-typed-context-security.yaml
  - 07-review-tanstack-router-typed-context-code-simplification.md
  - 07-review-tanstack-router-typed-context-code-simplification.yaml
  - 07-review-tanstack-router-typed-context-intent-fidelity.md
  - 07-review-tanstack-router-typed-context-intent-fidelity.yaml
  - 07-review-tanstack-router-typed-context-testing.md
  - 07-review-tanstack-router-typed-context-testing.yaml
  - 07-review-tanstack-router-typed-context-maintainability.md
  - 07-review-tanstack-router-typed-context-maintainability.yaml
  - 07-review-tanstack-router-typed-context-reliability.md
  - 07-review-tanstack-router-typed-context-reliability.yaml
  - 07-review-tanstack-router-typed-context-refactor-safety.md
  - 07-review-tanstack-router-typed-context-refactor-safety.yaml
  - 04-plan-tanstack-data-layer-unification.md
  - 04-plan-tanstack-data-layer-unification.yaml
  - 04-plan-tanstack-data-layer-unification.html.fragment
  - 05-implement-tanstack-data-layer-unification.md
  - 06-verify-tanstack-data-layer-unification.md
  - 07-review-tanstack-data-layer-unification.md
  - 07-review-tanstack-data-layer-unification.yaml
  - 07-review-tanstack-data-layer-unification.html.fragment
  - 07-review-tanstack-data-layer-unification-correctness.md
  - 07-review-tanstack-data-layer-unification-correctness.yaml
  - 07-review-tanstack-data-layer-unification-security.md
  - 07-review-tanstack-data-layer-unification-security.yaml
  - 07-review-tanstack-data-layer-unification-code-simplification.md
  - 07-review-tanstack-data-layer-unification-code-simplification.yaml
  - 07-review-tanstack-data-layer-unification-code-simplification.html.fragment
  - 07-review-tanstack-data-layer-unification-intent-fidelity.md
  - 07-review-tanstack-data-layer-unification-intent-fidelity.yaml
  - 07-review-tanstack-data-layer-unification-intent-fidelity.html.fragment
  - 07-review-tanstack-data-layer-unification-testing.md
  - 07-review-tanstack-data-layer-unification-testing.yaml
  - 07-review-tanstack-data-layer-unification-maintainability.md
  - 07-review-tanstack-data-layer-unification-maintainability.yaml
  - 07-review-tanstack-data-layer-unification-reliability.md
  - 07-review-tanstack-data-layer-unification-reliability.yaml
  - 07-review-tanstack-data-layer-unification-architecture.md
  - 07-review-tanstack-data-layer-unification-architecture.yaml
  - 07-review-tanstack-data-layer-unification-data-integrity.md
  - 07-review-tanstack-data-layer-unification-data-integrity.yaml
  - 07-review-tanstack-data-layer-unification-refactor-safety.md
  - 07-review-tanstack-data-layer-unification-refactor-safety.yaml
  - 07-review-tanstack-data-layer-unification-privacy.md
  - 07-review-tanstack-data-layer-unification-privacy.yaml
  - 07-review-tanstack-data-layer-unification-supply-chain.md
  - 07-review-tanstack-data-layer-unification-supply-chain.yaml
  - 07-review-health-endpoint.md
  - 07-review-health-endpoint.yaml
  - 07-review-health-endpoint.html.fragment
  - 07-review-health-endpoint-correctness.md
  - 07-review-health-endpoint-correctness.yaml
  - 07-review-health-endpoint-security.md
  - 07-review-health-endpoint-security.yaml
  - 07-review-health-endpoint-code-simplification.md
  - 07-review-health-endpoint-code-simplification.yaml
  - 07-review-health-endpoint-intent-fidelity.md
  - 07-review-health-endpoint-intent-fidelity.yaml
  - 07-review-health-endpoint-testing.md
  - 07-review-health-endpoint-testing.yaml
  - 07-review-health-endpoint-maintainability.md
  - 07-review-health-endpoint-maintainability.yaml
  - 07-review-health-endpoint-reliability.md
  - 07-review-health-endpoint-reliability.yaml
  - 07-review-health-endpoint-reliability.html.fragment
  - 07-review-health-endpoint-observability.md
  - 07-review-health-endpoint-observability.yaml
  - 07-review-health-endpoint-api-contracts.md
  - 07-review-health-endpoint-api-contracts.yaml
  - 07-review-health-endpoint-api-contracts.html.fragment
  - 03-slice-precommit-gitleaks-resilience.md
  - 03-slice-repo-format-baseline.md
  - 03-slice-fsrs-scheduler-test-determinism.md
  - 03-slice-e2e-session-cookie-prefix.md
  - 04-plan-e2e-session-cookie-prefix.md
  - 04-plan-e2e-session-cookie-prefix.yaml
  - 04-plan-e2e-session-cookie-prefix.html.fragment
  - 04-plan-precommit-gitleaks-resilience.md
  - 04-plan-precommit-gitleaks-resilience.yaml
  - 04-plan-precommit-gitleaks-resilience.html.fragment
  - 04-plan-repo-format-baseline.md
  - 04-plan-repo-format-baseline.yaml
  - 04-plan-repo-format-baseline.html.fragment
  - 05-implement-repo-format-baseline.md
  - 05-implement-precommit-gitleaks-resilience.md
  - 06-verify-precommit-gitleaks-resilience.md
  - 06-verify-repo-format-baseline.md
  - 07-review-precommit-gitleaks-resilience.md
  - 07-review-precommit-gitleaks-resilience.yaml
  - 07-review-precommit-gitleaks-resilience.html.fragment
  - 07-review-precommit-gitleaks-resilience-correctness.md
  - 07-review-precommit-gitleaks-resilience-correctness.yaml
  - 07-review-precommit-gitleaks-resilience-security.md
  - 07-review-precommit-gitleaks-resilience-security.yaml
  - 07-review-precommit-gitleaks-resilience-security.html.fragment
  - 07-review-precommit-gitleaks-resilience-code-simplification.md
  - 07-review-precommit-gitleaks-resilience-code-simplification.yaml
  - 07-review-precommit-gitleaks-resilience-intent-fidelity.md
  - 07-review-precommit-gitleaks-resilience-intent-fidelity.yaml
  - 07-review-precommit-gitleaks-resilience-testing.md
  - 07-review-precommit-gitleaks-resilience-testing.yaml
  - 07-review-precommit-gitleaks-resilience-maintainability.md
  - 07-review-precommit-gitleaks-resilience-maintainability.yaml
  - 07-review-precommit-gitleaks-resilience-reliability.md
  - 07-review-precommit-gitleaks-resilience-reliability.yaml
  - 07-review-precommit-gitleaks-resilience-ci.md
  - 07-review-precommit-gitleaks-resilience-ci.yaml
  - 07-review-precommit-gitleaks-resilience-docs.md
  - 07-review-precommit-gitleaks-resilience-docs.yaml
  - 07-review-repo-format-baseline.md
  - 07-review-repo-format-baseline.yaml
  - 07-review-repo-format-baseline.html.fragment
  - 07-review-repo-format-baseline-correctness.md
  - 07-review-repo-format-baseline-correctness.yaml
  - 07-review-repo-format-baseline-security.md
  - 07-review-repo-format-baseline-security.yaml
  - 07-review-repo-format-baseline-code-simplification.md
  - 07-review-repo-format-baseline-code-simplification.yaml
  - 07-review-repo-format-baseline-intent-fidelity.md
  - 07-review-repo-format-baseline-intent-fidelity.yaml
  - 07-review-repo-format-baseline-refactor-safety.md
  - 07-review-repo-format-baseline-refactor-safety.yaml
  - 07-review-repo-format-baseline-dx.md
  - 07-review-repo-format-baseline-dx.yaml
  - 05-implement-e2e-session-cookie-prefix.md
  - 06-verify-e2e-session-cookie-prefix.md
  - 07-review-e2e-session-cookie-prefix.md
  - 07-review-e2e-session-cookie-prefix.yaml
  - 07-review-e2e-session-cookie-prefix.html.fragment
  - 07-review-e2e-session-cookie-prefix-correctness.md
  - 07-review-e2e-session-cookie-prefix-correctness.yaml
  - 07-review-e2e-session-cookie-prefix-security.md
  - 07-review-e2e-session-cookie-prefix-security.yaml
  - 07-review-e2e-session-cookie-prefix-code-simplification.md
  - 07-review-e2e-session-cookie-prefix-code-simplification.yaml
  - 07-review-e2e-session-cookie-prefix-intent-fidelity.md
  - 07-review-e2e-session-cookie-prefix-intent-fidelity.yaml
  - 07-review-e2e-session-cookie-prefix-testing.md
  - 07-review-e2e-session-cookie-prefix-testing.yaml
  - 07-review-e2e-session-cookie-prefix-testing.html.fragment
  - 04-plan-fsrs-scheduler-test-determinism.md
  - 04-plan-fsrs-scheduler-test-determinism.yaml
  - 04-plan-fsrs-scheduler-test-determinism.html.fragment
  - 05-implement-fsrs-scheduler-test-determinism.md
  - 06-verify-fsrs-scheduler-test-determinism.md
  - 07-review-fsrs-scheduler-test-determinism.md
  - 07-review-fsrs-scheduler-test-determinism.yaml
  - 07-review-fsrs-scheduler-test-determinism.html.fragment
  - 07-review-fsrs-scheduler-test-determinism-correctness.md
  - 07-review-fsrs-scheduler-test-determinism-correctness.yaml
  - 07-review-fsrs-scheduler-test-determinism-security.md
  - 07-review-fsrs-scheduler-test-determinism-security.yaml
  - 07-review-fsrs-scheduler-test-determinism-code-simplification.md
  - 07-review-fsrs-scheduler-test-determinism-code-simplification.yaml
  - 07-review-fsrs-scheduler-test-determinism-intent-fidelity.md
  - 07-review-fsrs-scheduler-test-determinism-intent-fidelity.yaml
  - 07-review-fsrs-scheduler-test-determinism-testing.md
  - 07-review-fsrs-scheduler-test-determinism-testing.yaml
  - 03-slice-tutor-interview-ac-ti1-fix.md
  - 04-plan-tutor-interview-ac-ti1-fix.md
  - 04-plan-tutor-interview-ac-ti1-fix.yaml
  - 04-plan-tutor-interview-ac-ti1-fix.html.fragment
  - 05-implement-tutor-interview-ac-ti1-fix.md
progress:
  intake: complete
  shape: complete
  slice: complete
  plan: complete
  implement: complete
  verify: complete
  review: complete
  handoff: not-started
  ship: not-started
  retro: not-started
---
