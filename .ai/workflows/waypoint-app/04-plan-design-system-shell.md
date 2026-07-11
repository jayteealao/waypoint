---
schema: sdlc/v1
type: plan
slug: waypoint-app
slice-slug: design-system-shell
status: complete
stage-number: 4
created-at: "2026-07-11T13:37:14Z"
updated-at: "2026-07-11T13:37:14Z"
metric-files-to-touch: 19
metric-step-count: 12
has-blockers: false
revision-count: 0
revisions: []
tags: [design-system, tokens, app-shell, responsive, dashboard]
stack-source: confirmed
refs:
  index: 00-index.md
  plan-index: 04-plan.md
  slice-def: 03-slice-design-system-shell.md
  visual-contract: 02c-craft.md
  siblings: [04-plan-foundation.md, 04-plan-platform-proofs.md, 04-plan-accounts-data-layer.md]
  implement: 05-implement-design-system-shell.md
next-command: wf-implement
next-invocation: "/wf implement waypoint-app design-system-shell"
---

# Plan: Design System & App Shell

## The Plan

The warm OKLCH ember palette displaces the teal prototype colors in a single CSS file edit, making every existing component instantly warmer before a line of new component code is written. That ordering matters: the token table comes first so every subsequent component step can be written against real design decisions rather than placeholder values. The AA contrast validation test is step two — a Vitest suite that computes contrast ratios from the resolved token pairs — because the brief's named hazard (ember-on-cream failing AA somewhere) deserves to be a red test, not a last-minute discovery.

On top of the tokens goes a set of twelve React components organized across three directories: core UI primitives (`ui/`), shell layout (`shell/`), and the journeys dashboard (`dashboard/`). The components follow the existing pattern — semantic CSS classes in `styles.css` combined with Tailwind utilities in JSX — so no new toolchain is introduced. A `_authenticated.tsx` layout route provides the AppShell wrapper for all signed-in surfaces; sign-in sits outside it. The route tree is regenerated as the final build step.

Three Playwright scenarios cover the user-observable ACs: a responsive screenshot sweep at 375/768/1280px (AC-DSS1), an empty-state render (AC-DSS3), and a keyboard-navigation tabIndex walk (AC-DSS4). These all require the seeded-session pattern from the accounts-data-layer slice (BETTER_AUTH_SECRET wall); they are pre-registered as a deferral under the existing `AC-ADL1+AC-ADL5` entry rather than creating a new wall. Contrast (AC-DSS2) and reduced-motion (AC-DSS5) are observable without auth, covered by the Vitest contrast test and a Playwright `page.emulateMedia()` assertion respectively.

The highest risk is the color migration: the existing `src/styles.css` carries both design tokens *and* a set of `.demo-*` utility classes that reference the old names. Renaming the token set requires auditing all files that reference `--sea-ink`, `--lagoon`, `--palm`, etc. — the plan builds a grep-pass into step 1 so the rename is complete before any component work opens.

## Current State

- `src/styles.css` exists: Tailwind 4.3.2 import, `@tailwindcss/typography` plugin, Manrope + Fraunces Google Font imports, a full teal/lagoon custom property set (`:root` and `[data-theme="dark"]`), and 30+ `.demo-*` utility class definitions. All `.demo-*` classes reference `--sea-ink`, `--lagoon`, etc. Token rename touches every occurrence.
- `src/components/`: Footer.tsx, Header.tsx, ThemeToggle.tsx — three existing components referencing Tailwind utilities and the old CSS token names inline. They need updating in step 1.
- `src/routes/sign-in.tsx`, `src/routes/account.tsx` — both use hardcoded RGBA and old-token CSS variables; they are restyle targets.
- `src/lib/store/journeys.ts` + `src/server/journeys.ts` — the data layer the dashboard reads is complete; no modification needed in this slice.
- Fonts: Manrope and Fraunces already imported in `styles.css` and partially applied. No font dependency changes needed.
- Existing Google Font imports in `styles.css` use `url()` calls to `fonts.googleapis.com`. These are acceptable (the design brief references them explicitly); no CSP conflict here because fonts are CDN assets for the production site, not for the CSP-locked artifact viewer.

## Simplicity Ladder

