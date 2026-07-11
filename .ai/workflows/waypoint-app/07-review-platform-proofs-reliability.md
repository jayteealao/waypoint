---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: platform-proofs
review-command: reliability
status: complete
updated-at: "2026-07-11T10:57:06Z"
metric-findings-total: 1
metric-findings-blocker: 0
metric-findings-high: 0
metric-findings-pre-existing: 0
metric-findings-resolved: 0
result: issues-found
fragment: none
tags: []
refs:
  review-master: 07-review-platform-proofs.md
---

# Review: reliability

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| REL-1 | LOW | High | deferred | false | 2026-07-11 | src/lib/ai-client.ts:28-70 | collectFirstToolCall() has no timeout — hung stream blocks Worker indefinitely |

## Detailed Findings

### REL-1: No timeout on AI stream collection [LOW]

**Location:** `src/lib/ai-client.ts:28-70`

**Source:** reliability

**Evidence:**
```typescript
for await (const chunk of stream as AsyncIterable<Record<string, unknown>>) {
  if (chunk['type'] === 'TOOL_CALL_START') {
    toolName = chunk['toolCallName'] as string
    toolArgsJson = ''
  } else if (chunk['type'] === 'TOOL_CALL_ARGS') {
    toolArgsJson += (chunk['delta'] as string) ?? ''
  } else if (chunk['type'] === 'TOOL_CALL_END') {
    break  // only exit; hangs if TOOL_CALL_END never arrives
  }
}
```

**Issue:** If the OpenRouter provider's stream stalls (network partition, provider bug, TCP half-open), the `for await` loop iterates indefinitely. Cloudflare Workers have a 30-second CPU execution limit, but a stalled stream can hold the execution context open until the limit is hit, returning a generic 524 timeout to the client instead of a structured error.

**Fix:** Wrap with AbortController:
```typescript
const ac = new AbortController()
const timeout = setTimeout(() => ac.abort(new Error('AI stream timeout')), 25_000)
try {
  const stream = chat({ adapter: adapter as any, messages: messages as any, tools: toolDefs as any, signal: ac.signal })
  for await (const chunk of stream) { ... }
} finally { clearTimeout(timeout) }
```
Deferred to ai-gateway slice which owns the production streaming implementation.

**Severity:** LOW | **Confidence:** High | **Pre-existing:** false
**Status:** deferred | **Surfaced:** 2026-07-11T10:57:06Z | **Last seen:** 2026-07-11T10:57:06Z

---

*Other reliability checks: SSE route — `ReadableStream.start()` is async with no catch; enqueue after client disconnect would produce an unhandled rejection but is acceptable for a demo route. Auth route — no retry logic; single-request per-invocation pattern is correct for stateless Workers. No shared mutable state between requests. D1 access is stateless per the per-request factory pattern.*

## Summary

- Open findings: 1    (resolved this run: 0)
- Open blockers: 0    (pre-existing excluded; pre-existing findings: 0)
- Status: Issues Found
