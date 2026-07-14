---
schema: sdlc/v1
type: plan
slug: waypoint-app
slice-slug: tutor-interview-ac-ti1-fix
status: complete
stage-number: 4
created-at: "2026-07-14T22:43:19Z"
updated-at: "2026-07-14T22:43:19Z"
metric-files-to-touch: 2
metric-step-count: 7
has-blockers: false
revision-count: 0
revisions: []
tags: [test, e2e, playwright, tutor-interview, regression, react-19-hydration]
stack-source: confirmed
refs:
  index: 00-index.md
  plan-index: 04-plan.md
  slice-def: 03-slice-tutor-interview-ac-ti1-fix.md
  siblings: [04-plan-tutor-interview.md]
  implement: 05-implement-tutor-interview-ac-ti1-fix.md
next-command: wf-implement
next-invocation: "/wf implement waypoint-app tutor-interview-ac-ti1-fix"
---

# Plan: Tutor-interview AC-TI1 chip-visibility fix

## The Plan

One Playwright test dies every full-suite run: **"AC-TI1: scripted interview completes with chips at each stage"** times out at line 267, where the "A little" prior-knowledge chip never becomes visible after the "Some experience" scope chip is clicked. The temptation is to reach for the repo's proven React-19 hydration gate and call it done — and that may well be the answer — but the slice makes diagnose-first a hard gate for a reason: three layers could each produce this exact symptom, and two of them would be masked, not fixed, by a test-side timing patch.

The evidence already narrows the field before a single line is touched. The state machine's `scope -> prior_knowledge` transition is unconditional and linear (`state-machine.ts:93-95`) and is directly unit-proven (`interview-state-machine.test.ts:128-130`), so a real domain regression (candidate 3) is unlikely. The mock table is fully populated for every stage (`interview.ts:45-53`) and mock mode returns `STAGE_CHIPS[nextStage]`, so a stalled scripted flow (candidate 2) is unlikely. The client's `submitUserContent -> setChips(result.chips)` re-render path (`InterviewView.tsx:106-114`) is logically correct. What is left is the interaction/hydration seam (candidate 1) — and a viewport wrinkle the current test carries: it resizes to 768px (`spec:248`) right before the actionable scope and prior-knowledge chip clicks, whereas the mount-time hydration gate (`spec:222`) only covers the *first* interaction.

So the plan is: capture a runtime snapshot at the failing point, read the two candidate library sources (Playwright actionability + react-dom 19 hydration) per the standing installed-source constraint, then apply the *minimal* fix at whichever layer the snapshot names — a test-only auto-wait/viewport-ordering change if it is a harness artifact, or a real client fix (with the mount gate extended, not the assertion loosened) if the first post-mount chip click genuinely no-ops. If — and only if — the fault is a real source regression, a focused unit case pins it. Two files touched in the expected (test-only) case; the environment wall that gates every seeded-session spec is already retired (`BETTER_AUTH_SECRET` present, len 64, ledger-cleared), so verification runs directly with no deferral.

## Current State

