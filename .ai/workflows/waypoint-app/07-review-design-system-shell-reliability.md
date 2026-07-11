---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: design-system-shell
review-command: reliability
status: complete
updated-at: "2026-07-11T15:17:15Z"
metric-findings-total: 1
metric-findings-blocker: 0
metric-findings-high: 0
metric-findings-pre-existing: 0
metric-findings-resolved: 0
result: issues-found
tags: []
refs:
  review-master: 07-review-design-system-shell.md
---

# Review: reliability

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| RE-1 | LOW | Med | open | false | 2026-07-11 | src/components/dashboard/JourneysDashboard.tsx:96 | No ErrorBoundary on JourneysDashboard or AppShell |

## Detailed Findings

### RE-1: Missing ErrorBoundary on authenticated shell [LOW]

**Location:** `src/components/dashboard/JourneysDashboard.tsx:96`, `src/routes/_authenticated.tsx:22`

**Source:** reliability

**Evidence:**
```typescript
// _authenticated.tsx
function AuthenticatedLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
  // No ErrorBoundary
}

// JourneysDashboard.tsx
const rawRows: any = useJourneys()
// No try/catch; useJourneys() is untyped (any); TanStack DB@0.6.14 error behavior undocumented
```

**Issue:** The authenticated layout and dashboard have no React ErrorBoundary. If `useJourneys()` throws (D1 connection failure, TanStack DB state corruption), the entire authenticated layout crashes. This surfaces as a blank page or React error overlay to the user with no recovery path. TanStack DB@0.6.14's error behavior on D1 failure is not documented in the package.

**Fix (deferred — next slice):** Add a React ErrorBoundary at the AppShell or `_authenticated` layout level with a friendly fallback ("Something went wrong. Please refresh."). This is architectural in scope and recommended as part of the `lesson-renderer` slice setup, which will add more data dependencies.

**Severity:** LOW | **Confidence:** Med | **Pre-existing:** false
**Status:** open | **Surfaced:** 2026-07-11T15:17:15Z | **Last seen:** 2026-07-11T15:17:15Z

## Summary
- Open findings: 1 (resolved this run: 0)
- Open blockers: 0 (pre-existing excluded; pre-existing findings: 0)
- Status: Issues Found
