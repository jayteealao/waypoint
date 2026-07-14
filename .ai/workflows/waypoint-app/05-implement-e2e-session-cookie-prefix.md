---
schema: sdlc/v1
type: implement
slug: waypoint-app
slice-slug: e2e-session-cookie-prefix
status: complete
stage-number: 5
created-at: "2026-07-14T20:54:18Z"
updated-at: "2026-07-14T20:54:18Z"
metric-files-changed: 2
metric-lines-added: 23
metric-lines-removed: 11
metric-deviations-from-plan: 1
metric-review-fixes-applied: 0
commit-sha: ""
tags: [test, e2e, playwright, better-auth, deferral-clearing]
refs:
  index: 00-index.md
  implement-index: 05-implement.md
  slice-def: 03-slice-e2e-session-cookie-prefix.md
  plan: 04-plan-e2e-session-cookie-prefix.md
  siblings:
    - 05-implement-repo-format-baseline.md
    - 05-implement-precommit-gitleaks-resilience.md
    - 05-implement-accounts-data-layer.md
    - 05-implement-design-system-shell.md
  verify: 06-verify-e2e-session-cookie-prefix.md
next-command: wf-verify
next-invocation: "/wf verify waypoint-app e2e-session-cookie-prefix"
---

# Implement: E2E seeded-session cookie prefix fix

## The Implementation

Two Playwright specs were still handing the server a session cookie it would never
recognize — injected under the stale `better-auth.session_token` / `secure:false`
shape while the app resolves the seeded session under the secure-context name
`__Secure-better-auth.session_token`. Every authenticated test in them bounced to
`/sign-in`. The core fix is exactly the mechanical rename the plan called for: four
cookie blocks in `auth-flow.spec.ts` (the `/account` identity test, both halves of the
two-account isolation test, and sign-out) and the one `makeAuthContext` helper in
`design-system.spec.ts`, each flipped to the `__Secure-` name with `secure:true` — the
same shape four sibling specs already authenticate with. With `BETTER_AUTH_SECRET`
present in `.dev.vars` (len 64), all twelve target-spec tests now pass with no `/sign-in`
redirect, including the isolation test seeing two distinct identities.

Fixing the cookie unmasked two redirect/timing behaviours the `/sign-in` bounce had been
hiding, and both got the small test-infra seams the plan anticipated. The AC-DSS3
empty-state test seeds a zero-journey user, so the dashboard's first-login `useEffect`
redirects it to `/sample` unless `wp:sample-visited` is already `"true"` — a scoped
`page.addInitScript` sets that key before page scripts run (the plan named this seam
directly). The AC-DSS5 drawer test then surfaced a second, un-planned wall: clicking the
hamburger did nothing (`3/3` deterministic), because in React 19 the handler had not yet
hydrated when the click landed — a no-op the earlier `/sign-in` redirect had always
short-circuited before the test reached it. The fix is the codebase's own established
hydration gate: wait for the client-only "Open TanStack Devtools" button (the exact
pattern the passing `adaptation-progress` spec uses) before interacting. That is the one
recorded deviation from the plan — a same-class test-fidelity guard, not an app or
scope change; the drawer component and app logic are untouched.

The app was never wrong. This slice changed only stale tests, and — its actual payoff —
flipped the two runtime-evidence deferral clusters (AC-ADL1/AC-ADL5 and AC-DSS1/3/4/5)
to `cleared` on the strength of a real green run, lifting the largest deferral cluster
that was hard-blocking `/wf ship`. One thing outside this slice's blast radius: the full
15-spec regression run turned up a single unrelated failure — `tutor-interview.spec.ts`
AC-TI1 (a `"A little"` interview chip never appearing), deterministic in isolation, in a
file this slice never touches and whose cookie was already correct. It is not a
regression from the rename; it is recorded below as a pre-existing, out-of-scope finding.

## Summary of Changes
- Renamed the seeded-session cookie to `__Secure-better-auth.session_token` and set
  `secure: true` at all 4 injection blocks in `auth-flow.spec.ts` and the 1
  `makeAuthContext` helper in `design-system.spec.ts` (mirrors the proven
  `adaptation-progress.spec.ts` pattern).
- Updated the stale file-header comment in `auth-flow.spec.ts` to reference the new
  cookie name (doc accuracy).
- Added a scoped `page.addInitScript` localStorage guard (`wp:sample-visited="true"`) to
  the AC-DSS3 empty-state test so the dashboard's zero-journey first-login redirect to
  `/sample` does not fire.
- Added a React-hydration gate (wait for the client-only "Open TanStack Devtools"
  button) before the AC-DSS5 hamburger click — deviation from plan, see below.
- Flipped the two runtime-evidence-deferral clusters in `00-index.md` (AC-ADL1/AC-ADL5,
  AC-DSS1/3/4/5) to `status: cleared` with `cleared-at` + `cleared-note`, after the green
  run (AC-ECP3).

## Files Changed
- `tests/e2e/auth-flow.spec.ts` — cookie name + `secure` flag at 4 blocks; header comment. (+9/-9)
- `tests/e2e/design-system.spec.ts` — cookie name + `secure` flag in `makeAuthContext`;
  AC-DSS3 localStorage guard; AC-DSS5 hydration gate. (+14/-2)
