---
schema: sdlc/v1
type: review
slug: waypoint-app
review-scope: per-slice
slice-slug: quiz-fsrs
status: complete
stage-number: 7
created-at: "2026-07-12T04:54:26Z"
updated-at: "2026-07-12T04:54:26Z"
verdict: ship
commands-run: [correctness, security, code-simplification, testing, maintainability, reliability, accessibility, frontend-performance, interface-craft, ux-copy, data-integrity, performance, privacy, supply-chain, cost]
metric-commands-run: 15
metric-findings-total: 10
metric-findings-raw: 14
metric-findings-blocker: 0
metric-findings-pre-existing: 0
metric-findings-high: 0
metric-findings-med: 0
metric-findings-low: 8
metric-findings-nit: 2
metric-findings-resolved: 0
metric-findings-total-ever: 12
runs:
  - at: "2026-07-12T04:54:26Z"
    dimensions: [correctness, security, code-simplification, testing, maintainability, reliability, accessibility, frontend-performance, interface-craft, ux-copy, data-integrity, performance, privacy, supply-chain, cost]
    verdict: ship
    fix-commit: "bd9aa74"
tags: []
refs:
  index: 00-index.md
  slice-def: 03-slice-quiz-fsrs.md
  implement: 05-implement-quiz-fsrs.md
  verify: 06-verify-quiz-fsrs.md
  sub-reviews:
    - 07-review-quiz-fsrs-correctness.md
    - 07-review-quiz-fsrs-security.md
    - 07-review-quiz-fsrs-code-simplification.md
    - 07-review-quiz-fsrs-testing.md
    - 07-review-quiz-fsrs-maintainability.md
    - 07-review-quiz-fsrs-reliability.md
    - 07-review-quiz-fsrs-accessibility.md
    - 07-review-quiz-fsrs-frontend-performance.md
    - 07-review-quiz-fsrs-interface-craft.md
    - 07-review-quiz-fsrs-ux-copy.md
    - 07-review-quiz-fsrs-data-integrity.md
    - 07-review-quiz-fsrs-performance.md
    - 07-review-quiz-fsrs-privacy.md
    - 07-review-quiz-fsrs-supply-chain.md
    - 07-review-quiz-fsrs-cost.md
next-command: wf-handoff
next-invocation: "/wf handoff waypoint-app"
---

# Review: Quiz Engine & FSRS Learner Model

## The Review

The quiz-fsrs slice delivers the pedagogy payload Waypoint was built for: AI-generated quizzes with graded free-text answers, every response updating a per-concept FSRS card, and due concepts from earlier lessons resurfacing in later quizzes. Fifteen dimensions reviewed across 17 new or modified files. Two medium-severity ownership-check gaps were found in the security review and patched in the fix loop before this artifact was written.

The FSRS math layer (`fsrs-scheduler.ts`) is the strongest part of the implementation: cleanly separated from the gateway, fully deterministic (no network, clock-controlled via `vi.useFakeTimers`), with a round-trip test that catches silent mis-scheduling errors. The schema module is pure and well-typed. Server functions follow the established `withSession` + `requireAuth` pattern with one exception per function that the security dimension caught.

After the fix loop, no open BLOCKER or HIGH findings remain. Eight LOW and two NIT findings are deferred — they are improvement opportunities rather than correctness or safety issues. The largest deferred finding (DI-1) is a data model gap (missing UNIQUE constraint on concepts) whose practical risk is negligible in a single-user v1 app. The verdict is Ship.

## Verdict

**Ship**

Two medium-severity ownership-check gaps (gradeAnswer loading questions without verifying journey ownership; getWaypointCompletionStatus returning waypoint IDs without verifying journey ownership) were identified and patched in commit `bd9aa74`. All 15 review dimensions are clean after the fix. Remaining open findings are 8 LOWs and 2 NITs, all deferred with documented reasons. No OPEN BLOCKER or HIGH findings.