- **Failing test:** `tests/e2e/tutor-interview.spec.ts` line 207, times out at line 267 (`getByRole("button", { name: "A little" })` never visible). Repro: `set -a && . ./.dev.vars && set +a && pnpm exec playwright test tests/e2e/tutor-interview.spec.ts -g "AC-TI1" --reporter=line`.
- **Flow at the failure:** consent -> click "Yes, let's explore" -> mission (passes, `chat-bubble-assistant-3` visible) -> type mission + submit -> scope ("Some experience" chip visible + clicked, passes) -> **prior_knowledge (fails: "A little" chip never appears)**.
- **Domain layer proven correct:** `InterviewStateMachine.transition` (`src/lib/interview/state-machine.ts:67-115`) advances `scope -> prior_knowledge` unconditionally; unit-covered at `tests/smoke/interview-state-machine.test.ts:128-130`.
- **Mock layer proven correct:** `MOCK_QUESTIONS` (`src/server/interview.ts:45-53`) has an entry for every stage; `sendTurn` mock branch returns `STAGE_CHIPS[nextStage]` (`interview.ts:304-306, 377`). `STAGE_CHIPS.prior_knowledge = ["None at all", "A little", "Solid foundation"]` (`src/types/interview.ts:74`).
- **Client layer:** `InterviewView.submitUserContent` sets `turns`, `stage`, and `chips` from the server response (`InterviewView.tsx:97-130`); `ChatChips` renders `STAGE_CHIPS`-driven labels (`ChatChips.tsx:17-37`). Logically correct.
- **Existing mount-time hydration gate:** `spec:222` waits for the client-only "Open TanStack Devtools" button before the first interaction — but not before subsequent chip clicks.
- **Viewport churn in the test:** `spec:248` sets 768px right before the mission submit and the scope/prior-knowledge clicks; the 375px screenshot path (`spec:229-237`) already resets to 1280 before interacting, and the mission-submit path does not.
- **Environment wall retired:** `BETTER_AUTH_SECRET` is present in `.dev.vars` (len 64) and the seeded-session deferral (AC-ADL1/5 cluster) is `cleared` in `00-index.md`.
- **Stack (confirmed):** web / TypeScript / React 19.2.7 / Vite + Cloudflare Workers / pnpm / Vitest 4.1.10 + Playwright 1.61.1.

## Simplicity Ladder

- **Observe the stuck stage at the failing step** -> rung 2 native-platform — Playwright's built-in `page.screenshot`, `locator.ariaSnapshot()`, and trace viewer; no new tooling.
- **Reliable wait for the re-rendered chip bar** -> rung 2 native-platform — Playwright auto-waiting / web-first assertions (`toBeVisible`, `toBeEnabled`) over a fixed `timeout: 5000`. No polling helper to hand-roll.
- **Confirm React has attached listeners before a mid-flow click** -> rung 3 reuse — the established repo pattern, the client-only "Open TanStack Devtools" visibility gate (`adaptation-progress.spec.ts:391-392`, already partially used at `tutor-interview.spec.ts:222`); reuse/extend, do not invent a new hydration primitive.
- **Fix mechanism** -> rung 4 new code only if diagnose-first proves a real client/domain defect; the change is then the smallest edit at the named layer (a client event-attach fix or a one-line transition fix), not a rewrite. Reason lower rungs do not hold: a genuine regression is a code defect, not a wait or a built-in.

## Applied Learnings

- `.ai/solutions/INDEX.md` — not present in-repo; user-level `solutions.globalDir` not configured. **No applicable learnings found.**
- **Standing memory (MEMORY.md):** the TanStack "assume-missing" anti-pattern note — read installed source before working around any API. Folded into Step 2 (study-sources of Playwright + react-dom 19) and RIM-E3 compliance below.
- **Repeat-deferral tripwire:** the slice's verification names the `BETTER_AUTH_SECRET` seeded-session wall. Scanning `00-index.md` `runtime-evidence-deferrals`, that wall's entry (AC-ADL1/5 cluster) is `status: cleared` — the secret is present (len 64). The slug does **not** pay the wall twice: it is already retired, so no harness must be scoped and no `harness-declined` is needed. Recorded, not silent.

## Likely Files / Areas to Touch

- `tests/e2e/tutor-interview.spec.ts` — **primary** (expected sole fix site): AC-TI1 interaction ordering, chip-visibility waits, and viewport-vs-interaction sequencing.
- `tests/smoke/interview-state-machine.test.ts` — **conditional**: +1 focused unit case ONLY if diagnosis proves a real source regression (AC-TI1F3).
- `src/components/interview/InterviewView.tsx` — **conditional / read-only context**: touched only if diagnose-first names a real client event-attach/render defect.
- `src/lib/interview/state-machine.ts`, `src/server/interview.ts` — **read-only context**: candidate causes 2/3, currently excluded by unit + code evidence; touched only if the runtime snapshot contradicts.

## Proposed Change Strategy

