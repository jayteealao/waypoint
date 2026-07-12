---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: source-grounding
review-command: code-simplification
status: complete
updated-at: "2026-07-12T07:32:29Z"
metric-findings-total: 2
metric-findings-blocker: 0
metric-findings-high: 0
metric-findings-pre-existing: 0
metric-findings-resolved: 0
result: issues-found
tags: []
refs:
  review-master: 07-review-source-grounding.md
---

# Review: code-simplification

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| CS-1 | NIT | High | deferred | false | 2026-07-12 | src/server/interview.ts:91-98 | parseSourceContent duplicates parseSourceUrls pattern |
| CS-2 | NIT | High | deferred | false | 2026-07-12 | src/server/interview.ts:241 | eslint-disable-next-line comment avoidable by splitting declaration |

## Detailed Findings

### CS-1: Duplicated JSON-Array Parse Pattern [NIT]

**Location:** `src/server/interview.ts:88-98`

**Evidence:**
```typescript
// parseSourceUrls (existing)
function parseSourceUrls(json: string): string[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? (parsed as string[]) : []
  } catch { return [] }
}

// parseSourceContent (new, nearly identical)
function parseSourceContent(json: string): SourceContent[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? (parsed as SourceContent[]) : []
  } catch { return [] }
}
```

Both functions are identical except for their return type. A generic `parseJsonArray<T>(json: string): T[]` would eliminate the duplication. Deferred as a cross-cutting cleanup.

**Severity:** NIT | **Confidence:** High | **Pre-existing:** false | **Status:** deferred

---

### CS-2: ESLint Disable Comment Avoidable by Splitting Declaration [NIT]

**Location:** `src/server/interview.ts:241`

**Evidence:**
```typescript
// eslint-disable-next-line prefer-const
let nextStage = sm.transition(userContent)
```

A type annotation on an intermediate `let` declaration removes the need for the lint disable:
```typescript
let nextStage: typeof currentStage = sm.transition(userContent)
```
or split as:
```typescript
let nextStage: InterviewStage
nextStage = sm.transition(userContent)
```

Deferred — cosmetic only.

**Severity:** NIT | **Confidence:** High | **Pre-existing:** false | **Status:** deferred

## Summary
- Open findings: 2    (resolved this run: 0)
- Open blockers: 0    (pre-existing excluded; pre-existing findings: 0)
- Status: Issues Found (NIT only)
