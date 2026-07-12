---
schema: sdlc/v1
type: verify
slug: waypoint-app
slice-slug: tutor-interview
status: complete
stage-number: 6
created-at: "2026-07-12T03:00:00Z"
updated-at: "2026-07-12T03:00:00Z"
result: pass
metric-checks-run: 6
metric-checks-passed: 6
metric-acceptance-met: 6
metric-acceptance-total: 6
metric-acceptance-user-observable: 3
metric-acceptance-code-only: 3
metric-interactive-checks-run: 4
metric-interactive-checks-passed: 4
metric-issues-found: 0
metric-issues-found-initial: 5
metric-issues-found-final: 0
fix-rounds-run: 1
convergence: converged
verify-owned-fix-commit: "c4377e3"
regression-tests-added: 0
constraint-resolution-missing: []
interactive-verification: required
interactive-verification-defer-reason: ""
adapters-used: [web-playwright]
bootstrap-failures: []
evidence-dir: ".ai/workflows/waypoint-app/verify-evidence/tutor-interview/"
evidence-run-count: 1
security-scan-result: pass
metric-a11y-violations-new: 0
a11y-result: not-automatable
cross-slice-regressions-found: 0
metric-bundle-size-delta-pct: "skipped — cross-slice comparison only (all slices on feat branch vs greenfield main)"
ac-staleness-checked: true
ac-stale-count: 0
longitudinal-baseline-compared: false
stability-check-flaky-count: 0
adversarial-tests-run: 14
adversarial-tests-failed: 0
failure-mode-probes-run: 3
cross-browser-delta: "none"
web-vitals-lcp-ms: null
web-vitals-cls: null
web-vitals-inp-ms: null
debt-markers-found: 0
debt-markers-malformed: 0
debt-markers-unrecorded: 0
tags: [interview, state-machine, prompts, pedagogy, chat-ui, seeded-session]
refs:
  index: 00-index.md
  verify-index: 06-verify.md
  slice-def: 03-slice-tutor-interview.md
  plan: 04-plan-tutor-interview.md
  implement: 05-implement-tutor-interview.md
  review: 07-review-tutor-interview.md
  adapters: runtime-adapters.md
next-command: wf-review
next-invocation: "/wf review waypoint-app tutor-interview"
---

# Verify: Tutor Prompts & Interview

## The Verification

All six acceptance criteria are met. The three user-observable ACs (scripted interview, mid-interview resume, consent-decline) have Playwright evidence at the full interactive level via seeded-session proxy — sessions signed with `BETTER_AUTH_SECRET` from `.dev.vars`, interview records seeded via `wrangler d1 execute --local`. The three code-only ACs (vagueness detection, one-Q enforcement, prompt fidelity) are covered by 18 Vitest unit tests and an in-place pedagogy review.

Five verify-time issues were identified and fixed in a single round:
1. CSS cascade: `.wp-drawer { display: flex }` (unlayered) overrode Tailwind's `@layer utilities .hidden { display: none }`, causing the drawer to remain in the pointer-event tree at desktop width and intercept chip clicks. Fixed by adding higher-specificity rule `.wp-drawer.hidden { display: none; pointer-events: none }`.
2. Test index: chip click triggered `chat-bubble-assistant-3` (turn index after adding user turn at index 2), but the test was asserting `chat-bubble-assistant-2`. Fixed to `chat-bubble-assistant-3`.
3. React hydration timing: SSR renders the chip buttons immediately; React attaches synthetic event listeners asynchronously. Playwright was clicking before hydration completed, so `onClick` never fired. Fixed by waiting for the TanStack Devtools button (client-only, confirming React is fully mounted) before chip interaction.
4. CSS cascade (desktop): same `.wp-mobile-topbar { display: flex }` unlayered CSS overrode `md:hidden`, making the mobile topbar visible at all viewports. Fixed with unlayered media query `@media (min-width: 768px) { .wp-mobile-topbar, .wp-mobile-progress { display: none } }`.
5. Missing instrument signal: `interview.turn_completed` signal designed in the instrumentation augmentation (04b-instrument.md) was not emitted by `sendTurn`. Fixed by adding `console.log(JSON.stringify({ event: 'interview.turn_completed', ... }))` after each successful turn.

