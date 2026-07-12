---
schema: sdlc/v1
type: implement
slug: waypoint-app
slice-slug: tutor-interview
status: complete
stage-number: 5
created-at: "2026-07-12T01:08:00Z"
updated-at: "2026-07-12T01:08:00Z"
metric-files-changed: 17
metric-lines-added: 2210
metric-lines-removed: 8
metric-deviations-from-plan: 2
metric-review-fixes-applied: 0
commit-sha: "130c05a"
tags: [interview, prompts, pedagogy, chat-ui, state-machine]
refs:
  index: 00-index.md
  implement-index: 05-implement.md
  slice-def: 03-slice-tutor-interview.md
  plan: 04-plan-tutor-interview.md
  siblings:
    - 05-implement-foundation.md
    - 05-implement-platform-proofs.md
    - 05-implement-accounts-data-layer.md
    - 05-implement-design-system-shell.md
    - 05-implement-lesson-renderer.md
    - 05-implement-sample-journey.md
    - 05-implement-ai-gateway.md
  verify: 06-verify-tutor-interview.md
next-command: wf-verify
next-invocation: "/wf verify waypoint-app tutor-interview"
---

# Implement: Tutor Prompts & Interview

## The Implementation

The consent-gated interview is the first real door into Waypoint — everything downstream of it (roadmaps, lessons, quizzes) starts here. Two interlocking pieces ship: the agent prompt suite that articulates the pedagogy in LLM instructions, and the interview state machine that enforces the one-question contract structurally so no model can break it behaviorally. Together they mean the interview's structure is guaranteed by code, not by instruction-following.

Fifteen files, 2,200 lines. The backbone is `InterviewStateMachine` — a pure-function class that extracts the first ?-terminated sentence from any model output, handles the consent-decline path, detects vague mission answers (< 20 chars or vague-phrase patterns without a mission-format marker), and advances through the consent → mission → scope → prior_knowledge → sources → complete stage sequence. The prompt suite travels alongside it: the interview prompt is fully exercised with injection-resistance posture, one-Q-per-turn language, MISSION-FORMAT pushback, and stage sequencing; the lesson, quiz, and roadmap prompts are drafted thin with FIDELITY-NOTE comments mapping each source-skill rule to its Waypoint home.

The chat surface is four small components (ChatBubble, ChatChips, TypingIndicator, InterviewView) plus ~200 lines of CSS using the existing ember design tokens. A `?mock=1` query param on the interview route gates the server function into scripted-response mode, providing deterministic Playwright coverage without live model calls. The dashboard CTA now points to `/journey/new` — the sdlc-debt comment and the `/sample` link are both retired.

