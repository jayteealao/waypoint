---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: lesson-renderer
review-command: reliability
status: complete
updated-at: "2026-07-11T20:02:45Z"
metric-findings-total: 1
metric-findings-blocker: 0
metric-findings-high: 0
metric-findings-pre-existing: 0
metric-findings-resolved: 0
result: issues-found
tags: []
refs:
  review-master: 07-review-lesson-renderer.md
---

# Review: reliability

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| REL-1 | LOW | Med | open | false | 2026-07-11T20:02:45Z | src/server/lessons.ts:41 | D1 query has no error handling — DB errors are indistinguishable from not-found |

## Detailed Findings

### REL-1: getLesson missing D1 error handling [LOW]

**Location:** `src/server/lessons.ts:41`
**Source:** reliability

**Evidence:**
```typescript
.handler(async ({ data: lessonId }): Promise<Lesson | null> => {
  const row = await env.DB.prepare('SELECT * FROM lessons WHERE id = ?')
    .bind(lessonId)
    .first<Lesson>()
  if (!row) return null
  return row
})
```

**Issue:** `env.DB.prepare().first()` can throw D1 errors (connection failures, query binding errors, D1 service unavailability). These exceptions propagate unhandled through `createServerFn`, where TanStack Start converts them to opaque 500 responses. Callers cannot distinguish "lesson doesn't exist" (null) from "database is unavailable" (exception). The D1 binding is also not checked for existence before use.

**Fix:** Wrap the D1 call in try/catch. Options:
1. Re-throw as a typed error (`throw new Error('DB_ERROR: could not fetch lesson')`) that callers can inspect
2. Return null and log the error (`console.error('[lessons] D1 error:', err)`) — callers treat DB errors same as not-found
3. Return a structured result `{ data: Lesson | null; error?: string }` for finer caller control

For this slice, option 2 is the minimal safe fix (consistent with the existing `journeys.ts` pattern).

**Severity:** LOW | **Confidence:** Med | **Pre-existing:** false
**Status:** open | **Surfaced:** 2026-07-11T20:02:45Z | **Last seen:** 2026-07-11T20:02:45Z

## Summary
- Open findings: 1 (resolved this run: 0)
- Open blockers: 0 (pre-existing: 0)
- Status: Issues Found

## Clean areas
- `sanitizerReady` fail-safe: if DOMPurify dynamic import fails, `_purify` stays null and `escapeHtml` is used — correct fail-open behavior
- `useSimulatedStream` cleanup: `return () => clearInterval(id)` prevents lingering timers on unmount
- `CheckpointQuestion` localStorage: both get and set wrapped in try/catch with silent continue on failure
- `resolveWidget` never throws: all error paths return null, lesson renders around failures
