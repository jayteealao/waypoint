---
schema: sdlc/v1
type: design
slug: waypoint-app
status: complete
stage-number: 2
created-at: "2026-07-10T22:10:52Z"
updated-at: "2026-07-10T22:10:52Z"
component: waypoint-button
register: product
recommended-references: [typeset, colorize, animate, layout, harden]
tags: [design-brief, warm-encouraging, greenfield]
refs:
  index: 00-index.md
  shape: 02-shape.md
---

# Design Brief — Waypoint

## The Design

Waypoint has two visual jobs that pull in different directions, and naming that tension early is the whole brief. The app chrome — dashboard, roadmap, chat, quizzes, progress — must feel like an encouraging companion: warm, rounded, softly colorful, the register the PO chose over both the scholarly and the SaaS options. But the lessons inside it inherit a different law from the source skills: "beautiful — clean, readable typography and layout. Think Tufte." A warm app wrapped around fine-book lessons is not a contradiction; it's the product's personality. The chrome encourages, the content respects. The design system therefore carries two typographic voices (a rounded, friendly sans for UI; a serious reading serif for lesson bodies) unified by one warm palette and one set of spacing/radius tokens.

The palette commits to warmth without shouting: a sunrise-ember primary that passes AA with white text, cream-paper light surfaces, and a true first-class dark theme — the scene sentence below forces it, because evening is when this product actually gets used. The anti-goals matter as much as the goals: no gamification circus, no corporate-LMS grayness, no dark patterns on streaks. Encouragement here means the roadmap visibly filling in and mastery meters rising — earned progress, not confetti.

## 1. Feature summary

A multi-user AI teaching web app: learners state a goal, an AI tutor interviews them, builds an adaptive roadmap of waypoints, teaches through streamed interactive lessons, quizzes with AI grading, and tracks per-concept mastery. This brief covers the v1 web surface — app shell, interview chat, lesson reading, quizzes, and progress — at fully-responsive quality.

## 2. User and context

A curious adult — a professional learning Rust after work, a parent learning dog training, a student shoring up statistics — in stolen sessions of 15–40 minutes. They arrive in one of two states: *starting* (motivated, slightly daunted — the interview must feel like a friendly conversation, not a placement exam) or *returning* (habitual, time-boxed — the dashboard must answer "where was I, what's due?" in one glance). Failure states (a flopped quiz) find them vulnerable; the design's tone at exactly those moments — proposing a review waypoint warmly rather than flagging failure red — is where "encouraging" is earned or lost.

## 3. Content inventory

**Surfaces**: journeys dashboard · interview chat (bubbles + quick-reply chips + free text) · roadmap sidebar (collapses to progress bar + drawer < 768px) · lesson view (streamed prose, code blocks, citations, embedded checkpoint widgets) · quiz view (MC with equal-length options, free-text with graded feedback) · progress panel (mastery meters, quiz history, streak, review-due count) · quota state · settings/account.

**Realistic ranges**: journeys 0–8 (dashboard must be lovely at 1); waypoints per journey 4–20 (sidebar scrolls); lesson length 800–3000 words with 1–4 widgets; quiz 5–15 questions; concepts per journey 10–80 (mastery view needs grouping past ~30); streak 0–365.

**State variants**:
- *First-run*: no empty dashboard — new users land in the pre-baked sample journey.
- *Loading*: the stream IS the loading state — skeleton outline that progressively fills with real content; interview turns show a typing indicator; quiz grading shows a brief per-question "checking…" state.
- *Empty*: journey with no completed quizzes (progress panel shows a gentle "your map starts here" state, not zeroed-out charts).
- *Error*: generation failure past all fallbacks (friendly retry, partial content preserved); unfetchable source URL (inline chat acknowledgment); quota reached (warm blocking card with reset time — never a paywall-shaped dark pattern).
- *Reconnecting*: brief unobtrusive banner during fallback recovery.
- *Adaptation proposal*: a distinct, consent-shaped card ("I'd suggest adding a review waypoint — okay?") with accept/decline as equals.

## 4. Visual direction

- **Register**: **product** — this is an app's working UI, not a marketing surface; but the *content register inside lessons* leans editorial (reading serif, generous measure, citation styling). Determination: recurring-use tool with a reading room inside it.
- **Color strategy**: **Committed** — one warm ember accent used meaningfully (primary actions, progress fill, streak flame), warm neutrals everywhere else, semantic green/blue used sparingly for mastery/info. Not Drenched: lessons need calm; the warmth lives in the chrome, not shouting over the reading.
- **Scene sentence**: A tired-but-motivated adult on the sofa at 9pm, laptop or phone under warm lamp light, giving Waypoint twenty-five minutes before bed — the room is dim, so dark mode is a first-class citizen, and the light theme reads as warm paper, never clinical white.
- **Anchor references**: **Duolingo** (encouragement mechanics, streak/progress warmth — minus the gamification pressure and mascot theatrics); **Headspace** (soft warmth, rounded calm, kind voice in UI copy); **a Stripe Press book** (the lesson interior: serious, beautiful long-form typography that respects the reader).
- **Anti-goals**: NOT a corporate LMS (Moodle/Blackboard grayness, table-of-contents-as-bureaucracy); NOT a gamification circus (no XP explosions, no guilt-tripping streak notifications, no red failure screams); NOT a sterile SaaS dashboard (this is a companion, not an admin panel); NOT a chat app with homework bolted on (the roadmap and lessons are the spine; chat serves them).

## 5. Scope and fidelity

Shipped quality — the PO's bar is "well-designed for all viewports and perfectly responsive," and design quality is an explicit acceptance criterion (AC-14). All state variants in §3 must be designed, not just the happy path; the three breakpoints (375 / 768 / 1280) are each a real design, not a reflow accident. Dark and light themes both ship in v1. Accessibility floor: WCAG AA contrast (the warm palette is validated, not assumed — see token table), 44px touch targets, `prefers-reduced-motion` respected, keyboard-operable core loop.

## 6. Recommended references

- `typeset.md` — always; and doubly so here: the dual-voice typography (UI sans / lesson serif) is the design's spine.
- `colorize.md` — the warm palette with AA validation is significant color work.
- `animate.md` — streaming reveal, progress fills, mastery-meter motion, adaptation-proposal entrance; all must respect reduced-motion.
- `layout.md` — sidebar + content shell with mobile collapse is layout-heavy.
- `harden.md` — accessibility is a stated NFR (AA contrast on a warm palette needs checking, not vibes).

*(Mirrored as `recommended-references:` in frontmatter for `/wf implement`. `optimize.md` omitted: perceived-latency work is owned by the streaming architecture, not CSS.)*

*Visual direction is captured here, not confirmed — image probes and the confirm gate belong to `plan` (02c-craft.md); the image gate is intentionally unresolved in this file.*
