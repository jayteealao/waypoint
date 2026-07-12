---
schema: sdlc/v1
type: review
slug: waypoint-app
review-scope: per-slice
slice-slug: tutor-interview
status: complete
stage-number: 7
created-at: "2026-07-12T02:06:04Z"
updated-at: "2026-07-12T02:06:04Z"
verdict: ship
commands-run: [correctness, security, code-simplification, testing, maintainability, reliability, accessibility, frontend-accessibility, frontend-performance, interface-craft, backend-concurrency, data-integrity, ux-copy]
metric-commands-run: 13
metric-findings-total: 1
metric-findings-raw: 4
metric-findings-blocker: 0
metric-findings-pre-existing: 0
metric-findings-high: 0
metric-findings-med: 0
metric-findings-low: 1
metric-findings-nit: 0
metric-findings-resolved: 0
metric-findings-total-ever: 4
runs:
  - at: "2026-07-12T02:06:04Z"
    dimensions: [correctness, security, code-simplification, testing, maintainability, reliability, accessibility, frontend-accessibility, frontend-performance, interface-craft, backend-concurrency, data-integrity, ux-copy]
    verdict: ship
    fix-commit: "2185282"
tags: []
refs:
  index: 00-index.md
  slice-def: 03-slice-tutor-interview.md
  implement: 05-implement-tutor-interview.md
  verify: 06-verify-tutor-interview.md
  sub-reviews:
    - 07-review-tutor-interview-correctness.md
    - 07-review-tutor-interview-security.md
    - 07-review-tutor-interview-code-simplification.md
    - 07-review-tutor-interview-testing.md
    - 07-review-tutor-interview-maintainability.md
    - 07-review-tutor-interview-reliability.md
    - 07-review-tutor-interview-accessibility.md
    - 07-review-tutor-interview-frontend-accessibility.md
    - 07-review-tutor-interview-frontend-performance.md
    - 07-review-tutor-interview-interface-craft.md
    - 07-review-tutor-interview-backend-concurrency.md
    - 07-review-tutor-interview-data-integrity.md
    - 07-review-tutor-interview-ux-copy.md
next-command: wf-handoff
next-invocation: "/wf handoff waypoint-app"
---

# Review

## The Review

The consent-gated learner interview lands clean. Thirteen dimensions across the 2,210-line implementation found four issues; three were fixed in a single commit before this verdict was written, and one was deliberately deferred. The slice does what it set out to do: the state machine enforces the one-question contract structurally, the prompt suite is faithful to the source-skill pedagogy, and the Playwright evidence shows the full conversation flowing correctly from consent through to the completion card.

The one real issue worth calling out: the conversation container had `aria-live="off"` while individual assistant bubbles carried `role="status"` and an explicit `aria-live="polite"`. This is the wrong layering — competing live-region directives that some assistive technology implementations resolve by suppressing the child announcements entirely. The fix moves ownership to the container (`aria-live="polite" aria-relevant="additions"`) and strips the redundant attributes from individual bubbles, which is the spec-correct pattern for a chat interface. Two smaller fixes went in alongside it: a guard preventing vague mission answers from being written to the captured record before a stage advance, and the removal of the redundant `aria-live="polite"` that `role="status"` already implies.

The deferred finding is an unused `journeyId` prop on `InterviewView` that the implementation does not consume. It may have been retained as a forward-compatibility hook for the next slice that will own completion navigation, which is why it was deferred rather than removed.

## Verdict

**Ship**

Three findings were fixed in the review-owned fix loop and confirmed clean by typecheck + 95 Vitest tests. One LOW finding is deferred. No BLOCKERs, no HIGH findings remain open. The accessibility fix is the load-bearing change; everything else is a safety improvement.

## Domain Coverage

