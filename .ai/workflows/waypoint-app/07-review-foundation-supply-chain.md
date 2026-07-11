---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: foundation
review-command: supply-chain
status: complete
updated-at: "2026-07-11T08:58:15Z"
metric-findings-total: 1
metric-findings-blocker: 0
metric-findings-high: 0
result: issues-found
tags: [review, supply-chain, foundation]
refs:
  plan: 04-plan-foundation.md
  implement: 05-implement-foundation.md
  verify: 06-verify-foundation.md
---

# Supply-Chain Review — foundation slice

**Scope:** `git diff main...HEAD` — 32 product source files, all net-new (greenfield bootstrap)  
**Date:** 2026-07-11  

---

## 0. Supply-Chain Checklist

| Check | Result |
|---|---|
| All deps exact-pinned (no `^`, `~`, `latest`) | PASS — all 30 deps exact |
| `pnpm-lock.yaml` committed | PASS |
| CI uses `--frozen-lockfile` | PASS |
| `pnpm audit --audit-level=high` clean | PASS (verified stage 6) |
| No banned TanStack versions | PASS — @tanstack/react-start 1.168.27 and @tanstack/react-router 1.170.17 not in any banned range |
| Pin-check node script in CI | PASS — CI step 10 |
| `pnpm.onlyBuiltDependencies` allowlist | PASS — `workerd`, `sharp`, `esbuild`, `lightningcss` |
| GitHub Actions pinned to SHA | LOW FINDING — pinned to version tags only |

---

## 1. Findings

### SC-1: GitHub Actions use version tags instead of SHA digests [LOW]

**Location:** `.github/workflows/ci.yml` lines 14, 17, 22  
**Severity:** LOW | **Confidence:** Med | **Pre-existing:** false

**Evidence:**
```yaml
uses: actions/checkout@v4          # line 14
uses: pnpm/action-setup@v4         # line 17
uses: actions/setup-node@v4        # line 22
```

**Issue:** Version tags (`@v4`) are mutable — a tag can be force-pushed to point to a different commit. The supply-chain rubric flags this as a potential compromise vector. However, all three actions are from the official GitHub Actions org (`actions/`) or the official pnpm team (`pnpm/`), where the practical risk of tag compromise is extremely low.

**Why LOW rather than MED:** All actions are from trusted, official sources (GitHub Inc. and the pnpm team). No third-party actions used.

**Failure scenario:** Adversary force-pushes `actions/checkout@v4` tag → malicious code runs in CI and exfiltrates secrets. Probability: extremely low for official GitHub actions.

---

## 2. Triage Decisions

| ID | Sev | Decision | Reason |
|----|-----|----------|--------|
| SC-1 | LOW | **DEFER** | All three actions are from official trusted sources (GitHub Inc., pnpm team). SHA lookup requires network access not available during review. Address before first production merge by running `gh api /repos/<owner>/<repo>/git/ref/refs/tags/v4` for each action and pinning to the returned SHA. |

**Open (deferred):** SC-1