## Domain Coverage

| Domain | Command | Status |
|--------|---------|--------|
| Logic + invariants | `correctness` | 1 LOW deferred |
| Vulnerabilities | `security` | 2 MED fixed; 1 LOW deferred |
| Reuse + complexity | `code-simplification` | 1 LOW + 1 NIT deferred |
| Test coverage | `testing` | 1 LOW deferred |
| Readability + coupling | `maintainability` | Clean |
| Error handling | `reliability` | 1 LOW deferred |
| Screen reader support | `accessibility` | 1 NIT deferred |
| Client performance | `frontend-performance` | Clean |
| Visual detail | `interface-craft` | Clean |
| Copy + labels | `ux-copy` | Clean |
| DB writes + validation | `data-integrity` | 1 LOW deferred |
| Query efficiency | `performance` | 2 LOW deferred |
| PII handling | `privacy` | 1 LOW deferred |
| New dependencies | `supply-chain` | Clean |
| AI call costs | `cost` | 1 NIT deferred (same root as PERF-2) |

## All Findings

| ID | Sev | Conf | Status | Pre | Surfaced | Source | File:Line | Issue |
|----|-----|------|--------|-----|----------|--------|-----------|-------|
| SEC-1 | MED | High | fixed | false | 2026-07-12T04:54:26Z | security | src/server/quiz.ts:306 | gradeAnswer loaded question without ownership check |
| SEC-2 | MED | High | fixed | false | 2026-07-12T04:54:26Z | security | src/server/quiz.ts:445 | getWaypointCompletionStatus queried waypoints without ownership check |
| SEC-3 | LOW | Med | deferred | false | 2026-07-12T04:54:26Z | security | src/server/quiz.ts:272 | correct_answer exposed in getQuizQuestions API response |
| COR-1 | LOW | Med | deferred | false | 2026-07-12T04:54:26Z | correctness + reliability | quiz.tsx:36 | Empty quiz after failed generation — unbounded retry + no user error signal |
| CS-1 | LOW | Med | deferred | false | 2026-07-12T04:54:26Z | code-simplification | src/server/quiz.ts:130 | Inline interface declarations inside handler body |
| TST-1 | LOW | Med | deferred | false | 2026-07-12T04:54:26Z | testing | tests/smoke/ | No tests for gradeAnswer/getWaypointCompletionStatus ownership checks |
| DI-1 | LOW | Med | deferred | false | 2026-07-12T04:54:26Z | data-integrity | src/server/quiz.ts:100 | Concepts table missing UNIQUE(journey_id, name) — duplicate row race |
| PERF-1 | LOW | Med | deferred | false | 2026-07-12T04:54:26Z | performance | src/server/quiz.ts:456 | getWaypointCompletionStatus N+1 queries (2 per waypoint) |
| PERF-2 | LOW | Med | deferred | false | 2026-07-12T04:54:26Z | performance + cost | src/server/quiz.ts:164 | N sequential gateway calls in generateQuiz — plan-acknowledged debt |
| PRV-1 | LOW | Med | deferred | false | 2026-07-12T04:54:26Z | privacy | src/server/quiz.ts:334 | grading_parse_error log includes raw_text slice |
| A11Y-1 | NIT | Med | deferred | false | 2026-07-12T04:54:26Z | accessibility | src/components/quiz/QuizView.tsx:461 | MC options container role=group vs role=radiogroup |
| CS-2 | NIT | Med | deferred | false | 2026-07-12T04:54:26Z | code-simplification | src/lib/quiz/fsrs-scheduler.ts:158 | Double type-cast for RecordLog indexing |

**Open:** BLOCKER: 0 | HIGH: 0 | MED: 0 | LOW: 8 | NIT: 2   **Pre-existing:** 0
**Closed:** fixed: 2   **Ledger size (ever):** 12
*(This run: 12 net-new, 0 re-confirmed, 0 resolved; merged from 14 raw findings across 15 commands; fix loop patched 2 of 2 MED findings)*