Diagnose, then fix at the named layer with the smallest possible change. The slice's `< 3s` turn NFR is not implicated (no mechanism choice narrows a charter commitment here), so no NFR charter-ranking citation is required. Precedence: **runtime snapshot > code/unit evidence > repo pattern**. The snapshot decides the layer; the code evidence (domain + mock proven, client logically correct) sets the prior that the layer is the interaction/hydration seam; the repo's hydration-gate pattern is the reuse target if the fix is client-side. Loosening the assertion to force a green is out of bounds — a wait must be justified by an actual settling event, and a real defect must be fixed at the defect, with unit proof when it is in source.

## Step-by-Step Plan

1. **Diagnose-first (hard gate, no edits yet).** Run the repro under trace; at the point "A little" fails to appear, capture `page.screenshot`, `locator("[data-testid=interview-view]").ariaSnapshot()`, and the visible chip labels. Determine which stage the flow is actually stuck on and whether the "Some experience" click fired (did `stage` advance to `prior_knowledge`? did `sendTurn` run? are the prior-knowledge chips in the DOM but not "visible", or absent entirely?). Record the finding verbatim in `05-implement-tutor-interview-ac-ti1-fix.md` (AC-TI1F3).
2. **Read installed source before choosing the mechanism (RIM-E3 / MEMORY).** Via study-sources, read `@playwright/test` actionability + auto-waiting semantics (why `toBeVisible`/click may pass or stall after a viewport resize) and `react-dom` 19 hydration/event-attach behavior for post-mount interactions. Cite the `node_modules/` paths read in the implement artifact. (In-repo interview source already read directly during planning.)
3. **Pick the layer from the snapshot:**
   - **3a. Test-only (expected):** if the chips render but the harness observes them unreliably (viewport/actionability/timing), apply the minimal spec change — auto-wait on the chip-bar re-render / chip enabled-state, and move the 768px screenshot resize so it does not precede an actionable click (mirror the 375px reset-to-1280 pattern, `spec:229-237`).
   - **3b. Client defect (candidate 1, app-side):** if the first *post-mount* chip click genuinely no-ops (event listeners not attached for the mid-flow interaction), fix in `InterviewView.tsx` — do not loosen the assertion. Extend/repair the hydration seam, not the test's patience.
   - **3c. Mock/domain regression (candidate 2/3):** if the snapshot shows the stage did not advance server-side, fix `interview.ts` mock flow or `state-machine.ts` transition, and add the unit case (Step 5).
4. **Apply the smallest fix** at the layer chosen in Step 3.
5. **Unit coverage for a real source fix (AC-TI1F3, conditional):** if 3b/3c, add a focused case to `tests/smoke/interview-state-machine.test.ts` (or the relevant unit suite) that fails before / passes after the source change. Skip if 3a (test-only).
6. **Prove AC-TI1F1 + AC-TI1F2:** run the AC-TI1 repro (green, no line-267 timeout), then the **full** `tutor-interview.spec.ts` (every previously-passing test still passes — no regression).
7. **Commit cleanly through the full pre-commit gate** (secret-scan, lint, format-check, commitlint) with a conventional message and **no `--no-verify`**. Product-language commit only (no workflow/stage/artifact identifiers). The format-check gate is now green (repo-format-baseline landed, `00-index.md` ledger).

## Verification Strategy

| AC | Tool / method + ladder rung | Environment need — satisfiable in target env? | What must be BUILT to make it verifiable | Fallback chain |
|----|------------------------------|-----------------------------------------------|------------------------------------------|----------------|
| AC-TI1F1 — AC-TI1 repro passes; "A little" chip visible+clickable, no line-267 timeout | Playwright E2E seeded-session run (rung 2 native runtime) | `BETTER_AUTH_SECRET` (present, len 64), local wrangler D1 seed, Vite dev server, Chromium — **yes, all present** | The Step-3 fix itself (test wait/ordering or client seam); diagnose-first snapshot is the observability seam, built in Step 1 | primary tool available -> no fallback needed |
| AC-TI1F2 — full `tutor-interview.spec.ts` green, no regression | Full-spec Playwright run (rung 2) | same as above — **yes** | none beyond Step-3 fix | primary available -> no fallback |
| AC-TI1F3 — diagnosis recorded; clean commit; source fix unit-covered if app regression | Diagnosis written to implement artifact; `pnpm test` (Vitest) for any unit case; full pre-commit gate run (rung 1/2) | local Node + Vitest + lefthook — **yes** | conditional unit case (Step 5) | n/a — process/automated AC |

