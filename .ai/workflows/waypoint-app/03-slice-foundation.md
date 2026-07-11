---
schema: sdlc/v1
type: slice
slug: waypoint-app
slice-slug: foundation
status: defined
stage-number: 3
created-at: "2026-07-10T22:43:12Z"
updated-at: "2026-07-10T22:43:12Z"
complexity: m
depends-on: []
tags: [bootstrap, ci, supply-chain]
refs:
  index: 00-index.md
  slice-index: 03-slice.md
  siblings: [03-slice-platform-proofs.md, 03-slice-accounts-data-layer.md, 03-slice-design-system-shell.md, 03-slice-lesson-renderer.md, 03-slice-sample-journey.md, 03-slice-ai-gateway.md, 03-slice-tutor-interview.md, 03-slice-roadmap-lesson-generation.md, 03-slice-quiz-fsrs.md, 03-slice-adaptation-progress.md, 03-slice-source-grounding.md]
  plan: 04-plan-foundation.md
  implement: 05-implement-foundation.md
---

# Slice: Foundation

## The Slice

Everything in this project starts from literally nothing — no git repo, no package.json, no lockfile — so the first slice is the one that makes every other slice possible: initialize the repo, scaffold TanStack Start via the official CLI, and wire the toolchain the shape already decided (pnpm, exact pins, `@cloudflare/vite-plugin`, Vitest, Playwright, CI with `pnpm audit`). The reason this is a real slice and not a checklist item is the supply-chain discipline: the shape names specific compromised versions to avoid (`@tanstack/react-start` 1.167.68/.71, router 1.169.5/.8) and a known-broken range (1.142.x Cloudflare middleware), so "install dependencies" here means *auditable, pinned, verified* dependencies — the CVE-2026-45321 lesson turned into repo policy from commit one.

The slice is deliberately mechanical. It proves the scaffold serves a page and the test harnesses run, and nothing more — the risky platform behaviors (streaming, adapter, D1) belong to the next slice, so a failure there can't be confused with a scaffolding mistake.

## Goal

A pinned, CI-guarded TanStack Start + Cloudflare workspace where `pnpm install && pnpm dev` serves a page and both test harnesses (Vitest, Playwright) run green.

## Why This Slice Exists

Every other slice assumes a repo, a scaffold, a test harness, and a supply-chain gate. Isolating bootstrap keeps the first platform-proof failures diagnosable (they'll mean "platform problem," never "setup problem") and makes the compromised-version avoidance an explicit, reviewable act.

## Scope

- **In:** `git init` + `main` + `feat/waypoint-app` branch; scaffold via `npx @tanstack/cli create` (React + Start); pnpm with exact pins (avoid the compromised/broken versions named in 02-shape.md §Sequencing); `@cloudflare/vite-plugin` + `wrangler.jsonc`; Vitest + Testing Library setup; `@playwright/test` as dev dep (browsers pre-installed globally on the PO machine); CI workflow running lint, typecheck, tests, and `pnpm audit`; `.env.example` documenting the three external prerequisites (OAuth apps, OpenRouter key, Cloudflare account); README stub; TanStack Intent (`npx @tanstack/intent install`) for dev-time agent skills.
- **Out:** any product code, D1 schema, auth (accounts-data-layer); workerd behavior proofs (platform-proofs); design tokens (design-system-shell).

## Acceptance Criteria

- Given a fresh clone with pnpm 10.x, When `pnpm install && pnpm dev` runs, Then the scaffolded app serves a rendered page in a browser with no console errors.
  <!-- observable: true — a served page is the user-visible outcome; observed by driving the dev server in a real browser -->
  verify: { method: playwright (or Claude_Browser drive) against the dev server, env: local Windows dev machine, Node 22 + pnpm 10 (already installed), fixture: none — scaffold default route, rung: web-1 }
- Given the lockfile and package.json, When the pin-audit check runs, Then every dependency is exact-pinned (no `^`/`~`), none of the known-compromised/broken versions are present, and `pnpm audit` reports no untriaged criticals.
  <!-- observable: false — fully provable by a static assertion over package.json/lockfile plus the audit exit code; no runtime needed -->
- Given the repo, When `pnpm test` and `pnpm exec playwright test` run, Then a Vitest smoke test and a Playwright smoke test (loads the dev-server root page) both pass.
  <!-- observable: false — harness-works-at-all is proven by the test runners' own exit codes in CI -->
- Given a push to the branch, When CI runs, Then lint, typecheck, unit tests, and `pnpm audit` all execute and gate the build.
  <!-- observable: false — CI run status is an automated assertion; the CI platform's log is the evidence -->

## Dependencies on Other Slices

None — this is the root.

## Risks

- `@tanstack/cli create` is alpha; if the scaffold output is broken or drifts, fall back to composing Start + Vite manually per official docs (plan should note the fallback).
- Exact pinning on three pre-1.0 libraries means upgrades are manual and deliberate — accepted by the PO at intake.
- CI platform choice (no remote exists yet) is a plan-time decision; the AC only requires that the gate exists once a remote does.
