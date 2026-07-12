---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: quiz-fsrs
review-command: code-simplification
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

# Review: code-simplification

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| CS-1 | LOW | Med | deferred | false | 2026-07-12T04:54:26Z | src/server/quiz.ts:130 | Inline interface declarations inside handler body |
| CS-2 | NIT | Med | deferred | false | 2026-07-12T04:54:26Z | src/lib/quiz/fsrs-scheduler.ts:158 | Double type-cast for RecordLog indexing |

## Detailed Findings

### CS-1: Inline interface declarations inside handler [LOW]

**Location:** `src/server/quiz.ts:130-160`

**Evidence:**
```typescript
interface ConceptItem {
  conceptId: string
  name: string
  type: 'mc' | 'frq'
}
const conceptQueue: ConceptItem[] = []
// ...
interface GeneratedQuestion { ... }
```

**Issue:** Both `ConceptItem` and `GeneratedQuestion` are declared as interfaces inside the `generateQuiz` handler body. TypeScript interfaces declared inside functions are legal but conventionally placed at module scope or in a types file, making them invisible to tests and harder to discover.

**Fix:** Move both interfaces to module scope in `src/server/quiz.ts` or to `src/lib/quiz/schema.ts`.

**Severity:** LOW | **Confidence:** Med | **Pre-existing:** false
**Status:** deferred | **Surfaced:** 2026-07-12T04:54:26Z

### CS-2: Double type-cast for RecordLog indexing [NIT]

**Location:** `src/lib/quiz/fsrs-scheduler.ts:158`

**Evidence:**
```typescript
const result = recordLog[rating as unknown as keyof typeof recordLog]
```

**Issue:** The ts-fsrs `repeat()` return type `RecordLog` is keyed by `Grade` (a subset of `Rating`). TypeScript can't narrow `rating` to the valid subset without the double cast. The cast is runtime-safe (Manual is filtered above this line) but the double-cast pattern is a code smell.

**Fix:** Import `Grade` from `ts-fsrs` and use `recordLog[rating as unknown as Grade]` — still one level of trust but semantically accurate.

**Severity:** NIT | **Confidence:** Med | **Pre-existing:** false
**Status:** deferred | **Surfaced:** 2026-07-12T04:54:26Z

## Summary

- Open findings: 2 (resolved this run: 0)
- Open blockers: 0 (pre-existing excluded; pre-existing findings: 0)
- Status: Issues Found
