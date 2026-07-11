---
schema: sdlc/v1
type: slice
slug: waypoint-app
slice-slug: platform-proofs
status: complete
stage-number: 3
created-at: "2026-07-10T22:43:12Z"
updated-at: "2026-07-11T09:53:39Z"
complexity: s
depends-on: [foundation]
tags: [de-risking, workerd, tanstack-ai, d1]
refs:
  index: 00-index.md
  slice-index: 03-slice.md
  siblings: [03-slice-foundation.md, 03-slice-accounts-data-layer.md, 03-slice-design-system-shell.md, 03-slice-lesson-renderer.md, 03-slice-sample-journey.md, 03-slice-ai-gateway.md, 03-slice-tutor-interview.md, 03-slice-roadmap-lesson-generation.md, 03-slice-quiz-fsrs.md, 03-slice-adaptation-progress.md, 03-slice-source-grounding.md]
  plan: 04-plan-platform-proofs.md
  implement: 05-implement-platform-proofs.md
---

# Slice: Platform Proofs

## The Slice

Three beta/RC dependencies sit on this project's critical path simultaneously, and this slice exists to make each of them fail *now*, while failing is cheap. Each proof is a small, kept piece of code — a demo SSE route, an adapter smoke test, an auth-mounted API route — that answers one question the shape flagged as inferred-not-documented: does SSE streaming actually work under workerd (AC-15's first half)? Does the TanStack AI OpenRouter adapter's tool calling work today, and does the OpenAI-adapter-with-OpenRouter-baseURL fallback actually swap in without touching call sites (it broke as recently as May)? And does better-auth mount cleanly on a `createAPIFileRoute` with D1, with per-request client creation and `cloudflare:workers` env access — the three sharp edges the freshness research named?

The tradeoff is stated plainly: this slice ships almost nothing a learner will ever see. It buys the right to build eight UI-bearing slices on top without discovering in slice nine that the streaming architecture never worked on the target runtime. If any proof fails, the fallback is already named (adapter swap; or in the worst case re-shaping the affected decision) — and the cost of discovering that here is days, not weeks.

## Goal

Empirical, recorded evidence that the three riskiest platform behaviors — SSE streaming on workerd, OpenRouter adapter tool calling (with fallback), and D1 + better-auth on an API file route — work in this scaffold.

## Why This Slice Exists

Shape sequencing constraint #2: "Platform proofs early — each cheap, each de-risks a beta dependency." The PO chose to follow the proofs with a visible milestone, which makes this the last purely-technical slice for a while; it must retire the platform risk before the UI investment starts.

## Scope

- **In:** (1) a demo streaming route using `toServerSentEventsResponse()` driven under workerd via `wrangler dev`/the Cloudflare Vite plugin, with network-trace evidence; (2) a TanStack AI smoke: one `openRouterText` tool-call round trip behind the mocked-adapter harness by default and a live-tagged variant for the real key, plus a config-level adapter swap test proving the OpenAI-adapter-baseURL fallback substitutes without call-site changes; (3) a D1 spike: local D1 binding, better-auth ≥ 1.6.23 mounted on `createAPIFileRoute`, clients created per-request, secrets via `import { env } from 'cloudflare:workers'`.
- **Out:** real auth flows and schema (accounts-data-layer); quota/usage plumbing (ai-gateway); production deploy verification of streaming (AC-15's residual lives with roadmap-lesson-generation's first deploy).

## Acceptance Criteria

- Given the app running on the workerd runtime (`wrangler dev` or the Cloudflare Vite plugin dev server), When the demo streaming route is requested, Then SSE chunks arrive progressively over one connection (not buffered into a single flush), observable in the network trace.
  <!-- observable: true — progressive arrival is the user-experienceable behavior the whole lesson UX depends on; observed via network timing evidence -->
  verify: { method: playwright network trace (or curl with chunk timestamps) against the running route, env: wrangler dev / workerd locally — no install needed beyond foundation, fixture: demo route emitting timed chunks, rung: web-1 }
- Given the mocked TanStack AI adapter harness, When the tool-call smoke test runs, Then one complete tool-call round trip (model requests tool → app executes → model consumes result) validates against the expected schema; And given the live tag with `OPENROUTER_API_KEY` present, When the same smoke runs live, Then it passes against the real OpenRouter endpoint.
  <!-- observable: false — an adapter integration contract, fully provable by the tagged automated test; the live-tagged variant is the pre-registered residual clearance (key is a PO-provided secret, per shape §Verification Strategy) -->
- Given the adapter-swap config test, When the AI client is constructed with the OpenAI adapter + OpenRouter baseURL instead of the native adapter, Then all call sites compile and the mocked smoke passes unchanged.
  <!-- observable: false — a compile-and-test assertion proving the fallback is real, not aspirational -->
- Given `wrangler dev` with a local D1 binding, When the auth spike route is exercised, Then better-auth responds on its `createAPIFileRoute` mount, the D1 read/write round-trips, and no module-scope client leaks across requests.
  <!-- observable: false — an infrastructure integration proven by an automated test against the real local runtime (miniflare D1), per the backend ladder: real query path, not mocks -->

## Dependencies on Other Slices

- `foundation`: the scaffold, wrangler config, and test harnesses this slice drives.

## Risks

- The live OpenRouter smoke needs the PO's API key — if unavailable at implement time, the mocked proof lands and the live variant is the pre-registered residual (named in shape; not a new deferral).
- If tool calling on the native OpenRouter adapter is still broken, the fallback becomes the default — a config flip this slice explicitly proves cheap.
- If SSE under workerd genuinely fails, that is a shape-level event (streaming architecture rethink); surface immediately rather than working around it silently.