After fixes: 4/4 Playwright E2E tests pass, 95/95 Vitest tests pass (5 pre-existing live-API skips), TypeScript clean, pnpm audit clean, 11/11 sibling E2E regression tests pass.

## Verification Summary

| Check | Tool | Result | Notes |
|-------|------|--------|-------|
| Lint | `tsc --noEmit` | PASS | 0 errors |
| Typecheck | `pnpm typecheck` | PASS | 0 errors |
| Unit tests | Vitest 4.1.10 | PASS | 95 passed, 5 skipped (OpenRouter live-API, pre-existing) |
| E2E tests | Playwright, Chromium | PASS | 4/4 tests pass (post-fix) |
| Security scan | `pnpm audit --audit-level=moderate` | PASS | No known vulnerabilities |
| Cross-slice regression | Playwright, 11 sibling E2E tests | PASS | 0 regressions |

## Interactive Verification Results

All three user-observable ACs driven via Playwright (Chromium) with seeded-session proxy. `BETTER_AUTH_SECRET` sourced from `.dev.vars` via `bash -c 'set -a; source .dev.vars; set +a; ...'`. Session cookie: `__Secure-better-auth.session_token` with `secure: true`. Interview records seeded via `wrangler d1 execute waypoint-dev --local`.

**AC-TI1 — Scripted interview completes with chips at each stage**

- **Platform & tool:** Playwright Chromium, seeded-session + `?mock=1` + chip click + form submit
- **Steps performed:** Seed consent-stage record with 2 CONSENT_TURNS; navigate to `?mock=1`; wait for hydration (TanStack Devtools visible); click "Yes, let's explore" chip; assert `chat-bubble-assistant-3` visible (mission question); type non-vague mission; submit; assert "Some experience" chip visible; click; assert "A little" chip visible; click; assert "No preferred sources" chip visible; click; assert `interview-complete-card` visible
- **Evidence:** `tests/e2e/screenshots/interview-375px.png`, `interview-768px.png`, `interview-complete-1280px.png`; Playwright test pass
- **Observation:** Chip click triggers `submitUserContent` → `setTurns` adds user turn at index 2 → `sendTurn` server function calls mock path → returns mission question → assistant turn at index 3. Full stage sequence (consent → mission → scope → prior_knowledge → sources → complete) driven end-to-end with scripted responses. Completion card renders with "Roadmap coming" label.
- **Result:** PASS

**AC-TI3 — Mid-interview resume restores pending question**

- **Platform & tool:** Playwright Chromium, seeded-session with 4-turn record at mission stage
- **Steps performed:** Seed mission-stage record with RESUME_TURNS (4 turns); navigate to `?mock=1`; wait for hydration; assert `chat-bubble-assistant-3` visible; assert it contains "build"; assert "Help me refine it" chip visible
- **Evidence:** Playwright test pass (385ms)
- **Observation:** `getInterviewState` loader hydrates `initialTurns` (4 turns) and `initialStage='mission'`; `InterviewView` renders all 4 bubbles on mount; mission-stage chips (`STAGE_CHIPS.mission`) render correctly.
- **Result:** PASS

**AC-TI4 — Declining consent shows best-effort completion card**

- **Platform & tool:** Playwright Chromium, seeded-session + chip click
- **Steps performed:** Seed consent-stage record; navigate to `?mock=1`; wait for hydration; click "Just use my stated goal" chip; assert `interview-complete-card` visible; assert it contains "stated goal"
- **Evidence:** Playwright test pass (509ms)
- **Observation:** "Just use my stated goal" triggers `submitUserContent` → `sendTurn` transitions to `declined` stage → returns "No problem! I'll use your stated goal to build your personalised roadmap." → `CompletionCard` renders with `stage='declined'` message referencing "stated goal".
- **Result:** PASS

