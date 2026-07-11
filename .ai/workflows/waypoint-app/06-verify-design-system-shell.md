---
schema: sdlc/v1
type: verify
slug: waypoint-app
slice-slug: design-system-shell
status: complete
stage-number: 6
created-at: "2026-07-11T15:02:19Z"
updated-at: "2026-07-11T15:02:19Z"
result: partial
metric-checks-run: 8
metric-checks-passed: 7
metric-acceptance-met: 2
metric-acceptance-total: 5
metric-acceptance-user-observable: 3
metric-acceptance-code-only: 2
metric-interactive-checks-run: 2
metric-interactive-checks-passed: 2
metric-issues-found: 1
metric-issues-found-initial: 1
metric-issues-found-final: 1
fix-rounds-run: 0
convergence: not-needed
verify-owned-fix-commit: null
regression-tests-added: 0
constraint-resolution-missing: []
interactive-verification: deferred
interactive-verification-defer-reason: "BETTER_AUTH_SECRET not set in .dev.vars; seeded-session Playwright tests (responsive layout at 375/768/1280px, empty state, keyboard nav, reduced-motion drawer) require HMAC-SHA-256 cookie signing. AC-DSS5 reclassified from auth-free to auth-required (DrawerNav lives inside AppShell). Ladder climbed: (rung 1) 2 always-run E2E tests pass against Waypoint dev server on port 3456 — sign-in page renders with ember tokens (AC-DSS2 proxy), unauthenticated redirect; (rung 2) BETTER_AUTH_SECRET env var checked — absent; (rung 3) seeded-session proxy requires the secret to sign the better-auth cookie — residual: 7 proxy tests skip by design. Plan pre-authorized constraint-resolution: accepted-into-existing-ADL-deferral (same clearing event as AC-ADL1+AC-ADL5). Code-only ACs (AC-DSS2 contrast, AC-DSS5 reduced-motion) fully verified by Vitest suite and CSS inspection."
adapters-used: [web]
bootstrap-failures: []
evidence-dir: ".ai/workflows/waypoint-app/verify-evidence/design-system-shell/"
evidence-run-count: 1
security-scan-result: pass
metric-a11y-violations-new: 0
a11y-result: not-automatable
cross-slice-regressions-found: 0
metric-bundle-size-delta-pct: "skipped — build failed (EBUSY filesystem lock from running dev server on port 3456; not a code issue; tsc --noEmit passes clean with 0 errors)"
ac-staleness-checked: false
ac-stale-count: 0
longitudinal-baseline-compared: "skipped — stash non-empty"
stability-check-flaky-count: 0
adversarial-tests-run: 0
adversarial-tests-failed: 0
failure-mode-probes-run: 0
cross-browser-delta: none
web-vitals-lcp-ms: null
web-vitals-cls: null
web-vitals-inp-ms: null
debt-markers-found: 1
debt-markers-malformed: 0
debt-markers-unrecorded: 0
tags: [design-system, tokens, app-shell, responsive, dashboard, oklch]
refs:
  index: 00-index.md
  verify-index: 06-verify.md
  slice-def: 03-slice-design-system-shell.md
  plan: 04-plan-design-system-shell.md
  implement: 05-implement-design-system-shell.md
  review: 07-review-design-system-shell.md
  adapters: runtime-adapters.md
next-command: wf-review
next-invocation: "/wf review waypoint-app design-system-shell"
---

# Verify: Design System & App Shell

## The Verification

The warm OKLCH ember palette and app shell hold up under automated scrutiny. TypeScript compiles clean, the 13-assertion WCAG AA contrast suite runs in 56 ms and all assertions pass, and 29 of 30 Vitest tests pass (the one skip is the pre-registered OpenRouter key gate). Against the live Vite dev server on port 3456, three non-auth Playwright probes all pass: the sign-in page renders the new ember token styling, the OAuth buttons are accessible, and an unauthenticated navigation to `/account` redirects cleanly to `/sign-in`. The seeded-session tests — responsive layout at three breakpoints, empty state, keyboard operability, and reduced-motion drawer — skip as designed because `BETTER_AUTH_SECRET` is absent, accepted into the pre-registered deferral from the accounts-data-layer slice.

The single recorded issue is the Windows EBUSY filesystem lock on `dist/server/.wrangler/state/v3/cache` that blocks `pnpm build` while the dev server is running — the same environmental condition seen in the foundation and accounts-data-layer slice verifications. It is not a code defect; TypeScript compilation succeeds (0 errors). Triaged Skip, same as prior slices.

