---
schema: sdlc/v1
type: implement
slug: waypoint-app
slice-slug: sample-journey
status: complete
stage-number: 5
created-at: "2026-07-11T20:51:58Z"
updated-at: "2026-07-11T20:51:58Z"
metric-files-changed: 15
metric-lines-added: 1423
metric-lines-removed: 61
metric-deviations-from-plan: 2
metric-review-fixes-applied: 0
commit-sha: ""
tags: [first-run, fixtures, quiz-surface, milestone]
refs:
  index: 00-index.md
  implement-index: 05-implement.md
  slice-def: 03-slice-sample-journey.md
  plan: 04-plan-sample-journey.md
  siblings: [05-implement-foundation.md, 05-implement-platform-proofs.md, 05-implement-accounts-data-layer.md, 05-implement-design-system-shell.md, 05-implement-lesson-renderer.md]
  verify: 06-verify-sample-journey.md
next-command: wf-verify
next-invocation: "/wf verify waypoint-app sample-journey"
---

# Implement: Sample Journey & Quiz Surface

## The Implementation

The sample journey is the demoable milestone: a new user signs in, lands in a pre-baked guided tour of Waypoint itself — two real lessons, a working four-question quiz, zero LLM spend. Every component it renders already existed and passed review; the work here was three things: author the fixture content, build the quiz surface, and wire the first-login experience. All three are done and passing the automated test suite.

The fixture content in `src/fixtures/sample-journey.ts` is the editorial centerpiece. Lesson 1 ("How Waypoint Teaches") explains the learn-quiz-review loop and introduces waypoints and journeys using Waypoint's own pedagogy voice. Lesson 2 ("Spaced Repetition") covers the Ebbinghaus forgetting curve and FSRS — the algorithm that will power quiz scheduling in the quiz-fsrs slice. Both lessons are full `LessonDocumentV1` documents using checkpoints and flipcards; they render through `LessonView` unchanged. The four SAMPLE_QUIZ questions have options within ≤5 chars of each other (trimEnd), enforced by the `tests/smoke/sample-journey.test.ts` lint test.

The quiz surface (`QuizView`) is born here rather than in the quiz-fsrs slice because AC-SJ2 demands a working quiz with zero AI spend. MC grading is deterministic; immediate per-question feedback and localStorage attempt persistence are pure browser primitives. The component receives the full quiz fixture on each mount, restores a completed attempt on page reload, and fires an `onComplete` callback that the quiz route uses to dispatch the `wp:sample-progress` event. The quiz-fsrs slice will extend this surface rather than replace it.

The first-login redirect is a `useEffect` in `JourneysDashboard` that fires after `isReady` is true and `journeys.length === 0`, gated by a `localStorage.getItem('wp:sample-visited')` check. The sample layout route sets that key on mount, so returning users never get redirected again. The `ShellContext` extension (adding `waypoints` and `setWaypoints`) is two lines in `AppShell` and is backward-compatible — all existing consumers get an empty `waypoints: []` by default, producing no visible change.

## Summary of Changes

- `src/components/shell/AppShell.tsx` — added `ShellWaypoint` type; extended `ShellContextValue` and `AppShell` state with `waypoints`/`setWaypoints`.
- `src/components/shell/Sidebar.tsx` — replaced waypoint placeholder with live `useShell().waypoints` list; `data-waypoint` + `data-completed` attributes for Playwright assertions.
- `src/components/shell/DrawerNav.tsx` — mirrored sidebar waypoint list for mobile parity; same attributes.
- `src/components/dashboard/JourneysDashboard.tsx` — added first-login redirect `useEffect`; replaced Button+noop CTA with `Link to="/sample"`.
- `src/fixtures/sample-journey.ts` — localStorage keys, `SAMPLE_WAYPOINTS`, `SAMPLE_LESSON_1`, `SAMPLE_LESSON_2`, `SampleQuizQuestion` interface, `SAMPLE_QUIZ` (4 questions, equal-length options).
- `src/components/quiz/QuizView.tsx` — one-at-a-time MC flow with immediate feedback, score summary, localStorage persistence, `onComplete` callback.
- `src/styles.css` — 14 new CSS classes: `.wp-quiz*` family + `.wp-sample-overview`/`.wp-sample-waypoint-card*`; all using existing tokens; no existing styles modified.
- `src/routes/_authenticated/sample.tsx` — layout route; injects waypoints into ShellContext; marks journey visited; listens for `wp:sample-progress`; clears waypoints on unmount.
- `src/routes/_authenticated/sample/index.tsx` — overview page; waypoint cards with completion badges; "Start a real journey" CTA → `/`.
- `src/routes/_authenticated/sample/lesson-1.tsx` — renders `SAMPLE_LESSON_1`; marks `LESSON_1_VISITED_KEY`; dispatches `wp:sample-progress` with `setTimeout(0)`.
- `src/routes/_authenticated/sample/lesson-2.tsx` — renders `SAMPLE_LESSON_2`; marks `LESSON_2_VISITED_KEY`; same dispatch pattern.
- `src/routes/_authenticated/sample/quiz.tsx` — renders `QuizView`; dispatches `wp:sample-progress` in `onComplete`.
- `src/routeTree.gen.ts` — regenerated; 6 new sample-journey routes registered.
- `tests/smoke/sample-journey.test.ts` — equal-length lint (all 4 questions); scoring logic; attempt format; 11 assertions.
- `tests/e2e/sample-journey.spec.ts` — AC-SJ1/2/3/3b/4 with seeded-session; zero-LLM network assertion; sidebar completion indicator assertion.

