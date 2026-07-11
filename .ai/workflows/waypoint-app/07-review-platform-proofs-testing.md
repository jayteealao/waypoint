---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: platform-proofs
review-command: testing
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

# Review: testing

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| TS-1 | LOW | Med | deferred | false | 2026-07-11 | tests/smoke/ai-tool-call.test.ts:64-83 | Adapter-swap test proves interface symmetry but not behavioral equivalence |

## Detailed Findings

### TS-1: Adapter-swap proof weak — TypeScript symmetry only, not behavioral [LOW]

**Location:** `tests/smoke/ai-tool-call.test.ts:64-83`

**Source:** testing

**Evidence:**
```typescript
test('adapter-swap: OpenAI fallback satisfies AIClient interface', async () => {
  const fallbackClient: AIClient = createOpenAIFallbackClient('test-key')
  const nativeClient: AIClient = createOpenRouterClient('test-key')

  for (const client of [fallbackClient, nativeClient] as const) {
    expect(typeof client.complete).toBe('function')  // ← only proves .complete exists
  }

  // Schema assertions run against createMockAIClient(), not fallbackClient or nativeClient
  const mockClient: AIClient = createMockAIClient()
  const result = await mockClient.complete(TEST_MESSAGES, TEST_TOOLS)
  expect(result.tool_use.name).toBe('echo_tool')
```

**Issue:** The test proves that both factories return an object implementing `AIClient` (TypeScript and runtime), but the schema assertions run against `createMockAIClient()` rather than the fallback or native client. If `createOpenAIFallbackClient().complete()` threw or returned a different shape, this test would still pass.

**Fix:** Wire a fetch mock (e.g., `vi.stubGlobal('fetch', mockFn)`) to stub the OpenAI-compatible API, then call `fallbackClient.complete(TEST_MESSAGES, TEST_TOOLS)` and assert the schema. This makes the proof behavioral, not just structural. Deferred: requires a network mock harness out of scope for the platform-proofs spike; addressed in ai-gateway slice.

**Severity:** LOW | **Confidence:** Med | **Pre-existing:** false
**Status:** deferred | **Surfaced:** 2026-07-11T10:57:06Z | **Last seen:** 2026-07-11T10:57:06Z

---

*Coverage assessment: All four ACs have test coverage. AC-PP1 (SSE timing): Playwright wrangler spec with elapsed assertion. AC-PP2a (mocked round trip): Vitest test 1. AC-PP2b (live smoke): test.skipIf gate, pre-registered residual. AC-PP3 (adapter swap): TypeScript-level proof (weak, see TS-1). AC-PP4 (D1 + auth): Playwright wrangler spec with status and concurrency assertions. Error paths for collectFirstToolCall (no tool call in response) and SSE stream close are untested but acceptable for a proof slice.*

## Summary

- Open findings: 1    (resolved this run: 0)
- Open blockers: 0    (pre-existing excluded; pre-existing findings: 0)
- Status: Issues Found