Per-AC constraint-resolution (force-scope rule):

- **AC-TI1F1 / AC-TI1F2** — `constraint-resolution: satisfied-in-env` — the only environment dependency on the critical path (`BETTER_AUTH_SECRET` for HMAC-SHA-256 session-cookie signing) **already exists** in `.dev.vars` (len 64) and its seeded-session deferral is `status: cleared` in `00-index.md`. No wall to scope, proxy, or PO-accept; verification runs directly. (The three force-scope options apply only to a dependency that does not exist — this one does.)
- **AC-TI1F3** — no environment dependency; automated + documentation AC.

No outcome-metric AC and no mandated-mitigation AC in this slice — the force-scope proxy/exercise clauses do not apply.

## Test / Verification Plan

### Automated checks
- **lint/typecheck:** `pnpm run typecheck` + lint clean over changed files (part of the pre-commit gate).
- **unit tests:** `pnpm test` — existing `tests/smoke/interview-state-machine.test.ts` (12 cases inc. `scope->prior_knowledge->sources`) stays green; +1 case only on the source-fix branch.
- **e2e:** AC-TI1 repro run, then full `tutor-interview.spec.ts`.

### Interactive verification (human-in-the-loop)
- **What to verify:** the scripted interview advances consent -> mission -> scope -> **prior_knowledge** -> sources -> completion, with the "A little" chip visible and clickable at the prior-knowledge stage.
- **Platform & tool:** Web — in-repo Playwright suite (`stack.testing: [playwright]`), seeded-session proxy with `?mock=1`. Exact command: `set -a && . ./.dev.vars && set +a && pnpm exec playwright test tests/e2e/tutor-interview.spec.ts -g "AC-TI1" --reporter=line`, then the same without `-g` for the full spec.
- **Companion skills:** none required.
- **Steps:** (1) seed via the spec's `beforeAll` (wrangler d1 local); (2) run the AC-TI1 repro; (3) on green, run the full spec; (4) inspect the diagnose-first screenshot/aria-snapshot captured in Step 1.
- **Evidence capture:** Playwright screenshots already written to `tests/e2e/screenshots/interview-*.png`; the diagnose-first snapshot + `--reporter=line` pass/fail tail recorded in `06-verify-tutor-interview-ac-ti1-fix.md`.
- **Pass criteria:** AC-TI1 test passes (no line-267 timeout); full spec shows every previously-passing test still passing.

## Risks / Watchouts
- **Misdiagnosis into the wrong layer** (slice risk 1) — mitigated by the diagnose-first hard gate; do not edit before the stuck stage is named.
- **A test-only gate hiding a real client hydration defect** — if the first post-mount chip click genuinely no-ops, fix the client, do not loosen the assertion (risk-2 in sibling `.yaml`).
- **A real source fix shipping without unit proof** — AC-TI1F3 conditional unit case guards this (risk-3).
- **Viewport-actionability red herring** — the 768px resize before actionable clicks is a plausible harness artifact; confirm with the snapshot rather than assuming.

## Dependencies on Other Slices
- None (`depends-on: []`). Corrects a test against the completed `tutor-interview` slice (context, not modification). Reuses the React-19 hydration-gate pattern proven in `adaptation-progress` and `e2e-session-cookie-prefix`. Orderable anytime.

## Assumptions

<!-- Every entry is an autonomously-resolved discovery question. class: implementation-detail on all — none change user-observable scope, a public API, persisted shape, or require a migration. -->

