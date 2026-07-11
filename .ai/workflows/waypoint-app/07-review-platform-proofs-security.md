---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: platform-proofs
review-command: security
status: complete
updated-at: "2026-07-11T10:57:06Z"
metric-findings-total: 1
metric-findings-blocker: 0
metric-findings-high: 0
metric-findings-pre-existing: 0
metric-findings-resolved: 0
result: issues-found
fragment: none
tags: []
refs:
  review-master: 07-review-platform-proofs.md
---

# Review: security

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| SEC-1 | LOW | High | deferred | false | 2026-07-11 | src/lib/auth.ts:24 | Hardcoded fallback secret used if BETTER_AUTH_SECRET env var unset |

## Detailed Findings

### SEC-1: Hardcoded weak auth secret fallback [LOW]

**Location:** `src/lib/auth.ts:24`

**Source:** security

**Evidence:**
```typescript
secret: (process.env['BETTER_AUTH_SECRET'] as string | undefined) ?? 'dev-secret-replace-in-prod',
```

**Issue:** If `BETTER_AUTH_SECRET` is not set in the deployment environment, better-auth falls back to signing all session tokens with the well-known string `'dev-secret-replace-in-prod'`. An attacker who knows this default value could forge valid session cookies. better-auth emits a runtime warning about short secrets (< 32 chars), but the warning is logged — not enforced.

**Fix:** Add an environment guard before the betterAuth() call:
```typescript
if (!process.env['BETTER_AUTH_SECRET'] && process.env['NODE_ENV'] !== 'development') {
  throw new Error('BETTER_AUTH_SECRET must be set in non-development environments.')
}
```
Deferred to accounts-data-layer slice which configures production secrets, OAuth providers, and a proper `.env` with BETTER_AUTH_SECRET required.

**Severity:** LOW | **Confidence:** High | **Pre-existing:** false
**Status:** deferred | **Surfaced:** 2026-07-11T10:57:06Z | **Last seen:** 2026-07-11T10:57:06Z

---

*Other security checks: API key handling clean — keys passed as function arguments from env vars, never hardcoded. No hardcoded credentials found in diff. No CORS misconfiguration (API-only routes). No SQL injection surface — D1 is accessed through better-auth's internal Kysely dialect with parameterized queries. No CSRF issues (auth handler is managed by better-auth). Secret scan of diff: no API tokens, keys, or passwords in committed code. pnpm audit clean (per verify record).*

## Summary

- Open findings: 1    (resolved this run: 0)
- Open blockers: 0    (pre-existing excluded; pre-existing findings: 0)
- Status: Issues Found