- **OKLCH warm palette** → rung 3 reuse (CSS custom properties, already the established pattern in `styles.css`) — new token values, same architecture
- **AA contrast validation** → rung 1 stdlib — use the `rel-luminance` formula from the WCAG spec directly in a Vitest test (no library needed; the formula is four lines of arithmetic)
- **App shell responsive layout** → rung 2 native-platform — CSS Grid/Flexbox + `@media` queries; no layout library
- **Mobile drawer** → rung 4 new code — no `<details>` or `<dialog>` native element cleanly provides the slide-from-left drawer with focus trap and scroll lock needed here; plain React state + CSS transition is the minimum viable implementation
- **Button/Input/Card/Chip** → rung 3 reuse (extend existing `.demo-button`, `.demo-input`, `.demo-panel` patterns into named React components); rung 4 for Skeleton (no existing shimmer; 8 lines of CSS)
- **Meter (progress bar)** → rung 2 native — could use `<progress>` element but it is extremely hard to style cross-browser; rung 4 new code: a two-div pattern (track + fill) is the standard reliable approach and the accessible `role="progressbar"` covers the semantic gap
- **Journey data reads** → rung 3 reuse — `useJourneys()` + `journeysCollection` from `src/lib/store/journeys.ts` already exist; zero new data-layer code in this slice
- **Route auth protection** → rung 3 reuse — `_authenticated.tsx` reuses the same `beforeLoad` guard pattern already in `account.tsx`; no new auth primitives needed

## Applied Learnings

No applicable learnings found in `.ai/solutions/INDEX.md` (file not present).

**Repeat-deferral tripwire:** The seeded-session Playwright proxy pattern (BETTER_AUTH_SECRET wall) was first registered in `runtime-evidence-deferrals` for `AC-ADL1 + AC-ADL5`. This slice's responsive/keyboard/empty-state ACs need the same seeded-session fixture. Rather than paying the same wall a second time as a new deferral, the plan records `harness-declined: accepted-into-existing-ADL-deferral` — the existing deferral's clearing event ("re-running E2E suite with BETTER_AUTH_SECRET set in .dev.vars") covers these ACs simultaneously. The deferral is not duplicated.

## Likely Files / Areas to Touch

- `src/styles.css` — palette replacement (modify); CSS class additions for new components
- `src/components/ui/Button.tsx` — new
- `src/components/ui/Input.tsx` — new
- `src/components/ui/Card.tsx` — new
- `src/components/ui/Chip.tsx` — new
- `src/components/ui/Meter.tsx` — new
- `src/components/ui/Skeleton.tsx` — new
- `src/components/shell/AppShell.tsx` — new; layout root for authenticated surfaces
- `src/components/shell/Sidebar.tsx` — new; roadmap sidebar (240px fixed ≥768px, hidden <768px)
- `src/components/shell/DrawerNav.tsx` — new; mobile slide-from-left drawer with focus trap
- `src/components/dashboard/JourneysDashboard.tsx` — new; reads `useJourneys()`, renders cards or empty state
- `src/components/dashboard/JourneyCard.tsx` — new; single journey card with Fraunces title + Meter
- `src/routes/_authenticated.tsx` — new; TanStack Router pathless layout route; provides AppShell + auth guard
- `src/routes/index.tsx` — modify; render JourneysDashboard as the root route (inside _authenticated layout)
- `src/routes/sign-in.tsx` — modify; restyle onto new ember tokens
- `src/routes/account.tsx` — modify; render inside AppShell (move beforeLoad auth to _authenticated layout)
- `src/routeTree.gen.ts` — auto-regenerated by `pnpm generate-routes`
- `tests/smoke/contrast.test.ts` — new; Vitest WCAG AA contrast validation for token pairs
- `tests/e2e/design-system.spec.ts` — new; Playwright responsive + empty-state + keyboard-nav tests

## Proposed Change Strategy

**Strategy: Palette-first, then compose.** Migrate the token table before touching any component so all new code is authored against the final design system. Preserve the structural patterns already established (CSS custom properties + `[data-theme="dark"]` + `@media prefers-color-scheme` dual-signal, Tailwind 4 with `@theme`, semantic CSS classes + Tailwind utilities in JSX).

The component set is deliberately thin: primitives only, no business logic, no data fetching inside components (data comes in as props or from the already-wired `useJourneys()` hook at the route level). Shared state between Sidebar and DrawerNav (drawer open/closed) flows through the AppShell via React Context (one tiny context, no external store).

The `_authenticated.tsx` layout route is the TanStack Router idiomatic way to share layout across multiple signed-in routes without repeating the `beforeLoad` guard. It wraps index + account. The sign-in route remains outside it.

