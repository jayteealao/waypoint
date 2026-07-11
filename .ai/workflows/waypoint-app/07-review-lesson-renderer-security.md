---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: lesson-renderer
review-command: security
status: complete
updated-at: "2026-07-11T20:02:45Z"
metric-findings-total: 2
metric-findings-blocker: 0
metric-findings-high: 0
metric-findings-pre-existing: 0
metric-findings-resolved: 0
result: issues-found
tags: []
refs:
  review-master: 07-review-lesson-renderer.md
---

# Review: security

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| SEC-1 | MED | High | open | false | 2026-07-11T20:02:45Z | src/server/lessons.ts:41 | getLesson fetches any lesson by ID with no ownership enforcement |
| SEC-2 | LOW | Med | open | false | 2026-07-11T20:02:45Z | src/lib/lesson/sanitize.ts:22 | ALLOWED_ATTR includes 'class', enabling arbitrary CSS class injection from AI-generated prose |

## Detailed Findings

### SEC-1: getLesson missing ownership enforcement [MED]

**Location:** `src/server/lessons.ts:41`
**Evidence:**
```typescript
export const getLesson = createServerFn()
  .middleware([withSession])
  .validator((id: string) => id)
  .handler(async ({ data: lessonId }): Promise<Lesson | null> => {
    const row = await env.DB.prepare('SELECT * FROM lessons WHERE id = ?')
      .bind(lessonId)
      .first<Lesson>()
    if (!row) return null
    return row
  })
```
**Issue:** `getLesson` authenticates the caller (via `withSession`) but does not verify that the requested lesson belongs to the authenticated user's journey. Any authenticated user who knows or guesses a lesson ID can retrieve another user's lesson content. The comment acknowledges this ("callers must check") but enforcement at the data layer is missing, making this a foot-gun for future callers.

**Fix:** Add an optional `waypointId` parameter to narrow the query: `SELECT * FROM lessons WHERE id = ? AND waypoint_id = ?` when provided, or add a post-fetch ownership assertion against the session user's journeys. At minimum, rename the parameter and add a JSDoc `@throws` note to make the caller contract explicit and harder to accidentally violate.

**Severity:** MED | **Confidence:** High | **Pre-existing:** false
**Status:** open | **Surfaced:** 2026-07-11T20:02:45Z | **Last seen:** 2026-07-11T20:02:45Z

---

### SEC-2: ALLOWED_ATTR 'class' enables CSS class injection [LOW]

**Location:** `src/lib/lesson/sanitize.ts:22`
**Evidence:**
```typescript
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'code', 'a', 'span', 'br', 'u'],
  ALLOWED_ATTR: ['href', 'class'],
  FORCE_BODY: true,
} as const
```
**Issue:** `class` is included in `ALLOWED_ATTR`, which means AI-generated inline HTML can inject arbitrary class names into the rendered DOM. An adversarial or mistaken model output could inject application CSS classes (e.g., `.wp-lesson-source-block`, `.ember`, auth-state-revealing classes) that alter visual presentation or reveal information through styling. While this cannot execute code, it is unnecessary — the inline formatting tags (`em`, `strong`, `code`, `a`, `span`) do not require author-controlled class names to render correctly.

**Fix:** Remove `'class'` from `ALLOWED_ATTR`. The allowed inline tags render correctly without class names; any design-specific styling should come from the rendering component's class context, not from AI-authored HTML.

**Severity:** LOW | **Confidence:** Med | **Pre-existing:** false
**Status:** open | **Surfaced:** 2026-07-11T20:02:45Z | **Last seen:** 2026-07-11T20:02:45Z

## Summary
- Open findings: 2 (resolved this run: 0)
- Open blockers: 0 (pre-existing excluded; pre-existing findings: 0)
- Status: Issues Found