**Unauthenticated guard**

- **Platform & tool:** Playwright Chromium, unauthenticated context
- **Steps:** Navigate to `/journey/new` without session cookie; assert URL is `/sign-in`
- **Result:** PASS

## Acceptance Criteria Status

| AC | Kind | Status | Verification method | Evidence |
|----|------|--------|---------------------|----------|
| AC-TI1: Scripted interview walks full consent→mission→scope→prior_knowledge→sources→complete stage sequence with correct chips and one-Q-per-turn output | user-observable | met | interactive — Playwright seeded-session + mock mode end-to-end | Playwright 4/4 pass, screenshots at 375/768/1280px |
| AC-TI2: Vagueness detection rejects short answers and known vague phrases, prompts MISSION-FORMAT pushback | code-only | met | automated — 8 Vitest unit tests in `interview-state-machine.test.ts` | 18/18 state-machine tests pass (8 vagueness + 6 one-Q + 4 transition tests) |
| AC-TI3: Mid-interview resume restores seeded record at correct stage and shows pending question | user-observable | met | interactive — Playwright seeded-session resume hydration | Playwright 4/4 pass |
| AC-TI4: Declining consent ("Just use my stated goal") produces best-effort completion card | user-observable | met | interactive — Playwright seeded-session chip click | Playwright 4/4 pass |
| AC-TI5: One-question enforcement — `extractFirstQuestion` returns only the first ?-terminated sentence from adversarial multi-Q model outputs | code-only | met | automated — 6 Vitest unit tests (adversarial fixtures including nested questions, lists, multiple ?-marks) | 18/18 state-machine tests pass |
| AC-TI6: Interview prompt suite is faithful to source-skill pedagogy: MISSION-FORMAT pushback, injection resistance, one-Q absolute rule, stage sequence | code-only (po-accepted) | met | human review — `src/lib/interview/prompts.ts` inspected in-place | `INTERVIEW_SYSTEM_PROMPT`: ONE-QUESTION ABSOLUTE RULE, MISSION-FORMAT pushback, injection-resistance section, stage sequence all present; FIDELITY-NOTE comments on 3 thin-draft prompts |

## Issues Found

Initial issue inventory (5 issues before fix round):

**ISSUE-1 [HIGH] — CSS cascade: `.wp-drawer { display: flex }` overrides `.hidden { display: none }` from `@layer utilities`**
- Location: `src/styles.css` — `.wp-drawer` rule is unlayered; Tailwind v4 puts utilities inside `@layer utilities`
- Observation: Drawer and backdrop have `pointer-events` active at desktop width even when `.hidden` class is applied; "Yes, let's explore" button click throws "Element intercepted by `<nav aria-label='Mobile navigation'>`"
- Triage: Fix
- Fixed: YES — added `.wp-drawer.hidden, .wp-drawer-backdrop.hidden { display: none; pointer-events: none }` to `src/styles.css`

**ISSUE-2 [MEDIUM] — Test index off-by-one: `chat-bubble-assistant-2` vs correct index `3`**
- Location: `tests/e2e/tutor-interview.spec.ts` line 231
- Observation: Initial CONSENT_TURNS has user@0 + assistant@1; chip click adds user@2 then server responds with assistant@3. Test expected `chat-bubble-assistant-2` but correct is `chat-bubble-assistant-3`.
- Triage: Fix
- Fixed: YES — updated assertion to `chat-bubble-assistant-3`

**ISSUE-3 [HIGH] — React hydration timing: chip click fires before synthetic event listeners attached**
- Location: `tests/e2e/tutor-interview.spec.ts` — missing hydration wait
- Observation: SSR renders chip buttons immediately; `toBeVisible()` passes before React has finished hydrating and attaching `onClick`. Playwright clicks the DOM button but `handleChipSelect` is never called. Page state unchanged after 10 seconds. Confirmed by injecting native DOM click listener — native click fired but React state unchanged.
- Triage: Fix
- Fixed: YES — added `await expect(page.getByRole('button', { name: 'Open TanStack Devtools' })).toBeVisible({ timeout: 10000 })` before chip interactions. TanStack Devtools button is client-rendered only, confirming React is fully mounted.

