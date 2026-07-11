---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: platform-proofs
review-command: correctness
status: complete
updated-at: "2026-07-11T10:57:06Z"
metric-findings-total: 0
metric-findings-blocker: 0
metric-findings-high: 0
metric-findings-pre-existing: 0
metric-findings-resolved: 0
result: clean
fragment: none
tags: []
refs:
  review-master: 07-review-platform-proofs.md
---

# Review: correctness

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| CR-1 | LOW | High | fixed | false | 2026-07-11 | tests/e2e/d1-auth-spike.wrangler.spec.ts:28 | Test name/comment says "sequential requests" but uses Promise.all (concurrent) |

## Detailed Findings

### CR-1: Misleading "sequential" label on concurrent test [LOW]

**Location:** `tests/e2e/d1-auth-spike.wrangler.spec.ts:22-47`

**Source:** correctness

**Evidence:**
```typescript
test('no module-scope client leak across sequential requests (AC-PP4b)', async ({
  request,
}) => {
  // Two independent requests to the session endpoint.
  // If better-auth used module-scope state, the second request might see
  // stale D1 client state from request 1 and crash or return an error.
  const [r1, r2] = await Promise.all([
    request.get(AUTH_SESSION_URL),
    request.get(AUTH_SESSION_URL),
  ])
```

**Issue:** The test name and inline comment both describe "sequential requests," but `Promise.all` fires both requests concurrently. While concurrent isolation is actually a *stronger* proof than sequential isolation (it catches races that sequential tests would miss), the misleading label could cause a future maintainer to believe the test proves request ordering, then add ordering-dependent assumptions.

**Fix:** Rename the test to `'no module-scope client leak across concurrent requests (AC-PP4b)'` and update the comment to say "two concurrent requests." The proof is unchanged — and improved by accurately describing what is actually being tested.

**Severity:** LOW | **Confidence:** High | **Pre-existing:** false
**Status:** fixed | **Surfaced:** 2026-07-11T10:57:06Z | **Last seen:** 2026-07-11T10:57:06Z | **Fixed:** 2026-07-11T11:10:00Z (commit 824bc17)

---

*Note: Also reviewed `demo-stream.ts` ReadableStream `start()` — async errors from `controller.enqueue()` on client disconnect would produce an unhandled rejection in the Workers runtime. This is LOW severity and deferred as a known spike limitation; the demo route is not production-hardened by design. No additional finding created since it is recorded in the implement record under Known Risks / Caveats.*

## Summary

- Open findings: 1    (resolved this run: 0)
- Open blockers: 0    (pre-existing excluded; pre-existing findings: 0)
- Status: Issues Found
