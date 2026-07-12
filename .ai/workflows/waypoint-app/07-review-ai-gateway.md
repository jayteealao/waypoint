---
schema: sdlc/v1
type: review
slug: waypoint-app
review-scope: per-slice
slice-slug: ai-gateway
status: complete
stage-number: 7
created-at: "2026-07-12T00:28:12Z"
updated-at: "2026-07-12T00:30:06Z"
verdict: ship
commands-run: [correctness, security, code-simplification, testing, maintainability, reliability, backend-concurrency, performance, data-integrity, privacy, api-contracts, cost, observability]
metric-commands-run: 13
metric-findings-total: 2
metric-findings-raw: 5
metric-findings-blocker: 0
metric-findings-pre-existing: 0
metric-findings-high: 0
metric-findings-med: 0
metric-findings-low: 2
metric-findings-nit: 0
metric-findings-resolved: 0
metric-findings-total-ever: 5
runs:
  - at: "2026-07-12T00:28:12Z"
    dimensions: [correctness, security, code-simplification, testing, maintainability, reliability, backend-concurrency, performance, data-integrity, privacy, api-contracts, cost, observability]
    verdict: ship
    fix-commit: "3af3ad7"
tags: [ai-gateway, quotas, model-tiering, fallback, instrumentation, cost-attribution]
refs:
  index: 00-index.md
  slice-def: 03-slice-ai-gateway.md
  implement: 05-implement-ai-gateway.md
  verify: 06-verify-ai-gateway.md
  sub-reviews:
    - 07-review-ai-gateway-correctness.md
    - 07-review-ai-gateway-security.md
    - 07-review-ai-gateway-code-simplification.md
    - 07-review-ai-gateway-testing.md
    - 07-review-ai-gateway-maintainability.md
    - 07-review-ai-gateway-reliability.md
    - 07-review-ai-gateway-backend-concurrency.md
    - 07-review-ai-gateway-performance.md
    - 07-review-ai-gateway-data-integrity.md
    - 07-review-ai-gateway-privacy.md
    - 07-review-ai-gateway-api-contracts.md
    - 07-review-ai-gateway-cost.md
    - 07-review-ai-gateway-observability.md
next-command: wf-handoff
next-invocation: "/wf handoff waypoint-app"
---

# Review: AI Gateway, Quotas & Instrumentation

## The Review

Five findings surfaced across 13 review dimensions; three were fixed in the same review pass and two deferred. The one that mattered most was a silent correctness failure at the heart of the slice's primary purpose: quota enforcement. The `usage_events` INSERT omitted the `at` column, causing Cloudflare D1's `DEFAULT (datetime('now'))` to store timestamps in `'YYYY-MM-DD HH:MM:SS'` format. The quota check filters `at >= 'YYYY-MM-DDTHH:MM:SSZ'` — and because a space character sorts before the letter T in ASCII, every production-inserted row fell lexicographically before the daily window start. The SUM always returned zero; the quota gate never fired. Fixed in commit 3af3ad7 by explicitly binding `new Date().toISOString()` to the `at` column, bringing storage and filter format into agreement.

The E2E tests passed through this bug because the test-seeding helper explicitly constructs ISO-8601 `at` values (the seed SQL uses `slice(0,10) + 'T00:01:00Z'`), while the gateway's production INSERT relied on D1's native default. Unit tests mock D1 entirely, so neither test layer could catch the format divergence. This is the canonical example of why review exists alongside testing.

Two other findings were fixed in the same commit: a missing Vitest test for the full fallback-chain-exhaustion path (all models fail), and a `@ts-ignore` that should have been the self-policing `@ts-expect-error`. Two LOW findings are deferred as appropriate at v1 scale: the TOCTOU quota race (concurrent requests could both pass before either writes usage) and the absence of a failure usage row when the full chain exhausts. Security, privacy, observability, performance, and API contract dimensions are all clean.

## Verdict

**Ship**

The one BLOCKER — silent quota bypass due to date format mismatch — is fixed. No open BLOCKER, HIGH, or MED findings remain. Two LOW findings are deferred as explicitly acceptable at v1 with a single operator and low call volume. All thirteen review dimensions cover this slice; eleven pass clean. The instrumentation augmentation is fully honored: all five signals are present and correctly structured.

## Domain Coverage