1. **Diagnosis mechanism** (class: implementation-detail) — assumed Playwright trace + `page.screenshot` + `ariaSnapshot()` + visible-chip dump at the failing line, over a debugger or ad-hoc `console.log`. Cheapest, deterministic, reuses the tool already in `stack.testing`; no blast radius.
2. **Most-probable layer = interaction/hydration (candidate 1)** (class: implementation-detail) — assumed as the working prior because the domain transition is unit-proven (`interview-state-machine.test.ts:128-130`) and `MOCK_QUESTIONS` is fully populated (`interview.ts:45-53`), so candidates 2/3 are improbable. **Not presumed as the fix** — Step 1's snapshot is authoritative and can override this prior.
3. **Prefer test-only, minimal fix when the layer is the harness** (class: implementation-detail) — assumed the fix is a Playwright-native auto-wait on the chip re-render plus viewport-vs-interaction re-ordering (mirroring the existing 375px reset-to-1280 pattern), not a broad `waitForTimeout` and not loosening assertions. Lowest cost, matches repo conventions, fully reversible.
4. **Viewport hypothesis is worth testing** (class: implementation-detail) — assumed the 768px resize at `spec:248` (immediately before actionable scope/prior-knowledge clicks) is a candidate contributor; if the snapshot confirms a covered/below-fold chip, move the screenshot capture or reset to 1280 before the clicks. Test-only.
5. **Unit coverage only on a real source fix** (class: implementation-detail) — assumed AC-TI1F3's unit-coverage clause is exercised only if diagnosis is 3b/3c; if the fix is test-only (3a), the existing 12 unit cases + green spec satisfy the AC. Avoids padding the suite with a test for a non-defect.
6. **RIM-E3 installed-source read targets Playwright + react-dom 19** (class: implementation-detail) — assumed the standing "read installed source before choosing the fix mechanism" constraint is satisfied by a study-sources read of `@playwright/test` (actionability/auto-waiting) and `react-dom` 19 (hydration/event-attach) in `node_modules`, since the fix leans on those library behaviors. In-repo interview source read directly during planning.
7. **Verification environment is already provisioned** (class: implementation-detail) — assumed `BETTER_AUTH_SECRET` present (len 64, ledger-cleared) means the seeded-session wall is retired and verification runs directly, no deferral. Reads state from `.dev.vars` + `00-index.md`; no new provisioning.
8. **If diagnosis forces an app fix, it restores intended behavior — not a contract change** (class: implementation-detail) — assumed a candidate-1/3 source fix RESTORES the AC-TI1-intended chip flow within the completed slice's existing contract (same `InterviewStage` union, same `STAGE_CHIPS`, same `sendTurn` shape). No user-observable scope change, no API/persisted-shape change, no migration — therefore not a hard-stop, and unit-covered per AC-TI1F3.

## Blockers
- None. Environment satisfiable, no unresolved verification wall, no contract-level open question. Autonomous discovery resolved every implementation-detail fork above; none met the hard-stop bar (user-observable scope / contract / persisted-shape / migration).

## Freshness Research

- **@playwright/test 1.61.1** (installed) — current major line; web-first assertions (`toBeVisible`, `toBeEnabled`) and locator auto-waiting are the idiomatic replacement for fixed `timeout:` polling. Relevant: the fix's preferred mechanism (Step 3a) is the framework's recommended pattern, not a workaround. Source of truth: installed package (study-sources read scheduled at implement, Step 2).
- **react-dom 19.2.7** (installed) — React 19 hydration; the established repo mitigation (wait for a client-only element before interaction) already exists at `spec:222`. Relevant: if the mid-flow click no-ops, the gap is that the gate covers mount but not subsequent interactions — an app-side seam, read installed source before patching.
- **Vitest 4.1.10** (installed) — unit runner for any AC-TI1F3 source-fix case; no version concern.

## Recommended Next Stage
- **Option A (default):** `/wf implement waypoint-app tutor-interview-ac-ti1-fix` — plan is execution-ready; diagnose-first is Step 1, fix layer resolves from the runtime snapshot. Consider `/compact` first — planning research is noise for implementation; state lives in these artifacts.
