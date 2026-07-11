---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: accounts-data-layer
review-command: code-simplification
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

# Review: code-simplification

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| CS-1 | NIT | High | open | false | 2026-07-11 | src/lib/auth-client.ts:17 | _baseURL uses private-variable naming convention on an active module-level constant |
| CS-2 | LOW | Med | deferred | false | 2026-07-11 | src/lib/auth-guard.ts:24 | requireAuth return asserted as any; type contract not enforced |

## Detailed Findings

### CS-1: _baseURL uses underscore prefix on an active constant [NIT]

**Location:** `src/lib/auth-client.ts:17`

**Evidence:**
```typescript
const _baseURL =
  typeof window !== 'undefined'
    ? `${window.location.origin}/api/auth`
    : `${process.env['VITE_APP_URL'] ?? 'http://localhost:3000'}/api/auth`
```

**Issue:** The underscore prefix conventionally signals a private or unused variable (ESLint `no-unused-vars` often ignores underscore-prefixed variables). This is an actively used module-level constant. The naming creates misleading intent for readers.

**Fix:** Rename to `baseURL` (no underscore).

**Severity:** NIT | **Confidence:** High | **Pre-existing:** false
**Status:** open | **Surfaced:** 2026-07-11T13:18:04Z | **Last seen:** 2026-07-11T13:18:04Z

---

### CS-2: requireAuth returns result as any [LOW]

**Location:** `src/lib/auth-guard.ts:24`

**Evidence:**
```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
return result as any
```

**Issue:** The function declares an explicit return type but casts to `any` before returning, bypassing TypeScript's check that the actual return shape matches the declared signature. If better-auth's `getSession` response changes shape (field added/removed/renamed), TypeScript won't catch the divergence at the `requireAuth` return site.

**Fix:** Import better-auth's `Session` and `User` types from `better-auth` and use them as the cast target:
```typescript
import type { Session, User } from 'better-auth'
return result as { session: Session; user: User }
```

**Triage:** DEFER — better-auth v1.6.23 does not cleanly export these types at the top level (they're internally derived); fix when upstream stabilizes its exported type surface (expected with v2 stable).

**Severity:** LOW | **Confidence:** Med | **Pre-existing:** false
**Status:** deferred | **Surfaced:** 2026-07-11T13:18:04Z | **Last seen:** 2026-07-11T13:18:04Z

## Summary

- Open findings: 2    (resolved this run: 0)
- Open blockers: 0    (pre-existing excluded; pre-existing findings: 0)
- Status: Issues Found
