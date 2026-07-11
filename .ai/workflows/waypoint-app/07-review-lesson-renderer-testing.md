---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: lesson-renderer
review-command: testing
status: complete
updated-at: "2026-07-11T20:02:45Z"
metric-findings-total: 1
metric-findings-blocker: 0
metric-findings-high: 0
metric-findings-pre-existing: 0
metric-findings-resolved: 0
result: issues-found
tags: []
refs:
  review-master: 07-review-lesson-renderer.md
---

# Review: testing

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| TST-1 | LOW | Med | open | false | 2026-07-11T20:02:45Z | tests/smoke/ (absent) | useSimulatedStream has no unit test — only E2E Playwright coverage |

## Detailed Findings

### TST-1: useSimulatedStream missing unit test [LOW]

**Location:** `src/lib/lesson/stream-driver.ts` / `tests/smoke/` (absent)
**Source:** testing

**Evidence:**
```typescript
// stream-driver.ts — hook with setInterval logic
export function useSimulatedStream(
  full: LessonDocumentV1,
  options: UseSimulatedStreamOptions = {},
): PartialLessonDocument {
  ...
  const id = setInterval(() => {
    // section reveal logic
  }, delayMs)
  return () => clearInterval(id)
```
No corresponding unit test in `tests/smoke/`.

**Issue:** The `useSimulatedStream` hook contains non-trivial logic: initial all-null state, section-by-section reveal on interval, double-clearInterval guard when all sections revealed, and cleanup on unmount. This logic is currently only exercised by Playwright E2E (AC-LR3), which runs against the full app in Chromium. A dedicated unit test using `renderHook` + fake timers would run in < 1ms vs ~3s for E2E, and would be easier to debug when the interval logic changes.

Specifically untested at unit level:
- Initial state is `{ ...full, sections: full.sections.map(() => null) }` (all null)
- Each interval tick reveals exactly one additional section
- `clearInterval` is called when all sections are revealed
- Effect cleanup on unmount fires `clearInterval` (no lingering timer)

**Fix:** Add `tests/smoke/stream-driver.test.ts` (`@vitest-environment jsdom` or `node` with React DOM). Use `renderHook(()=> useSimulatedStream(FIXTURE_LESSON))` with `vi.useFakeTimers()`. Advance timers with `vi.advanceTimersByTime(200)` per section.

**Severity:** LOW | **Confidence:** Med | **Pre-existing:** false
**Status:** open | **Surfaced:** 2026-07-11T20:02:45Z | **Last seen:** 2026-07-11T20:02:45Z

## Summary
- Open findings: 1 (resolved this run: 0)
- Open blockers: 0 (pre-existing: 0)
- Status: Issues Found

## Clean areas
- 19-test adversarial Vitest suite: thorough coverage of registry rejection + sanitizer; all hostile input vectors exercised
- Playwright suite: 6 tests cover AC-LR1/LR2/LR3 + auth guard; well-structured with seeded-session helper
- `escapeHtml` function: covered indirectly via `sanitizeHtml` when document is unavailable
- `getLesson` mocking: mock D1 binding pattern follows existing project conventions