## Findings (Detailed)

### SEC-1: gradeAnswer missing ownership check [MED] — FIXED

**Location:** `src/server/quiz.ts:306` (pre-fix)
**Source:** security

**Issue:** gradeAnswer loaded quiz questions by ID without verifying the question belonged to the authenticated user's journey. A user who obtained another user's questionId could call gradeAnswer and receive AI-generated grading feedback revealing question rubrics.

**Fix:** Replaced bare SELECT with a JOIN to waypoints + journeys filtering on `j.user_id = ?`. Returns 404 if the question doesn't belong to the caller's journey. Applied in commit bd9aa74.

**Severity:** MED | **Confidence:** High | **Pre-existing:** false
**Status:** fixed | **Surfaced:** 2026-07-12T04:54:26Z | **Fixed:** 2026-07-12T04:54:26Z

---

### SEC-2: getWaypointCompletionStatus missing ownership check [MED] — FIXED

**Location:** `src/server/quiz.ts:445` (pre-fix)
**Source:** security

**Issue:** getWaypointCompletionStatus queried all waypoint IDs for a given journeyId without verifying the caller owns that journey, enabling waypoint structure enumeration from arbitrary journeys.

**Fix:** Added journey ownership check before waypoint query: `SELECT id FROM journeys WHERE id = ? AND user_id = ?`. Returns 404 if not owned. Applied in commit bd9aa74.

**Severity:** MED | **Confidence:** High | **Pre-existing:** false
**Status:** fixed | **Surfaced:** 2026-07-12T04:54:26Z | **Fixed:** 2026-07-12T04:54:26Z

---

### SEC-3: correct_answer exposed in getQuizQuestions API response [LOW]

**Location:** `src/server/quiz.ts:272`
**Source:** security

**Issue:** getQuizQuestions returns QuizQuestion[] with correct_answer populated. A learner who inspects the network response can see the correct MC option before answering. This is an inherent tradeoff of the client-side MC grading design (plan assumption A2).

**Fix (deferred):** Move MC grading server-side and omit correct_answer from the response. Requires a new `checkMcAnswer` server function. Out of scope for v1; noted as a design tradeoff.

**Severity:** LOW | **Confidence:** Med | **Pre-existing:** false
**Status:** deferred | **Surfaced:** 2026-07-12T04:54:26Z

---

### COR-1: Empty quiz — unbounded retry + no user error signal [LOW]

**Location:** `src/routes/_authenticated/journey/$journeyId/waypoint/$waypointId/quiz.tsx:36`
**Source:** correctness + reliability

**Issue:** If generateQuiz returns an empty array (all concepts fail validation), the quiz loader retries generation on every subsequent visit. The component also shows an empty results state (0/0 score) with no error message explaining what happened.

**Fix (deferred):** After generateQuiz returns `[]`, show an error state rather than passing empty questions to QuizView. Gateway quota enforcement limits worst-case repeated calls.

**Severity:** LOW | **Confidence:** Med | **Pre-existing:** false
**Status:** deferred | **Surfaced:** 2026-07-12T04:54:26Z

---

### CS-1: Inline interface declarations inside generateQuiz handler [LOW]

**Location:** `src/server/quiz.ts:130`
**Source:** code-simplification

**Issue:** `ConceptItem` and `GeneratedQuestion` interfaces are declared inside the handler function body. Prefer module scope or `src/lib/quiz/schema.ts`.

**Fix (deferred):** Move to module scope.

**Severity:** LOW | **Confidence:** Med | **Pre-existing:** false
**Status:** deferred | **Surfaced:** 2026-07-12T04:54:26Z

---

### TST-1: No tests for new ownership checks [LOW]

**Location:** `tests/smoke/` (gap)
**Source:** testing