18 state-machine unit tests pass (above the plan's 14 minimum); 4 Playwright E2E tests written (3 seeded-session + 1 unauthenticated guard); 1 interview-tier live-model smoke added to the existing ai-tool-call suite. All 95 Vitest tests pass; 5 now skip (the added live smoke + 4 pre-existing).

## Summary of Changes

- Added `interview_records` D1 table (additive migration, idempotent)
- Authored all interview domain types (`InterviewStage`, `InterviewStatus`, `InterviewTurn`, `InterviewRecord`, `CapturedRecord`, `STAGE_CHIPS`, `TurnResponse`)
- Built `InterviewStateMachine` with `extractFirstQuestion`, `transition`, `detectVagueness`, `captureField`, `buildConsentDeclinedRecord`
- Built full agent prompt suite (`INTERVIEW_SYSTEM_PROMPT` exercised; `LESSON_SYSTEM_PROMPT`, `QUIZ_SYSTEM_PROMPT`, `ROADMAP_SYSTEM_PROMPT` drafted thin)
- Built four server functions: `startInterview`, `sendTurn`, `getInterviewState`, `completeInterview`
- Built four chat UI components: `ChatBubble`, `ChatChips`, `TypingIndicator`, `InterviewView`
- Added ~200 lines of chat CSS to `src/styles.css` using ember tokens
- Added two new routes: `/journey/new` (goal entry) and `/journey/$journeyId/interview` (chat)
- Updated dashboard CTA from `/sample` to `/journey/new`, removing sdlc-debt comment
- Regenerated route tree (44 lines added to `routeTree.gen.ts`)
- Added 18 state-machine unit tests and 4 E2E tests (3 seeded-session, 1 always-run)
- Added interview-tier live-model smoke to `ai-tool-call.test.ts`

## Files Changed

- `migrations/0001_interview_state.sql` — new: additive interview_records table
- `src/types/interview.ts` — new: all interview domain types and STAGE_CHIPS constant
- `src/lib/interview/state-machine.ts` — new: InterviewStateMachine class (pure, re-instantiable)
- `src/lib/interview/prompts.ts` — new: full agent prompt suite with FIDELITY-NOTE comments
- `src/server/interview.ts` — new: four server functions with withSession middleware pattern
- `src/components/interview/ChatBubble.tsx` — new: user/assistant message bubbles
- `src/components/interview/ChatChips.tsx` — new: quick-reply chip bar
- `src/components/interview/TypingIndicator.tsx` — new: three-dot bounce animation
- `src/components/interview/InterviewView.tsx` — new: top-level chat surface
- `src/routes/_authenticated/journey/new.tsx` — new: new-journey entry form
- `src/routes/_authenticated/journey/$journeyId/interview.tsx` — new: interview + resume route
- `src/styles.css` — modified: +~200 lines chat surface styles
- `src/components/dashboard/JourneysDashboard.tsx` — modified: CTA updated to `/journey/new`
- `src/routeTree.gen.ts` — modified: regenerated with new routes (+44 lines, auto-generated)
- `tests/smoke/interview-state-machine.test.ts` — new: 18 unit tests
- `tests/e2e/tutor-interview.spec.ts` — new: 4 Playwright tests (3 seeded-session + guard)
- `tests/smoke/ai-tool-call.test.ts` — modified: +28 lines interview-tier live smoke

## Shared Files (also touched by sibling slices)

- `src/styles.css` — shared with all UI slices; appended safely to end of file
- `src/routeTree.gen.ts` — shared auto-generated; regenerated cleanly
- `tests/smoke/ai-tool-call.test.ts` — shared with ai-gateway slice; new test added in the existing describe block

## Notes on Design Choices

1. **Non-streaming interview turns.** Confirmed from plan. Non-streaming call simplifies the server function and client significantly; gpt-4o-mini hits the < 3s turn budget without SSE. Decision recorded in plan assumptions §1.

2. **State machine as pure rehydratable class.** `InterviewStateMachine` takes `initialStage` in its constructor. Each server function call creates a new instance from the stored D1 `stage` field. This is correct for stateless Workers functions.

3. **Mock seam on the route, not the server function.** `?mock=1` on the interview route passes `mock: true` to `sendTurn`. The server function guards the mock path with `process.env.NODE_ENV !== 'production'`. This matches the lesson/fixture.tsx pattern.

4. **STAGE_CHIPS in types/interview.ts, not server.** Chips are client-side constants — putting them in the types file avoids a server-only import in the UI layer.

5. **TanStack Form deviation.** Controlled React textarea used instead (see Deviations from Plan).

## Verification Seams Built

- AC-TI1 (scripted interview) → `?mock=1` route param + `MOCK_QUESTIONS` table in `src/server/interview.ts:65–74` (enables mock `sendTurn` in Playwright); `data-testid="interview-view"`, `"chat-chips"`, `"chat-bubble-assistant-*"`, `"interview-complete-card"` in `InterviewView.tsx`; `data-testid="chat-input"`, `"chat-submit"` for free-text input
- AC-TI2 (vagueness detection) → `InterviewStateMachine.detectVagueness()` tested by 8 Vitest unit tests at `tests/smoke/interview-state-machine.test.ts`
- AC-TI3 (resume) → `getInterviewState()` loader in `interview.tsx`; `initialTurns` prop hydrates from D1; seeded `interview_records` row in beforeAll
- AC-TI4 (decline-consent) → `STAGE_CHIPS.consent` includes "Just use my stated goal"; `sendTurn` transition returns `declined` stage → completion card visible; seeded consent-stage record in beforeAll
- AC-TI5 (one-Q enforcement) → `InterviewStateMachine.extractFirstQuestion()` tested by 6 adversarial Vitest fixtures
- AC-TI6 (prompt fidelity) → `INTERVIEW_SYSTEM_PROMPT` with MISSION-FORMAT, one-Q, injection-resistance, stage sequence; `FIDELITY-NOTE:` comments on all three thin-draft prompts

## Deviations from Plan

1. **TanStack Form not installed.** The plan assumed `@tanstack/react-form` was installed ("stable, already installed"). It is not in `package.json` or `node_modules`. Used controlled React textarea + `useState` instead. Functional equivalence: same validation (≥5 chars), same submit handler pattern, zero additional dependency. This is rung-1 (native React) vs rung-2 (form library) on the simplicity ladder — more minimal, not worse. Recorded here.

2. **`?mock=1` on the interview route.** The plan described mock mode as "detectable via a query param on the fixture route" and implied a separate fixture route. Implemented as a `validateSearch` param on the interview route itself (`/journey/$journeyId/interview?mock=1`) rather than a separate fixture route. This is simpler and keeps the mock seam in the production route, which also tests the route's own rendering path rather than a fixture bypass. No scope difference.

## Anything Deferred

- **Roadmap trigger on completion.** When `stage === 'complete'`, the completion card shows a static "roadmap coming" message. The actual roadmap generation trigger is deferred to the roadmap-lesson-generation slice, per plan design.
- **Source URL fetching.** Captured URL strings are stored in `captured_source_urls`; fetching and processing the URLs is deferred to the source-grounding slice.
- **OAuth sign-in flow clarity in the interview.** Mid-interview auth expiry handling (e.g., re-auth prompt on 401 from server functions) is not implemented — this is an edge case deferred to the accounts hardening pass.

## Known Risks / Caveats

- **Live model voice quality.** The mocked tests pin structure (one-Q, stage transitions, capture format); voice quality (warmth, vagueness pushback wording, injection resistance) is only observable in a live-model smoke run. The interview-tier smoke is tagged in `ai-tool-call.test.ts` and requires `OPENROUTER_API_KEY`.
- **Multi-Q adversarial model outputs.** `extractFirstQuestion()` regex covers 6 fixture types; further edge cases may emerge in live runs (e.g., questions inside code blocks, non-ASCII `？`). The 18 unit tests are the automated floor.

## Freshness Research

No additional freshness research performed beyond what was recorded in the plan. The plan's freshness sweep (2026-07-10T22:10Z) covered all relevant dependencies:
- `gpt-4o-mini` (interview tier primary): no regressions reported
- `@tanstack/react-start` v1.168.x: `getWebRequest()` absence confirmed; `createMiddleware` pattern established in prior slices
- `better-auth` `requireAuth()`: stable, no drift since accounts-data-layer

## Recommended Next Stage

- **Option A (default):** `/wf verify waypoint-app tutor-interview` — implementation touches testable behavior (state machine unit tests, Playwright E2E with seeded sessions). The BETTER_AUTH_SECRET deferral is pre-registered; seeded-session tests run when the secret is set. Consider `/compact` before verifying — seven-slice implementation context is in memory.
- **Option B:** `/wf review waypoint-app tutor-interview` — skip verify if the unit tests (18/18 passing) are sufficient evidence for the structural ACs and the Playwright deferral is accepted.
