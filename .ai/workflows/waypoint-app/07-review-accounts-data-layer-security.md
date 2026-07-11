---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: accounts-data-layer
review-command: security
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

# Review: security

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| SEC-1 | LOW | Med | deferred | false | 2026-07-11 | src/lib/auth.ts:24 | trustedOrigins always includes localhost dev URLs even in production |

## Detailed Findings

### SEC-1: trustedOrigins hardcodes localhost in all environments [LOW]

**Location:** `src/lib/auth.ts:24-27`

**Evidence:**
```typescript
trustedOrigins: [
  'http://localhost:3000',
  'http://localhost:8787',
  ...(env.BETTER_AUTH_BASE_URL ? [env.BETTER_AUTH_BASE_URL] : []),
],
```

**Issue:** The localhost origins are always included regardless of deployment environment. In a production Workers deployment, these localhost URLs are in the trust list. The practical security risk is low (Workers never make localhost HTTP connections), but it is an attack surface if better-auth's CSRF/origin checks were bypassed via a crafted request in a hypothetical same-machine scenario.

**Fix:** Guard localhost origins behind an environment check:
```typescript
trustedOrigins: [
  ...(env.DEPLOYMENT_ENV === 'production' ? [] : [
    'http://localhost:3000',
    'http://localhost:8787',
  ]),
  ...(env.BETTER_AUTH_BASE_URL ? [env.BETTER_AUTH_BASE_URL] : []),
],
```

**Triage:** DEFER — risk is minimal in Workers context; production hardening deferred to a future security pass when DEPLOYMENT_ENV is part of the env config.

**Severity:** LOW | **Confidence:** Med | **Pre-existing:** false
**Status:** deferred | **Surfaced:** 2026-07-11T13:18:04Z | **Last seen:** 2026-07-11T13:18:04Z

## Summary

- Open findings: 1    (resolved this run: 0)
- Open blockers: 0    (pre-existing excluded; pre-existing findings: 1 — SEC-1 deferred)
- Status: Issues Found (deferred only)