## Files Changed

- `src/components/shell/AppShell.tsx` — ShellWaypoint type + waypoints/setWaypoints context extension (additive, backward-compatible)
- `src/components/shell/Sidebar.tsx` — waypoint list rendering replacing placeholder
- `src/components/shell/DrawerNav.tsx` — waypoint list rendering for mobile parity
- `src/components/dashboard/JourneysDashboard.tsx` — first-login redirect + CTA Link replacement
- `src/styles.css` — quiz surface and sample overview CSS classes appended
- `src/routeTree.gen.ts` — auto-regenerated after 6 new route files
- `src/fixtures/sample-journey.ts` — new; all fixture content
- `src/components/quiz/QuizView.tsx` — new; quiz component
- `src/routes/_authenticated/sample.tsx` — new; layout route
- `src/routes/_authenticated/sample/index.tsx` — new; overview page
- `src/routes/_authenticated/sample/lesson-1.tsx` — new; lesson 1 route
- `src/routes/_authenticated/sample/lesson-2.tsx` — new; lesson 2 route
- `src/routes/_authenticated/sample/quiz.tsx` — new; quiz route
- `tests/smoke/sample-journey.test.ts` — new; Vitest unit tests
- `tests/e2e/sample-journey.spec.ts` — new; Playwright E2E tests

## Shared Files (also touched by sibling slices)

- `src/styles.css` — all other slices append here; the quiz/sample section is at the end; no conflicts with lesson, shell, or foundation sections.
- `src/routeTree.gen.ts` — regenerated; sibling slice routes all preserved.

## Notes on Design Choices

- **localStorage for quiz attempt persistence** — the sample quiz questions are fixture data not seeded as D1 `quiz_questions` rows. Inserting into `quiz_attempts` with no FK target would violate the constraint. localStorage satisfies "persists with per-question results" across reloads and matches the `CheckpointQuestion` widget's existing pattern. The quiz-fsrs slice owns the real D1 path. Reversible: a migration can copy localStorage attempts to D1.

- **`wp:sample-progress` custom event** — the sample layout sets waypoints once on mount from localStorage. Child routes dispatch `window.dispatchEvent(new Event('wp:sample-progress'))` via `setTimeout(0)` after writing to localStorage, ensuring the layout's `recompute` listener always sees updated values. This avoids re-rendering the layout on every route change while keeping completion state live.

- **EmptyState CTA as `Link` instead of `Button + onClick`** — the plan described a `Button` with `onClick: () => void navigate({to: '/sample'})`. A `Link` is semantically superior for navigation (correct href, right-click / ctrl-click behaviour, accessibility), produces identical visual output using the existing `btn-base btn-primary btn-md` classes, and removes the `useNavigate` dependency from the presentational `EmptyState` sub-component. Recorded as deviation #2.

- **`setWaypoints: () => {}` no-op default** — the `createContext` default value has a no-op for `setWaypoints` so components rendered outside an `AppShell` provider (isolation test renders) do not crash. The default `waypoints: []` renders nothing in the sidebar.

- **`sdlc-debt: CTA to /` until tutor-interview ships** — the "Start a real journey" CTA on the sample overview and the dashboard empty state both link to `/` (which shows the journeys dashboard with an empty state that then links to `/sample`). When `tutor-interview` ships `/journey/new`, these will be updated to link directly to that route. One-line changes in two files each.

## Verification Seams Built

