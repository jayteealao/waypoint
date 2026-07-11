---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: accounts-data-layer
review-command: correctness
status: complete
updated-at: "2026-07-11T13:18:04Z"
metric-findings-total: 1
metric-findings-blocker: 0
metric-findings-high: 0
metric-findings-pre-existing: 0
metric-findings-resolved: 0
result: issues-found
tags: []
refs:
  review-master: 07-review-accounts-data-layer.md
---

# Review: correctness

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| CR-1 | MED | High | open | false | 2026-07-11 | src/lib/store/journeys.ts:50 | catch() swallows all errors as auth errors; D1/network failures produce silent empty collection |

## Detailed Findings

### CR-1: Sync error catch swallows non-auth errors silently [MED]

**Location:** `src/lib/store/journeys.ts:50-54`

**Evidence:**
```typescript
.catch(() => {
  // Auth errors (401/403): mark ready so the collection unblocks;
  // the collection will be empty and the component handles the empty state.
  markReady()
})
```

**Issue:** The comment says "Auth errors (401/403)" but the catch handler catches ALL errors from `listJourneys()`. If D1 is unavailable, a network error occurs, or any other non-auth failure happens, the collection silently returns empty. The user sees an empty journeys list with no indication of failure, and the error is lost from both developer tools and Workers observability (Logpush).

**Fix:** Distinguish between expected auth errors (401/403 Response objects) and unexpected errors. For auth errors: call `markReady()` silently. For other errors: log to `console.error` (which routes to Cloudflare Logpush via `observability: { enabled: true }`) and then call `markReady()`:

```typescript
.catch((err: unknown) => {
  if (err instanceof Response && (err.status === 401 || err.status === 403)) {
    // Expected: unauthenticated or unauthorized — empty collection is correct
  } else {
    console.error('[journeys-collection] unexpected sync error:', err)
  }
  markReady()
})
```

**Severity:** MED | **Confidence:** High | **Pre-existing:** false
**Status:** open | **Surfaced:** 2026-07-11T13:18:04Z | **Last seen:** 2026-07-11T13:18:04Z

## Summary

- Open findings: 1    (resolved this run: 0)
- Open blockers: 0    (pre-existing excluded; pre-existing findings: 0)
- Status: Issues Found
