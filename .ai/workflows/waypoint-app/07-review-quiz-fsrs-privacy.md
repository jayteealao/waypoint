---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: quiz-fsrs
review-command: privacy
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

# Review: privacy

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| PRV-1 | LOW | Med | deferred | false | 2026-07-12T04:54:26Z | src/server/quiz.ts:334 | quiz.grading_parse_error logs raw_text (first 200 chars of AI response) which could contain learner-influenced content |

## Detailed Findings

### PRV-1: grading_parse_error log includes raw AI response text [LOW]

**Location:** `src/server/quiz.ts:334`

**Evidence:**
```typescript
console.log(JSON.stringify({
  event: 'quiz.grading_parse_error',
  user_id: userId,
  question_id: questionId,
  raw_text: rawText.slice(0, 200),
}))
```

**Issue:** If a grader model produces malformed JSON, the first 200 chars are logged. Under adversarial prompting or unusual model behaviour, the raw response could reflect or echo content from the learner's answer, inadvertently logging learner data.

**Fix:** Replace `raw_text: rawText.slice(0, 200)` with `raw_text_length: rawText.length` and `raw_text_starts_with_brace: rawText.trimStart().startsWith('{')`. Preserves debuggability without risking learner data in logs.

**Severity:** LOW | **Confidence:** Med | **Pre-existing:** false
**Status:** deferred | **Surfaced:** 2026-07-12T04:54:26Z

## Summary

- Open findings: 1 (resolved this run: 0)
- Open blockers: 0 (pre-existing excluded; pre-existing findings: 0)
- Status: Issues Found
