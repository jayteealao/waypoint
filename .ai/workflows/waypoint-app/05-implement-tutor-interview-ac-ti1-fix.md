---
schema: sdlc/v1
type: implement
slug: waypoint-app
slice-slug: tutor-interview-ac-ti1-fix
status: complete
stage-number: 5
created-at: "2026-07-14T23:08:05Z"
updated-at: "2026-07-14T23:08:05Z"
metric-files-changed: 3
metric-lines-added: 79
metric-lines-removed: 4
metric-deviations-from-plan: 3
metric-review-fixes-applied: 0
commit-sha: "cc9c2cd"
tags: [test, e2e, playwright, tutor-interview, regression, search-params, tanstack-router, mock-seam]
refs:
  index: 00-index.md
  implement-index: 05-implement.md
  slice-def: 03-slice-tutor-interview-ac-ti1-fix.md
  plan: 04-plan-tutor-interview-ac-ti1-fix.md
  siblings:
    - 05-implement-tutor-interview.md
    - 05-implement-e2e-session-cookie-prefix.md
  verify: 06-verify-tutor-interview-ac-ti1-fix.md
next-command: wf-verify
next-invocation: "/wf verify waypoint-app tutor-interview-ac-ti1-fix"
---

# Implement: Tutor-interview AC-TI1 chip-visibility fix

## The Implementation

The plan expected a test-side timing patch and made diagnose-first a hard gate precisely so a
real defect could not hide behind one. That gate earned its keep. The runtime snapshot at the
failing step showed the "Some experience" click *had* fired (the user turn was in the transcript,
the typing indicator was spinning) — but the rendered questions were live-model prose about
"Rust or systems programming", not the scripted `MOCK_QUESTIONS`. Mock mode was never engaging.
A server probe confirmed `sendTurn` received `mock: false` on every turn with `NODE_ENV` a healthy
`"development"`, and a loader probe showed the route resolving at `/journey/…/interview` with the
`?mock=1` **gone**. A raw HTTP trace found the culprit: a `307` that stripped the query string
outright.

The root cause is a parse→stringify asymmetry in the interview route's `validateSearch`. `?mock=1`
parses (router-core default, `JSON.parse` per value) to the number `1`, validates to the boolean
`true`, and the router re-serializes that to the canonical `?mock=true`. It then re-parses and
re-validates that canonical URL — and the old check accepted only `"1"`/`1`, so boolean `true`
failed, `mock` resolved to `undefined`, and the canonicalizing redirect dropped the param. The
component saw `mock === false` and every interview turn silently called the live OpenRouter model.
That is why the "deterministic" failure was really flakiness: the third turn's live latency
intermittently blew the 5 s assertion. (An empirical tell recorded during diagnosis: `?mock=1&foo=bar`
canonicalized to `?foo=bar` — the *validated* param was stripped while the unknown one survived.)

