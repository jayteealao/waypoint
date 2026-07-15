---
schema: sdlc/v1
type: slice-index
slug: waypoint-app
status: complete
stage-number: 3
created-at: "2026-07-10T22:43:12Z"
updated-at: "2026-07-15T21:23:44Z"
total-slices: 13
best-first-slice: foundation
tags: [greenfield, tanstack, ai-teaching, cloudflare-only, local-first, fsrs]
slices:
  - slug: foundation
    status: defined
    complexity: m
    depends-on: []
  - slug: platform-proofs
    status: defined
    complexity: s
    depends-on: [foundation]
  - slug: accounts-data-layer
    status: defined
    complexity: l
    depends-on: [platform-proofs]
  - slug: design-system-shell
    status: defined
    complexity: l
    depends-on: [accounts-data-layer]
  - slug: lesson-renderer
    status: defined
    complexity: m
    depends-on: [design-system-shell]
  - slug: sample-journey
    status: defined
    complexity: m
    depends-on: [lesson-renderer]
  - slug: ai-gateway
    status: defined
    complexity: m
    depends-on: [platform-proofs, accounts-data-layer]
  - slug: tutor-interview
    status: defined
    complexity: l
    depends-on: [ai-gateway, design-system-shell]
  - slug: roadmap-lesson-generation
    status: defined
    complexity: l
    depends-on: [tutor-interview, lesson-renderer]
  - slug: quiz-fsrs
    status: defined
    complexity: l
    depends-on: [roadmap-lesson-generation, sample-journey]
  - slug: adaptation-progress
    status: defined
    complexity: m
    depends-on: [quiz-fsrs]
  - slug: source-grounding
    status: defined
    complexity: m
    depends-on: [tutor-interview, roadmap-lesson-generation]
  - slug: fix-continue-button
    status: defined
    slice-type: fix
    compressed: true
refs:
  index: 00-index.md
  shape: 02-shape.md
  design: 02b-design.md
next-command: wf-plan
next-invocation: "/wf plan waypoint-app foundation"
---

# Slice Index

## The Slices

Twelve slices, and the ordering logic is the story. The PO made three calls at this stage's interview that shaped the cut: a visible milestone right after the platform proofs (not more risk burn-down), medium granularity — one coherent subsystem per slice, since every slice buys a review cycle — and no walking skeleton, meaning each subsystem lands at shipped quality and the core loop first closes end-to-end at slice nine. That last choice is the decomposition's stated tradeoff: integration surprises can hide until `roadmap-lesson-generation`, so the sequence compensates by making slices one through eight retire every input risk that slice would otherwise meet for the first time — the runtime is proven in slice two, the render surface and its trust model in slice five, the AI economics in slice seven, the interview contract in slice eight. Slice nine is still the riskiest thing here (three beta libraries meeting real SSE on workerd), but by the time it runs, everything it touches has been verified from the other side.

The sequence reads as three phases. **Standing** (foundation → platform-proofs → accounts-data-layer): repo from nothing, the three de-risking proofs the shape mandated, then OAuth accounts, the complete D1 schema, and the client store. **Seeing** (design-system-shell → lesson-renderer → sample-journey): the warm design system and responsive shell, the widget registry and editorial lesson surface, then the pre-baked sample journey — the PO's demoable milestone, where a new user reads real lessons and takes a working quiz with zero LLM spend. **Thinking** (ai-gateway → tutor-interview → roadmap-lesson-generation → quiz-fsrs → adaptation-progress → source-grounding): the metered AI gateway before any feature can call a model, the teach/grill prompt rewrite with the consent-gated interview, the generation spine, the FSRS learner model, the surfaces that make it visible, and finally grounding — sequenced last because it decorates the pipeline rather than enabling anything.

Two structural decisions are worth defending up front. The quiz surface is born in `sample-journey` (deterministic MC, zero LLM — AC-2 forces this) and the quiz *engine* arrives four slices later, so the surface gets a second consumer before its logic hardens. And the AI gateway is its own slice, placed before every generation feature, because the app's own OpenRouter key funds all users — no call path should ever exist that bypasses quota and cost metering, and the only way to guarantee that is to build the meter before the callers.