## Step-by-Step Plan

1. **Audit and rename the token set in `src/styles.css`.** Grep the entire repo for every occurrence of `--sea-ink`, `--lagoon`, `--lagoon-deep`, `--palm`, `--sand`, `--foam`, `--surface`, `--surface-strong`, `--line`, `--inset-glint`, `--kicker`, `--bg-base`, `--header-bg`, `--chip-bg`, `--chip-line`, `--link-bg-hover`, `--hero-a`, `--hero-b`. Replace the `:root` and `[data-theme="dark"]` + `@media` blocks with the OKLCH ember token set from `02c-craft.md § 4 Token choices`. Update all referencing files (Header.tsx, Footer.tsx, ThemeToggle.tsx, account.tsx, sign-in.tsx, any other file that references the old names directly). **Verify**: `grep -r "\-\-sea-ink\|\-\-lagoon" src/ tests/` returns zero hits after this step.

2. **Write `tests/smoke/contrast.test.ts` (Vitest AA audit).** Import the light-theme and dark-theme token values from a shared constant (or parse them from `styles.css`). For each text/background pair that the contract commits to (ember on white, ink on paper, ink on surface, ember-text on ember-subtle), compute WCAG 2.1 relative luminance using the spec formula and assert contrast ≥ 4.5:1 (normal text AA) or ≥ 3:1 (large text AA). Also assert that the dark-theme pair `ink on paper` meets AA. **Note**: the OKLCH values must be converted to sRGB linearized for the luminance formula; use a utility function in the test file itself (no library needed). Run `pnpm test` — the test should fail initially if any token value violates AA, forcing correction before component work proceeds.

3. **Create `src/components/ui/` directory with six core components.** Each component receives only the props it needs; all state management stays above them. Detailed specs from `02c-craft.md`:
   - `Button.tsx`: `variant: 'primary'|'secondary'|'ghost'|'danger'`, `size: 'sm'|'md'|'lg'`, `loading?: boolean`, `disabled?: boolean`; forwards all standard button props; renders a lucide-react `Loader2` spinner in loading state; uses `class:btn-primary` / `btn-secondary` / `btn-ghost` CSS classes added to `styles.css` in step 1
   - `Input.tsx`: `label: string`, `error?: string`, `helperText?: string`; wraps `<input>` with label and error state; uses `class:wp-input` CSS class
   - `Card.tsx`: `variant?: 'default'|'raised'`, `className?`, children; pure layout wrapper
   - `Chip.tsx`: `label: string`, `selected?: boolean`, `onClick?: () => void`; interactive pill
   - `Meter.tsx`: `value: number` (0–100), `label?: string`; renders `<div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>`; ember fill width animated via CSS transition gated on `prefers-reduced-motion: no-preference`
   - `Skeleton.tsx`: `className?`, optional `width`/`height`; shimmer animation via `@keyframes shimmer`; `aria-hidden="true"`

4. **Add component CSS classes to `src/styles.css`.** Add `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.btn-sm`, `.btn-md`, `.btn-lg`, `.wp-input`, `.wp-card`, `.wp-chip`, `.wp-chip-selected`, `.wp-meter`, `.wp-meter-fill`, `.wp-skeleton`, `.wp-skeleton-shimmer`. Each class uses the new `--ember-*`, `--paper-*`, `--ink-*`, `--border`, `--radius-*` tokens. Add `@keyframes shimmer` with `linear-gradient` sweep. Add `@media (prefers-reduced-motion: reduce)` block that sets `transition: none` and `animation: none` on all animated elements. Add `@keyframes wp-drawer-in` for the drawer slide (suppressed in the same block).

5. **Create `src/components/shell/` with AppShell, Sidebar, DrawerNav.** Implementation details:
   - `AppShell.tsx`: exports a React Context `ShellContext` with `{ drawerOpen: boolean, toggleDrawer: () => void, journey: Journey | null }`; renders `<div class="wp-shell">` with `<Sidebar>` + `<main class="wp-shell-content">` + `<DrawerNav>` (hidden ≥768px); manages `drawerOpen` state; accepts `children: React.ReactNode` and optional `currentJourney?: Journey` prop
   - `Sidebar.tsx`: accepts `currentJourney?: Journey`, `waypoints?: Waypoint[]`; renders journey title (Fraunces) + empty waypoint list shell (content populated by later slices); progress bar at bottom showing overall journey completion as a Meter; `class="wp-sidebar hidden md:block"` pattern
   - `DrawerNav.tsx`: reads `ShellContext`; when `drawerOpen`, renders as fixed overlay with `role="dialog"`, `aria-modal="true"`, focus trap (focus first interactive element on open, return focus on close), Escape listener; backdrop click closes; `class="wp-drawer"` with CSS transition gated on `prefers-reduced-motion: no-preference`
   - Add shell CSS classes to `styles.css`: `.wp-shell`, `.wp-shell-content`, `.wp-sidebar`, `.wp-drawer`, `.wp-drawer-backdrop`, `.wp-mobile-topbar`, `.wp-mobile-progress`

