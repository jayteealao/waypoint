---
schema: sdlc/v1
type: design-contract
slug: waypoint-app
title: Waypoint design-system-shell visual contract
status: ready
created-at: "2026-07-11T13:37:14Z"
updated-at: "2026-07-11T13:37:14Z"
component: waypoint-app-shell
based-on: 02b-design.md
tokens: [ember, paper, surface, ink, ink-muted, ink-faint, success, info, radius-sm, radius-md, radius-lg, radius-pill, space-1, space-2, space-3, space-4, space-6, space-8, shadow-card, shadow-overlay, motion-fast, motion-default, motion-slow]
states: [default, hover, focus, active, disabled, loading, empty, error]
sizes: [mobile, tablet, desktop]
themes: [light, dark]
refs:
  design: 02b-design.md
register: product
image-gate: "skipped:autonomous-mode-imagery-skill-unavailable-direction-fully-specified-in-brief"
north-star-mock: none
references-loaded: [typeset, colorize, animate, layout, harden]
---

# Visual Contract — Waypoint Design System & App Shell

## 1. Visual direction confirmed

The direction is a warm-encouraging product chrome that wraps book-serious lesson interiors. The palette commits fully to the OKLCH warm ember family (hue angle ~30–40, sunrise-amber) replacing the teal/lagoon prototype palette established during the accounts-data-layer slice. Light surfaces read as warm cream paper (`oklch(0.98 0.018 80)`) — never clinical white — and the dark theme is first-class: a dim-lamp-lit room at 9pm (`oklch(0.15 0.018 260)` base surface). The ember primary (`oklch(0.54 0.19 32)`) carries primary actions and progress fills and is validated to pass WCAG AA with white text in code, not assumed. Two typographic voices already installed: Manrope (rounded UI sans) as the application voice and Fraunces (optical-size serif, already used as `.display-title`) as the lesson reading voice. Warmth lives in the chrome; the reading interior is calm and generous. The image gate is recorded as skipped under the autonomous-override policy: the brief's scene sentence, anchor references, and anti-goals are specific enough to specify the token table and component decisions without a generated mock.

## 2. North-star mock