The fix makes the validator idempotent: accept `true`/`"true"` as well as `1`/`"1"`, so `?mock=true`
is a stable fixed point. This is an app-side source fix (the plan's Step-3c contingency), not the
test-only hydration gate its prior favored. Because the route module can't be imported under Vitest
(it transitively pulls `cloudflare:workers`), the parsing logic moved to a tiny pure helper,
`parseMockFlag`, which a focused unit test pins against the exact round-trip regression. Post-fix
proof is layered: a raw curl now shows `?mock=1 → 307 → ?mock=true` (retained, not stripped);
`tutor-interview.spec.ts` is 4/4 green and AC-TI1 holds 3/3 under `--repeat-each`; the mock seam now
drives the flow deterministically with zero live-model calls. The spec file itself was not touched.

## Summary of Changes

- **Fixed the interview route's `?mock` search-param validation to be round-trip idempotent** so the
  `?mock=1` scripted-test seam actually engages (it never did before — the canonicalizing redirect
  silently stripped the param, routing every turn to the live model).
- **Extracted the parse into a pure `parseMockFlag(raw)` helper** (`src/lib/interview/mock-flag.ts`)
  so it is unit-testable without a Workers runtime; the route's `validateSearch` delegates to it.
- **Added a focused unit test** (`tests/smoke/interview-mock-flag.test.ts`, 4 cases) pinning the
  round-trip regression: `1`/`"1"` *and* the canonical `true`/`"true"` are accepted; falsey/unrelated
  values are rejected; the parse→validate→stringify→parse loop reaches a stable fixed point.

## Files Changed

- `src/routes/_authenticated/journey/$journeyId/interview.tsx` — `validateSearch` now delegates to
  `parseMockFlag`; comment explains the round-trip requirement. (+7 / −4)
- `src/lib/interview/mock-flag.ts` — **new.** Pure `parseMockFlag(raw): boolean` accepting the raw
  URL form (`1`/`"1"`) and the canonical serialized form (`true`/`"true"`) the router round-trips to.
- `tests/smoke/interview-mock-flag.test.ts` — **new.** 4-case Vitest suite; regression guard for the
  boolean-form acceptance and round-trip idempotency.

## Shared Files (also touched by sibling slices)

- `src/routes/_authenticated/journey/$journeyId/interview.tsx` — authored by the completed
  `tutor-interview` slice. This change is confined to `validateSearch`; the interview UX, state
  machine, chip contract, and `sendTurn` shape are untouched (the completed slice's other ACs are
  unaffected).

## Notes on Design Choices

- **Fix the validator, not the assertion.** The plan barred loosening the test to force green; the
  defect is a real param-stripping bug, fixed at the defect. The spec was left unchanged.
- **Accept the canonical boolean rather than force a different serialization.** The validator's own
  output is boolean `true`, whose canonical URL is `?mock=true`; the only idempotent contract is to
  accept that boolean back. `?mock=1` still triggers one harmless server-side canonicalizing 307 to
  `?mock=true`, after which the flag survives to the component — no redirect loop, no strip.
- **Pure-helper extraction is for testability, not abstraction.** The route file can't load under the
  jsdom/node unit runner (transitive `cloudflare:workers`); the repo's existing SSR test
  (`db-collection-ssr.test.ts`) imports the pure factory for exactly this reason. `parseMockFlag` is a
  one-liner with a single production call site — kept minimal, not a speculative seam.
- **Production safety unchanged.** The `sendTurn` mock gate remains `mock === true && NODE_ENV !==
  'production'`; making `?mock=true` a valid *retained* param does not enable the mock path in
  production (still `NODE_ENV`-gated on the server).

## Verification Seams Built

- **AC-TI1F1 / AC-TI1F2** → the diagnose-first observability (Playwright trace + error-context aria
  snapshot + transient server-side `console.log` probes on `mock`/`NODE_ENV`, request URL, and
  `validateSearch` in/out) was the Step-1 seam that named the stuck layer; all probes were removed
  after diagnosis (no diagnostic code remains — grep for `DIAG_` is clean).
- **AC-TI1F3** → `parseMockFlag` extracted as a pure module at `src/lib/interview/mock-flag.ts:20` —
  the seam that makes the search-param round-trip observable to Vitest (`tests/smoke/interview-mock-flag.test.ts`)
  without standing up a Workers runtime. Enables the unit-coverage clause for a real source fix.

## Deviations from Plan

1. **Fix layer: app-side, not test-only** (class: implementation-detail). The plan's leading prior was
   candidate 1 (a React-19 hydration gate in the spec, "expected sole fix site
   `tests/e2e/tutor-interview.spec.ts`"). Diagnosis proved the fault is an app-side route defect —
   the plan's own Step-3c contingency branch. Pre-authorized by the plan (Steps 3b/3c + Step 5), so
   this is the plan's conditional path being taken, not out-of-scope drift. No user-observable scope,
   API, persisted-shape, or migration change.
2. **Fix site + an extra new file** (class: implementation-detail). Actual sites are
   `src/routes/…/interview.tsx` (not the spec) plus a new pure module `src/lib/interview/mock-flag.ts`
   (2 files vs. the plan's expected "two files touched in the test-only case"). The new module is a
   testability extraction, not new product surface. Not a "planned API not found" deviation — no
   dependency capability was assumed absent.
3. **Unit-coverage locus** (class: implementation-detail). AC-TI1F3 phrased the conditional coverage
   as "the state-machine's unit tests." The root cause is *not* in `InterviewStateMachine` (that
   transition is correct and already unit-proven); the correct locus is the search-param validator, so
   coverage is the new `parseMockFlag` suite. The AC's intent — a real source fix carries unit proof —
   is satisfied at the right layer.

## Anything Deferred

- None. The fix is complete and the AC set is fully met in-env (no runtime-evidence wall: the
  seeded-session `BETTER_AUTH_SECRET` is present, len 64, ledger-cleared).
- The `tutor-interview` slice's completed `?mock=1` cross-slice note (05-implement.md, "exposes
  `mock: boolean` … E2E tests use this seam") described intended behavior that was in fact broken
  until now; a corrected note is added to the master index this round (not a deferral — reconciled).

## Known Risks / Caveats

- **One canonicalizing redirect on `?mock=1`.** The test URL now incurs a single server-side 307 to
  `?mock=true` before render. It is harmless (search-only canonicalization, preserves other params,
  transparent to Playwright) and affects only the dev/E2E mock path. Documented, not a live-code
  ceiling. No `sdlc-debt:` marker warranted (no shortcut with a known-worse ceiling was taken).

## Freshness Research

- **@tanstack/router-core (installed, per RIM-E3 / MEMORY):** read
  `node_modules/@tanstack/router-core/dist/esm/searchParams.js` — `defaultParseSearch =
  parseSearchWith(JSON.parse)` JSON-parses each value (so `mock=1` → number `1`), and
  `defaultStringifySearch` re-serializes primitives verbatim (so boolean `true` → `mock=true`). This
  is the mechanism behind the parse→stringify asymmetry the fix closes; confirmed against installed
  source, not recalled shapes.
- **@playwright/test 1.61.1 / react-dom 19.2.7 (installed):** the plan's candidate-1 hydration
  hypothesis was ruled out by the runtime snapshot (the click fired; the gap was server-side mock
  routing, not client event attachment), so no library workaround was needed. Recorded for RIM-E3
  completeness: the hydration gate at `spec:222` was already present and was not the fault.

## Recommended Next Stage

- **Option A (default):** `/wf verify waypoint-app tutor-interview-ac-ti1-fix` — re-drive AC-TI1 (and
  the full `tutor-interview.spec.ts`) to independently confirm mock mode now engages deterministically
  (no live-model calls), plus the `parseMockFlag` unit suite and the `?mock=1 → ?mock=true` retention.
  Consider `/compact` first — diagnostic context is noise for verification; state lives in the artifacts.
- **Option B:** `/wf review waypoint-app tutor-interview-ac-ti1-fix` — skip verify only if the layered
  in-implement proof (4/4 spec, 3/3 repeat, curl retention, 4/4 unit) is judged sufficient; a source
  fix to a routing validator generally warrants an independent verify re-drive first.