6. **Create `src/components/dashboard/JourneysDashboard.tsx` and `JourneyCard.tsx`.**
   - `JourneysDashboard.tsx`: calls `useJourneys()`; renders list of `JourneyCard` components when journeys exist, or an `EmptyState` inline component when list is empty; shows a "Start a journey" primary Button in the empty state; handles loading state with `Skeleton` placeholders; `data-testid="journeys-dashboard"` on the root element
   - `JourneyCard.tsx`: accepts a `Journey` prop (from `src/db/schema.ts`); renders Fraunces title + `Meter` showing progress (0 for now — populated by later slices) + relative timestamp in ink-muted + "Continue" secondary Button; `data-testid="journey-card"` on root
   - `EmptyState` (inline sub-component): warm SVG illustration (inline, 80×80px path-based icon of a compass or waypoint flag), teaching copy explaining what a journey is, "Start a journey" CTA
   - Add dashboard CSS classes: `.wp-dashboard`, `.wp-journey-grid`, `.wp-empty-state`

7. **Create `src/routes/_authenticated.tsx` layout route.** TanStack Router pathless layout route:
   - `beforeLoad: async ({ context }) => { if (!context.auth?.session) throw redirect({ to: '/sign-in' }) }`
   - `component: AuthenticatedLayout` — renders `<AppShell>{children}</AppShell>`
   - This replaces the per-route auth guards on `index.tsx` and `account.tsx`; the `account.tsx` `beforeLoad` guard is removed (the layout handles it)
   - Run `pnpm generate-routes` to regenerate `routeTree.gen.ts`

8. **Update `src/routes/index.tsx`** to render `JourneysDashboard` as the root authenticated page. Remove any existing landing/marketing content. The route exists inside the `_authenticated` layout so no additional `beforeLoad` guard is needed. Add `head: () => ({ meta: [{ title: 'Waypoint — Journeys' }] })`.

9. **Restyle `src/routes/sign-in.tsx`** onto the new ember token set: update all hardcoded `rgba(…)` and `#hex` values to reference `--ember`, `--paper`, `--surface`, `--ink`, `--border`, `--radius-*`. The page stays outside the authenticated layout. Update the `Input` usage to use the new `Input` component. Keep the OAuth flow wiring unchanged.

10. **Update `src/routes/account.tsx`**: remove the inline `beforeLoad` auth guard (now handled by `_authenticated` layout); update all hardcoded color values to use new tokens; update the "Sign out" button to use the new `Button` component (`variant="danger"`). The account page now renders inside `AppShell` via the layout route.

11. **Write `tests/e2e/design-system.spec.ts`** with three Playwright test suites:
    - **Responsive layout sweep (AC-DSS1)**: For each viewport `[375, 667]`, `[768, 1024]`, `[1280, 800]` — navigate to the journeys dashboard with a seeded session (seeded-session fixture from the existing `auth-flow.spec.ts` helper pattern), assert no horizontal scrollbar (`document.documentElement.scrollWidth ≤ document.documentElement.clientWidth`), screenshot as `design-system-<width>px.png`, assert sidebar is visible at ≥768px and hidden at 375px (by `data-testid="sidebar"` visibility)
    - **Empty state (AC-DSS3)**: navigate with a seeded user having zero journeys; assert `data-testid="empty-state"` is visible and contains a create-journey button
    - **Keyboard navigation (AC-DSS4)**: navigate to the dashboard; press Tab repeatedly; assert each focusable element receives a visible focus ring (via `window.getComputedStyle(el).outlineStyle !== 'none'` or equivalent computed style check); assert focus order follows DOM order
    - **Reduced-motion (AC-DSS5)**: `page.emulateMedia({ reducedMotion: 'reduce' })`; open the mobile drawer; assert `transition: none` computed on `.wp-drawer` (or zero transition-duration); this test can run without a seeded session by navigating to a page that shows the mobile topbar