- `.ai/workflows/waypoint-app/00-index.md` — two deferral clusters flipped to `cleared`;
  workflow-files + `updated-at` (workflow artifact, not counted in code metrics).

## Shared Files (also touched by sibling slices)
- `.ai/workflows/waypoint-app/00-index.md` — control file; edited only the two deferral
  entries recorded against the completed `accounts-data-layer` and `design-system-shell`
  slices (their `03`/`04`/`05` artifacts are NOT modified). No functional overlap with
  the round-5 sibling slices.

## Notes on Design Choices
- **In-place edits, no shared cross-file helper** — mirrored the proven cookie shape at
  each block rather than extracting a helper, keeping the diff to name+flag lines a
  reviewer can check at a glance against `adaptation-progress.spec.ts` (plan Assumption).
- **`page.addInitScript` for the DSS3 guard** — the native Playwright primitive for
  pre-seeding `localStorage` before page scripts run; matches the sibling
  `sample-journey.spec.ts` idiom.
- **Cookie behaviour grounded in executable evidence, not recalled API** — the
  `__Secure-` resolution is proven by sibling green runs (and now these), honoring the
  user-memory `tanstack-assume-missing` anti-pattern; no better-auth limitation asserted
  from memory. Source-verified the redirect key `SAMPLE_JOURNEY_VISITED_KEY =
  "wp:sample-visited"` in `src/fixtures/sample-journey.ts` and the redirect condition in
  `src/components/dashboard/JourneysDashboard.tsx:147-150` before writing the guard.

## Verification Seams Built
- **AC-ECP1** (both specs authenticate, no `/sign-in`) → the cookie rename itself is the
  seam, at `auth-flow.spec.ts` (4 blocks) + `design-system.spec.ts:89/94`. Observed:
  12/12 target-spec tests green.
- **AC-ECP2** (AC-DSS3 empty state renders, not `/sample` redirect) → `addInitScript`
  localStorage guard at `design-system.spec.ts:236-238`. Observed: empty-state test green.
- **AC-DSS5 observability** (drawer opens on click) → React-hydration gate at
  `design-system.spec.ts:139-140` (wait for the client-only devtools button). Observed:
  reduced-motion drawer test green 3/3. (Deviation seam — see below.)

## Deviations from Plan
- **Added a React-hydration gate to the AC-DSS5 drawer test** (not in the plan's
  step list). After the cookie fix, the AC-DSS5 test authenticated and reached the
  hamburger click, then failed deterministically (3/3) because the click landed before
  React 19 wired the `onClick` handler — a latent hydration-timing no-op previously masked
  by the `/sign-in` redirect. Root cause verified against source: `AppShell.tsx:80`
  (`onClick={toggleDrawer}`) and `DrawerNav.tsx:129` (visibility keyed on `drawerOpen`)
  are correct wiring; the failure was purely pre-hydration click timing. Resolved
  in-scope with the codebase's own established gate — wait for the client-only "Open
  TanStack Devtools" button, the same pattern `adaptation-progress.spec.ts:391-392` uses.
  Classified `class: implementation-detail` (test-fidelity timing guard, same class as the
  plan's sanctioned AC-DSS3 guard); no app code, no user-observable scope change. With the
  gate, the AC-DSS1/3/4/5 cluster is fully green — the precondition for clearing its
  deferral.

## Anything Deferred
- None from this slice. No `sdlc-debt:` shortcuts introduced.

## Known Risks / Caveats
- **Pre-existing, OUT-OF-SCOPE failure surfaced by the full-suite regression run:**
  `tests/e2e/tutor-interview.spec.ts` AC-TI1 ("scripted interview completes with chips at
  each stage") fails deterministically at line 267 — the `"A little"` prior-knowledge chip
  never becomes visible. This is **not** a regression from this slice: `tutor-interview.spec.ts`
  is not touched here and already injects the correct `__Secure-better-auth.session_token`
  cookie (line 186). It fails identically in isolation, so it is independent of the cookie
  rename. Flagged for a separate task; it does not block clearing this slice's deferral
  clusters (all their tests are green). Full-suite tally this run: 49 passed, 1 failed
  (AC-TI1), 3 did not run (stopped after the failure).
- The AC-ADL1/AC-ADL5 real-OAuth-on-deployed residual is a separate track (the deferral's
  `cleared-by` was an OR; the seeded-session automated half is now satisfied and cleared).

## Freshness Research
- None required. No dependency, API surface, or versioned-library behaviour changed. The
  one behavioural fact leaned on (`__Secure-` session-cookie resolution) is grounded in
  executable in-repo evidence (four passing sibling specs + this slice's green run), which
  outranks any web-doc lookup. `page.addInitScript` and role-based `waitFor` are stable,
  long-standing `@playwright/test` primitives.

## Recommended Next Stage
- **Option A (default):** `/wf verify waypoint-app e2e-session-cookie-prefix` — the change
  touches testable behaviour (e2e auth); verify should confirm the green run and the
  deferral-clearing lawfulness independently. Consider `/compact` first; workflow state
  lives in the artifact files.
- **Option B:** `/wf review waypoint-app e2e-session-cookie-prefix` — viable if verify is
  deemed trivial (the green run is already captured), but Option A is preferred given this
  slice's whole purpose is runtime evidence.