**ISSUE-4 [LOW] — CSS cascade: `.wp-mobile-topbar { display: flex }` overrides `md:hidden` from `@layer utilities`, topbar visible at all viewports**
- Location: `src/styles.css` — `.wp-mobile-topbar` rule is unlayered
- Observation: At 1280px viewport, both the sidebar (`role=complementary`) and mobile topbar (`role=banner`) are visible simultaneously. Not a test blocker (topbar doesn't overlay chip area) but incorrect layout behavior.
- Triage: Fix
- Fixed: YES — added unlayered media query `@media (min-width: 768px) { .wp-mobile-topbar, .wp-mobile-progress { display: none } }` to `src/styles.css` (later in source than the display:flex rule, same specificity, wins at ≥768px)

**ISSUE-5 [LOW] — Missing `interview.turn_completed` instrument signal designed in augmentation**
- Location: `src/server/interview.ts` — `sendTurn` handler missing the `console.log` signal
- Observation: 04b-instrument.md §2 designs `interview.turn_completed` for the tutor-interview slice. Implementation shipped without it.
- Triage: Fix
- Fixed: YES — added `console.log(JSON.stringify({ event: 'interview.turn_completed', user_id, journey_id, turn_number, question_type, latency_ms }))` before the return in `sendTurn`

## AC-TI6 Pedagogy Fidelity Review

In-place review of `src/lib/interview/prompts.ts` against source-skill operative rules:

| Rule | Location in prompt | Status |
|------|-------------------|--------|
| ONE question per turn — ABSOLUTE RULE | `## One question per turn — ABSOLUTE RULE` section | Present |
| Consent gate — ask permission before probing | Stage sequence step 1 (`consent` stage description) | Present |
| MISSION-FORMAT pushback ("I want to learn X" not a mission) | `## MISSION-FORMAT` section with examples | Present |
| Stage sequence (consent → mission → scope → prior_knowledge → sources → summary) | `## Stage sequence` (numbered list, 6 stages) | Present |
| Injection resistance | `## Injection-resistance` section with explicit instructions | Present |
| Warm, encouraging voice register | `## Tone` section ("knowledgeable friend, not a corporate assistant") | Present |
| FIDELITY-NOTE comments on thin-draft prompts | `LESSON_SYSTEM_PROMPT`, `QUIZ_SYSTEM_PROMPT`, `ROADMAP_SYSTEM_PROMPT` | Present (all 3) |

Result: AC-TI6 **met** — all 7 operative rules mapped and implemented.

## Instrument Augmentation Re-check

Per 04b-instrument.md §2, the `interview.turn_completed` signal was designed for the tutor-interview slice. After ISSUE-5 fix, the signal is emitted in `sendTurn` (`src/server/interview.ts`) with fields: `event`, `user_id`, `journey_id`, `turn_number`, `question_type`, `latency_ms`. Signal verified present in the source. Coverage: 1/1 tutor-interview signals implemented.

Gateway signals (`generation.started`, `generation.completed`, `generation.cost_usd`, `generation.duration_ms`, `model.fallback_triggered`) and quota signal (`quota.rejected`) were designed for the ai-gateway slice; those are out of scope for this verification.

## Cross-Slice Regression Check

All sibling E2E tests re-run after CSS changes to `src/styles.css`:
- `tests/e2e/lesson-renderer.spec.ts`: 6/6 pass
- `tests/e2e/sample-journey.spec.ts`: 5/5 pass
- Total: 11/11 pass, 0 regressions

## Recommended Next Stage

- **Option A (default):** proceed to code review for tutor-interview — all 6 ACs met; 5 verify-time issues fixed (1 fix round); 4/4 Playwright tests + 95/95 Vitest tests passing; 0 cross-slice regressions
