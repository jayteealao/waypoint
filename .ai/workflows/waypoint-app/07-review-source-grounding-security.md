---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: source-grounding
review-command: security
status: complete
updated-at: "2026-07-12T07:32:29Z"
metric-findings-total: 1
metric-findings-blocker: 0
metric-findings-high: 0
metric-findings-pre-existing: 0
metric-findings-resolved: 0
result: issues-found
tags: []
refs:
  review-master: 07-review-source-grounding.md
---

# Review: security

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| SEC-1 | LOW | Low | deferred | false | 2026-07-12 | src/lib/source-fetch.ts:50 | No SSRF allowlist — scheme/host not restricted |

## Detailed Findings

### SEC-1: No SSRF Allowlist on User-Submitted URLs [LOW]

**Location:** `src/lib/source-fetch.ts:48-54`
**Source:** security

**Evidence:**
```typescript
export async function fetchSourceUrl(url: string): Promise<SourceFetchResult> {
  // Validates URL format only — no scheme or host restriction
  try {
    new URL(url)
  } catch {
    return { ok: false, reason: 'network_error' }
  }
  // fetch() called with fully user-controlled URL (scheme, host, path)
  response = await fetch(url, { signal: controller.signal })
```

**Issue:** User-submitted URLs are validated for format (`new URL()`) but not for scheme or host. This theoretically allows requests to non-http(s) schemes or internal host ranges. However, the Cloudflare Workers runtime substantially mitigates traditional SSRF:
- Workers cannot reach `localhost` or `127.0.0.1` (no concept of "local" in the sandboxed runtime)
- The AWS instance metadata endpoint (`169.254.169.254`) is not reachable from Workers
- Workers have access only to the public internet

Residual risk: cross-tenant Cloudflare internal addresses or Workers-specific metadata endpoints might be reachable; this is runtime-specific and hard to verify without live environment testing. The practical exploitability is Low for this deployment.

**Mitigation present:** URL scheme is implicitly restricted by `new URL()` accepting any scheme but Workers `fetch()` only supporting `http:` and `https:` — other schemes (e.g., `file:`, `ftp:`) would throw at the fetch call, which is caught by the network_error handler.

**Fix:** Add explicit scheme check: `if (!['http:', 'https:'].includes(new URL(url).protocol)) return { ok: false, reason: 'network_error' }`. This makes the intent explicit even if the runtime already enforces it.

**Severity:** LOW | **Confidence:** Low | **Pre-existing:** false
**Status:** deferred | **Surfaced:** 2026-07-12T07:32:29Z

## Summary
- Open findings: 1    (resolved this run: 0)
- Open blockers: 0    (pre-existing excluded; pre-existing findings: 0)
- Status: Issues Found
