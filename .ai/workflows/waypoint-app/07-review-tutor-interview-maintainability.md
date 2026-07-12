---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: tutor-interview
review-command: maintainability
status: complete
updated-at: "2026-07-12T02:06:04Z"
metric-findings-total: 0
metric-findings-blocker: 0
metric-findings-high: 0
metric-findings-pre-existing: 0
metric-findings-resolved: 0
result: clean
fragment: none
tags: []
refs:
  review-master: 07-review-tutor-interview.md
---

# Review: maintainability

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| MAINT-1 | LOW | High | fixed | false | 2026-07-12T02:06:04Z | src/server/interview.ts:217 | captureField called on every turn including vague-stage non-advances, writing transient dirty data |

## Detailed Findings

### MAINT-1: captureField called unconditionally regardless of stage advance [LOW]

**Location:** `src/server/interview.ts:217`  
**Source:** maintainability

**Evidence:**
```typescript
const sm = new InterviewStateMachine(currentStage)
const nextStage = sm.transition(userContent)

// BUG: always called, even when nextStage === currentStage (vague mission → no advance)
const captured = sm.captureField(currentStage, userContent)
```

**Issue:** `captureField` is called with `currentStage` on every turn regardless of whether the stage actually advanced. When a learner gives a vague mission answer (stage stays at `'mission'`), the vague text is written to `captured_mission` in D1. On the next turn, if a good answer is given, it is overwritten. The final captured state is always correct (because reaching `'complete'` requires a non-vague mission), but intermediate DB state contains rejected/transient data. This is a data quality concern and a readability issue — the intent of `captureField` is "capture the just-completed stage field", which only makes sense when the stage advanced.

**Fix:** Guard the call: `const captured = nextStage !== currentStage ? sm.captureField(currentStage, userContent) : {}`

**Severity:** LOW | **Confidence:** High | **Pre-existing:** false  
**Status:** fixed | **Surfaced:** 2026-07-12T02:06:04Z | **Last seen:** 2026-07-12T02:06:04Z | **Fixed:** 2026-07-12T02:06:04Z

## Summary

- Open findings: 0    (resolved this run: 0)
- Open blockers: 0    (pre-existing excluded; pre-existing findings: 0)
- Status: Clean (after fix)
