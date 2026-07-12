---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: ai-gateway
review-command: reliability
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

# Review: reliability

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| AG-CR-3 | LOW | Low | deferred | false | 2026-07-12 | src/lib/ai/gateway.ts:310 | Failed calls don't insert usage row; partial token costs go untracked |

## Detailed Findings

### AG-CR-3: No usage row recorded on complete fallback chain failure [LOW]

**Location:** `src/lib/ai/gateway.ts:310–327`

**Issue:** When all models in the fallback chain fail, the gateway emits a `generation.completed` log with `outcome: 'failure'` but does not insert a D1 usage row. If any model in the chain consumed tokens before the failure response arrived, those costs are not attributed to the user.

**Fix:** Insert a failure usage row (`cost_usd=0, outcome='failure'`) on chain exhaustion. **Deferred:** at v1 scale with a single operator and low call volume, the cost of untracked failure tokens is minimal. The `generation.completed` log with `outcome: 'failure'` provides observability for the operator.

**Severity:** LOW | **Confidence:** Low | **Pre-existing:** false
**Status:** deferred | **Surfaced:** 2026-07-12T00:28:12Z

## Summary

- Open findings: 1 (deferred, LOW)
- Open blockers: 0
- Status: Issues Found
