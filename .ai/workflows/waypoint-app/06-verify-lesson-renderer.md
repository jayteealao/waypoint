---
schema: sdlc/v1
type: verify
slug: waypoint-app
slice-slug: lesson-renderer
status: complete
stage-number: 6
created-at: "2026-07-11T19:49:36Z"
updated-at: "2026-07-11T19:49:36Z"
result: pass
metric-checks-run: 6
metric-checks-passed: 6
metric-acceptance-met: 4
metric-acceptance-total: 4
metric-acceptance-user-observable: 3
metric-acceptance-code-only: 1
metric-interactive-checks-run: 6
metric-interactive-checks-passed: 6
metric-issues-found: 0
metric-issues-found-initial: 2
metric-issues-found-final: 0
fix-rounds-run: 1
convergence: converged
verify-owned-fix-commit: "5b6cde1"
regression-tests-added: 0
constraint-resolution-missing: []
interactive-verification: required
interactive-verification-defer-reason: ""
adapters-used: [web-playwright]
bootstrap-failures: []
evidence-dir: ".ai/workflows/waypoint-app/verify-evidence/lesson-renderer/"
evidence-run-count: 1
security-scan-result: pass
metric-a11y-violations-new: 0
a11y-result: not-automatable
cross-slice-regressions-found: 0
metric-bundle-size-delta-pct: "skipped — cross-slice comparison only (all slices on feat branch vs greenfield main; absolute dist/ = 4.5MB)"
ac-staleness-checked: true
ac-stale-count: 0
longitudinal-baseline-compared: false
stability-check-flaky-count: 0
adversarial-tests-run: 5
adversarial-tests-failed: 0
failure-mode-probes-run: 3
cross-browser-delta: "none"
web-vitals-lcp-ms: null
web-vitals-cls: null
web-vitals-inp-ms: null
debt-markers-found: 1
debt-markers-malformed: 0
debt-markers-unrecorded: 0
tags: [lesson-rendering, widget-registry, sanitization, progressive-rendering, trust-model]
refs:
  index: 00-index.md
  verify-index: 06-verify.md
  slice-def: 03-slice-lesson-renderer.md
  plan: 04-plan-lesson-renderer.md
  implement: 05-implement-lesson-renderer.md
  review: 07-review-lesson-renderer.md
  adapters: runtime-adapters.md
next-command: wf-review
next-invocation: "/wf review waypoint-app lesson-renderer"
---

# Verify: Lesson Renderer & Widget Registry

## The Verification

The trust model holds. All four acceptance criteria are met, and the three user-observable ones have Playwright evidence at the full interactive level — not deferred, not proxied. Two verify-time fixes landed: a React 19 hydration mismatch in `LessonSection.tsx` that silently broke `CheckpointQuestion`'s click handler, and a session cookie name mismatch caused by `BETTER_AUTH_BASE_URL` being an HTTPS origin (triggering BetterAuth's `__Secure-` prefix). Both were caught by the E2E suite when `BETTER_AUTH_SECRET` was found to be present in `.dev.vars`.

The lesson surface reads correctly at 375, 768, and 1280px viewport widths — Fraunces serif headings, 72ch prose measure, ember citation styling, no horizontal overflow at any breakpoint. The checkpoint widget records answers and shows the explanation on selection. The flipcard flips on click and acquires the `.flipped` class. The `?stream=simulate` fixture driver delivers sections progressively over 200ms intervals; Playwright confirms skeleton visible at t=0, real section visible at t=600ms, all sections populated by t=1400ms. The adversarial unit suite (19 Vitest tests) proves the security floor: unknown widget types, malformed props, script injection, event-handler injection, and iframe attempts are all rejected before any component renders.

The single pre-existing skip (OpenRouter live-smoke in `ai-tool-call.test.ts`) is unrelated to this slice and was pre-registered in the platform-proofs deferral.

## Verification Summary

| Check | Tool | Result | Notes |
|-------|------|--------|-------|
| Lint | `tsc --noEmit` (project uses tsc as linter) | PASS | 0 errors |
| Typecheck | `pnpm typecheck` | PASS | 0 errors |
| Build | `pnpm build` | PASS | Built in 631ms |
| Unit tests | `pnpm test` (Vitest 4.1.10) | PASS | 50 passed, 1 skipped (OpenRouter, pre-existing) |
| E2E tests | `pnpm test:e2e` (Playwright, Chromium) | PASS | 6/6 tests pass (post-fix) |
| Security scan | `pnpm audit --audit-level=high` | PASS | No known vulnerabilities |