| Domain | Command | Status |
|--------|---------|--------|
| Correctness | `correctness` | Clean |
| Security | `security` | Clean |
| Code simplification | `code-simplification` | 1 deferred LOW |
| Test coverage | `testing` | Clean |
| Maintainability | `maintainability` | Fixed (1 LOW) |
| Reliability | `reliability` | Clean |
| Accessibility | `accessibility` | Fixed (1 MED) |
| Frontend accessibility | `frontend-accessibility` | Clean |
| Frontend performance | `frontend-performance` | Clean |
| Interface craft | `interface-craft` | Clean |
| Concurrency | `backend-concurrency` | Clean |
| Data integrity | `data-integrity` | Clean |
| UX copy | `ux-copy` | Clean |

## All Findings

ALL findings ever recorded — open AND closed.

| ID | Sev | Conf | Status | Pre | Surfaced | Source | File:Line | Issue |
|----|-----|------|--------|-----|----------|--------|-----------|-------|
| A11Y-1 | MED | High | fixed | false | 2026-07-12T02:06:04Z | accessibility | src/components/interview/InterviewView.tsx:154 | aria-live="off" on container conflicts with per-bubble role="status"; AT may suppress announcements |
| MAINT-1 | LOW | High | fixed | false | 2026-07-12T02:06:04Z | maintainability | src/server/interview.ts:217 | captureField called on every turn regardless of stage advance; writes transient vague text to captured_mission |
| CS-1 | LOW | High | fixed | false | 2026-07-12T02:06:04Z | code-simplification | src/components/interview/ChatBubble.tsx:33 | Redundant aria-live="polite" on role="status" element (already implied); subsumed by A11Y-1 fix |
| CS-2 | LOW | Med | deferred | false | 2026-07-12T02:06:04Z | code-simplification | src/components/interview/InterviewView.tsx:63 | Unused journeyId prop (_journeyId); possible forward-compat hook for completion navigation |

**Open:** BLOCKER: 0 | HIGH: 0 | MED: 0 | LOW: 1 | NIT: 0   **Pre-existing:** 0
**Closed:** resolved: 0 | fixed: 3 | dismissed: 0   **Ledger size (ever):** 4
*(This run: 4 net-new, 0 re-confirmed, 0 resolved; fix loop patched 3 of 3; 1 open)*

## Findings (Detailed)

### A11Y-1: Conflicting live-region directives on chat container [MED]

**Location:** `src/components/interview/InterviewView.tsx:154`
**Source:** accessibility

**Evidence:**
```tsx
// Before fix:
<div className="wp-chat-scroll" aria-label="Interview conversation" aria-live="off">
  <ChatBubble role="status" aria-live="polite" ... />  {/* each bubble */}
```

**Issue:** `aria-live="off"` on the parent and `role="status"` (implicit `aria-live="polite"`) on individual bubbles creates competing live-region directives. VoiceOver and some NVDA configurations interpret the parent's `aria-live="off"` as suppressing child announcements, meaning new tutor messages would not be read aloud.

**Fix:** Move live-region ownership to the container with `aria-live="polite" aria-relevant="additions"`. Remove `role="status"` and explicit `aria-live="polite"` from individual assistant bubbles.

**Severity:** MED | **Confidence:** High | **Pre-existing:** false
**Status:** fixed | **Surfaced:** 2026-07-12T02:06:04Z | **Last seen:** 2026-07-12T02:06:04Z — **Fixed:** 2026-07-12T02:06:04Z

---

### MAINT-1: captureField called unconditionally on every turn [LOW]

**Location:** `src/server/interview.ts:217`
**Source:** maintainability

**Evidence:**
```typescript
// Before fix:
const captured = sm.captureField(currentStage, userContent)
// If vague mission answer: nextStage === currentStage === 'mission'
// captureField('mission', vagueText) → stored to captured_mission in D1
```

**Issue:** When a learner gives a vague mission answer (stage stays at 'mission'), the vague text was written to `captured_mission` in D1 even though the answer was rejected by the state machine. The final captured state was always correct (stage can only reach 'complete' via a non-vague answer), but intermediate DB state contained transient/rejected data.

**Fix:** Guard the call: `const captured = nextStage !== currentStage ? sm.captureField(currentStage, userContent) : {}`