## Slice Strategy

Medium granularity per the PO (12 slices, complexity s–l, no xl); dependency-ordered, subsystem-by-subsystem at shipped quality; risk-reduction front-loaded per the shape's sequencing constraints; the visible milestone (sample-journey) placed per the PO's stage answer. The stack gate is honored: groupings reference only confirmed stack facts (Start/workerd, D1, TanStack AI/DB, pnpm, Playwright pre-installed).

**Design-brief surface → slice mapping** (every 02b-design surface has a home; groupings justified per the conditional-input contract):

- *Journeys dashboard* → `design-system-shell` — built with the tokens/shell because it is the shell's proving ground; AC-13's UI ships here, its end-to-end proof closes in `adaptation-progress` once independent learner models exist to compare.
- *Interview chat* → `tutor-interview` — one surface, one slice.
- *Roadmap sidebar* → chrome in `design-system-shell` (verified against seeded fixtures), populated by `roadmap-lesson-generation` — split because the shell must be responsive-proven before generation exists; fixture ranges (4–20 waypoints) come from the brief.
- *Lesson view* → `lesson-renderer` (surface, proven on fixtures + simulated streams), fed for real by `roadmap-lesson-generation` — split so the trust model and progressive rendering are verified AI-free before flaky real streams arrive.
- *Quiz view* → surface in `sample-journey` (AC-2 requires a working zero-LLM quiz), engine in `quiz-fsrs` — the split lets the fixture quiz prove the surface before AI grading lands on it.
- *Progress panel* → `adaptation-progress` — one surface, one slice (all four sub-surfaces the PO selected).
- *Quota state* → component built in `ai-gateway` (it is the gateway's user-facing face), wired into generation surfaces as they land.
- *Settings/account* → `accounts-data-layer` — minimal identity + sign-out surface rides with auth.

**State-variant → slice mapping** (the brief's §3 inventory): first-run → `sample-journey`; loading/streaming-as-skeleton → `lesson-renderer` (machinery) + `roadmap-lesson-generation` (real transport); empty states → `design-system-shell` (dashboard) + `adaptation-progress` ("your map starts here"); error/failure + reconnecting → primitives in `ai-gateway`, user-facing states in `roadmap-lesson-generation`; adaptation-proposal card → `adaptation-progress`; quota card → `ai-gateway`.

**AC → slice homing:** AC-1, AC-2, AC-3, AC-4 → accounts-data-layer, sample-journey, tutor-interview, source-grounding respectively; AC-5/6/12/15-residual → roadmap-lesson-generation (AC-15 first pass in platform-proofs); AC-7/8 → quiz-fsrs; AC-9/10/13/14-final → adaptation-progress (AC-14 breakpoint discipline is also carried per-slice by every UI slice); AC-11 → ai-gateway.

## Recommended Order

1. `foundation` — nothing exists without it; supply-chain discipline from commit one.
2. `platform-proofs` — the three beta-dependency proofs while failure is cheap (shape constraint #2).
3. `accounts-data-layer` — auth + whole schema early so FSRS/quiz/journey work never migrates D1 mid-build.
4. `design-system-shell` — tokens and responsive shell before any content surface (shape constraint #5).
5. `lesson-renderer` — trust model + progressive rendering proven AI-free.
6. `sample-journey` — **the visible milestone**: demoable product on zero LLM spend.
7. `ai-gateway` — the meter before the callers; no unmetered path ever exists.
8. `tutor-interview` — the prompt-suite rewrite + the loop's front door (shape constraint #3).
9. `roadmap-lesson-generation` — the riskiest slice, run when every input is proven; the loop closes here.
10. `quiz-fsrs` — the learner model; engine math proven LLM-free.
11. `adaptation-progress` — the model made visible; whole-app closes (AC-13, AC-14 sweep).
12. `source-grounding` — the lowest-coupling slice; layers onto a finished pipeline.

## Cross-Cutting Concerns

- **Responsiveness (AC-14)**: every UI-bearing slice carries its own 375/768/1280 ACs; the final 5-screens × 3-widths sweep + human design-quality judgement is homed in `adaptation-progress`.
- **Instrumentation (Augmentation Plan)**: the signal spine lands in `ai-gateway`; `plan` folds per-slice signal wiring into each generation-consuming slice per the shape's instrument decision (04b-instrument.md at plan time).
- **Pedagogy fidelity**: the prompt suite lives in `tutor-interview`, but lesson/quiz/roadmap prompts are exercised and iterated by slices 9–11; the human fidelity review spans them.
- **Security floor**: sanitization + widget-registry rejection (`lesson-renderer`), authz denial (`accounts-data-layer`), injection posture (`tutor-interview` prompts, adversarially tested in `source-grounding`), supply-chain pins (`foundation`) — each slice owns its layer; no security slice exists because security is not a layer you bolt on.
- **External prerequisites (PO)**: OAuth app registrations (needed by slice 3's residual), OpenRouter API key (live smokes from slice 2 onward), Cloudflare account (first deploy in slice 9) — all pre-registered in shape; each consuming slice names its residual.
- **Live-LLM residuals**: automated tests run mocked throughout; each generation slice pre-registers its live-smoke residual, cleared on demand with the PO's key (shape §Verification Strategy).

## Dependencies Between Slices

- The chain 1→2→3→4→5→6 is strictly sequential (each consumes the previous slice's output).
- `ai-gateway` (7) depends only on 2+3 — **it can run in parallel with slices 4–6** if capacity allows; it is sequenced after the milestone to honor the PO's visible-first answer.
- The FSRS engine core inside `quiz-fsrs` depends only on the data layer (shape constraint #4) — a plan-time option is to pull the ts-fsrs integration + scheduling tests forward in parallel with slices 8–9, leaving quiz generation/grading in place at slice 10.
- `source-grounding` (12) needs 8+9 but nothing needs it — it can slip without blocking anything (relevant since the PO declared no late-slice preference).
- Sanctioned split, pre-authorized: if `roadmap-lesson-generation` balloons at plan, split into roadmap-generation then lesson-streaming (recorded in its Risks).

## Deferred / Optional Slices

None deferred at this stage beyond the shape's standing out-of-scope list (real-world tasks, AI-JS sandbox, real-time sync, PWA packaging, BYOK, native shells, social). Every slice above is v1. The parallelization options (gateway alongside 4–6; FSRS engine early) are capacity plays, not deferrals.

## Freshness Research

- Source: 02-shape.md §Freshness Research (seven-source sweep, verified 2026-07-10 — today).
  Why it matters: slicing order leans on external facts — which dependencies are beta (front-load proofs), the compromised-version list (foundation's pin gate), the broken PWA plugin (nothing sliced for PWA), the DO-adapter existence (no sync slice needed in v1).
  Takeaway: all still current as of this stage's run date; no new research was needed for decomposition — no slicing decision here rests on a fact the shape didn't already verify. Re-check the TanStack AI adapter status at `plan` for slices 7–9 (its tool-calling regression history is the most volatile fact in the set).

## Recommended Next Stage

- **Option A (default): `/wf plan waypoint-app foundation`** — standard flow; the root slice is unambiguous and everything else depends on it.
- **Option B: `/wf plan waypoint-app all`** — viable if you want the whole build mapped before coding: dependencies are explicit and the shape is stable, but twelve plans up front is a large bet against learning-as-you-go; the parallel options (ai-gateway, FSRS core) make more sense pulled at plan time individually.
- **Option C: `/wf shape waypoint-app`** — not indicated; slicing surfaced no contradiction or gap in the shape. (If the platform proofs in slice 2 fail structurally, that — not this stage — is the trigger to revisit shape.)
- *Optional second opinion:* `/consult critique this slice decomposition — independence, ordering, any risky slice buried mid-sequence` — a read-only multi-model panel; cheap insurance before twelve slices of plans.