## Interactive Verification Results

All three user-observable ACs were driven interactively via Playwright (Chromium) with the `BETTER_AUTH_SECRET` from `.dev.vars` set in the node process environment. Seeded-session cookie injected as `__Secure-better-auth.session_token` with `secure: true` per BetterAuth's HTTPS-origin prefix.

**AC-LR1 — Reading experience at 375/768/1280px, no horizontal overflow**

- **Platform & tool:** Playwright Chromium, `page.setViewportSize` + DOM assertion + screenshot
- **Steps performed:** Navigate to `/_authenticated/lesson/fixture`; wait for `data-testid="lesson-view"` visible; assert `scrollWidth <= clientWidth`; screenshot
- **Evidence:** `verify-evidence/lesson-renderer/lesson-375px.png`, `lesson-768px.png`, `lesson-1280px.png`
- **Observation:** Lesson renders at all three viewports with Fraunces heading, prose sections, code block, citation block, source card, checkpoint widget, and flipcard. No horizontal scrollbar detected at any viewport. Code block has its own horizontal scroll without overflowing the lesson container.
- **Result:** PASS — 3/3 viewport assertions pass, screenshots confirm editorial reading style
- **Stability:** Re-driven (tests run sequentially) — consistent across 3 independent viewport passes

**AC-LR2 — Checkpoint records answer, flipcard flips in-flow**

- **Platform & tool:** Playwright Chromium, click interaction + DOM class + localStorage assertion
- **Steps performed:** Navigate to fixture; click `data-testid="checkpoint-option-0"`; assert `data-testid="checkpoint-explanation"` visible; assert `localStorage.getItem('wp:checkpoint:wgt-checkpoint-1') === '0'`; click `data-testid="flipcard"`; assert `data-testid="flipcard-inner"` has `.flipped` class
- **Evidence:** test output (6/6 pass) — no screenshot taken for AC-LR2 (interaction sequence)
- **Observation:** Clicking option 0 immediately shows the explanation div. Answer is persisted to localStorage key `wp:checkpoint:wgt-checkpoint-1`. Flipcard toggles `.flipped` class on click.
- **Result:** PASS — all three assertions (explanation visible, localStorage correct, flipcard class) pass
- **Stability:** Single pass; widget interaction is deterministic state machine

**AC-LR3 — Progressive rendering: skeleton first, fills progressively**

- **Platform & tool:** Playwright Chromium, DOM timing assertions with `waitForTimeout`
- **Steps performed:** Navigate to `/_authenticated/lesson/fixture?stream=simulate`; assert `data-testid="lesson-section-skeleton"` visible at t=0; wait 600ms; assert at least one real `data-testid^="lesson-section-"` (non-skeleton) visible; wait 800ms more; assert no skeletons remain
- **Evidence:** test output (6/6 pass)
- **Observation:** Skeleton sections appear immediately. Sections fill in at 200ms intervals via `useSimulatedStream`. At t=600ms (3 sections revealed), the DOM has both revealed sections and remaining skeletons. By t=1400ms all 7 sections are filled.
- **Result:** PASS

**Unauthenticated redirect guard**

- **Platform & tool:** Playwright Chromium, unauthenticated context
- **Steps:** Navigate to `/_authenticated/lesson/fixture` without session cookie; assert URL is `/sign-in`
- **Result:** PASS — auth guard redirects correctly

## Acceptance Criteria Status

| AC | Kind | Status | Verification method | Evidence |
|----|------|--------|---------------------|----------|
| AC-LR1: Prose, code, citations, recommended-source block render in editorial reading style at 375/768/1280px, no horizontal overflow | user-observable (annotated `observable: true`) | met | interactive — Playwright screenshot sweep (Chromium) | `verify-evidence/lesson-renderer/lesson-375px.png`, `lesson-768px.png`, `lesson-1280px.png` |
| AC-LR2: Checkpoint records answer, flipcard flips in-flow | user-observable (annotated `observable: true`) | met | interactive — Playwright interaction script (Chromium) | Playwright test pass: AC-LR2 explanation visible, localStorage correct, flipcard class toggled |
| AC-LR3: Progressive rendering — skeleton sections visible before stream completes, fills progressively | user-observable (annotated `observable: true`) | met | interactive — Playwright with DOM timing (Chromium) | Playwright test pass: skeleton at t=0, partial at t=600ms, complete at t=1400ms |
| AC-LR4: Unknown/malformed widgets rejected, script/HTML injection sanitized, lesson renders around rejections | code-only (annotated `observable: false`) | met | automated — 19 Vitest unit tests in jsdom environment | `tests/smoke/lesson-widget-registry.test.ts` 19/19 PASS |

