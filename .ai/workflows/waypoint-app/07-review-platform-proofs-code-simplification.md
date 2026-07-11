---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: platform-proofs
review-command: code-simplification
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

# Review: code-simplification

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| CS-1 | NIT | High | fixed | false | 2026-07-11 | src/routes/api/auth/$.ts:12-21 | Duplicate GET/POST handler bodies — extract to shared handler |
| CS-2 | NIT | Med | deferred | false | 2026-07-11 | src/lib/ai-client.ts:1 | @ts-ignore is file-level; use @ts-expect-error for targeted suppression |

## Detailed Findings

### CS-1: Duplicate GET/POST handler bodies in auth route [NIT]

**Location:** `src/routes/api/auth/$.ts:12-21`

**Source:** code-simplification

**Evidence:**
```typescript
GET: ({ request }) => {
  const auth = createAuth(env['DB'])
  return auth.handler(request)
},
POST: ({ request }) => {
  const auth = createAuth(env['DB'])
  return auth.handler(request)
},
```

**Issue:** Both handler bodies are byte-for-byte identical. If the handler logic changes (e.g., adding logging, changing the DB binding), the developer must update two places.

**Fix:**
```typescript
const handleAuth = ({ request }: { request: Request }) => {
  const auth = createAuth(env['DB'])
  return auth.handler(request)
}
export const Route = createFileRoute('/api/auth/$')({
  server: { handlers: { GET: handleAuth, POST: handleAuth } },
})
```

**Severity:** NIT | **Confidence:** High | **Pre-existing:** false
**Status:** fixed | **Surfaced:** 2026-07-11T10:57:06Z | **Last seen:** 2026-07-11T10:57:06Z | **Fixed:** 2026-07-11T11:10:00Z (commit 824bc17)

---

### CS-2: @ts-ignore is file-level rather than targeted [NIT]

**Location:** `src/lib/ai-client.ts:1`

**Source:** code-simplification

**Evidence:**
```typescript
// @ts-ignore — @tanstack/ai is in beta; complex generic constraints bypassed with 'as any'
import { chat, toolDefinition } from '@tanstack/ai'
```

**Issue:** `@ts-ignore` suppresses all TypeScript errors on the next line. If a new import is added that has a genuine error, it would be silently ignored. `@ts-expect-error` is preferred because it produces a TS error if the suppression is no longer needed.

**Fix:** Replace `// @ts-ignore` with `// @ts-expect-error — @tanstack/ai beta generics`. Deferred: the beta package's type complexity makes this a moving target; upgrade path depends on the package reaching a stable API.

**Severity:** NIT | **Confidence:** Med | **Pre-existing:** false
**Status:** deferred | **Surfaced:** 2026-07-11T10:57:06Z | **Last seen:** 2026-07-11T10:57:06Z

## Summary

- Open findings: 1    (resolved this run: 0)
- Open blockers: 0    (pre-existing excluded; pre-existing findings: 0)
- Status: Issues Found
