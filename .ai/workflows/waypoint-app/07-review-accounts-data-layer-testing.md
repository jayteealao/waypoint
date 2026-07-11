---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: accounts-data-layer
review-command: testing
status: complete
updated-at: "2026-07-11T13:18:04Z"
metric-findings-total: 2
metric-findings-blocker: 0
metric-findings-high: 0
metric-findings-pre-existing: 0
metric-findings-resolved: 0
result: issues-found
tags: []
refs:
  review-master: 07-review-accounts-data-layer.md
---

# Review: testing

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| TS-1 | LOW | High | open | false | 2026-07-11 | tests/e2e/auth-flow.spec.ts:57 | seedUser SQL string interpolation unsafe for non-literal inputs |
| TS-2 | LOW | High | deferred | false | 2026-07-11 | tests/smoke/auth-guard.test.ts:1 | requireAuth function has no unit test coverage |

## Detailed Findings

### TS-1: seedUser SQL string interpolation without escaping [LOW]

**Location:** `tests/e2e/auth-flow.spec.ts:57-58`

**Evidence:**
```typescript
const userSql = `INSERT OR REPLACE INTO user (id, name, email, emailVerified, image, createdAt, updatedAt) VALUES ('${userId}', '${name}', '${email}', 1, NULL, '${createdAt}', '${createdAt}');`
```

**Issue:** The `seedUser` helper function accepts `userId`, `name`, `email`, and `sessionToken` as parameters and interpolates them directly into SQL strings without escaping. The current callers pass hardcoded safe strings, but the function's signature allows any string. A name like `O'Reilly` would produce invalid SQL. Additionally, the SQL string passes through shell interpolation via `execSync` with `--command`, multiplying the injection surface.

**Fix:** Escape single quotes in all interpolated values before SQL interpolation:
```typescript
const esc = (s: string) => s.replace(/'/g, "''")
const userSql = `INSERT OR REPLACE INTO user ... VALUES ('${esc(userId)}', '${esc(name)}', '${esc(email)}', ...)`
```
Alternatively, write the SQL to a temp file and use `wrangler d1 execute --local --file=<path>` to avoid shell escaping entirely.

**Severity:** LOW | **Confidence:** High | **Pre-existing:** false
**Status:** open | **Surfaced:** 2026-07-11T13:18:04Z | **Last seen:** 2026-07-11T13:18:04Z

---

### TS-2: requireAuth has no unit test [LOW]

**Location:** `tests/smoke/auth-guard.test.ts:1`

**Evidence:**
```typescript
// The file tests requireOwnership only.
// The plan stated it would also test the 401 shape from a mock requireAuth.
// That test case is not present in the implemented file.
```

**Issue:** `requireAuth` (the async function that calls `createAuth(env).api.getSession()`) has no unit-level test. The plan stated a mock-based 401 shape test would be included. Without it, the only coverage for `requireAuth` is the E2E Playwright tests, which currently skip due to the missing `BETTER_AUTH_SECRET`. If `requireAuth` is refactored, TypeScript alone won't catch behavioral regressions.

**Fix:** Add a Vitest test that mocks `createAuth` to return `{ api: { getSession: vi.fn().mockResolvedValue(null) } }` and asserts that `requireAuth` throws a `Response` with status 401.

**Triage:** DEFER — adding requires `vi.mock('#/lib/auth')` and module-level mocking setup that adds non-trivial test complexity; acceptable given E2E coverage will close the gap when `BETTER_AUTH_SECRET` is present.

**Severity:** LOW | **Confidence:** High | **Pre-existing:** false
**Status:** deferred | **Surfaced:** 2026-07-11T13:18:04Z | **Last seen:** 2026-07-11T13:18:04Z

## Summary

- Open findings: 2    (resolved this run: 0)
- Open blockers: 0    (pre-existing excluded; pre-existing findings: 0)
- Status: Issues Found
