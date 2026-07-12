---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: quiz-fsrs
review-command: security
status: complete
updated-at: "2026-07-12T04:54:26Z"
metric-findings-total: 1
metric-findings-blocker: 0
metric-findings-high: 0
metric-findings-pre-existing: 0
metric-findings-resolved: 0
result: issues-found
tags: []
refs:
  review-master: 07-review-quiz-fsrs.md
---

# Review: security

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| SEC-1 | MED | High | fixed | false | 2026-07-12T04:54:26Z | src/server/quiz.ts:306 | gradeAnswer loads questions without ownership check — any user can grade another user's questions via known questionId |
| SEC-2 | MED | High | fixed | false | 2026-07-12T04:54:26Z | src/server/quiz.ts:445 | getWaypointCompletionStatus queries waypoint IDs without verifying journey ownership |
| SEC-3 | LOW | Med | deferred | false | 2026-07-12T04:54:26Z | src/server/quiz.ts:272 | correct_answer exposed in getQuizQuestions API response enables pre-answer lookup |

## Detailed Findings

### SEC-1: gradeAnswer missing ownership check [MED]

**Location:** `src/server/quiz.ts:306` (pre-fix)

**Evidence:**
```typescript
const question = await env.DB.prepare(
  'SELECT * FROM quiz_questions WHERE id = ?',
)
  .bind(questionId)
  .first<QuizQuestion>()
if (!question) throw new Response(null, { status: 404 })
```

**Issue:** The original `gradeAnswer` function loaded quiz questions by ID without any ownership verification. A user who obtained another user's questionId (e.g., via shared URL, API fuzzing, or network interception) could call `gradeAnswer` to receive AI-generated grading feedback that inherently reveals the question's rubric and context.

**Fix:** Replaced the bare SELECT with a JOIN to `waypoints` and `journeys` filtering on `j.user_id = ?`. If the question doesn't belong to the authenticated user's journey, the query returns null and a 404 is returned. Applied in commit bd9aa74.

**Severity:** MED | **Confidence:** High | **Pre-existing:** false
**Status:** fixed | **Surfaced:** 2026-07-12T04:54:26Z | **Fixed:** 2026-07-12T04:54:26Z

### SEC-2: getWaypointCompletionStatus missing journey ownership check [MED]

**Location:** `src/server/quiz.ts:445` (pre-fix)

**Evidence:**
```typescript
const waypointIds = await env.DB.prepare(
  `SELECT DISTINCT q.waypoint_id FROM quiz_questions q JOIN waypoints w ON w.id = q.waypoint_id WHERE w.journey_id = ?`
).bind(journeyId).all()
```

**Issue:** The first query in `getWaypointCompletionStatus` returned all waypoint IDs for the given `journeyId` without checking that the authenticated user owns that journey. An attacker who knew another user's journeyId (UUID, so practically unguessable but theoretically possible via sharing links) could enumerate that journey's waypoint structure.

**Fix:** Added a journey ownership check before the waypoint query: `SELECT id FROM journeys WHERE id = ? AND user_id = ?`. Returns 404 if not found. Applied in commit bd9aa74.

**Severity:** MED | **Confidence:** High | **Pre-existing:** false
**Status:** fixed | **Surfaced:** 2026-07-12T04:54:26Z | **Fixed:** 2026-07-12T04:54:26Z

### SEC-3: correct_answer exposed in quiz questions API response [LOW]

**Location:** `src/server/quiz.ts:272`

**Evidence:**
```typescript
export const getQuizQuestions = createServerFn()
  // ... returns QuizQuestion[] with correct_answer populated
```

```typescript
// QuizView.tsx:465
if (opt === question.correct_answer) extraClass = ' wp-quiz-option--correct'
```

**Issue:** The `correct_answer` field is included in the quiz questions returned to the client. A learner who inspects network responses before answering can see the correct MC option. This is an inherent design tradeoff of client-side MC grading; the plan explicitly chose this for simplicity and immediacy.

**Fix:** Move MC grading server-side; omit `correct_answer` from the client response and expose a `checkMcAnswer` server function instead. This redesign is out of scope for a v1 review fix — the plan pre-authorized client-side MC grading as a design choice (A2).

**Severity:** LOW | **Confidence:** Med | **Pre-existing:** false
**Status:** deferred | **Surfaced:** 2026-07-12T04:54:26Z | **Last seen:** 2026-07-12T04:54:26Z

## Summary

- Open findings: 1 (resolved this run: 0)
- Open blockers: 0 (pre-existing excluded; pre-existing findings: 0)
- Status: Issues Found
