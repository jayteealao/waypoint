---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: ai-gateway
review-command: testing
status: complete
updated-at: "2026-07-12T00:30:06Z"
metric-findings-total: 0
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

# Review: testing

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| AG-TS-1 | MED | High | fixed | false | 2026-07-12 | tests/smoke/ai-gateway.test.ts | No test for full fallback chain exhaustion (all models fail) |

## Detailed Findings

### AG-TS-1: Missing test for full fallback chain exhaustion [MED]

**Location:** `tests/smoke/ai-gateway.test.ts`
**Source:** testing

**Evidence:**
The test file had a test for "fallback chain: tries primary then fallback on error" which mocks the primary model to throw and the fallback to succeed. No test exercised the scenario where ALL models in the chain fail — verifying that the final error propagates correctly and that the right number of adapter calls were made.

**Issue:** The code path at `gateway.ts:310–326` (all-models-exhausted path) was untested. A regression in error propagation or adapter call count would be invisible to the test suite.

**Fix:** Added test `fallback chain: throws when all models fail` — mocks all `chat()` calls to throw; asserts `callGateway` rejects, and that `createOpenRouterText` was called exactly `1 + fallbackChain.length` times.

**Severity:** MED | **Confidence:** High | **Pre-existing:** false
**Status:** fixed | **Surfaced:** 2026-07-12T00:28:12Z | **Last seen:** 2026-07-12T00:28:12Z | **Fixed:** 2026-07-12T00:30:06Z

## Summary

- Open findings: 0
- Open blockers: 0
- Status: Clean (finding fixed in review fix loop)