| Domain | Command | Status |
|--------|---------|--------|
| Logic & invariants | `correctness` | 1 LOW open (deferred) |
| Security | `security` | Clean |
| Complexity | `code-simplification` | Clean |
| Test coverage | `testing` | Clean |
| Readability | `maintainability` | Clean |
| Error handling | `reliability` | 1 LOW open (deferred) |
| Async behavior | `backend-concurrency` | Clean |
| Query efficiency | `performance` | Clean |
| D1 writes | `data-integrity` | Clean |
| PII & logging | `privacy` | Clean |
| API surface | `api-contracts` | Clean |
| Cloud spend | `cost` | Clean |
| Signals & logging | `observability` | Clean |

## All Findings

| ID | Sev | Conf | Status | Pre | Surfaced | Source | File:Line | Issue |
|----|-----|------|--------|-----|----------|--------|-----------|-------|
| AG-CR-1 | BLOCKER | High | fixed | false | 2026-07-12 | correctness | src/lib/ai/gateway.ts:262 | `at` column omitted; D1 DEFAULT format breaks quota filter |
| AG-TS-1 | MED | High | fixed | false | 2026-07-12 | testing | tests/smoke/ai-gateway.test.ts | No test for full fallback chain exhaustion |
| AG-CS-1 | NIT | High | fixed | false | 2026-07-12 | code-simplification | src/lib/ai/gateway.ts:233 | @ts-ignore should be @ts-expect-error |
| AG-CR-2 | LOW | Med | deferred | false | 2026-07-12 | correctness | src/lib/ai/gateway.ts:187 | TOCTOU race in quota enforcement |
| AG-CR-3 | LOW | Low | deferred | false | 2026-07-12 | reliability | src/lib/ai/gateway.ts:310 | Failed calls don't insert usage row |

**Open:** BLOCKER: 0 | HIGH: 0 | MED: 0 | LOW: 2 | NIT: 0   **Pre-existing:** 0
**Closed:** resolved: 0 | fixed: 3 | dismissed: 0   **Ledger size (ever):** 5
*(This run: 5 net-new, 0 re-confirmed, 0 resolved; fix loop patched 3 of 3; 2 open deferred)*

## Findings (Detailed)

### AG-CR-1: usage_events INSERT date format breaks quota enforcement [BLOCKER]

**Location:** `src/lib/ai/gateway.ts:262–276`
**Source:** correctness

**Evidence:**
```typescript
// Before fix: INSERT omitted 'at' column → D1 DEFAULT datetime('now') produces
// '2026-07-12 00:24:51' (space separator, no Z)
// Quota filter: at >= '2026-07-12T00:00:00Z' (ISO-8601, T separator)
// String comparison: ' ' (32) < 'T' (84) → all rows appear before window start
// SUM always returns 0 → quota gate never rejects
```

**Issue:** Production quota enforcement was silently non-functional. The `at` column default format from D1's SQLite `datetime('now')` is `'YYYY-MM-DD HH:MM:SS'`, which lexicographically sorts before the quota check bound `'YYYY-MM-DDTHH:MM:SSZ'` in every case. E2E tests passed because the test seeding helper explicitly constructs ISO-8601 `at` values.

**Fix:** `INSERT INTO usage_events (..., at) VALUES (..., ?)` with `new Date().toISOString()` bound, ensuring format consistency with the quota filter.

**Severity:** BLOCKER | **Confidence:** High | **Pre-existing:** false
**Status:** fixed | **Surfaced:** 2026-07-12T00:28:12Z | **Last seen:** 2026-07-12T00:28:12Z | **Fixed:** 2026-07-12T00:30:06Z

---

### AG-TS-1: Missing test for full fallback chain exhaustion [MED]

**Location:** `tests/smoke/ai-gateway.test.ts`
**Source:** testing

**Evidence:** The file had a test for the primary-fails-then-fallback-succeeds path but no test where ALL models in the chain fail.

**Issue:** The gateway code at lines 310–326 handles the all-models-exhausted case (error log + rethrow), but this path was not tested. A regression here would be silent.

**Fix:** Added test `fallback chain: throws when all models fail` — asserts rejection and exact adapter call count.

**Severity:** MED | **Confidence:** High | **Pre-existing:** false
**Status:** fixed | **Surfaced:** 2026-07-12T00:28:12Z | **Fixed:** 2026-07-12T00:30:06Z

---

### AG-CS-1: @ts-ignore should be @ts-expect-error [NIT]

**Location:** `src/lib/ai/gateway.ts:233`
**Source:** code-simplification

**Issue:** `@ts-ignore` silently swallows suppression even if the error stops occurring. `@ts-expect-error` errors when the suppression becomes unnecessary.

**Fix:** Changed to `@ts-expect-error` — the TS error IS still present (string not assignable to model literal union), so the directive is valid now.

