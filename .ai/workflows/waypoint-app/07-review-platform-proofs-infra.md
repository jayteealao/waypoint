---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: platform-proofs
review-command: infra
status: complete
updated-at: "2026-07-11T10:57:06Z"
metric-findings-total: 0
metric-findings-blocker: 0
metric-findings-high: 0
metric-findings-pre-existing: 0
metric-findings-resolved: 0
result: clean
fragment: none
tags: []
refs:
  review-master: 07-review-platform-proofs.md
---

# Review: infra

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| INFRA-1 | NIT | High | deferred | false | 2026-07-11 | wrangler.jsonc:14 | Placeholder D1 UUID would cause wrangler deploy to fail |

*Note: INFRA-1 is deferred and not counted in open findings.*

## Detailed Findings

### INFRA-1: Placeholder D1 database_id [NIT]

**Location:** `wrangler.jsonc:14`

**Source:** infra

**Evidence:**
```jsonc
// Placeholder ID valid for wrangler dev / miniflare local D1.
// Replace with the real ID from `wrangler d1 create waypoint-dev` on first deploy.
"database_id": "00000000-0000-0000-0000-000000000000"
```

**Issue:** The placeholder UUID is valid for local `wrangler dev` (miniflare creates a local SQLite DB regardless of the ID), but a `wrangler deploy` targeting the Cloudflare API would fail with "database not found." The in-file comment documents this, but there is no automated guard.

**Fix:** Run `wrangler d1 create waypoint-dev` and replace the UUID before first production deploy. Deferred: requires Cloudflare account access.

**Severity:** NIT | **Confidence:** High | **Pre-existing:** false
**Status:** deferred | **Surfaced:** 2026-07-11T10:57:06Z | **Last seen:** 2026-07-11T10:57:06Z

---

*Other infra checks: `observability: { enabled: true }` present in wrangler.jsonc (foundation slice addition, correct). D1 binding fields (binding, database_name, database_id) are all present and correctly typed. `nodejs_compat` compatibility flag present. No open ports or env var leaks.*

## Summary

- Open findings: 0    (resolved this run: 0)
- Open blockers: 0    (pre-existing excluded; pre-existing findings: 0)
- Status: Clean