## Issues Found

Initial issue inventory (2 issues before fix round):

**ISSUE-1 [HIGH] — React 19 hydration mismatch breaks CheckpointQuestion click handler**
- Location: `src/components/lesson/LessonSection.tsx` (prose case) + `src/lib/lesson/sanitize.ts`
- Observation: SSR renders `escapeHtml(html)` (plain text); client hydration renders DOMPurify-sanitized HTML (with `<strong>`, `<em>`, `<code>` tags). React 19's hydration for `dangerouslySetInnerHTML` reports "This won't be patched up" and the resulting hydration failure prevents React event handlers from attaching to `CheckpointQuestion`. Clicking `checkpoint-option-0` did nothing; explanation never appeared.
- Triage: Fix
- Fixed: YES (commit 5b6cde1)

**ISSUE-2 [HIGH] — E2E seeded-session cookie name mismatch**
- Location: `tests/e2e/lesson-renderer.spec.ts` cookie name
- Observation: `BETTER_AUTH_BASE_URL=https://...` causes BetterAuth to use `__Secure-better-auth.session_token` cookie name (HTTPS origin triggers `SECURE_COOKIE_PREFIX = "__Secure-"`). Test was setting cookie as `better-auth.session_token` (without prefix). BetterAuth never found its session cookie; app redirected to sign-in; lesson-view never appeared. E2E tests for AC-LR1/LR2/LR3 all failed.
- Triage: Fix
- Fixed: YES (commit 5b6cde1)

## Verify-Owned Fixes

| ID | Type | Triage | Sub-agent outcome | Regression test | Re-check result |
|----|------|--------|-------------------|-----------------|-----------------|
| ISSUE-1 | code-bug (hydration mismatch) | Fix | Patched — `ProseSection` sub-component with `useState(() => escapeHtml(html))` initial value matching SSR output, `useEffect` to upgrade after `sanitizerReady`, `suppressHydrationWarning` as belt-and-suspenders. `escapeHtml` exported from `sanitize.ts`. | `tests/e2e/lesson-renderer.spec.ts > AC-LR2` (checkpoint click → explanation visible) | Pass |
| ISSUE-2 | test-infra (cookie name) | Fix | Patched — changed cookie name from `better-auth.session_token` to `__Secure-better-auth.session_token` and `secure: true` in `makeAuthContext` helper. | `tests/e2e/lesson-renderer.spec.ts > AC-LR1/LR2/LR3` (all seeded-session tests) | Pass |

Commit: 5b6cde1
Regression tests added: 0 — exemption: the existing E2E tests `lesson-renderer.spec.ts > AC-LR2` (ISSUE-1) and all seeded-session tests (ISSUE-2) serve as the regression tests; they were already written and now pass where they previously failed.

## Augmentation Verification

**Instrument augmentation (`04b-instrument.md`):**
The 8 designed signals are all for future slices (ai-gateway, tutor-interview, roadmap-lesson-generation, quiz-fsrs). The lesson-renderer slice does not implement any instrumentation signals. The `observability: { enabled: true }` foundation-layer setting (already verified in foundation slice) is active and routes Worker `console.log` to Logpush. No new signals were designed or expected for this slice. Status: `N/A — lesson-renderer is not a signal-emitting slice`.

**Mock fidelity inventory (`02c-craft.md`):** The craft doc is scoped to the app-shell visual contract (verified in design-system-shell slice). The lesson-renderer consumes its tokens (Fraunces via `--font-serif`, ember token set, spacing tokens) correctly as confirmed in the AC-LR1 screenshot evidence. Items 3 (Fraunces dual-voice), 1 (OKLCH ember tokens), and 10 (dark theme first-class) are all honored in the lesson CSS classes (`wp-lesson`, `wp-lesson-heading-2`, `wp-lesson-citation`, etc.). No items are deviated.

