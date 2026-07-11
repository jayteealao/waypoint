---
schema: sdlc/v1
type: slice
slug: waypoint-app
slice-slug: roadmap-lesson-generation
status: defined
stage-number: 3
created-at: "2026-07-10T22:43:12Z"
updated-at: "2026-07-10T22:43:12Z"
complexity: l
depends-on: [tutor-interview, lesson-renderer]
tags: [roadmap, lesson-generation, streaming, resilience, concept-tagging]
refs:
  index: 00-index.md
  slice-index: 03-slice.md
  siblings: [03-slice-foundation.md, 03-slice-platform-proofs.md, 03-slice-accounts-data-layer.md, 03-slice-design-system-shell.md, 03-slice-lesson-renderer.md, 03-slice-sample-journey.md, 03-slice-ai-gateway.md, 03-slice-tutor-interview.md, 03-slice-quiz-fsrs.md, 03-slice-adaptation-progress.md, 03-slice-source-grounding.md]
  plan: 04-plan-roadmap-lesson-generation.md
  implement: 05-implement-roadmap-lesson-generation.md
---

# Slice: Roadmap & Lesson Generation

## The Slice

This is where the loop closes: everything before it was preparation, and after this slice a learner can finish an interview, watch a roadmap appear in the sidebar, open a waypoint, and read a lesson that streams in progressively with interactive widgets — generated, not fixture. Two generation paths land together because they share everything: the roadmap path (structured output on the cheap tier, non-streaming + Response Healing, schema validation with one re-ask) turns the interview's record into ordered waypoints with titles, goals, and concept lists; the lesson path (premium tier) streams SSE through the gateway into the renderer's already-proven progressive surface, invoking registry widgets and tagging content to concepts as it goes — the tags quiz-fsrs will consume.

This slice also owns making failure invisible-ish: composing the gateway's retry/fallback primitives into resume-from-last-completed-section, so a mid-stream model failure costs the learner a brief reconnecting banner instead of a lost lesson (AC-12). And it clears AC-15's residual — the streaming proof re-run against a real Cloudflare deploy. Named plainly: this is the riskiest slice in the sequence, where three beta libraries meet real streaming on workerd with the whole product's perceived quality on the line. It runs last-but-three for exactly that reason — everything it depends on is verified before it starts.

## Goal

Interview record → persistent roadmap in the sidebar → streamed, widget-bearing, concept-tagged lessons with failure resume — the core generation spine, working on the real runtime.

## Why This Slice Exists

AC-5, AC-6 (full), AC-12, and AC-15's residual all live here. It is the product's reason to exist; every earlier slice was sequenced to make this one land on proven ground.

## Scope

- **In:** roadmap generation (structured, validated, one re-ask on malformed output; persisted waypoints; sidebar population using design-system-shell's chrome; regenerate-once affordance if the learner rejects the first roadmap is a plan decision); lesson generation (streamed via gateway lesson tier through `toServerSentEventsResponse()` into the progressive renderer; widget invocations through the registry; citations + recommended primary source per the lesson schema; concept-tagging of sections and content); generation status states (skeleton fill, reconnecting banner, friendly failure-with-retry past all fallbacks, partial content preserved); resume-from-last-completed-section on mid-stream failure; first real Cloudflare deploy + AC-15 residual check.
- **Out:** quiz generation (quiz-fsrs); source grounding of generation (source-grounding layers onto this pipeline); adaptation proposals (adaptation-progress); the interview itself (done).

## Acceptance Criteria

- Given a completed interview, When roadmap generation finishes, Then an ordered roadmap of waypoints (title, goal, concept list) renders in the sidebar and persists across reload and re-login. *(AC-5)*
  <!-- observable: true — the roadmap appearing is the interview's payoff moment -->
  verify: { method: playwright complete-interview-then-reload scenario, env: local dev, fixture: mocked structured roadmap response, rung: web-1; residual — one live roadmap generation via tagged smoke }
- Given the learner opens an ungenerated waypoint, When the lesson generates, Then content renders progressively (first content visible well before completion), includes at least one interactive checkpoint widget answerable in-flow, and no AI-authored script executes. *(AC-6 full)*
  <!-- observable: true — the streamed reading experience is the product's centerpiece; observed via timestamped DOM growth + widget interaction on the real transport -->
  verify: { method: playwright with DOM-growth timestamps + network stream trace, env: local dev (vite/workerd) with mocked streaming adapter emitting realistic chunk cadence, fixture: scripted lesson stream with widget invocations, rung: web-1; residual — live stream via tagged smoke }
- Given a mid-stream generation failure (injected), When the app recovers, Then it retries via the fallback chain and resumes from the last completed section without losing rendered content, showing at most a brief reconnecting banner. *(AC-12)*
  <!-- observable: true — recovery is a user-experienced moment (the banner, the preserved content); the mechanics are additionally pinned by automated fault-injection -->
  verify: { method: playwright with fault-injected mock stream (fail at section N, succeed on retry) observing banner + content preservation, env: local dev, fixture: fault-scripted stream, rung: web-1 }
- Given generation fails past all fallbacks (injected), When the failure surfaces, Then the learner sees a friendly retry state, already-rendered partial content remains readable, and the failure is recorded in the gateway's counters.
  <!-- observable: true — the worst-case state is a designed surface per the design brief's error inventory -->
  verify: { method: playwright all-fallbacks-fail scenario, env: local dev, fixture: fault-scripted stream, rung: web-1 }
- Given generated lesson content, When it persists, Then sections and quiz-relevant content carry concept tags consistent with the roadmap's concept list (the FSRS pipeline's input contract).
  <!-- observable: false — tag presence/consistency is provable by schema-level automated checks over generated fixtures -->
- Given the app deployed to Cloudflare (first real deploy), When a lesson generates against the deployed environment, Then SSE streaming works end-to-end under production workerd. *(AC-15 residual)*
  <!-- observable: true — the platform proof on the real runtime; network-trace evidence -->
  verify: { method: one driven generation against the deployed env via Claude_Browser or playwright with network trace, env: PO's Cloudflare account (cloudflare-api MCP available) + OpenRouter key for one live call, fixture: a real journey on a test account, rung: web-1 on deployed target (staging-deploy rung, ship-plan permitting) }

## Dependencies on Other Slices

- `tutor-interview`: the captured journey record (generation input) and the prompt suite's roadmap/lesson prompts.
- `lesson-renderer`: the progressive lesson surface, widget registry, and lesson schema this pipeline feeds.
- (Transitive via those: `ai-gateway` for tiers/fallback/quota/usage on every call.)

## Risks

- Highest-risk slice by construction: real SSE cadence may expose renderer assumptions the simulated stream hid (chunk boundaries mid-node, out-of-order widget resolution). Plan should schedule the real-transport integration first, not last, within the slice.
- Concept-tagging quality is a silent-failure risk — bad tags don't crash, they quietly corrupt the learner model downstream; the schema checks pin presence/consistency, and quiz-fsrs's resurfacing tests will catch semantic drift late. Watch it at the manual spot-check.
- If this slice balloons at plan time, the sanctioned split is roadmap-generation vs lesson-streaming (in that order) — noted here so a mid-slice re-scope is a documented option, not a scramble.
