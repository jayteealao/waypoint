---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: quiz-fsrs
review-command: performance
status: complete
updated-at: "2026-07-12T04:54:26Z"
metric-findings-total: 2
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

# Review: performance

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| PERF-1 | LOW | Med | deferred | false | 2026-07-12T04:54:26Z | src/server/quiz.ts:456 | getWaypointCompletionStatus N+1 pattern — 2 queries per waypoint |
| PERF-2 | LOW | Med | deferred | false | 2026-07-12T04:54:26Z | src/server/quiz.ts:164 | generateQuiz N sequential gateway calls — acknowledged plan debt |

## Detailed Findings

### PERF-1: N+1 queries in getWaypointCompletionStatus [LOW]

**Location:** `src/server/quiz.ts:456`

**Evidence:**
```typescript
for (const { waypoint_id: waypointId } of waypointIds.results) {
  const totalRow = await env.DB.prepare('SELECT COUNT(*) ...').bind(waypointId).first()
  const passedRow = await env.DB.prepare('SELECT COUNT(DISTINCT q.id) ...').bind(userId, waypointId).first()
}
```

**Issue:** 2 D1 round-trips per waypoint (+ 1 for the initial distinct query). At 10 waypoints: 21 D1 calls. Each D1 round-trip is ~1ms on Workers edge but sequentially adds latency. Acceptable at v1 but will degrade as journeys grow.

**Fix:** Rewrite with a single `GROUP BY waypoint_id` query using conditional aggregation across all waypoints simultaneously.

**Severity:** LOW | **Confidence:** Med | **Pre-existing:** false
**Status:** deferred | **Surfaced:** 2026-07-12T04:54:26Z

### PERF-2: N sequential gateway calls in generateQuiz [LOW]

**Location:** `src/server/quiz.ts:164`

**Issue:** One `callGateway` call per concept. For a waypoint with 5 concepts: 5 sequential gateway round-trips (each 200-400ms). Total: 1-2s of blocking generation time. Pre-acknowledged in plan §Risks and tracked as `sdlc-debt` in schema.ts.

**Fix:** Batch all concepts into a single gateway call with a JSON array response schema. Tracked as sdlc-debt.

**Severity:** LOW | **Confidence:** Med | **Pre-existing:** false
**Status:** deferred | **Surfaced:** 2026-07-12T04:54:26Z

## Summary

- Open findings: 2 (resolved this run: 0)
- Open blockers: 0 (pre-existing excluded; pre-existing findings: 0)
- Status: Issues Found