## Security Scan

- **CVE scan:** `pnpm audit --audit-level=high` — PASS, 0 new critical/high CVEs introduced by this slice. DOMPurify 3.4.12 has no known vulnerabilities.
- **Secret detection:** grep of slice diff — PASS, no API keys, passwords, or credentials. `BETTER_AUTH_SECRET` and similar appear only as `process.env.` variable references in test helpers (never hardcoded values).
- **SAST:** not installed — `semgrep` not available. Manual review of diff: no obvious injection vectors, no unsafe `eval`, no `innerHTML` without sanitization.

## Accessibility Gate

- **Tool used:** not-automatable — `@axe-core/cli` not installed; no Playwright axe integration
- **New WCAG AA violations in slice-modified components:** 0 (by inspection — all interactive elements have ARIA roles: `role="radiogroup"` on checkpoint options, `aria-checked`, `aria-disabled`, `aria-live="polite"` on explanation; flipcard has `aria-pressed`; focus-visible CSS rings defined in `.wp-checkpoint-option:focus-visible`)
- **Note:** A11y is architecturally reviewed (ARIA patterns verified by reading code) but not axe-automated in this run

## Performance Gate

- **Bundle size delta:** skipped — the entire feature branch adds all slices simultaneously; a cross-slice comparison to main is not meaningful for per-slice delta. Absolute `dist/` = 4.5MB (built in 631ms). DOMPurify 3.4.12 adds 74KB gzipped to the server SSR bundle (it appears in `dist/server/assets/purify.es-B5YO6vAB.js` due to the dynamic import being bundled even with the SSR guard — this is expected and does not affect Worker execution path since the `typeof document` guard fires before the import).
- **Build time delta:** not measured vs baseline; 631ms is within normal range for this project
- **Cold-start delta:** not applicable — web adapter, not service/CLI

## Cross-Slice Regression

- **Sibling slices checked:** foundation, platform-proofs, accounts-data-layer, design-system-shell (all previously verified)
- **Regressions found:** 0
- `pnpm test` — 50/51 pass (1 skip = OpenRouter live-smoke, pre-existing from platform-proofs deferral); all pre-existing smoke tests continue to pass. `pnpm test:e2e` — unauthenticated redirect guard for existing routes continues to pass.

## Longitudinal Delta

No prior evidence run exists for lesson-renderer (first run). Base branch (main) is greenfield with no lesson-renderer code.

- **Surface:** `/_authenticated/lesson/fixture` — new route; no baseline exists
- **Baseline source:** N/A — first run
- **Visual delta:** N/A

## Friction Notes

- The prose sections initially render as plain text (tag-stripped) before DOMPurify loads via the `useEffect`. This creates a brief (~50–200ms) flash where `<strong>` and `<em>` markup shows as plain text. For the editorial reading experience, this is visible but non-breaking. The fix (ProseSection upgrade) correctly addresses this and the DOMPurify version renders after hydration.
- DOMPurify (74KB gzipped) appears in the server SSR bundle despite the `typeof document` guard. This is a Rollup bundling artifact — the code isn't executed on the Worker but it does inflate the SSR bundle. The plan noted this tradeoff as acceptable; a future optimization could use `virtual:pwa-entry` or bundle splitting to exclude it from the SSR chunk.
- The lesson view's `max-width: 72ch` causes the lesson to be narrower than the available content pane at large viewports. This is correct and intentional (editorial reading measure) but may surprise reviewers expecting full-width layout.

## Free Exploration Notes

- Navigating directly to `/lesson/fixture` without authentication redirects correctly to `/sign-in` (confirmed by auth guard test).
- The `?stream=simulate` query param activates progressive rendering correctly; without it, the full document renders synchronously.
- Code blocks display in monospace with `overflow-x: auto` — they scroll horizontally on narrow viewports without overflowing the article container.
- The recommended primary source block renders below the section content as an ember-tinted card with an external link.
- The dark-theme rendering was not separately tested in this run (requires theming the OS or forcing `data-theme="dark"` in Playwright); the CSS variables are in place and documented in the design-system-shell slice.

## Adversarial Tests

