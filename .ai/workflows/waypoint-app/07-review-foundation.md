---
schema: sdlc/v1
type: review
slug: waypoint-app
review-scope: per-slice
slice-slug: foundation
status: complete
stage-number: 7
created-at: "2026-07-11T08:58:15Z"
updated-at: "2026-07-11T08:58:15Z"
verdict: ship
commands-run:
  - correctness
  - security
  - code-simplification
  - testing
  - supply-chain
  - ci
  - maintainability
  - reliability
  - docs
metric-commands-run: 9
metric-findings-total: 3
metric-findings-raw: 3
metric-findings-blocker: 0
metric-findings-high: 0
metric-findings-med: 0
metric-findings-low: 2
metric-findings-nit: 1
metric-findings-resolved: 1
runs:
  - at: "2026-07-11T08:58:15Z"
    dimensions:
      - correctness
      - security
      - code-simplification
      - testing
      - supply-chain
      - ci
      - maintainability
      - reliability
      - docs
    verdict: ship
    fix-commit: "7c7d048"
tags: [review, foundation, tanstack, cloudflare-workers]
refs:
  plan: 04-plan-foundation.md
  implement: 05-implement-foundation.md
  verify: 06-verify-foundation.md
  dimension-correctness: 07-review-foundation-correctness.md
  dimension-security: 07-review-foundation-security.md
  dimension-code-simplification: 07-review-foundation-code-simplification.md
  dimension-testing: 07-review-foundation-testing.md
  dimension-supply-chain: 07-review-foundation-supply-chain.md
  dimension-ci: 07-review-foundation-ci.md
  dimension-maintainability: 07-review-foundation-maintainability.md
  dimension-reliability: 07-review-foundation-reliability.md
  dimension-docs: 07-review-foundation-docs.md
next-command: wf-handoff
next-invocation: "/wf handoff waypoint-app"
---

# Review — foundation slice

**Verdict: SHIP**  
**Date:** 2026-07-11 | **Dimensions:** 9 | **Findings:** 3 total (0 blocker, 0 high, 0 med, 2 low, 1 nit)

---

## Executive Summary

The foundation slice is a greenfield TanStack Start + Cloudflare Workers bootstrap. All 32 net-new product source files were reviewed across 9 dimensions. The slice delivers its 4 acceptance criteria cleanly: dev server works, all 30 deps are exact-pinned and audit-clean, both test harnesses pass, and CI has all required gates.

**Verdict: SHIP** — no blockers, no high-severity findings. Two LOW findings deferred as out-of-scope for this slice; one NIT fixed in-session.

---

## Fix Loop Summary

| ID | Sev | Status | Action |
|----|-----|--------|--------|
| CI-1 | NIT | **Fixed** | Added `permissions: contents: read` to `.github/workflows/ci.yml` |

**Fix commit:** `7c7d048`

---

## Open Findings (Deferred)

| ID | Sev | Dimension | Issue | Decision |
|----|-----|-----------|-------|----------|
| CORR-1 | LOW | correctness | `wrangler.jsonc` missing `assets` config for static file serving | DEFER — out of scope for foundation ACs; address in platform-proofs slice |
| SC-1 | LOW | supply-chain | GitHub Actions use version tags not SHA digests | DEFER — all 3 are official trusted actions; address before first production merge |

---

## Dimension Results

| Dimension | Result | Findings |
|-----------|--------|----------|
| Correctness | Issues Found | 1 LOW (deferred) |
| Security | Clean | — |
| Code Simplification | Clean | — |
| Testing | Clean | — |
| Supply Chain | Issues Found | 1 LOW (deferred) |
| CI | Issues Found (fixed) | 1 NIT (fixed) |
| Maintainability | Clean | — |
| Reliability | Clean | — |
| Docs | Clean | — |

---

## Pre-existing Debt

None — all files are net-new (greenfield). `pre-existing: false` for all findings.

---

## Acceptance Criteria Gate

Per `03-slice-foundation.md`:

| AC | Description | Gate |
|----|-------------|------|
| AC-F1 | Dev server serves a page | PASS (verified stage 6) |
| AC-F2 | Exact-pinned deps, no banned versions, pnpm audit clean | PASS |
| AC-F3 | Vitest + Playwright smoke tests pass | PASS |
| AC-F4 | CI gates on push (proxy+deferral) | PASS (proxy + deferral pre-authorized) |

All 4 ACs met. No review finding changes AC status.

---

## Deferred Finding Details

### CORR-1 — `wrangler.jsonc` missing `assets` config

`wrangler.jsonc` uses `main: "@tanstack/react-start/server-entry"` (canonical scaffold) but omits the `assets` directory field needed for Cloudflare Workers to serve static JS/CSS bundles. Without it, `wrangler deploy` produces a Worker that cannot serve static assets.

**Why deferred:** Foundation slice ACs cover `pnpm dev`, not `wrangler deploy`. The platform-proofs slice is where Cloudflare deployment is validated. The correct `assets` path depends on the Vite build output structure, which should be confirmed via `pnpm build` during platform-proofs.

**Address by:** platform-proofs slice, before `wrangler dev` validation.

### SC-1 — GitHub Actions version tags

Lines 14, 17, 22 of `.github/workflows/ci.yml` use `@v4` tags for `actions/checkout`, `pnpm/action-setup`, and `actions/setup-node`. Version tags are mutable. However, all three actions are maintained by official organizations (GitHub Inc. and the pnpm team), making the practical risk extremely low.

**Why deferred:** SHA lookup requires network access unavailable during this review session. The fix is straightforward: run `gh api /repos/{owner}/{repo}/git/ref/refs/tags/v4` for each action and pin to the returned SHA.

**Address by:** first PR to main.
