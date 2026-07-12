---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: tutor-interview
review-command: accessibility
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

# Review: accessibility

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| A11Y-1 | MED | High | fixed | false | 2026-07-12T02:06:04Z | src/components/interview/InterviewView.tsx:154 | aria-live="off" on conversation container conflicts with per-bubble role="status"; AT may suppress announcements |

## Detailed Findings

### A11Y-1: Conflicting live-region directives on chat container [MED]

**Location:** `src/components/interview/InterviewView.tsx:154`  
**Source:** accessibility

**Evidence:**
```tsx
<div className="wp-chat-scroll" ref={scrollRef} aria-label="Interview conversation" aria-live="off">
  {turns.map((turn, i) => (
    <ChatBubble ... role="status" aria-live="polite" />
```

**Issue:** `aria-live="off"` on the parent container and `role="status"` (implicit `aria-live="polite"`) on each assistant bubble creates competing live-region declarations. Some AT implementations (VoiceOver on iOS/macOS) interpret the parent `aria-live="off"` as suppressing descendant live regions, meaning new assistant messages would not be announced. Additionally, the explicit `aria-live="polite"` on each bubble is redundant with `role="status"` and could cause double-announcement on NVDA.

**Fix:** Move live-region ownership to the container (`aria-live="polite" aria-relevant="additions"`) and remove `role="status"` + `aria-live="polite"` from individual assistant bubbles.

**Severity:** MED | **Confidence:** High | **Pre-existing:** false  
**Status:** fixed | **Surfaced:** 2026-07-12T02:06:04Z | **Last seen:** 2026-07-12T02:06:04Z | **Fixed:** 2026-07-12T02:06:04Z

## Summary

- Open findings: 0    (resolved this run: 0)
- Open blockers: 0    (pre-existing excluded; pre-existing findings: 0)
- Status: Clean (after fix)