**Severity:** NIT | **Confidence:** High | **Pre-existing:** false
**Status:** fixed | **Surfaced:** 2026-07-12T00:28:12Z | **Fixed:** 2026-07-12T00:30:06Z

---

### AG-CR-2: TOCTOU race in quota enforcement [LOW]

**Location:** `src/lib/ai/gateway.ts:187`
**Source:** correctness

**Issue:** The `checkQuota()` read and D1 usage INSERT are not atomic. Concurrent same-user requests can both pass the quota gate before either write is committed.

**Fix:** D1 transactions for atomic check-and-insert.

**Severity:** LOW | **Confidence:** Med | **Pre-existing:** false
**Status:** deferred | **Surfaced:** 2026-07-12T00:28:12Z | **Last seen:** 2026-07-12T00:28:12Z

---

### AG-CR-3: No usage row on full chain failure [LOW]

**Location:** `src/lib/ai/gateway.ts:310`
**Source:** reliability

**Issue:** When all models fail, no D1 row is written. Token costs consumed before the last error are untracked. The `generation.completed` log (outcome: 'failure') provides observability but no DB audit trail.

**Fix:** Insert a failure row (cost_usd=0, outcome='failure') on chain exhaustion.

**Severity:** LOW | **Confidence:** Low | **Pre-existing:** false
**Status:** deferred | **Surfaced:** 2026-07-12T00:28:12Z | **Last seen:** 2026-07-12T00:28:12Z

## Soft Findings

From `06-verify-ai-gateway.md § Friction Notes`:
- Playwright click timing on SSR-hydrated TanStack Start pages: React 19 defers hydration; the `data-hydrated` useEffect pattern (introduced by the verify's cross-slice fix) is the recommended guard for E2E tests on interactive components.
- SQLITE_BUSY on concurrent local D1 writes: resolved by `playwright.config.ts workers: 1`. Future test additions should maintain serial mode.

## Pre-existing Debt

No pre-existing findings (all findings surfaced on code added by this diff).

## Triage Decisions

| ID | Sev | Source | Decision | Notes |
|----|-----|--------|----------|-------|
| AG-CR-1 | BLOCKER | correctness | fix | Auto-selected (BLOCKER → always fix) |
| AG-TS-1 | MED | testing | fix | Auto-selected (MED → always fix, no defer option) |
| AG-CS-1 | NIT | code-simplification | fix | In-scope, localized, safe (self-policing TS directive upgrade) |
| AG-CR-2 | LOW | correctness | defer | D1 transactions add complexity; acceptable at v1 scale (PO is sole operator) |
| AG-CR-3 | LOW | reliability | defer | Minimal practical impact at v1 scale; generation.completed log provides observability |

## Fix Status

| ID | Sev | Source | Status | Fixed-at | Commit | Notes |
|----|-----|--------|--------|----------|--------|-------|
| AG-CR-1 | BLOCKER | correctness | fixed | 2026-07-12T00:30:06Z | 3af3ad7 | Added explicit `at = new Date().toISOString()` to usage_events INSERT |
| AG-TS-1 | MED | testing | fixed | 2026-07-12T00:30:06Z | 3af3ad7 | Added `fallback chain: throws when all models fail` Vitest test |
| AG-CS-1 | NIT | code-simplification | fixed | 2026-07-12T00:30:06Z | 3af3ad7 | Changed @ts-ignore to @ts-expect-error on createOpenRouterText call |

## Recommendations

### Deferred

- **AG-CR-2** (LOW) — TOCTOU race in quota enforcement. Re-triage via `/wf intake refactor` when concurrent usage patterns emerge or per-user limits are needed. Fix: D1 transactions.
- **AG-CR-3** (LOW) — No failure usage row on chain exhaustion. Re-triage via `/wf intake fix` before operator cost dashboard is built. Fix: insert `outcome='failure'` row at lines 310–326.

### Consider (LOW/NIT — not triaged)

No additional LOW/NIT findings.

## Recommended Next Stage

- **Option A (recommended):** `/wf handoff waypoint-app` — verdict `ship`; no OPEN blockers; the ai-gateway slice is the last slice with an implement + verify record in `00-index.md`. Handoff aggregates all complete slices for the PR description. All prior slices (foundation through sample-journey) have `verdict: ship` or `verdict: ship-with-caveats` with no OPEN blockers; the ai-gateway review completes the pre-handoff review coverage.
- **Option D:** `/wf plan waypoint-app tutor-interview` — plan the next generation-consuming slice; `callGateway()` is now the stable foundation for it. Handoff can follow once all desired slices are complete.
