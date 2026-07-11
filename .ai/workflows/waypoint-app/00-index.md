---
schema: sdlc/v1
type: index
slug: waypoint-app
title: "Waypoint — AI teaching app (web + mobile + desktop native + PWA) on TanStack"
status: active
current-stage: review
stage-number: 7
created-at: "2026-07-10T21:00:44Z"
updated-at: "2026-07-11T10:16:17Z"
selected-slice: "platform-proofs"
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
next-command: wf-review
next-invocation: "/wf review waypoint-app platform-proofs"
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
  - 04b-instrument.md
  - 04b-instrument.yaml
  - 05-implement.md
  - 05-implement-foundation.md
  - 05-implement-platform-proofs.md
  - 06-verify-platform-proofs.md
  - 06-verify.md
  - 06-verify-foundation.md
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