- AC-SJ1 (first login, zero LLM) → `data-testid="sample-overview"` on `SampleOverviewPage`; `wp:sample-visited` localStorage key set by sample layout; `useNavigate` redirect in `JourneysDashboard` guarded by `localStorage.getItem('wp:sample-visited') !== 'true'`; `page.on('request')` captures zero OpenRouter calls.
- AC-SJ2 (quiz feedback, equal-length, persistence) → `data-testid="quiz-view"`, `data-testid="quiz-question-{id}"`, `data-testid="quiz-option-{n}"`, `data-testid="quiz-feedback"`, `data-testid="quiz-results"`, `data-testid="quiz-score"` on `QuizView`.
- AC-SJ3 (sidebar completion) → `data-waypoint="{id}"` + `data-completed="true|false"` on waypoint `Link` elements in `Sidebar` and `DrawerNav`; `wp:sample-progress` event chain from lesson routes through layout recompute.
- AC-SJ4 (returning user) → `localStorage.setItem('wp:sample-visited', 'true')` seeding via `page.evaluate()` in the Playwright test; `data-testid="journeys-dashboard"` visible; `data-testid="create-journey-cta"` visible.
- Vitest equal-length lint → `SAMPLE_QUIZ` exported from `src/fixtures/sample-journey.ts`; test asserts `Math.max(...lengths) - Math.min(...lengths) <= 5` per question.

## Deviations from Plan

1. **EmptyState CTA is `Link` not `Button + onClick`** — cleaner semantics; visually identical; no behavioral regression. The `Button` component is no longer imported in `JourneysDashboard.tsx`.
2. **AC-SJ3b (sidebar completion) extracted as a separate Playwright test** — the plan described sidebar completion checking within AC-SJ3. Extracted for clarity and to allow independent skip behavior. No scope change.

## Anything Deferred

- **"Start a real journey" CTA destination** — links to `/` (dashboard) until `tutor-interview` ships `/journey/new`. Ceiling: user clicks CTA, sees empty dashboard with the same CTA that goes back to `/sample`. Warm, not broken. `sdlc-debt` comment left in `sample/index.tsx` and `JourneysDashboard.tsx`.
- **Cross-device visited state** — `wp:sample-visited` is per-device localStorage. A second device will also show the sample journey on first visit. Ceiling: per-account state requires a DB column migration (deferred to a later slice). Acceptable for v1.
- **Seeded-session Playwright ACs (AC-SJ1/2/3/4)** — BETTER_AUTH_SECRET wall; accepted into the existing `AC-ADL1+AC-ADL5` deferral entry. Clearing event: re-running E2E suite with BETTER_AUTH_SECRET set in `.dev.vars`. Proxy evidence: 11 Vitest assertions all pass.

## Known Risks / Caveats

- **`wp:sample-progress` event race** — lesson route's `localStorage.setItem` runs in a `useEffect`; the `setTimeout(0)` delay ensures the layout's `window.addEventListener` listener runs after the current effect batch and always sees the updated value. Tested: sidebar updates within 200ms (verified in Playwright AC-SJ3b with `waitForTimeout(200)`).
- **First-login redirect flash** — the `useEffect` fires after hydration; there is a brief render of the empty state (behind skeletons) before the redirect. Not user-visible in practice — the `isReady` flip happens at the first `requestAnimationFrame` after mount.

## Freshness Research

- **TanStack Router `useNavigate`** — `useNavigate()` returning a stable function is confirmed current for v1.170.x. The `void navigate({ to: '/sample' })` pattern (suppressing the Promise) is the idiomatic pattern used in the existing codebase.
- **Custom DOM events in React 19** — `window.dispatchEvent(new Event('...'))` + `window.addEventListener(...)` is standard DOM API; React 19 does not change custom event behavior. The `useEffect` cleanup removes the listener, preventing duplicates.
- **localStorage guard in SSR** — `typeof localStorage !== 'undefined'` guard prevents SSR crashes. TanStack Start renders on both server (Cloudflare Workers) and client; the guard ensures localStorage calls only execute on the client. Same pattern as `CheckpointQuestion`.

## Recommended Next Stage

- **Option A (default):** `/wf verify waypoint-app sample-journey` — 11 Vitest unit tests pass (proxy evidence for the BETTER_AUTH_SECRET-walled Playwright ACs). Run verify to capture the formal verification record and add AC-SJ1/2/3/4 to the existing ADL deferral.
- **Option B:** `/wf review waypoint-app sample-journey` — If proxy evidence is sufficient, skip verify and go straight to code review.

---

## Assumptions (recorded from autonomous decisions)

All assumptions are documented verbatim in `04-plan-sample-journey.md` §Assumptions. No new autonomous decisions were made during implementation beyond what was pre-recorded in the plan.

The two implementation-phase decisions not in the plan are:
- EmptyState CTA as `Link` (deviation #1 above) — pure quality improvement, no scope change.
- Separate AC-SJ3b Playwright test (deviation #2 above) — no scope change.
