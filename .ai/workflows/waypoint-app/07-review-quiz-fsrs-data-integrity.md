---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: quiz-fsrs
review-command: data-integrity
status: complete
updated-at: "2026-07-12T04:54:26Z"
metric-findings-total: 1
metric-findings-blocker: 0
metric-findings-high: 0
metric-findings-pre-existing: 0
metric-findings-resolved: 0
result: issues-found
fragment: none
tags: []
refs:
  review-master: 07-review-quiz-fsrs.md
---

# Review: data-integrity

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| DI-1 | LOW | Med | deferred | false | 2026-07-12T04:54:26Z | src/server/quiz.ts:100 | Concept upsert lacks UNIQUE(journey_id, name) — concurrent requests can create duplicate concept rows |

## Detailed Findings

### DI-1: Concepts table missing UNIQUE constraint on (journey_id, name) [LOW]

**Location:** `src/server/quiz.ts:100` / `migrations/0000_schema_v1.sql:134`

**Evidence:**
```sql
-- No UNIQUE constraint:
CREATE TABLE IF NOT EXISTS concepts (
  id          TEXT PRIMARY KEY,
  journey_id  TEXT NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT
);
```

```typescript
// SELECT then conditional INSERT — race window:
const existing = await env.DB.prepare('SELECT id FROM concepts WHERE journey_id = ? AND name = ?').bind(journeyId, name).first()
if (!existing) {
  conceptId = crypto.randomUUID()
  await env.DB.prepare('INSERT OR IGNORE INTO concepts ...').bind(conceptId, ...).run()
}
```

**Issue:** `INSERT OR IGNORE` only fires on PRIMARY KEY conflicts. Without `UNIQUE(journey_id, name)`, two concurrent requests that both see `existing = null` will both insert successfully, creating two concept rows with different UUIDs. Subsequent quiz questions and FSRS cards reference one or the other UUID, fragmenting the learner model for that concept. Practically very unlikely in a single-user v1 app (UI navigates away on quiz click, making true concurrent generation for the same waypoint impossible through normal use).

**Fix:** Add `CREATE UNIQUE INDEX concepts_journey_name_uidx ON concepts(journey_id, name)` in a new migration, then always re-SELECT after `INSERT OR IGNORE` to get the surviving row's ID. This avoids the race without needing a transaction.

**Severity:** LOW | **Confidence:** Med | **Pre-existing:** false
**Status:** deferred | **Surfaced:** 2026-07-12T04:54:26Z

## Summary

- Open findings: 1 (resolved this run: 0)
- Open blockers: 0 (pre-existing excluded; pre-existing findings: 0)
- Status: Issues Found
