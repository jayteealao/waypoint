---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: fix-continue-button
review-command: frontend-accessibility
status: complete
updated-at: "2026-07-16T16:48:34Z"
metric-findings-total: 0
metric-findings-blocker: 0
metric-findings-high: 0
metric-findings-pre-existing: 0
metric-findings-resolved: 0
result: clean
fragment: none
tags: []
refs:
  review-master: 07-review-fix-continue-button.md
---

# Review: frontend-accessibility

## Findings

No findings.

## Detailed Findings

None.

## Summary

- Open findings: 0
- Open blockers: 0
- Status: Clean

**Scope reviewed:** the diff swaps a dead `<Button variant="secondary" size="sm">` (no `onClick`,
no `type`, no navigation — a functional dead end) for a real `<Link to="/journey/$journeyId/progress"
params={{ journeyId: journey.id }}>` in `src/components/dashboard/JourneyCard.tsx`. All shown lines
are diff-added, so every check below is against the new code, not pre-existing behavior.

**Accessible name preserved (4.1.2 Name, Role, Value).** `aria-label={`Continue ${journey.title}`}`
carried over unchanged from the old `Button` to the new `Link`. This isn't just a static-code
assumption — `JourneyCard.test.ts` exercises it end-to-end: `screen.findByRole("link", { name:
`Continue ${journey.title}` })` resolves against the real rendered DOM (real `@tanstack/react-router`
Link, jsdom, `dom-testing-library`'s accname computation), confirming the accessible name is correctly
computed as `"Continue Learn Rust"` for the test fixture, not just present in source.

**Keyboard focusability (2.1.1 Keyboard, 2.4.7 Focus Visible).** The prior control was a semantic
`<button>` but non-functional (no click handler) — clicking or activating it via keyboard did nothing.
The new `Link` renders a native `<a href="/journey/$journeyId/progress">` (confirmed by the component
test: `expect(link.tagName).toBe("A")`), which is natively in the tab order and natively activates on
Enter — no custom `onKeyDown` handler needed, and no keyboard trap risk since it's a plain in-flow
anchor, not a widget.

**Decorative icon (1.1.1 Non-text Content).** `<ArrowRight size={14} aria-hidden="true" />` is an
unchanged context line in the diff — the icon was already correctly hidden from the accessibility
tree before this change and remains so. Because the anchor has an explicit `aria-label`, the icon's
hidden state doesn't even factor into accessible-name computation (aria-label short-circuits
descendant content), but hiding it is still correct practice for any other AT surface (e.g. braille
displays walking the DOM).

**WCAG 2.5.3 Label in Name — checked, no mismatch.** This was the main risk called out for this
control: does `aria-label="Continue Learn Rust"` conflict with the visible text `"Continue"`? It does
not. SC 2.5.3 requires the visible label text to be contained within the accessible name (case- and
whitespace-insensitive substring match) — here `"Continue"` is the literal, leading substring of
`"Continue Learn Rust"`. A screen-reader user hears "Continue Learn Rust, link" (extra context, not
contradictory), and a voice-control user saying "Click Continue" or "Click Continue Learn Rust" both
match the start of the accessible name. This is the *good* pattern for 2.5.3 — the icon-only-button
anti-pattern this criterion targets (visible text absent from or reordered within the accessible name)
does not apply here.

**Focus-visible styling parity (2.4.7 Focus Visible).** The old `Button` built its className as
`` `btn-base ${variantClass} ${sizeClass} ${className}` `` (`src/components/ui/Button.tsx:37`), which
for `variant="secondary" size="sm"` resolves to exactly `"btn-base btn-secondary btn-sm"`. The new
`Link` hardcodes that identical literal string. Because focus styling in `src/styles.css` is
class-selector-based, not element-type-based, the swap from `<button>` to `<a>` changes nothing about
what fires on focus:
- `:focus-visible { outline: 3px solid oklch(0.54 0.19 32 / 0.5); outline-offset: 2px; }` (`src/styles.css:194-198`) —
  universal bare pseudo-class selector, applies to any focusable element regardless of tag.
- `.btn-secondary:not(:disabled):focus-visible { box-shadow: 0 0 0 3px oklch(0.54 0.19 32 / 0.2); }`
  (`src/styles.css:293-295`) — class-scoped, matches the `Link` the same as it matched the `Button`.
  (`:disabled` is meaningless on an `<a>` but the selector still matches since the pseudo-class simply
  never applies, so the rule isn't excluded.)

Net: keyboard users get the same double focus indicator (outline + box-shadow) they would have gotten
had the old `Button` been wired up correctly. No regression, and no new gap introduced by the tag
change.

**Overall:** this is a pure accessibility improvement over the pre-fix state (a semantically correct
but functionally dead `<button>`) — it is now a real, reachable, correctly-named, keyboard-operable
navigation control with no WCAG 2.1 AA violations found in the reviewed diff.