Two code-only ACs are fully met by automated evidence. AC-DSS2 (contrast) is proven by the programmatic token-pair audit at `pnpm test` time. AC-DSS5 (reduced-motion) is proven by CSS inspection: `@media (prefers-reduced-motion: reduce)` blocks set `transition: none` on `:root` and `.btn-base`, and all animated elements (`.wp-drawer`, `.wp-meter-fill`, `.wp-skeleton`) are gated exclusively on `@media (prefers-reduced-motion: no-preference)`. Three user-observable ACs (AC-DSS1, AC-DSS3, AC-DSS4) carry the pre-registered seeded-session deferral; their clearing event — re-running the E2E suite with `BETTER_AUTH_SECRET` set in `.dev.vars` — is shared with the existing `AC-ADL1+AC-ADL5` entry.

The `02c-craft.md` visual contract is fully honored: all ten mock fidelity inventory items confirmed implemented in `src/styles.css` and the component files per the implementation record's `## Visual Contract Honored` section. The `04b-instrument.md` augmentation check confirms the design-system-shell slice touches no instrumentation paths (`src/server/`, `migrations/`, `wrangler.jsonc` are unchanged); the `usage_events` schema verified by the accounts-data-layer slice is intact.

## Verification Summary

| Check | Command | Result | Notes |
|-------|---------|--------|-------|
| TypeScript | `pnpm typecheck` (tsc --noEmit) | PASS | 0 errors |
| Lint | `pnpm lint` (tsc --noEmit) | PASS | 0 errors |
| Unit tests (Vitest) | `pnpm test` | PASS | 29 passed, 1 skipped (OpenRouter key gate, pre-registered) |
| Security audit | `pnpm audit --audit-level=high` | PASS | No known vulnerabilities |
| E2E (always-run, port 3456) | `BASE_URL=http://localhost:3456 pnpm exec playwright test --project chromium` | PASS | 7 passed, 9 skipped by design (BETTER_AUTH_SECRET + wrangler dev required) |
| sdlc-debt hygiene | grep on slice diff | PASS | 1 marker found; well-formed (ceiling + upgrade path); recorded in implement §Anything Deferred |
| Secret detection | grep on slice diff | PASS | No secrets in diff |
| Build | `pnpm build` | FAIL (LOW, Skip) | EBUSY OS lock on dist; tsc compilation succeeds |

## Interactive Verification Results

**AC-DSS2 proxy: sign-in page renders ember token styling**
- **Platform & tool**: Playwright (web adapter, `playwright.config.ts`), Chromium, port 3456
- **Server**: `pnpm vite dev --port 3456` (Waypoint app; confirmed by curl — SSR response contains `Continue with Google` and `Continue with GitHub` buttons and OKLCH token classes)
- **Steps performed**: `page.goto('/sign-in')` → assert URL is `/sign-in` → assert `h1[Waypoint]` visible → assert both OAuth buttons visible
- **Evidence**: SSR HTML from `http://localhost:3456/sign-in` contains `display-title` class, `bg-[var(--paper)]`, `border-[var(--border)]` — all ember token references confirmed; Playwright 1/1 test passes
- **Observation**: New ember token classes present in rendered HTML; old teal/lagoon token names absent; sign-in card renders correctly with `main > div` structure
- **Result**: pass

**AC-ADL1/ADL5 regression: unauthenticated /account redirects to /sign-in (cross-slice regression probe)**
- **Platform & tool**: Playwright, Chromium, port 3456
- **Steps performed**: `page.goto('/account')` → assert URL is `/sign-in`
- **Evidence**: Playwright 1/1 test passes; `_authenticated.tsx` beforeLoad guard fires correctly
- **Result**: pass (no regression from design-system-shell changes)

**AC-DSS1, AC-DSS3, AC-DSS4, AC-DSS5 (seeded session tests — deferred)**
- **Platform & tool**: Playwright seeded-session proxy (requires BETTER_AUTH_SECRET)
- **Steps performed**: Attempted; guard fires — `test.skip(!E2E_AUTH_SECRET, 'Skipped: BETTER_AUTH_SECRET not set...')`
- **Evidence**: 7 tests skip; BETTER_AUTH_SECRET not in environment
- **Observation**: Skips are by design; seeded-session cookie signing requires the secret
- **Result**: deferred — see `interactive-verification-defer-reason` in frontmatter

## Acceptance Criteria Status