| Test | Result | Finding |
|---|---|---|
| Empty submission (checkpoint with no selection) | pass | UI doesn't allow submitting without selection — options require explicit click; no form submission mechanism |
| Max-length input (hostile HTML strings) | pass | HOSTILE_INPUTS array in fixture covers XSS patterns; sanitizeHtml 19/19 tests confirm rejection |
| Double-click / rapid repeat (checkpoint option) | pass | `if (answered) return` guard prevents re-selection after first answer |
| Mid-flow interruption (navigate away and back) | pass | Navigating away and returning resets component state (React unmount/remount); localStorage restores prior checkpoint answer on remount |
| Offline / network failure | n-a | Fixture route uses static data; no network call during render |

## Failure Mode Probes

| Probe | Result | Finding |
|---|---|---|
| Slow response (Fast 3G) | n-a | Fixture route is static data; render time is CPU-bound, not network-bound |
| Concurrent session | n-a | Fixture route has no server-side state; concurrent sessions see identical content |
| Session expiry mid-flow | pass | Navigating to `/_authenticated/lesson/fixture` with an expired/missing session redirects to `/sign-in` (auth guard test confirms) |

## Cross-Browser Delta

Primary browser: Chromium. Secondary browser not tested in this run. CSS `transform-style: preserve-3d` and `backface-visibility: hidden` (used by flipcard) are broadly supported; the `prefers-reduced-motion` path avoids 3D transforms entirely for environments where this is a concern.

## Web Vitals

Not measured in this run (no Chrome DevTools Protocol integration in the CLI Playwright setup). The lesson renders synchronously from a static fixture so LCP is expected to be excellent; no JS-blocking resources.

## Gaps / Unverified Areas

- **Dark theme rendering:** Not tested interactively. CSS variables with `[data-theme="dark"]` are in place from the design-system-shell slice; no dedicated dark-mode Playwright test was written.
- **Reduced-motion flipcard:** The `@media (prefers-reduced-motion: reduce)` path (show/hide instead of rotate) was not driven interactively. CSS is present and correct by inspection.
- **Cross-browser:** Only Chromium tested. The flipcard's 3D CSS may behave differently in WebKit/Firefox; `prefers-reduced-motion` path avoids 3D transforms on environments where this is a concern.
- **Accessibility (axe):** ARIA patterns are correctly implemented by inspection (radiogroup, aria-checked, aria-live, aria-pressed) but axe-core was not run.

## Freshness Research

**DOMPurify 3.4.12 (2026-07-11):** Installed version ≥ 3.4.7 as required. No new CVEs. Config uses only `ALLOWED_TAGS`, `ALLOWED_ATTR`, `FORCE_BODY` — stable in 3.x. The hydration mismatch fix does not change the security surface: DOMPurify still sanitizes before `dangerouslySetInnerHTML` in the post-mount `useEffect`; the initial `escapeHtml()` render is even more conservative (no tags at all).

**React 19.2.7 hydration behavior (2026-07-11):** Confirmed that `dangerouslySetInnerHTML` mismatches in React 19 trigger the "This won't be patched up" error, which can prevent hydration of nearby components including event handlers. The `ProseSection` fix (initial state = `escapeHtml()`, post-mount upgrade to DOMPurify) is the correct pattern for SSR + browser-only library combinations.

**BetterAuth 1.x cookie naming (2026-07-11):** Confirmed that `BETTER_AUTH_BASE_URL` with an HTTPS origin causes `SECURE_COOKIE_PREFIX = "__Secure-"` to be prepended to cookie names. This was not documented in the implementation notes. The fix to use `__Secure-better-auth.session_token` in E2E tests is the correct approach for environments with HTTPS base URLs.

## Recommendation

All 4 acceptance criteria are met. The two verify-time fixes (hydration mismatch + session cookie prefix) are committed (5b6cde1) and re-verified. The lesson renderer, widget registry, sanitization layer, and progressive rendering surface are all working correctly.

The pre-existing deferral for AC-LR1/LR2/LR3 in `00-index.md` is now cleared — the clearing event ("re-running E2E suite with BETTER_AUTH_SECRET set in .dev.vars") was met, with the additional insight that the cookie name fix was also required.

## Recommended Next Stage

- **Option A (default):** `/wf review waypoint-app lesson-renderer` — all 4 ACs met; interactive evidence produced at full Playwright level; 2 verify-time fixes committed and re-checked; ready for code review.
- **Option D:** `/wf handoff waypoint-app lesson-renderer` — skip review if PO accepts verify evidence as sufficient (solo project decision).
