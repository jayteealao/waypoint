---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: source-grounding
review-command: maintainability
status: complete
updated-at: "2026-07-12T07:32:29Z"
metric-findings-total: 1
metric-findings-blocker: 0
metric-findings-high: 0
metric-findings-pre-existing: 0
metric-findings-resolved: 0
result: issues-found
tags: []
refs:
  review-master: 07-review-source-grounding.md
---

# Review: maintainability

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| MAINT-1 | NIT | High | deferred | false | 2026-07-12 | src/server/interview.ts:91-98 | parseSourceContent mirrors parseSourceUrls — extractable to shared utility |

## Detailed Findings

### MAINT-1: Duplicated JSON Parse Helper [NIT]

**Location:** `src/server/interview.ts:88-98`

**Issue:** `parseSourceContent` and `parseSourceUrls` are structurally identical (same try/catch/Array.isArray pattern). As the codebase grows, a third parsed column would create a third copy. A generic `parseJsonArray<T>(json: string, fallback?: T[]): T[]` extracted to `src/lib/interview/parse-utils.ts` would serve all callers.

Deferred as a small cross-cutting refactor. Not in-scope for this feature review.

**Severity:** NIT | **Confidence:** High | **Pre-existing:** false | **Status:** deferred

## Summary
- Open findings: 1    (resolved this run: 0)
- Open blockers: 0    (pre-existing excluded; pre-existing findings: 0)
- Status: Issues Found (NIT only)