**Severity:** LOW | **Confidence:** High | **Pre-existing:** false
**Status:** fixed | **Surfaced:** 2026-07-12T02:06:04Z | **Last seen:** 2026-07-12T02:06:04Z — **Fixed:** 2026-07-12T02:06:04Z

---

### CS-1: Redundant aria-live on role="status" element [LOW]

**Location:** `src/components/interview/ChatBubble.tsx:33`
**Source:** code-simplification

**Issue:** `role="status"` already implies `aria-live="polite"` per the ARIA spec. The explicit attribute was redundant and could cause double-announcement on some AT implementations.

**Severity:** LOW | **Confidence:** High | **Pre-existing:** false
**Status:** fixed | **Surfaced:** 2026-07-12T02:06:04Z — **Fixed:** 2026-07-12T02:06:04Z

---

### CS-2: Unused journeyId prop in InterviewView [LOW]

**Location:** `src/components/interview/InterviewView.tsx:63`
**Source:** code-simplification

**Evidence:**
```tsx
export function InterviewView({
  journeyId: _journeyId,  // underscore prefix = unused; onSendTurn closes over journeyId in route
  ...
}: InterviewViewProps)
```

**Issue:** The `journeyId` prop is declared in the interface and passed from the route, but is never used inside the component. Adds API surface without a current consumer.

**Severity:** LOW | **Confidence:** Med | **Pre-existing:** false
**Status:** deferred | **Surfaced:** 2026-07-12T02:06:04Z | **Last seen:** 2026-07-12T02:06:04Z

## Pre-existing Debt

None. All findings are introduced by this slice's diff (`pre-existing: false`).

## Triage Decisions

| ID | Sev | Source | Decision | Notes |
|----|-----|--------|----------|-------|
| A11Y-1 | MED | accessibility | fix | Container-scoped live region is the spec-correct pattern; fix is localized to 2 files. |
| MAINT-1 | LOW | maintainability | fix | Stage-advance guard is 1 line; eliminates transient dirty DB state. |
| CS-1 | LOW | code-simplification | fix | Subsumed by A11Y-1 fix (removed role="status" + aria-live="polite" from bubbles). |
| CS-2 | LOW | code-simplification | defer | Possibly a forward-compat hook for completion navigation in a future slice. Revisit at roadmap-lesson-generation review. |

## Fix Status

| ID | Sev | Source | Status | Fixed-at | Commit | Notes |
|----|-----|--------|--------|----------|--------|-------|
| A11Y-1 | MED | accessibility | fixed | 2026-07-12T02:06:04Z | 2185282 | Container aria-live="polite" aria-relevant="additions"; removed role="status" + aria-live from bubbles |
| MAINT-1 | LOW | maintainability | fixed | 2026-07-12T02:06:04Z | 2185282 | captureField guarded by nextStage !== currentStage |
| CS-1 | LOW | code-simplification | fixed | 2026-07-12T02:06:04Z | 2185282 | Subsumed by A11Y-1 fix (same commit) |

## Recommendations

### Must Fix (triaged "fix")
All resolved in fix loop.

### Should Fix (MED triaged "fix")
A11Y-1 — resolved. ✓

### Deferred (triaged "defer")
- CS-2 (LOW): Remove unused `journeyId` prop from `InterviewViewProps`. Re-triage at roadmap-lesson-generation review.

### Dismissed
None.

### Consider (LOW/NIT — not triaged)
None.

## Soft Findings

No Friction Notes or Free Exploration Notes in verify artifact (06-verify-tutor-interview.md reports no issues in those sections).

## Recommended Next Stage

- **Option A (default):** proceed to handoff — no OPEN blockers, verdict is Ship. This is the last implemented slice before roadmap-lesson-generation and subsequent slices. Handoff aggregates all complete slices for PR description.
- **Option B:** plan roadmap-lesson-generation — can be planned now that `CapturedRecord` type from `src/types/interview.ts` is finalized; the roadmap slice depends on it.
- **Option C:** proceed directly to implementation of roadmap-lesson-generation — if planning is already done or the team wants to continue without a handoff PR first.