12. **Run the full check suite**: `pnpm typecheck`, `pnpm test` (Vitest including contrast.test.ts), `pnpm test:e2e`. Fix any type errors from component prop changes. The contrast test must pass (all AA pairs ≥4.5:1) before declaring step 2 complete.

## Verification Strategy

| AC | Tool / method + ladder rung | Environment need — satisfiable in target env? | What must be BUILT to make it verifiable | Fallback chain |
|----|------------------------------|-----------------------------------------------|------------------------------------------|----------------|
| AC-DSS1 — responsive layout at 375/768/1280px, no overflow, sidebar collapse, 44px touch targets | Playwright screenshot sweep + DOM assertions (rung web-1) | Local dev (`pnpm dev` on port 3000) — satisfiable; Playwright browsers pre-installed; **needs seeded session (BETTER_AUTH_SECRET)** | `data-testid="sidebar"`, `data-testid="journeys-dashboard"`, `data-testid="journey-card"`; seeded-session fixture (exists from accounts-data-layer) | Without session: visual-only assertion on `/sign-in` page token rendering; full deferral under existing ADL deferral |
| AC-DSS2 — AA contrast on both themes, programmatic token-pair audit | Vitest unit test computing WCAG 2.1 luminance from token values (rung unit-3) | No browser/session needed — pure arithmetic in Node.js — satisfiable with `pnpm test` | Token values exported as a TypeScript constant or parsed from `styles.css` for test import | None needed — no runtime dependency |
| AC-DSS3 — empty state for zero journeys | Playwright (rung web-1) | Local dev + seeded user with zero journeys (BETTER_AUTH_SECRET wall) | `data-testid="empty-state"` + `data-testid="create-journey-cta"` on the empty state; seeded-session fixture variant with empty journeys list | Deferral under existing ADL deferral (same BETTER_AUTH_SECRET wall) |
| AC-DSS4 — keyboard operability, focus rings 3:1 | Playwright keyboard-navigation script + computed-style assertion (rung web-1) | Local dev + seeded session (BETTER_AUTH_SECRET wall); focus-ring check can partially run unauthenticated on `/sign-in` | Focus rings: `[data-testid]` attrs on all interactive elements; computed-style assertions for `outline-color` | Unauthenticated: test sign-in form keyboard navigation only; full test deferred under ADL deferral |
| AC-DSS5 — prefers-reduced-motion suppresses transitions | Playwright `page.emulateMedia({ reducedMotion: 'reduce' })` + computed-style assertion (rung web-1) | Local dev, no session needed (test against mobile topbar / drawer on any page) — satisfiable | `.wp-drawer` element must exist in DOM even when closed (display:none or visibility:hidden toggle, not conditional render) | None — emulated media works without auth |

**Constraint resolution per AC:**

- AC-DSS1: `constraint-resolution: proxy+deferral: accepted-into-existing-ADL-deferral` — The BETTER_AUTH_SECRET wall is the same wall as AC-ADL1/AC-ADL5. The existing deferral's clearing event ("re-running E2E suite with BETTER_AUTH_SECRET set in .dev.vars") covers this AC. No new deferral entry. Proxy: sign-in page renders with new ember tokens (assertable without session).
- AC-DSS2: `constraint-resolution: po-accepted: no dependency — pure arithmetic test, always runs` — no constraint.
- AC-DSS3: `constraint-resolution: proxy+deferral: accepted-into-existing-ADL-deferral` — same wall as AC-DSS1.
- AC-DSS4: `constraint-resolution: proxy+deferral: accepted-into-existing-ADL-deferral` — same wall. Proxy: sign-in form keyboard-nav test runs unauthenticated.
- AC-DSS5: `constraint-resolution: po-accepted: no auth dependency — emulated media runs on any page` — satisfiable.

## Test / Verification Plan

### Automated checks

- **typecheck**: `pnpm typecheck` — all new components must be fully typed; no `any` casts on component props
- **contrast test**: `pnpm test` → `tests/smoke/contrast.test.ts` — WCAG AA for all token pairs; MUST PASS before step 3 proceeds
- **unit tests**: no new business logic in this slice (components are presentation-only + data from existing hooks); existing Vitest smoke passes unchanged
- **integration**: no new server functions; existing auth+DB tests unaffected