**Issue:** The review fix loop added ownership checks to gradeAnswer and getWaypointCompletionStatus. Neither path has a test asserting that cross-user calls return 404.

**Fix (deferred):** Add D1-stub tests with multi-user fixtures for both functions.

**Severity:** LOW | **Confidence:** Med | **Pre-existing:** false
**Status:** deferred | **Surfaced:** 2026-07-12T04:54:26Z

---

### DI-1: Concept upsert race condition [LOW]

**Location:** `src/server/quiz.ts:100` / `migrations/0000_schema_v1.sql:134`
**Source:** data-integrity

**Issue:** The concepts table has no UNIQUE(journey_id, name) constraint. The SELECT + conditional INSERT pattern can create duplicate concept rows under concurrent generation requests, fragmenting FSRS scheduling data for that concept. Practically impossible in single-user v1 (UI prevents concurrent generation for same waypoint).

**Fix (deferred):** Add a UNIQUE index and re-SELECT after INSERT OR IGNORE.

**Severity:** LOW | **Confidence:** Med | **Pre-existing:** false
**Status:** deferred | **Surfaced:** 2026-07-12T04:54:26Z

---

### PERF-1: N+1 queries in getWaypointCompletionStatus [LOW]

**Location:** `src/server/quiz.ts:456`
**Source:** performance

**Issue:** 2 D1 queries per waypoint in the completion loop. At 10 waypoints: 21 sequential round-trips.

**Fix (deferred):** Single query with conditional aggregation across all waypoints.

**Severity:** LOW | **Confidence:** Med | **Pre-existing:** false
**Status:** deferred | **Surfaced:** 2026-07-12T04:54:26Z

---

### PERF-2: N sequential gateway calls in generateQuiz [LOW]

**Location:** `src/server/quiz.ts:164`
**Source:** performance + cost

**Issue:** One callGateway call per concept. For 5 concepts: 5 sequential 200–400ms calls. Pre-acknowledged in plan §Risks; tracked as sdlc-debt.

**Fix (deferred):** Batch into single multi-question call. Tracked as sdlc-debt.

**Severity:** LOW | **Confidence:** Med | **Pre-existing:** false
**Status:** deferred | **Surfaced:** 2026-07-12T04:54:26Z

---

### PRV-1: grading_parse_error logs raw AI response text [LOW]

**Location:** `src/server/quiz.ts:334`
**Source:** privacy

**Issue:** `raw_text: rawText.slice(0, 200)` in the grading parse error log could contain learner-influenced content if the model echoes the learner's answer in a malformed response.

**Fix (deferred):** Replace with `raw_text_length: rawText.length`.

**Severity:** LOW | **Confidence:** Med | **Pre-existing:** false
**Status:** deferred | **Surfaced:** 2026-07-12T04:54:26Z

---

### A11Y-1: MC options container role=group vs role=radiogroup [NIT]

**Location:** `src/components/quiz/QuizView.tsx:461`
**Source:** accessibility

**Issue:** The MC options wrapper uses `role="group"`. `role="radiogroup"` + `aria-checked` on selected button would be more semantically accurate.

**Fix (deferred):** Change to role="radiogroup" and add aria-checked.

**Severity:** NIT | **Confidence:** Med | **Pre-existing:** false
**Status:** deferred | **Surfaced:** 2026-07-12T04:54:26Z

---

### CS-2: Double type-cast for RecordLog indexing [NIT]

**Location:** `src/lib/quiz/fsrs-scheduler.ts:158`
**Source:** code-simplification

**Issue:** `recordLog[rating as unknown as keyof typeof recordLog]` — runtime-safe but awkward double-cast.

**Fix (deferred):** Import `Grade` from ts-fsrs; use `rating as unknown as Grade`.

**Severity:** NIT | **Confidence:** Med | **Pre-existing:** false
**Status:** deferred | **Surfaced:** 2026-07-12T04:54:26Z

