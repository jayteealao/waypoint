---
schema: sdlc/v1
type: index
slug: waypoint-app
title: "Waypoint — AI teaching app (web + mobile + desktop native + PWA) on TanStack"
status: active
current-stage: review
stage-number: 7
created-at: "2026-07-10T21:00:44Z"
updated-at: "2026-07-12T02:22:28Z"
selected-slice: "tutor-interview"
branch-strategy: dedicated
branch: "feat/waypoint-app"
base-branch: "main"
review-scope: per-slice
pr-url: ""
pr-number: 0
open-questions: []
runtime-evidence-deferrals:
  - ac: "AC-F4 — CI gates run on push (lint, typecheck, tests, pnpm audit)"
    slice: foundation
    reason: "No GitHub remote / no PR to main exists; the CI workflow only triggers on PRs targeting main, and yolo never opens PRs. Plan pre-authorized constraint-resolution: proxy+deferral. Local proxies (typecheck, lint, Vitest 1/1, Playwright e2e 1/1, pnpm audit clean, exact-pin check) all pass; .github/workflows/ci.yml structurally complete with all required gates."
    cleared-by: "first PR targeting main (at handoff) triggering a green GitHub Actions run"
    recorded-at: "2026-07-11T08:30:00Z"
  - ac: "AC-PP2b — live OpenRouter tool-call smoke"
    slice: platform-proofs
    reason: "OPENROUTER_API_KEY (PO-provided secret) not present in the automated environment; the live-smoke test's skipIf gate fires as designed. Plan pre-authorized constraint-resolution: proxy+deferral. Proxy evidence: mocked tool-call proof (AC-PP2a) passes; wrangler-dev SSE + D1 proofs pass under workerd (commit 7da0ab7)."
    cleared-by: "a tagged live-smoke run with OPENROUTER_API_KEY present (or /wf probe in a keyed environment)"
    recorded-at: "2026-07-11T10:30:00Z"
  - ac: "AC-ADL1 + AC-ADL5 — seeded-session proxy tests (session persistence, cross-account isolation, identity display, sign-out)"
    slice: accounts-data-layer
    reason: "BETTER_AUTH_SECRET not set in .dev.vars; seeded-session Playwright tests require this secret for HMAC-SHA-256 cookie signing. Ladder climbed: (rung 1) 2 always-run Playwright tests pass (sign-in UI, account redirect); (rung 2) BETTER_AUTH_SECRET env var checked — absent; (rung 3) seeded-session proxy requires the secret — residual: 3 proxy tests skip by design. Real OAuth flow is the original pre-registered plan residual. Plan pre-authorized constraint-resolution: proxy+deferral."
    cleared-by: "re-running E2E suite with BETTER_AUTH_SECRET set in .dev.vars, OR first deployed Google+GitHub sign-in on deployed environment"
    recorded-at: "2026-07-11T13:04:46Z"
  - ac: "AC-DSS1 + AC-DSS3 + AC-DSS4 + AC-DSS5 — seeded-session design system Playwright tests (responsive layout, empty state, keyboard nav, reduced-motion drawer)"
    slice: design-system-shell
    reason: "BETTER_AUTH_SECRET not set in .dev.vars; seeded-session Playwright tests require HMAC-SHA-256 cookie signing. AC-DSS5 reclassified from auth-free to auth-required (DrawerNav lives inside AppShell). Proxy evidence: AC-DSS2 contrast smoke test (13 WCAG AA assertions) passes; typecheck clean; pnpm test 29/30 passing. Plan pre-authorized constraint-resolution: accepted into existing AC-ADL1+AC-ADL5 deferral entry."
    cleared-by: "re-running E2E suite with BETTER_AUTH_SECRET set in .dev.vars"
    recorded-at: "2026-07-11T14:08:04Z"
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
workflow-files:
  - 00-index.md
  - 01-intake.md
  - po-answers.md
  - 02-shape.md
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
  - 04-plan.md
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