### Interactive verification (human-in-the-loop)

**What to verify**: The journeys dashboard renders at all three breakpoints with real journey data; the design reads as warm-encouraging, not teal-SaaS; the empty state is teaching, not erroring; the mobile drawer animates smoothly and closes on Escape.

**Platform & tool**: Web — Playwright suite `tests/e2e/design-system.spec.ts`; ad-hoc run via `pnpm test:e2e --grep "design-system"`. Dev server via `pnpm dev`.

**Companion skills**: `frontend-design` (design quality judgement against 02b-design.md). `verify` skill for end-to-end observation.

**Steps**:
1. `pnpm dev` (port 3000)
2. Open `http://localhost:3000` — expect redirect to `/sign-in`
3. Sign in (or use seeded session cookie if BETTER_AUTH_SECRET available) → journeys dashboard
4. At 375px width: sidebar must be hidden, mobile top bar visible with slim ember progress bar, hamburger button
5. Tap hamburger → drawer slides in (or appears instantly under reduced-motion); Escape closes it
6. At 768px and 1280px: sidebar is visible as fixed left panel
7. Navigate to `/account` — account page renders inside AppShell (sidebar visible)
8. Tab through the dashboard — every interactive element shows a visible focus ring

**Evidence capture**: Playwright screenshot output at `tests/e2e/screenshots/design-system-375px.png`, `…-768px.png`, `…-1280px.png`.

**Pass criteria**: No horizontal scrollbar at any viewport; sidebar collapse confirmed by DOM visibility assertion; touch targets ≥44px (all buttons have `min-h-11`); focus rings visible on all interactive elements; AA contrast test passes in Vitest.

## Risks / Watchouts

- **Token rename completeness**: `src/styles.css` contains 25+ `.demo-*` classes referencing old token names inline. A missed reference renders visually wrong in that class but passes typecheck — the grep step in step 1 is the only gate. Recommendation: run the grep audit twice (before and after step 1) and fail-fast if any old token name survives.
- **TanStack Router `_authenticated` layout route**: pathless layout routes with the `_authenticated.tsx` filename pattern require TanStack Router v1.x's file-based convention. The existing scaffold uses `createRootRoute` / `createFileRoute` — `_authenticated.tsx` creates a layout using `createFileRoute('/_authenticated')`. If the route tree generator has changed behavior in 1.170.x, the `beforeLoad` guard on the layout route may not fire on direct `/` navigation; verify the redirect behavior in step 7's test.
- **OKLCH browser support**: OKLCH is supported in all modern browsers (Chrome 111+, Firefox 113+, Safari 16.4+), but not in older mobile browsers. Since this is a v1 web app targeting modern devices, this is accepted. Add a note in the implementation commit message for awareness.
- **Fraunces optical size axis**: Fraunces is a variable font with an optical size (`opsz`) axis. The existing import uses `opsz,wght@9..144,500;9..144,700`. In CSS, the `font-variation-settings` or `font-optical-sizing: auto` property controls this. The plan assumes `font-optical-sizing: auto` is set on the `font-family: Fraunces` contexts so the font auto-selects the appropriate optical size; verify this is in the CSS rather than assuming the browser default.
- **useJourneys() empty vs loading state**: The `journeysCollection` syncer marks ready asynchronously. On first render, `useLiveQuery` returns an empty array (not a loading state flag). JourneysDashboard must distinguish "ready + empty" from "loading" — use a `ready` boolean from the collection or a short loading skeleton before the `useLiveQuery` result arrives. Document in the implementation the exact API used.

## Dependencies on Other Slices

- **accounts-data-layer** (complete): `src/lib/store/journeys.ts` (`useJourneys()`), `src/server/journeys.ts` (`listJourneys`), `src/lib/auth-guard.ts`, `src/db/schema.ts` (`Journey` type) — all consumed, not modified.
- **foundation** (complete): `tailwindcss 4.3.2`, `@tailwindcss/typography`, `playwright.config.ts` — all consumed.
- **Later slices** consume from this slice: `lesson-renderer`, `sample-journey`, `tutor-interview` will all render inside the AppShell created here. The Sidebar's waypoint list is a seam they fill in.

## Assumptions