- **Mock image**: none — text-only direction (image gate skipped per autonomous-override policy; the brief's direction is fully specified)
- **Scene sentence** (from 02b): A tired-but-motivated adult on the sofa at 9pm, laptop or phone under warm lamp light, giving Waypoint twenty-five minutes before bed — the room is dim, so dark mode is a first-class citizen, and the light theme reads as warm paper, never clinical white.
- **Annotated callouts** (from brief + existing codebase state):
  1. **Sidebar navigation** — roadmap waypoints listed in order, progress fill on completed waypoints uses ember; the sidebar is the dominant persistent element; collapses fully below 768px to a drawer
  2. **Ember primary action** — CTA buttons (Start Journey, Begin Lesson) use `--ember` fill with white text; this is the only element carrying the full accent
  3. **Cream paper surfaces** — card backgrounds are warm near-white (`--surface`) against a warm mid-tone base (`--paper`); not pure white; not gray-blue
  4. **Rounded generous radius** — components use `--radius-lg` (16px) for cards, `--radius-md` (10px) for inputs and chips, `--radius-pill` (9999px) for tags; matches the "rounded, friendly" brief register
  5. **Fraunces journey titles** — journey names on the dashboard use the display serif (Fraunces) at ~1.25rem weight 700 to give each journey a named-thing weight
  6. **Dark lamp light** — dark theme: ember accent shifts to `oklch(0.70 0.14 38)` (lighter so it still reads warm against dark surfaces), base surface `oklch(0.15 0.018 260)`, text `oklch(0.88 0.015 80)` (warm off-white)
  7. **Mastery meter** — horizontal progress bar with ember fill, rounded ends; the single most "encouraging" element on the screen; never uses red for incomplete
  8. **Journey card empty state** — uses a warm illustration placeholder (SVG, inline) with a gentle message; no zeroed-out charts, no red
  9. **44px touch targets** — all interactive elements have minimum 44×44px hit area; confirmed by `min-h-[2.75rem] min-w-[2.75rem]` Tailwind utilities
  10. **Focus ring** — 3px offset ring in `oklch(0.54 0.19 32 / 0.4)` (ember 40% opacity) on all focusable elements; visible on both themes

## 3. Mock fidelity inventory

1. **OKLCH ember token table** — the complete token set in CSS custom properties (both `:root` light and `[data-theme="dark"]`); replacing the teal prototype palette — why: the brief's palette is the canonical design decision; any teal remnant is a regression
2. **Warm cream paper base** — `--paper` and `--surface` read as warm, not clinical; perceptible warmth even on light theme — why: the scene sentence's "warm paper, never clinical white" is a primary brief constraint
3. **Fraunces as dual-voice serif** — used for journey titles, lesson headings, and `.display-title`; Manrope for all UI labels and body copy — why: the two-voice brief is explicit and already half-implemented
4. **App shell topology** — sidebar (240px) + content pane side-by-side ≥768px; single column with progress bar + drawer trigger <768px; the sidebar is sticky, the content scrolls — why: the brief's "roadmap sidebar + content pane" is the application's defining layout
5. **Ember progress fills** — all progress meters (waypoint completion, mastery %, streak) use ember fill on a warm-neutral track; not green, not blue — why: the brief's single-accent commitment (ember used meaningfully)
6. **Rounded generous component feel** — `--radius-lg` on cards, drawer, sidebar; `--radius-md` on inputs/buttons/chips; no sharp corners anywhere in the chrome — why: "rounded" is the brief's explicit register keyword
7. **Keyboard focus rings** — every interactive element shows a visible focus ring on keyboard navigation; 3:1 contrast minimum — why: accessibility is an explicit acceptance criterion and non-functional requirement
8. **prefers-reduced-motion suppression** — drawer slide, theme switch, and mastery meter fill transition are gated on `@media (prefers-reduced-motion: reduce)` or use `transition: none` — why: AC-DSS5 + NFR
9. **Empty state teaching message** — zero-journey state has copy + create-journey action; no charts showing zero, no red, no "nothing here" — why: AC-DSS3 and the brief's tone at failure/empty moments
10. **Dark theme as first-class** — every token, component, and state has an explicit dark-theme value; dark is not an afterthought inversion — why: scene sentence + the brief's first-class dark constraint

## 4. Implementation contract

### Token choices
Replace the existing `:root` teal palette in `src/styles.css` with the OKLCH warm ember token set. Keep the `:root[data-theme="dark"]` + `@media (prefers-color-scheme: dark)` dual-signal pattern (already established and correct). New CSS custom property names use `--ember-*`, `--paper`, `--surface`, `--ink-*` naming (clearer semantics than the prototype `--sea-ink`, `--lagoon` names).

Required new tokens (implementer validates AA programmatically via a Vitest contrast-ratio test):

```
/* Light theme (:root) */
--ember:         oklch(0.54 0.19 32)    /* primary action — AA with white */
--ember-light:   oklch(0.64 0.15 36)    /* hover/lighter ember */
--ember-dark:    oklch(0.44 0.20 28)    /* pressed / darker ember */
--ember-subtle:  oklch(0.96 0.04 50)    /* tint background behind ember elements */
--paper:         oklch(0.98 0.018 80)   /* page base — warm cream */
--paper-mid:     oklch(0.94 0.022 78)   /* sidebar, secondary surfaces */
--surface:       oklch(0.99 0.008 80)   /* card, elevated surface */
--surface-raised: oklch(1.00 0.00 0)    /* highest elevation (modal, popover) */
--ink:           oklch(0.24 0.032 30)   /* primary text — warm near-black */
--ink-muted:     oklch(0.44 0.038 30)   /* secondary text */
--ink-faint:     oklch(0.64 0.028 30)   /* placeholder, disabled labels */
--border:        oklch(0.88 0.018 80)   /* default border */
--border-strong: oklch(0.78 0.025 35)   /* focus border, stronger separator */
--success:       oklch(0.52 0.14 145)   /* mastery green */
--info:          oklch(0.56 0.12 230)   /* informational blue */

/* Dark theme ([data-theme="dark"], @media prefers-color-scheme: dark) */
--ember:         oklch(0.72 0.14 38)    /* lighter so it reads warm on dark surfaces */
--ember-light:   oklch(0.80 0.11 40)
--ember-dark:    oklch(0.62 0.16 34)
--ember-subtle:  oklch(0.24 0.05 30)
--paper:         oklch(0.14 0.018 255)  /* dim lamp-lit room */
--paper-mid:     oklch(0.18 0.016 255)
--surface:       oklch(0.20 0.014 255)
--surface-raised: oklch(0.24 0.012 255)
--ink:           oklch(0.88 0.015 80)   /* warm off-white text */
--ink-muted:     oklch(0.68 0.018 80)
--ink-faint:     oklch(0.50 0.016 80)
--border:        oklch(0.28 0.018 255)
--border-strong: oklch(0.42 0.025 40)   /* ember-toned border on dark */
--success:       oklch(0.72 0.14 145)
--info:          oklch(0.72 0.12 230)
```

Radius tokens (new CSS custom properties):
```
--radius-sm:   6px
--radius-md:   10px
--radius-lg:   16px
--radius-xl:   24px
--radius-pill: 9999px
```

Motion tokens:
```
--motion-fast:    120ms cubic-bezier(0.22, 1, 0.36, 1)
--motion-default: 200ms cubic-bezier(0.22, 1, 0.36, 1)
--motion-slow:    340ms cubic-bezier(0.16, 1, 0.3, 1)
```

### Component decisions
- **Button** (`src/components/ui/Button.tsx`): new component; variants: `primary` (ember fill, white text), `secondary` (paper fill, ink text, border), `ghost` (transparent fill, ink text), `danger` (red tint); sizes: `sm | md | lg`; loading state shows spinner; all min-h-11 for 44px touch target
- **Input** (`src/components/ui/Input.tsx`): new component wrapping `<input>`; focus ring ember; error state with `--error` tint; matches border-radius `--radius-md`
- **Card** (`src/components/ui/Card.tsx`): new base card (surface background, border, radius-lg, shadow-card); variant: `raised` for modals
- **Chip** (`src/components/ui/Chip.tsx`): existing `.demo-pill` pattern formalized as a React component; interactive (closable) and static variants
- **Meter** (`src/components/ui/Meter.tsx`): progress meter with ember fill, `role="progressbar"` for a11y; accepts `value` 0–100
- **Skeleton** (`src/components/ui/Skeleton.tsx`): shimmer animation on `--paper-mid` background; reduced-motion uses static background
- **AppShell** (`src/components/shell/AppShell.tsx`): layout container; renders Sidebar + main content slot; passes `isMobile` context
- **Sidebar** (`src/components/shell/Sidebar.tsx`): ≥768px: fixed 240px left; <768px: hidden; contains journey selector + waypoint list + progress bar
- **DrawerNav** (`src/components/shell/DrawerNav.tsx`): <768px drawer overlay; triggered by hamburger; slides in from left; traps focus; Escape closes it
- **JourneysDashboard** (`src/components/dashboard/JourneysDashboard.tsx`): list of journey cards + create-journey CTA; handles 0–8 journeys; empty state component inline
- **JourneyCard** (`src/components/dashboard/JourneyCard.tsx`): individual journey card with title (Fraunces), progress meter, last-activity timestamp, continue CTA

### Layout structure
- `_authenticated.tsx` layout route wraps all signed-in routes; renders `AppShell`
- Sidebar: `width: 240px`; `position: sticky top-0 h-screen overflow-y-auto` ≥768px
- Content pane: `flex-1 min-w-0 overflow-y-auto`; max-width 800px for prose surfaces
- Mobile collapse: sidebar `hidden md:block`; drawer triggered by sticky top bar with hamburger
- Progress bar on mobile: slim `4px` ember bar below the top nav showing overall journey progress

### Type scale
- **Display (Fraunces)**: journey titles on dashboard `text-xl font-bold`, lesson headings `text-2xl`
- **UI body (Manrope)**: `text-base` (1rem/1.5) for all running copy, labels, descriptions
- **UI label**: `text-sm font-medium` for form labels, chips, sidebar nav items
- **Micro**: `text-xs font-semibold` for badges, kicker labels
- **Lesson body (Fraunces)**: `prose prose-lg` within lesson content areas; `font-serif leading-relaxed`

### Color application
- **Ember**: CTA buttons, progress fills (waypoint completion, mastery meters, streak), active sidebar waypoint indicator, focus ring base
- **Paper / surface**: all component backgrounds; page base is `--paper`, cards are `--surface`
- **Ink / ink-muted**: all text; headings use `--ink`, descriptive copy `--ink-muted`, placeholders `--ink-faint`
- **Success (green)**: mastery ≥80% indicator, correct quiz answer feedback
- **Info (blue)**: informational badges, "due review" count
- **No red for "incomplete"** — incomplete states use `--ink-faint` or `--paper-mid`; red reserved for errors and destructive actions only

### Motion
- Drawer slide: `transform: translateX(-100%)` → `translateX(0)`, duration `--motion-slow` (340ms), easing `cubic-bezier(0.16, 1, 0.3, 1)`; suppressed when `prefers-reduced-motion: reduce`
- Theme switch: cross-fade via `transition: background-color var(--motion-default), color var(--motion-default)` on `:root`; suppressed under reduced-motion
- Mastery meter fill: `transition: width var(--motion-slow)` on the fill bar; suppressed under reduced-motion
- Skeleton shimmer: `animation: shimmer 1.4s linear infinite`; suppressed under reduced-motion (static gray)
- Button hover: `transform: translateY(-1px)` with `--motion-fast`; no translate under reduced-motion
- All transitions gated by `@media (prefers-reduced-motion: no-preference)` wrapper

### Finish & detail
- **Concentric radius**: nested elements step down: outer card `--radius-lg` (16px) → inner chip `--radius-md` (10px) → focus ring gap 2px
- **Shadow vocabulary**: cards use `box-shadow: 0 1px 3px oklch(0.24 0.032 30 / 0.08), 0 4px 16px oklch(0.24 0.032 30 / 0.05)`; elevated (drawer/modal) `0 8px 40px oklch(0.24 0.032 30 / 0.16)`; dark theme shadows use ember-toned darkening not black
- **No `outline: none`**: use `focus-visible:ring` Tailwind utilities; keyboard-only focus, not always-on ring
- **Touch targets**: all interactive elements have `min-h-[2.75rem]` (44px) and adequate horizontal padding
- **Icon sizing**: use `lucide-react` (already installed) at `size={16}` inline, `size={20}` standalone; never scale icons with font-size

### State coverage required per interactive element
| Element | States required |
|---|---|
| Button (primary/secondary/ghost) | default, hover, focus-visible, active, disabled, loading |
| Input | default, hover, focus, error, disabled |
| Chip (interactive) | default, hover, focus-visible, active (selected) |
| JourneyCard | default, hover, focus-within |
| Sidebar waypoint item | default, hover, focus-visible, active (current page), completed |
| DrawerNav (mobile) | closed (hidden), open (visible, focus-trapped) |
| Meter | any value 0–100, including 0 and 100 |
| Skeleton | loading (shimmer), settled (component replaces it) |

## 5. Anti-patterns to avoid

- **Teal/lagoon remnants**: the prototype palette (`--sea-ink`, `--lagoon`, `--palm`, etc.) is a placeholder; any component using it in final design-system-shell output is a regression. Old demo utility classes (`.demo-panel`, `.demo-button`, etc.) should be refactored to use the new token names or removed.
- **No gamification chrome**: no XP counters, no confetti, no animated mascots; progress fills and mastery meters are the extent of "celebration"
- **No red for incomplete**: empty progress bars, zero-mastery concepts, incomplete waypoints — all use `--ink-faint` or `--paper-mid`, never red
- **No `outline: none` without focus-visible replacement**: every interactive element must have a visible keyboard focus indicator
- **No fixed heights on text containers**: lesson bodies, journey titles, and sidebar labels may contain user-provided content; never clip with fixed height + overflow hidden (use line-clamp with graceful truncation instead)
- **No conditional dark theme**: both themes ship simultaneously; if a component only looks right in one theme, the contract is violated
- **No `!important` to fix specificity conflicts**: fix the underlying specificity instead
- **No gradient opacity hacks for contrast**: if a text/background pair fails AA, change the token value, not the opacity of the text

## 6. Implementation references

Follow these reference docs (load from `skills/wf/reference/design/`):
- `typeset.md` — dual-voice type scale, reading serif setup, prose measure
- `colorize.md` — OKLCH token authoring, AA validation approach, light/dark parity
- `animate.md` — frequency/easing/interruptibility rules, reduced-motion gates
- `layout.md` — sidebar + content shell, responsive collapse, sticky behavior
- `harden.md` — focus ring spec, touch target minimums, contrast checking
