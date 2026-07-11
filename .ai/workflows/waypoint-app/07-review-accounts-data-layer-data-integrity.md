---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: accounts-data-layer
review-command: data-integrity
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

# Review: data-integrity

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| DI-1 | LOW | Med | open | false | 2026-07-11 | src/server/journeys.ts:88 | updateJourney SELECT + ownership + UPDATE not atomic; TOCTOU window exists |

## Detailed Findings

### DI-1: updateJourney is not atomic [LOW]

**Location:** `src/server/journeys.ts:88-104`

**Evidence:**
```typescript
const journey = await env.DB.prepare('SELECT * FROM journeys WHERE id = ?')
  .bind(data.id)
  .first<Journey>()
if (!journey) throw new Response(null, { status: 404 })
requireOwnership(session.user.id, journey.user_id)

// ... UPDATE journeys SET title = ?, goal = ?, status = ?, updated_at = ? WHERE id = ?
```

**Issue:** Three separate database operations (SELECT, ownership check in TypeScript, UPDATE) have a TOCTOU window. Two concurrent requests by the same user could both pass the ownership check and the second write would overwrite the first without seeing its changes. D1's serialized-write model (SQLite WAL) reduces the probability, but does not eliminate the logical race. More importantly, the separate SELECT also means the function fetches the full journey row just to check ownership, which is unnecessary work.

**Fix:** Collapse into a single atomic UPDATE with the ownership check embedded in the WHERE clause:
```typescript
const now = Date.now()
const result = await env.DB.prepare(
  'UPDATE journeys SET title = ?, goal = ?, status = ?, updated_at = ? WHERE id = ? AND user_id = ? RETURNING *'
)
  .bind(data.patch.title ?? null, data.patch.goal ?? null, data.patch.status ?? null, now, data.id, session.user.id)
  .first<Journey>()

if (!result) {
  // Journey not found OR doesn't belong to this user — distinguish via a presence check
  const exists = await env.DB.prepare('SELECT id FROM journeys WHERE id = ?').bind(data.id).first()
  throw new Response(null, { status: exists ? 403 : 404 })
}
return result
```

This is atomic, eliminates the TOCTOU window, and is more efficient (one round-trip instead of two).

**Severity:** LOW | **Confidence:** Med | **Pre-existing:** false
**Status:** open | **Surfaced:** 2026-07-11T13:18:04Z | **Last seen:** 2026-07-11T13:18:04Z

## Summary

- Open findings: 1    (resolved this run: 0)
- Open blockers: 0    (pre-existing excluded; pre-existing findings: 0)
- Status: Issues Found
