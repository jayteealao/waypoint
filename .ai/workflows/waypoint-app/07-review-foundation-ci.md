---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: foundation
review-command: ci
status: complete
updated-at: "2026-07-11T08:58:15Z"
metric-findings-total: 1
metric-findings-blocker: 0
metric-findings-high: 0
result: issues-found
tags: [review, ci, foundation]
refs:
  plan: 04-plan-foundation.md
  implement: 05-implement-foundation.md
---

# CI Review — foundation slice

**Scope:** `.github/workflows/ci.yml` — new file (64 lines + 3 added by fix)  
**Date:** 2026-07-11  

---

## 0. CI Checklist

| Gate | Status |
|---|---|
| Install uses `--frozen-lockfile` | PASS |
| Route types generated before typecheck | PASS — `pnpm generate-routes` step present |
| Typecheck | PASS |
| Lint | PASS |
| Unit tests | PASS |
| E2e tests | PASS — Playwright chromium only (correct for CI) |
| Supply-chain audit (`--audit-level=high`) | PASS |
| Pin-check (no floating ranges) | PASS — inline node script |
| No hardcoded secrets in CI | PASS — no env secrets referenced |
| No `continue-on-error: true` | PASS |
| `reuseExistingServer: !process.env.CI` | PASS — e2e correctly starts own server in CI |
| Explicit `permissions:` block | FIXED (CI-1) |

---

## 1. Findings

### CI-1: No explicit `permissions:` block [NIT] — FIXED

**Location:** `.github/workflows/ci.yml` (between `on:` and `jobs:`)  
**Severity:** NIT | **Confidence:** Med | **Pre-existing:** false | **Status:** FIXED

**Issue:** The workflow had no `permissions:` block, meaning `GITHUB_TOKEN` permissions were governed solely by the repository's default workflow permissions setting. If that setting were ever changed to read-write (the GitHub default for older repos), CI would gain unintended write access.

**Fix applied:**
```diff
 on:
   push:
     branches: [main]
   pull_request:
     branches: [main]

+permissions:
+  contents: read
+
 jobs:
```

---

## 2. Triage Decisions

| ID | Sev | Decision | Reason |
|----|-----|----------|--------|
| CI-1 | NIT | **FIXED** | In-scope (CI YAML is in this diff), localized (3-line addition), safe (no convention conflict). Applied immediately. |

**Fixed:** CI-1
