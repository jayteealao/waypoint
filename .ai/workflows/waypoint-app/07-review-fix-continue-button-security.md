---
schema: sdlc/v1
type: review-command
slug: waypoint-app
review-scope: per-slice
slice-slug: fix-continue-button
review-command: security
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

# Review: security

## Findings

No findings.

## Detailed Findings

None.

## Summary

- Open findings: 0
- Open blockers: 0
- Status: Clean

**Threat surface reviewed:** the diff swaps a dead `<Button>` for a `<Link to="/journey/$journeyId/progress" params={{ journeyId: journey.id }}>`
in `src/components/dashboard/JourneyCard.tsx`, plus a jsdom+real-router regression test. The only
new capability introduced is client-side navigation to an existing, pre-existing route — no new
server code, no new data access, no new dependency.

**Is `journey.id` attacker-controlled?** No. `JourneyCard` is rendered from `JourneysDashboard.tsx`,
which sources its `journeys` array from `getJourneysCollection(userId, seed)`
(`src/components/dashboard/JourneysDashboard.tsx:135`) — a collection already scoped to the signed-in
user's own `userId`. The `journey.id` interpolated into the route param is therefore always one of
the current user's own journey ids, never free-form input from a form field, query string, or other
untrusted source.

**Does the typed param encode safely?** Verified in installed source, not assumed. TanStack Router's
path interpolation (`node_modules/@tanstack/router-core/dist/esm/path.js`) resolves the `$journeyId`
segment through `encodeParam` → `encodePathParam`, which is a straight `encodeURIComponent` call:

```javascript
// node_modules/@tanstack/router-core/dist/esm/path.js:215-218
function encodePathParam(value, decoder) {
	const encoded = encodeURIComponent(value);
	return decoder?.(encoded) ?? encoded;
}
```

`encodeURIComponent` percent-encodes `/`, `?`, `#`, and other path-delimiter characters, so even a
hostile `journey.id` value could not escape its own path segment (no path traversal, no query/hash
injection, no open redirect via the param). This forecloses the "injection via typed param" concern
raised for this slice.

**Is the destination route protected?** Yes, at two independent layers, both pre-existing (not part
of this diff, so out of this review's per-slice scope, but confirmed for completeness):
1. `/journey/$journeyId/progress` is a child of `_authenticated` (`src/routes/_authenticated.tsx:11-19`),
   whose `beforeLoad` throws a `redirect({ to: "/sign-in" })` when `context.auth?.session` is absent —
   an unauthenticated visitor cannot reach the loader at all.
2. The route's loader calls `getJourneyProgress` (`src/server/progress.ts:57-70`), a `createServerFn`
   gated by `withSession` middleware that independently re-fetches the journey's `user_id` from D1 and
   calls `requireOwnership(userId, journey.user_id)` before returning any data — a signed-in user who
   somehow navigated to another user's `journeyId` (e.g. by hand-editing the URL) gets rejected
   server-side, not merely hidden client-side. This means even if the new UI affordance were later
   reused with a non-owned id, the server layer is the actual authority, matching the "defense you can't
   bypass from the client" bar.

**Net assessment:** this diff only adds a UI entry point (a real `<a>` the user can now click) to a
route that was already reachable by typing the URL directly, was already gated by auth, and was
already ownership-checked server-side. No auth bypass, no injection vector, no secret exposure, no new
CSRF surface (GET navigation only), no broken access control. Clean.
