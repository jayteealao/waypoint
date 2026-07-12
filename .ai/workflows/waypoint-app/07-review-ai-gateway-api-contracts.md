---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: ai-gateway
review-command: api-contracts
status: complete
updated-at: "2026-07-12T00:30:06Z"
metric-findings-total: 0
metric-findings-blocker: 0
metric-findings-high: 0
metric-findings-pre-existing: 0
metric-findings-resolved: 0
result: clean
fragment: none
tags: []
refs:
  review-master: 07-review-ai-gateway.md
---

# Review: api-contracts

## Findings

No findings. Clean.

## Summary

`callGateway(input: GatewayInput): Promise<GatewayResponse>` is the sole new API surface. The `GatewayInput` discriminated union (`GatewayCallWithTools | GatewayCallWithFormat | GatewayCallText`) enforces the structured-output + tool-call invariant at compile time. `QuotaExhaustedError` carries a `status: QuotaStatus` for callers that want to render the quota card. `GatewayResponse` is purposefully minimal: `toolUse?`, `text?`, `usage`. `getQuotaStatus` server function returns `QuotaStatusSerialized` with a clear `resetAt: string` (not Date) boundary — serialization contract is explicit. No breaking changes to existing APIs (ai-client.ts untouched).

- Open findings: 0
- Status: Clean
