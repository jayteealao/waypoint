---
schema: sdlc/v1
type: index
slug: waypoint-app
title: "Waypoint — AI teaching app (web + mobile + desktop native + PWA) on TanStack"
status: active
current-stage: review
stage-number: 7
created-at: "2026-07-10T21:00:44Z"
updated-at: "2026-07-11T00:56:06Z"
selected-slice: "foundation"
branch-strategy: dedicated
branch: "feat/waypoint-app"
base-branch: "main"
review-scope: per-slice
pr-url: ""
pr-number: 0
open-questions: []
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
  available-mcp:
    - {name: Claude_Browser, hint: "In-app browser for driving/verifying the web app"}
    - {name: web-search-prime / web-reader, hint: "Web search + page reading for research"}
    - {name: zread, hint: "Read external GitHub repo structure/files"}
    - {name: cloudflare-api, hint: "Cloudflare code-mode MCP (docs/spec/execute) — PO-confirmed for hosting needs"}
  user-confirmed: true
next-command: wf-review
next-invocation: "/wf review waypoint-app foundation"
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
  - 04b-instrument.md
  - 04b-instrument.yaml
  - 05-implement.md
  - 05-implement-foundation.md
  - 06-verify.md
  - 06-verify-foundation.md
progress:
  intake: complete
  shape: complete
  slice: complete
  plan: complete
  implement: complete
  verify: complete
  review: not-started
  handoff: not-started
  ship: not-started
  retro: not-started
---
