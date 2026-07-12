---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: ai-gateway
review-command: code-simplification
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

# Review: code-simplification

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| AG-CS-1 | NIT | High | fixed | false | 2026-07-12 | src/lib/ai/gateway.ts:233 | @ts-ignore should be @ts-expect-error (self-policing) |

## Detailed Findings

### AG-CS-1: @ts-ignore should be @ts-expect-error [NIT]

**Location:** `src/lib/ai/gateway.ts:233`
**Source:** code-simplification

**Evidence:**
```typescript
// @ts-ignore — createOpenRouterText accepts a string model ID; the TS overloads
// enumerate the known model names but the list is non-exhaustive at runtime.
const adapter = createOpenRouterText(model, env.OPENROUTER_API_KEY)
```

**Issue:** `@ts-ignore` silently swallows the suppression even if the error stops occurring. `@ts-expect-error` is stricter: TypeScript errors if the suppressed error is no longer present, making the comment self-policing when the library updates its types.

**Fix:** Changed to `@ts-expect-error` — error IS still present (string not assignable to model literal union), so the directive is valid.

**Severity:** NIT | **Confidence:** High | **Pre-existing:** false
**Status:** fixed | **Surfaced:** 2026-07-12T00:28:12Z | **Last seen:** 2026-07-12T00:28:12Z | **Fixed:** 2026-07-12T00:30:06Z

## Summary

- Open findings: 0
- Open blockers: 0
- Status: Clean (finding fixed in review fix loop)