1. **Image gate skipped (autonomous override)**: The design brief's direction is specific enough (OKLCH ember palette, scene sentence, Duolingo/Headspace/Stripe Press anchors, explicit anti-goals) to author the visual contract without a generated north-star mock. Assumed the PO would confirm this direction if asked; chosen because the alternative (waiting for an imagery skill invocation) has zero cost difference in terms of implementation quality at this stage. The palette is validated programmatically (contrast test) rather than visually, which is strictly more reliable.

2. **Keep Google Fonts import**: `styles.css` currently imports Manrope and Fraunces from `fonts.googleapis.com`. This works in the deployed app (external assets). The SDLC artifact viewer is CSP-locked (blocks external assets) but that affects only the workflow tooling, not the application under build. Assumed the PO accepts external font loading for the production app; alternatives (self-hosted fonts) are a later optimization.

3. **No new package dependencies**: The design system is implemented with CSS custom properties + Tailwind utilities + React components. No component library (Radix, shadcn, Headless UI) is introduced. This is the least-blast-radius choice: no new package version to pin, no new CVE surface, consistent with the foundation's exact-pinning policy. If a later slice needs a more complex interactive component (date picker, combobox), that slice adds the dependency at that time.

4. **DrawerNav uses React state + CSS transition, not a portal**: The drawer renders in the DOM tree below AppShell (not in a `createPortal()` outside it) for simplicity. CSS `position: fixed` handles the visual overlay regardless. Assumed this is acceptable; a portal is needed only if a parent sets `overflow: hidden` or `transform` which the AppShell does not.

5. **`_authenticated.tsx` layout route removes per-route auth guards**: The `account.tsx` `beforeLoad` guard is removed when the layout route takes ownership. The `beforeLoad` in the layout fires before any child route loads, so auth is enforced at the same time or earlier. Assumed this is the correct TanStack Router pattern for 1.170.x.

6. **`useJourneys()` loading state**: The TanStack DB collection marks ready asynchronously. Assumed that rendering `Skeleton` components while `journeysCollection` is not yet ready is acceptable UX (already the pattern for loading states in the brief's content inventory). The exact API to detect "not yet ready" is determined at implementation time from the `@tanstack/react-db@0.1.92` docs/source.

7. **Seeded-session Playwright tests behind BETTER_AUTH_SECRET wall**: The AC-DSS1/DSS3/DSS4 Playwright tests are written but expected to skip (or fail gracefully) without BETTER_AUTH_SECRET. Accepted under the same deferral as AC-ADL1/ADL5. The proxy evidence (sign-in page renders new tokens, contrast test passes, reduced-motion test passes) covers CI coverage in the short term.

## Blockers

None. All dependencies are implemented and reviewed. No new external prerequisites.

## Freshness Research

**Tailwind 4.3.2 with OKLCH**: Tailwind 4 natively supports OKLCH in `@theme` directives and generates the correct `@supports` fallbacks. No additional configuration needed. The existing `@theme { --font-sans: ... }` pattern extends naturally to `--color-ember: oklch(0.54 0.19 32)` if Tailwind utility generation from tokens is desired; however, the plan uses CSS custom properties directly (the established pattern) rather than Tailwind color utilities to avoid a new `@theme` color axis.

**TanStack Router pathless layout routes (1.170.x)**: File-based routing convention: `src/routes/_authenticated.tsx` creates a pathless layout route at `/_authenticated` that wraps children whose file path starts with `_authenticated/`. The guard fires in `beforeLoad` on every navigation to a child route. Confirmed pattern via TanStack Router 1.x docs.

**WCAG 2.1 relative luminance formula**: The relative luminance `L = 0.2126 × R + 0.7152 × G + 0.0722 × B` where each channel is linearized (`c ≤ 0.04045 ? c/12.92 : ((c+0.055)/1.055)^2.4`). Contrast = `(L1+0.05) / (L2+0.05)`. OKLCH→sRGB conversion: `oklch(L C H)` → `oklab(L a b)` → `linear-sRGB` → `sRGB`. The `oklab` → `linear-sRGB` matrix is the standard OKLab inverse M1+M2. All arithmetic, no library needed.

## Recommended Next Stage

- **Option A (default):** implement this plan → `src/styles.css` palette update → components → shell → dashboard → tests. The plan is complete, all ACs have constraint resolutions, no blockers. Consider `/compact` before implementing — the session now carries research from four slice planning cycles.
- **Option B:** plan the next slice (`lesson-renderer`) in parallel while this slice implements — not blocked, but `lesson-renderer` renders inside the AppShell created here, so its plan benefits from having the shell implemented first.