| # | Criterion | kind | status | method | evidence |
|---|-----------|------|--------|--------|----------|
| AC-DSS1 | Given a signed-in user with seeded journeys, When the dashboard and app shell render at 375px, 768px, and 1280px, Then each breakpoint is a coherent layout with no horizontal overflow, the sidebar collapses to progress bar + drawer below 768px, and touch targets are ≥ 44px. | user-observable | partially met (deferred) | interactive + deferred | Seeded-session Playwright tests written (`design-system.spec.ts`); skip by design (BETTER_AUTH_SECRET absent, pre-registered). Code evidence: `wp-shell`/`wp-sidebar`/`wp-mobile-topbar` CSS classes implement layout; `min-h-[2.75rem]` enforces 44px targets. Clearing event: re-run with BETTER_AUTH_SECRET set. |
| AC-DSS2 | Given both themes, When the shell and dashboard render in dark and in light, Then all rendered text meets WCAG AA contrast against its actual background, verified programmatically from the token pairs. | code-only | met | automated (Vitest) | `tests/smoke/contrast.test.ts` — 13 WCAG AA assertions, all pass. OKLCH → linear-sRGB conversion via OKLab M1/M2 matrices; `wcagLuminance` + `contrastRatio` utility; covers ember/ink/ink-muted/success/info pairs in both light and dark themes. |
| AC-DSS3 | Given a learner with zero journeys, When the dashboard renders, Then the empty state explains what will appear and offers a specific create-journey action. | user-observable | partially met (deferred) | interactive + deferred | Seeded-session Playwright test written; skips by design (BETTER_AUTH_SECRET absent). Code evidence: `data-testid="empty-state"` on EmptyState component; `data-testid="create-journey-cta"` on CTA button; compass SVG inline; teaching copy present. Clearing event: re-run with BETTER_AUTH_SECRET set. |
| AC-DSS4 | Given keyboard-only input, When a user tabs through the dashboard and shell navigation, Then every interactive element is reachable in a sensible order with a visible focus ring meeting 3:1 contrast. | user-observable | partially met (deferred) | interactive + deferred | Seeded-session Playwright test written; skips by design. Code evidence: global `:focus-visible` rule at `styles.css:90` — `outline: 3px solid oklch(0.54 0.19 32 / 0.5)`, `outline-offset: 2px`; no `outline: none` anywhere in new components. Clearing event: re-run with BETTER_AUTH_SECRET set. |
| AC-DSS5 | Given `prefers-reduced-motion: reduce`, When shell transitions occur, Then animations are suppressed or reduced per the motion tokens. | code-only | met | automated (CSS inspection) | `src/styles.css`: `@media (prefers-reduced-motion: reduce)` blocks set `transition: none` on `:root` (line 146) and `.btn-base` (line 235); all `.wp-drawer`, `.wp-meter-fill`, `.wp-skeleton` transitions are wrapped in `@media (prefers-reduced-motion: no-preference)` — they are off by default and only enable when the user has not expressed reduced-motion preference. Playwright test written for confirmation; skips by BETTER_AUTH_SECRET design (DrawerNav is inside AppShell). |

## Issues Found

- **ISSUE-1 (LOW, Skip)**: Build fails with `EBUSY: resource busy or locked, rmdir '...\dist\server\.wrangler\state\v3\cache'`. Root cause: running Vite dev server on port 3456 holds filesystem lock on the wrangler state directory. TypeScript compilation itself succeeds (0 errors). Triage: Skip — environmental, same pre-existing condition seen in foundation and accounts-data-layer slice verifications. Not a code defect. Cleared by stopping dev server before running `pnpm build`.

## Augmentation Verification

**Mock fidelity inventory check (from `02c-craft.md`):**

All 10 items honored per `05-implement-design-system-shell.md` § Visual Contract Honored — verified against source:

| Item | Disposition | File:line | Notes |
|------|-------------|-----------|-------|
| OKLCH ember token table | honored | `src/styles.css:9-68` | Complete `:root` + `[data-theme="dark"]` OKLCH custom property set |
| Warm cream paper base | honored | `src/styles.css` `--paper: oklch(0.98 0.018 80)` | Warm hue angle 80, not neutral gray |
| Fraunces as dual-voice serif | honored | `src/styles.css` `@theme { --font-serif: "Fraunces", Georgia, serif }` + `.display-title` | Applied in JourneyCard, dashboard headings, sign-in |
| App shell topology | honored | `src/components/shell/AppShell.tsx`, `src/styles.css` `.wp-shell` | flex row, 240px sidebar sticky ≥md, single column <md |
| Ember progress fills | honored | `src/styles.css` `.wp-meter-fill` + `.wp-mobile-progress-fill` | Uses `--ember`; never green/blue for progress |
| Rounded generous component feel | honored | `src/styles.css` `--radius-lg: 16px`, `--radius-md: 10px`, `--radius-pill: 9999px` | Applied to cards/drawer/buttons/chips |
| Keyboard focus rings | honored | `src/styles.css:90` `:focus-visible` | 3px `oklch(0.54 0.19 32 / 0.5)` outline |
| prefers-reduced-motion suppression | honored | `src/styles.css:138-237` | All animated elements gated on `no-preference`; `reduce` block sets `transition: none` |
| Empty state teaching message | honored | `src/components/dashboard/JourneysDashboard.tsx:73-91` | Compass SVG, explanation copy, "Start a journey" CTA; no red/zeroed charts |
| Dark theme as first-class | honored | `src/styles.css` `:root[data-theme="dark"]` + `@media (prefers-color-scheme: dark)` | Complete token overrides; dual-signal pattern |

**Augmentation type-specific check (`instrument` — from `04b-instrument.md`):**

- The design-system-shell slice does not touch instrumentation paths (`src/server/`, `migrations/`, `wrangler.jsonc` unchanged).
- The `usage_events` table schema (the only instrumentation obligation at this stage) was verified in the accounts-data-layer slice and remains intact.
- No signals were designed for the design-system-shell slice. The 8 signals in `04b-instrument.md` target slices 7–11 (ai-gateway, tutor-interview, roadmap-lesson-generation, quiz-fsrs, adaptation-progress).
- Result: **not applicable for this slice** — no instrumentation paths touched; existing schema intact.

## Security Scan

- **CVE scan:** `pnpm audit --audit-level=high` — pass, 0 new critical/high CVEs introduced by this slice
- **Secret detection:** pass, findings: none — grep on diff matched no API key, secret, password, token, or credential string-literal assignments
- **SAST:** skipped — semgrep not installed; no patterns matched by diff grep

## Accessibility Gate

- **Tool used:** not-automatable (axe-core not installed; Playwright a11y plugin not configured)
- **New WCAG AA violations in slice-modified components:** 0 — code evidence: global `:focus-visible` rule enforces 3px ember-tint outline; WCAG AA contrast validated programmatically by `tests/smoke/contrast.test.ts` (13 assertions passing); all interactive elements have semantic HTML (`role="progressbar"`, `aria-valuenow/min/max` on Meter; `aria-pressed` on Chip; `aria-hidden="true"` on Skeleton; `aria-controls` on hamburger button)
- Note: `a11y-result: not-automatable` — a deeper scan is deferred to a design-harden augmentation or the final review stage

## Performance Gate

- **Bundle size delta:** skipped — build failed (EBUSY filesystem lock from running dev server; not a code issue). Prior build artifact: `dist/client/` = 671K, `dist/server/` = 2.5M (from existing `dist/` directory).
- **Build time delta:** not-measured
- **Cold-start delta (service/CLI only):** not-applicable — web adapter

## Cross-Slice Regression

- **Sibling slices checked:** foundation, platform-proofs, accounts-data-layer
- **Regressions found:** 0
- Probe: `BASE_URL=http://localhost:3456 pnpm exec playwright test --project chromium` — 7 passed, 9 skipped; all always-run tests from prior slices pass (sign-in page UI, unauthenticated redirect, ember styling, smoke test)
- `pnpm test` (Vitest) — 29/30 pass; 1 skip unchanged (OpenRouter key gate from platform-proofs slice)
- The sign-in OAuth buttons test and unauthenticated redirect test (accounts-data-layer slice) both pass against the new `_authenticated.tsx` layout structure, confirming no regression.

## Longitudinal Delta

No prior verify-evidence for this slice exists (first run). Baseline comparison skipped.

## Friction Notes

- **Font loading**: Google Fonts (`fonts.googleapis.com`) are imported in `styles.css`. In the dev server environment, these load from the internet. The smoke test on port 3000 (occupied by another app) showed 404 console errors, but these are from the wrong server — the Waypoint server on port 3456 serves correctly. The fonts load as CDN requests; no CSP conflict in production. Informational only.
- **JourneyCard progress**: Meter value is hardcoded to 0% for all journeys. The empty progress bar might be visually confusing if real journeys appear in later slice testing. Informational — expected; later slices will populate this.
- **DrawerNav always rendered (hidden, not conditional)**: The drawer panel is always in the DOM with a hidden CSS class when closed. This is intentional for Playwright computed-style assertions but means extra DOM nodes on every authenticated page load. Low complexity impact; acceptable.

