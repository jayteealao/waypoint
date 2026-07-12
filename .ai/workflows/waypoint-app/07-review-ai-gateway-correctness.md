---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: ai-gateway
review-command: correctness
status: complete
updated-at: "2026-07-12T00:30:06Z"
metric-findings-total: 1
metric-findings-blocker: 0
metric-findings-high: 0
metric-findings-pre-existing: 0
metric-findings-resolved: 0
result: issues-found
fragment: none
tags: []
refs:
  review-master: 07-review-ai-gateway.md
---

# Review: correctness

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| AG-CR-1 | BLOCKER | High | fixed | false | 2026-07-12 | src/lib/ai/gateway.ts:262 | `at` column omitted from INSERT; D1 DEFAULT datetime('now') format breaks quota filter |
| AG-CR-2 | LOW | Med | deferred | false | 2026-07-12 | src/lib/ai/gateway.ts:187 | TOCTOU race in quota enforcement (check-then-act not atomic) |

## Detailed Findings

### AG-CR-1: usage_events INSERT date format breaks quota enforcement [BLOCKER]

**Location:** `src/lib/ai/gateway.ts:262–276`
**Source:** correctness

**Evidence:**
```typescript
await env.DB.prepare(
  `INSERT INTO usage_events (id, user_id, journey_id, model, type, prompt_tokens, completion_tokens, cost_usd, duration_ms, outcome)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'success')`,  // ← 'at' column missing
)
```
Schema DEFAULT: `at TEXT NOT NULL DEFAULT (datetime('now'))` → produces `'2026-07-12 00:24:51'`
Quota filter in quota.ts: `at >= '2026-07-12T00:00:00Z'` (ISO-8601 with T separator)
Comparison: `'2026-07-12 00:24:51' >= '2026-07-12T00:00:00Z'` → FALSE (space < T, ASCII 32 < 84)
Result: quota SUM always returns 0; the gate never rejects any user.

**Issue:** The quota enforcement mechanism is silently non-functional in production. Every LLM call passes the quota check because production-inserted usage rows are excluded from the daily window query due to the date format mismatch.

**Fix:** Include `at` explicitly in the INSERT as `new Date().toISOString()` to guarantee ISO-8601 format consistent with the quota filter bound.

**Severity:** BLOCKER | **Confidence:** High | **Pre-existing:** false
**Status:** fixed | **Surfaced:** 2026-07-12T00:28:12Z | **Last seen:** 2026-07-12T00:28:12Z | **Fixed:** 2026-07-12T00:30:06Z

### AG-CR-2: TOCTOU race in quota check-and-insert [LOW]

**Location:** `src/lib/ai/gateway.ts:187–276`
**Source:** correctness

**Evidence:**
```typescript
const quotaStatus = await checkQuota(env.DB, userId, type)  // read
if (!quotaStatus.allowed) throw new QuotaExhaustedError(quotaStatus)
// ... LLM call (async, may take seconds) ...
await env.DB.prepare('INSERT INTO usage_events ...').run()  // write
```

**Issue:** Between `checkQuota()` (read) and the usage INSERT (write), concurrent same-user requests can both pass the quota check if they run before either records usage. This is a classic TOCTOU race.

**Fix:** Make the check-and-insert atomic using D1 transactions. Deferred: D1 transaction support adds implementation complexity; at v1 scale with a single operator, the practical impact is minimal. The `sdlc-debt` upgrade path is D1 transactions when concurrent usage patterns emerge.

**Severity:** LOW | **Confidence:** Med | **Pre-existing:** false
**Status:** deferred | **Surfaced:** 2026-07-12T00:28:12Z | **Last seen:** 2026-07-12T00:28:12Z

## Summary

- Open findings: 1 (status: deferred, severity: LOW)
- Open blockers: 0 (fixed in review fix loop)
- Status: Issues Found
