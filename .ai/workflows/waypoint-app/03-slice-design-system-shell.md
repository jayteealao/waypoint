---
schema: sdlc/v1
type: slice
slug: waypoint-app
slice-slug: design-system-shell
status: defined
stage-number: 3
created-at: "2026-07-10T22:43:12Z"
updated-at: "2026-07-10T22:43:12Z"
complexity: l
depends-on: [accounts-data-layer]
tags: [design-system, tokens, app-shell, responsive, dashboard]
refs:
  index: 00-index.md
  slice-index: 03-slice.md
  siblings: [03-slice-foundation.md, 03-slice-platform-proofs.md, 03-slice-accounts-data-layer.md, 03-slice-lesson-renderer.md, 03-slice-sample-journey.md, 03-slice-ai-gateway.md, 03-slice-tutor-interview.md, 03-slice-roadmap-lesson-generation.md, 03-slice-quiz-fsrs.md, 03-slice-adaptation-progress.md, 03-slice-source-grounding.md]
  plan: 04-plan-design-system-shell.md
  implement: 05-implement-design-system-shell.md
---

# Slice: Design System & App Shell

## The Slice

The design brief's central tension — a warm, encouraging chrome wrapped around book-serious lesson interiors — gets built here as tokens and shell, once, so no later slice re-litigates it. This slice ships the OKLCH warm palette (sunrise-ember primary, cream-paper lights, first-class dark theme) with AA contrast *validated in code* rather than assumed, the dual typographic voices (rounded UI sans / reading serif) as tokens, the spacing/radius system, and the component core with complete interactive states. On top of the tokens goes the app's skeleton: the roadmap-sidebar + content-pane shell that collapses to a progress bar + drawer under 768px, and the journeys dashboard — the returning learner's "where was I, what's due?" surface — designed to be lovely at one journey and scalable to eight.

The honest boundary: this slice builds the *chrome* of surfaces whose content arrives later. The sidebar renders real journey/waypoint data from the store but nothing generates waypoints yet, so its populated states are proven against seeded fixtures. That is the cost of the PO's visible-milestone-early ordering, and it is the right cost — every later slice drops content into a shell whose responsive behavior, themes, and accessibility floor are already verified at all three breakpoints.

## Goal

A token-complete, dual-theme, AA-validated design system plus the responsive app shell and journeys dashboard — the visual foundation every subsequent surface composes from.

## Why This Slice Exists

Shape sequencing constraint #5 puts the design system before lesson rendering; the PO's slice-stage answer put the visible milestone immediately after the proofs. AC-14's "each breakpoint is a real design" is only affordable if responsiveness is architectural, not per-screen patchwork.

## Scope

- **In:** design tokens (OKLCH palette with programmatic AA checks, dual type voices, spacing/radius, elevation/shadows, motion durations + reduced-motion handling), dark + light themes; core components with default/hover/focus/active/disabled/loading states (buttons, inputs, cards, chips, meters, skeletons); app shell (sidebar + content pane; < 768px collapse to progress bar + drawer; 44px touch targets); journeys dashboard (list/create-journey entry, real store reads, gorgeous at 1 journey, handles 0–8, AC-13's surface); sign-in screen restyle onto tokens; keyboard operability + focus rings for everything shipped here.
- **Out:** lesson typography interior beyond tokens (lesson-renderer owns the reading experience); interview chat UI (tutor-interview); progress panel (adaptation-progress); populated roadmap content (roadmap-lesson-generation feeds the sidebar it inherits here); the pre-baked sample journey content (sample-journey).

## Acceptance Criteria

- Given a signed-in user with seeded journeys, When the dashboard and app shell render at 375px, 768px, and 1280px, Then each breakpoint is a coherent layout with no horizontal overflow, the sidebar collapses to progress bar + drawer below 768px, and touch targets are ≥ 44px. *(AC-14 foundation)*
  <!-- observable: true — responsive layout is the user-visible outcome; screenshots at all three widths are the evidence format shape mandates -->
  verify: { method: playwright screenshot sweep with explicit viewports, env: local dev (Playwright browsers pre-installed), fixture: seeded user with 3 journeys + one with 8 waypoints, rung: web-1 }
- Given both themes, When the shell and dashboard render in dark and in light, Then all rendered text meets WCAG AA contrast against its actual background, verified programmatically from the token pairs.
  <!-- observable: false — contrast ratios are computable from resolved token values; an automated token-pair audit fully covers it (the perceptual design-quality judgement stays with the final AC-14 sweep, homed in adaptation-progress) -->
- Given a learner with zero journeys (post-sample-journey users can archive it later; the store can be empty), When the dashboard renders, Then the empty state explains what will appear and offers a specific create-journey action — teaching, not erroring.
  <!-- observable: true — an empty state is a designed user-facing surface -->
  verify: { method: playwright, env: local dev, fixture: seeded user with zero journeys, rung: web-1 }
- Given keyboard-only input, When a user tabs through the dashboard and shell navigation, Then every interactive element is reachable in a sensible order with a visible focus ring meeting 3:1 contrast.
  <!-- observable: true — focus behavior is user-experienced; drivable and assertable in a real browser -->
  verify: { method: playwright keyboard-navigation script asserting focus order + ring visibility, env: local dev, fixture: seeded dashboard, rung: web-1 }
- Given `prefers-reduced-motion: reduce`, When shell transitions occur (drawer open, theme switch), Then animations are suppressed or reduced per the motion tokens.
  <!-- observable: false — provable by emulating the media feature and asserting computed transition properties; no perceptual judgement needed at this layer -->

## Dependencies on Other Slices

- `accounts-data-layer`: sessions (the shell is signed-in chrome) and the journey store the dashboard reads.

## Risks

- The warm palette passing AA in *both* themes is the brief's named hazard — hence the programmatic check; if ember-on-cream fails AA anywhere, adjust tokens now, not per-screen later.
- Chrome built before content risks mismatch when real generated content arrives (e.g. sidebar with 20 waypoints); mitigated by fixture ranges taken from the brief's content inventory (4–20 waypoints, 0–8 journeys).
- This is the first slice where design quality is the deliverable; plan must resolve the image gate / visual contract (02c-craft.md) before code mutation opens.
