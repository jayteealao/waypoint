---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: lesson-renderer
review-command: interface-craft
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

# Review: interface-craft

## Findings

| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
| IC-1 | LOW | Med | deferred | false | 2026-07-11T20:02:45Z | src/components/lesson/LessonView.tsx:22 | Inline style objects for title, summary, author spans — should be CSS classes |

## Detailed Findings

### IC-1: Inline styles in LessonView [LOW — deferred]

**Location:** `src/components/lesson/LessonView.tsx:22-27`
**Source:** interface-craft

**Evidence:**
```tsx
<h1 className="display-title" style={{ marginBottom: '0.25rem', fontSize: '2rem', fontWeight: 700, lineHeight: 1.2 }}>
  {doc.title}
</h1>
{doc.summary && (
  <p style={{ color: 'var(--ink-muted)', fontFamily: 'var(--font-sans)', marginTop: '0.5rem', marginBottom: '1.5rem' }}>
    {doc.summary}
  </p>
)}
```

**Issue:** The `h1`, summary `p`, source author `span` elements use inline `style={{}}` props instead of CSS classes defined in `src/styles.css`. This is inconsistent with the CSS class approach used for all other lesson elements (`.wp-lesson`, `.wp-lesson-prose`, `.wp-lesson-citation`, etc.) and makes future design token changes harder — font-size, spacing, and color changes require code edits rather than CSS-only updates.

**Triage: DEFER** — fix requires adding CSS classes to `src/styles.css` and removing inline styles from JSX. Safe and in-scope but involves two files and constitutes a cosmetic cleanup. No functional impact; acceptable as technical debt until the next CSS pass.

**Severity:** LOW | **Confidence:** Med | **Pre-existing:** false
**Status:** deferred | **Surfaced:** 2026-07-11T20:02:45Z | **Last seen:** 2026-07-11T20:02:45Z

## Summary
- Open findings: 1 deferred (resolved this run: 0)
- Open blockers: 0 (pre-existing: 0)
- Status: Issues Found

## Clean areas
- Concentric radius: `.wp-lesson` uses `--radius-md`/`--radius-lg`/`--radius-pill` token references where radius applies; consistent
- Optical alignment: `72ch` measure is correctly centered with `margin-inline: auto`
- Hit areas: `.wp-checkpoint-option` has adequate padding; `.wp-flipcard` has full-area click target
- Code block overflow: `overflow-x: auto` on `.wp-lesson-code` prevents horizontal overflow bleeding into parent
- Fraunces serif applied correctly via `--font-serif` variable on `.wp-lesson`