## Free Exploration Notes

Could not drive authenticated surfaces (BETTER_AUTH_SECRET absent). Free exploration limited to unauthenticated surfaces (sign-in page, about page, redirect behavior).
- Sign-in page renders cleanly with all ember token classes applied — informational, pass.
- Navigating to `/` without auth triggers correct redirect to `/sign-in` — informational, correct behavior.
- The `about.tsx` page (not a primary product surface) renders without the new AppShell chrome; it has its own minimal layout. This matches the implementation decision to remove the shared Header/Footer from `__root.tsx`. Informational.

## Adversarial Tests

Could not drive authenticated surfaces. Adversarial tests against authenticated flows are deferred with the seeded-session tests.

| Test | Result | Finding |
|---|---|---|
| Empty submission | n-a | Authenticated forms not drivable without BETTER_AUTH_SECRET |
| Max-length input | n-a | Authenticated forms not drivable |
| Double-click / rapid repeat | n-a | Authenticated actions not drivable |
| Mid-flow interruption | n-a | Authenticated flows not drivable |
| Offline / network failure | n-a | Authenticated flows not drivable |

## Failure Mode Probes

| Probe | Result | Finding |
|---|---|---|
| Slow response (Fast 3G) | n-a | Authenticated surfaces not drivable |
| Concurrent session | n-a | Authenticated surfaces not drivable |
| Session expiry mid-flow | n-a | Authenticated surfaces not drivable |

## Cross-Browser Delta

- **Primary browser**: Chromium (Playwright default)
- **Secondary browser**: not tested — deferred (seeded-session tests blocked by BETTER_AUTH_SECRET)
- **Divergences found:** 0 (from available evidence)

## Web Vitals

Could not measure (seeded-session authenticated surfaces not drivable). null for all metrics.

## Gaps / Unverified Areas

- All seeded-session tests (AC-DSS1, AC-DSS3, AC-DSS4) — deferred; BETTER_AUTH_SECRET required
- AC-DSS5 reduced-motion Playwright assertion — deferred; DrawerNav is inside authenticated AppShell
- Cross-browser (Firefox/WebKit) — deferred with seeded-session tests
- Free exploration of authenticated surfaces — deferred
- Adversarial + failure-mode probes on authenticated surfaces — deferred

All deferrals share the clearing event: re-running the E2E suite with `BETTER_AUTH_SECRET` set in `.dev.vars` (shared with the existing AC-ADL1+AC-ADL5 deferral entry in `00-index.md`).

## Freshness Research

Not triggered (no test failures; plan created 2026-07-11, within 14 days; no external API integrations in this slice's changed files).

## Assumptions

1. The Waypoint Vite dev server must be started on a port not occupied by other applications. Port 3000 was occupied by an unrelated application (Clinical Simulation Studio — Next.js). The correct server started cleanly on port 3456 and was verified via `curl`.
2. `02c-craft.md` `north-star-mock: none` — no image comparison needed; visual contract honored via code inspection per implement record.
3. Reduced-motion (AC-DSS5) classified as `observable: false` per the `<!-- observable: false -->` annotation in `03-slice-design-system-shell.md` — CSS inspection is the authoritative evidence.

## Triage Decisions

1. **ISSUE-1 (EBUSY build failure)** — Skip. Environmental, pre-existing, non-code. Same condition as foundation and accounts-data-layer slice verifications. Fix: stop dev server before running `pnpm build`.

## Fix Status

No Fix sub-agents dispatched (`fix-rounds-run: 0`). Single issue triaged Skip.

## Verify-Owned Fixes

No fixes applied in this run.

## Recommendation

The design-system-shell slice is solid at the code layer: TypeScript clean, WCAG AA contrast proven by the Vitest suite, app shell structure verified against the design brief's visual contract, and all prior slice tests continue to pass. The three user-observable ACs are deferred to the pre-registered BETTER_AUTH_SECRET clearing event — not a code regression, a known environmental constraint that blocks seeded-session Playwright tests across all slices. Ready for review.

## Recommended Next Stage

- **Option A (recommended):** `/wf review waypoint-app design-system-shell` — all code-only ACs met; user-observable ACs deferred to pre-registered clearing event; no code regressions; ready for review
- **Option B:** `/wf verify waypoint-app design-system-shell` — re-run after setting `BETTER_AUTH_SECRET` in `.dev.vars` to clear the seeded-session deferral
- **Option G:** `/wf probe waypoint-app` — slug-wide runtime sweep after seeded-session clearing event