## Pre-existing Debt

None. All findings were introduced by code in the quiz-fsrs diff (pre-existing: false).

## Triage Decisions

| ID | Sev | Source | Decision | Notes |
|----|-----|--------|----------|-------|
| SEC-1 | MED | security | fix | Ownership check gap — fixed in bd9aa74 |
| SEC-2 | MED | security | fix | Ownership check gap — fixed in bd9aa74 |
| SEC-3 | LOW | security | defer | Design tradeoff of client-side MC grading (plan A2); redesign is out of scope |
| COR-1 | LOW | correctness + reliability | defer | Gateway quota limits retry cost; user error signal is a UX improvement |
| CS-1 | LOW | code-simplification | defer | Inline interfaces are legal and not blocking; scope-limited refactor |
| TST-1 | LOW | testing | defer | Follow-on tests for review-time ownership fixes; no production risk |
| DI-1 | LOW | data-integrity | defer | Practically impossible at v1 scale; migration required |
| PERF-1 | LOW | performance | defer | Acceptable at v1 scale (< 20 waypoints per journey) |
| PERF-2 | LOW | performance + cost | defer | Pre-acknowledged plan debt with sdlc-debt marker |
| PRV-1 | LOW | privacy | defer | Low probability; mitigated by model's injection-resistance instruction |
| A11Y-1 | NIT | accessibility | defer | Valid button pattern; role=radiogroup is enhancement not requirement |
| CS-2 | NIT | code-simplification | defer | Runtime-safe; documented with comment |

## Fix Status

| ID | Sev | Source | Status | Fixed-at | Commit | Notes |
|----|-----|--------|--------|----------|--------|-------|
| SEC-1 | MED | security | fixed | 2026-07-12T04:54:26Z | bd9aa74 | gradeAnswer JOIN to journeys WHERE user_id = ? |
| SEC-2 | MED | security | fixed | 2026-07-12T04:54:26Z | bd9aa74 | getWaypointCompletionStatus journey ownership gate |

## Recommendations

### Must Fix (triaged "fix")
All MED findings fixed in commit bd9aa74.

### Deferred (triaged "defer")

- **SEC-3** (LOW): correct_answer in API response — consider server-side MC grading when building the mobile client (where network inspection is easier).
- **COR-1** (LOW): empty quiz error state + retry limit — add error UI and/or a generation_attempted flag before building the adaptation-progress slice.
- **TST-1** (LOW): ownership check tests — add before the next security audit or when the test suite gets multi-user fixtures.
- **DI-1** (LOW): UNIQUE constraint on concepts — add migration in the adaptation-progress or source-grounding slice.
- **PERF-1** (LOW): N+1 completion queries — rewrite when journey length grows beyond 20 waypoints.
- **PERF-2** (LOW): N gateway calls — batch when per-waypoint quiz cost becomes measurable.
- **PRV-1** (LOW): raw_text in logs — replace in next logging cleanup pass.
- **CS-1** (LOW): inline interfaces — move in next refactor pass.
- **A11Y-1** (NIT): role=radiogroup — apply in the next accessibility pass.
- **CS-2** (NIT): type cast — clean up when ts-fsrs types become cleaner.

### Consider (LOW/NIT — not triaged)
All LOW/NIT findings are listed above under Deferred.

## Recommended Next Stage

- **Option A (recommended): `/wf handoff waypoint-app`** — verdict is Ship, all MED findings fixed, no OPEN BLOCKER or HIGH. All prior slices (foundation through quiz-fsrs) have shipped reviews. Ready to aggregate into PR.
- **Option D: `/wf plan waypoint-app adaptation-progress`** — if more slices should be implemented before PR. Check `03-slice.md` for remaining slices (adaptation-progress, source-grounding).
- **Option B: `/wf review waypoint-app quiz-fsrs`** — only if further fixes are applied and a re-check is desired (accumulating re-run merges into this ledger).
