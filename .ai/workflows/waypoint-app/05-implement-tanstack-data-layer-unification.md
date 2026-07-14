---
schema: sdlc/v1
type: implement
slug: waypoint-app
slice-slug: tanstack-data-layer-unification
status: complete
stage-number: 5
created-at: "2026-07-14T15:36:52Z"
updated-at: "2026-07-14T15:36:52Z"
metric-files-changed: 15
metric-lines-added: 869
metric-lines-removed: 179
metric-deviations-from-plan: 4
metric-review-fixes-applied: 0
commit-sha: "c05e635"
tags: [tanstack-db, data-layer, local-first, ssr, cloudflare, zod, architecture]
refs:
  index: 00-index.md
  implement-index: 05-implement.md
  slice-def: 03-slice-tanstack-data-layer-unification.md
  plan: 04-plan-tanstack-data-layer-unification.md
  siblings: [05-implement-accounts-data-layer.md, 05-implement-adaptation-progress.md, 05-implement-tanstack-router-typed-context.md, 05-implement-tanstack-ai-gateway-hygiene.md]
  verify: 06-verify-tanstack-data-layer-unification.md
next-command: wf-verify
next-invocation: "/wf verify waypoint-app tanstack-data-layer-unification"
---

# Implement: TanStack data-layer unification — DB everywhere

## The Implementation

Three half-wired client data strategies are now one. The dead Query bridge is gone (`@tanstack/react-query` + `@tanstack/react-router-ssr-query` removed — `pnpm why` confirmed the latter was the former's only consumer, so 189 packages left with them), `zod@4.4.3` is promoted to a direct exact-pin, and every domain entity that a client reads is backed by a schema-typed `@tanstack/db` collection built from one factory. The journeys dashboard is the exemplar the audit asked for: the `as any`, the `requestAnimationFrame` readiness proxy, and the fire-and-forget syncer are all deleted, and the F8 double-fetch is closed — the route loader is the single `listJourneys()` per navigation and hands its D1 result to the collection as a seed instead of the component fetching a second time. `defaultPreloadStaleTime` moved off `0` to `30_000` (F7).

The load-bearing decision was the seed mechanism, and it is where I departed from the plan's literal wording — for a reason the installed source forced. The plan said a `seed()` helper "writes the loader payload INTO the collection." Reading `@tanstack/db/dist/esm/local-storage.js` shows that is a double-write bug: `.insert()` on a localStorage collection routes through `wrappedOnInsert`, which calls our `onInsert` D1-flush handler. The library's only server-authoritative injection path is its sync source, which *is* localStorage — it reads the blob `{ "s:<key>": { versionKey, data } }` once at sync-init. So the correct seed writes that blob directly, LWW-merged by `updated_at`, *before* the (lazily created, per-user) collection is built. Per-user namespacing (`wp:<userId>:<entity>`, purged on sign-out) already forced lazy per-user collections rather than module singletons, so seed-before-create fell out naturally — and it doubles as the RIM-E7 containment: collections are client-only, the server never caches one (a warm-isolate registry would bleed users), and SSR renders from loaders (shape D3), so first client paint matches the server byte-for-byte.

Two deviations are load-bearing enough to call out here. First, the write path: `recordAttemptAndUpdateFsrs` is a coupled grading *command* (inserts the attempt, applies the FSRS rating, generates the id server-side), not a CRUD insert — retrofitting optimistic `collection.insert` onto it would orphan client ids and risk regressing a shipped, live-smoke-verified quiz flow, so the write entities are schema-typed cache collections and the AC-DLU8 optimistic-rollback *mechanism* is proven at the factory level (forced-flush-failure test) rather than rewired into the grading command. Second, consumer render-repointing beyond journeys + waypoints is staged: those surfaces keep rendering from loaders (which *is* the ratified D3 SSR path), with their collections defined, seeded, and available for client-nav reads — the per-entity interactive SSR/isolation gates (AC-DLU6/7, AC-DLU1) are verify-owned. Automated gates are green: typecheck clean, oxlint clean (no new warnings), 211 Vitest pass / 6 pre-existing skips, and AC-DLU2/3/4/5 verified by grep + inspection.

## Summary of Changes

- **F2 — Query bridge retired.** Removed `@tanstack/react-query` + `@tanstack/react-router-ssr-query`; promoted `zod` to a direct exact-pin (`4.4.3`). Zero `src/` references to either package (AC-DLU5).
- **Data-layer infrastructure (new).** `src/lib/db/schemas.ts` (Zod v4 schemas for all 8 client entities + type-level drift guards), `storage-keys.ts` (per-user namespace + `purgeUserCache`), `collection-factory.ts` (`defineDomainCollection` + `seedStorage` LWW merge + lazy per-user registry + client-only guard).
- **F3 — journeys rebuilt on the factory.** Schema-typed (`as any` gone), localStorage-persisted, `onUpdate`→`updateJourney` optimistic flush; `useJourneys` returns `Journey[]` with no cast (AC-DLU2).
- **F8 + readiness — dashboard.** Loader returns `{ journeys, masteryByJourneyId, userId }` (single fetch, AC-DLU1); component seeds the collection, renders loader data for SSR/first-paint, reads the reactive collection after hydration via `isReady()` (rAF proxy gone, AC-DLU3).
- **F7 — router.** `defaultPreloadStaleTime: 30_000` (AC-DLU4).
- **AC-DLU7 — sign-out purge.** `signOut` wrapped to `purgeUserCache()` (`wp:*`) before ending the session.
- **All-9 collections.** `src/lib/store/collections.ts` defines the remaining 7 client entities (waypoints, lessons, quiz-questions, concepts, adaptations, quiz-attempts, fsrs-cards); waypoints wired as a second loader-seed consumer on the journey layout route. `usage_events` deliberately server-only (Q-B).
- **Tests (new).** `db-collection-factory.test.ts`, `lww-reconcile.test.ts` (LWW + forced-flush-failure rollback), `db-collection-ssr.test.ts` (in-memory fallback + no server-side caching).

## Files Changed

- `package.json` / `pnpm-lock.yaml` — zod promoted to direct exact-pin `4.4.3`; `@tanstack/react-query` + `@tanstack/react-router-ssr-query` removed (−189 transitive packages).
- `src/lib/db/schemas.ts` (new) — 8 Zod v4 entity schemas + `MutualExtends` drift guards vs `src/db/schema.ts`.
- `src/lib/db/storage-keys.ts` (new) — `storageKey(userId, entity)` → `wp:<userId>:<entity>`; `purgeUserCache()`.
- `src/lib/db/collection-factory.ts` (new) — `defineDomainCollection`, `seedStorage` (direct-blob LWW seed), lazy per-user registry, client-only server guard.
- `src/lib/store/journeys.ts` (rebuilt) — factory-based journeys collection; `getJourneysCollection`, `useJourneys`.
- `src/lib/store/collections.ts` (new) — the other 7 client-entity collections + `get*Collection` helpers.
- `src/components/dashboard/JourneysDashboard.tsx` — SSR-safe loader-seed render; rAF proxy + `as any` normalization removed; `isReady()` readiness.
- `src/routes/_authenticated/index.tsx` — loader seeds journeys + returns `userId`; single fetch (F8).
- `src/routes/_authenticated/journey/$journeyId.tsx` — seeds the waypoints collection from its loader payload (second read exemplar; additive, render unchanged).
- `src/router.tsx` — `defaultPreloadStaleTime: 30_000` (F7).
- `src/lib/auth-client.ts` — `signOut` wraps `purgeUserCache()` (AC-DLU7).
- `tests/smoke/db-collection-factory.test.ts`, `tests/smoke/lww-reconcile.test.ts`, `tests/smoke/db-collection-ssr.test.ts` (new).

## Shared Files (also touched by sibling slices)

- `src/lib/store/journeys.ts`, `src/db/schema.ts` (read-only here) — owned by **accounts-data-layer**; the collection pattern is generalized, the schema left untouched.
- `src/router.tsx` — the typed-context `context: { auth: null }` from **tanstack-router-typed-context** is preserved; only the preload-staleTime line changed.
- `src/server/*` — unchanged; server functions remain the D1 system of record.

## Notes on Design Choices

- **Seed = direct localStorage blob, not `collection.insert`.** Forced by installed source (see The Implementation + Deviations). Makes the seed server-authoritative with no D1 double-write, and localizes the LWW-by-`updated_at` merge to one tested function.
- **Lazy per-user collections, never cached on the server.** Namespacing needs the runtime `userId`; the same lazy-create removes any server-side collection singleton (RIM-E7 isolate-bleed containment). Proven by `db-collection-ssr.test.ts`.
- **Render from loader data until hydrated.** `useState(false)` + mount effect: SSR and first client render both use the loader `journeys` prop, so hydration is byte-identical; the reactive collection takes over only after mount (AC-DLU6 mechanism).
- **One `collections.ts`, not seven files.** The plan named per-entity files; each is the same three-line factory call, so consolidating is the fewest-lines choice (build discipline). Journeys stays separate as it carries the write handler + hook.

## Verification Seams Built

- **AC-DLU1** (single fetch) → loader-seed path in `_authenticated/index.tsx`; `data-testid="journeys-dashboard"` present → Playwright network-count assertion can observe it.
- **AC-DLU2/3/4/5** (automated) → verified this round: `tsc --noEmit` clean; `grep` shows zero `as any`/`requestAnimationFrame` in code (only in explanatory comments); `defaultPreloadStaleTime: 30_000`; zero query-bridge refs in `src/` and `package.json`.
- **AC-DLU6** (SSR/hydration) → loader-seed + render-loader-until-hydrated pattern; `db-collection-ssr.test.ts` proves in-memory fallback + no server caching (automated half). Interactive per-entity/per-breakpoint proof is verify-owned.
- **AC-DLU7** (per-user purge) → `wp:<userId>:<entity>` namespacing + `purgeUserCache` on sign-out; `db-collection-factory.test.ts` asserts namespacing + purge (non-cache keys survive). Two-identity Playwright is verify-owned.
- **AC-DLU8** (write + LWW + rollback) → `seedStorage` LWW + forced-flush-failure rollback proven in `lww-reconcile.test.ts` (the plan's mandated-mitigation seam).
- **AC-DLU9** (no-regress) → full Vitest 211 pass / 6 pre-existing skips; typecheck + lint clean. Interactive suite is verify-owned.

## Deviations from Plan

1. **Seed writes the localStorage blob directly, not `collection.insert` (planned API misuse).** The plan's "seed writes the loader payload INTO the collection" would route through the `onInsert` D1-flush handler (double-write). *Source establishing this:* `node_modules/@tanstack/db/dist/esm/local-storage.js:92-110` (`wrappedOnInsert` → `config.onInsert` → `saveToStorage`) and `:278-296` (sync-init reads the blob as synced data). Resolved by `seedStorage` writing the blob directly before lazy create. `class: implementation-detail`.
2. **Write entities are cache collections; no optimistic-insert wired to the grading command.** `recordAttemptAndUpdateFsrs` (`src/server/quiz.ts:373`) is a coupled command that generates the attempt id server-side and applies FSRS — an optimistic `collection.insert` would orphan the client id and duplicate coupled logic, risking regression of a shipped, live-smoke-verified flow (AC-DLU9). The AC-DLU8 optimistic-rollback *mechanism* is proven at the factory level instead. `class: implementation-detail`.
3. **Consumer render-repointing beyond journeys + waypoints is staged.** Lesson/quiz/progress/adaptation surfaces keep rendering from loaders — which is the ratified D3 SSR path — with their collections defined, seeded-capable, and available for client-nav reads. No user-observable behavior changes; the per-entity interactive SSR/isolation gates are verify-owned. `class: implementation-detail`. See Anything Deferred.
4. **`collections.ts` consolidates the 7 remaining entities into one module** (plan named per-entity files). Boilerplate reduction; `class: implementation-detail`.

No deviation is intent-bearing: all 8 client entities become collections (all-9 honored as 8 client + `usage_events` server-only), the Query bridge is removed, and the localStorage-primary + D1-seeded-SSR architecture is fully realized.

## Anything Deferred

- **Render-path repointing of lesson/quiz/progress/adaptation consumers to collection reads.** Ceiling: those surfaces read loader data on the client (still correct — D3 SSR path); their collections are seeded-capable but not yet the render source. Upgrade path: repoint each consumer behind its per-entity AC-DLU6/DLU9 interactive gate at verify. Not a scope reduction (all entities have collections; no user-observable change).
- **Production optimistic-write wiring for quiz-attempts / FSRS.** Ceiling: writes go through the existing `recordAttemptAndUpdateFsrs` command, not the collection; the collection is a read cache. Upgrade path: a dedicated client-id-honoring insert server fn if optimistic quiz UX is later wanted.

## Known Risks / Caveats

- **`sdlc-debt` (collection-factory.ts): same-tab cross-device staleness until refresh.** The library reads localStorage once at sync-init and only reacts to cross-tab `storage` events — no public same-tab re-sync. A server change from another device shows on next full load (fresh isolate re-seeds), not mid-session on this tab. This *is* the shape's named consistency model ("eventually consistent on the client; D1 authoritative on refresh"), with LWW-by-`updated_at` as the seed-time tie-breaker. Upgrade path: a public collection re-sync hook / promoted `manualTrigger` in a later `@tanstack/db`.
- **`sdlc-debt` (collection-factory.ts): session-only cache when the seed can't persist** (localStorage quota/disabled). `seedStorage` swallows the write error; the library's in-memory fallback serves reads for the session; D1 stays authoritative. Exercised by the quota-throw factory test.
- **Seed couples to the library's storage-blob shape** (`{ "s:<key>": { versionKey, data } }`, `encodeStorageKey`). Source-cited at the site; a format change in `@tanstack/db` would require updating `seedStorage`. Guarded by the factory seed→read round-trip test.

## Freshness Research

- **Source (installed):** `@tanstack/db/dist/esm/local-storage.js:53-207` — `localStorageCollectionOptions`: in-memory fallback when `window` absent (SSR-safe), cross-tab `storage` listener, sync-init reads the blob once, `wrappedOnInsert/Update/Delete` call the user handler then persist. *Takeaway:* dictated the direct-blob seed + client-only server guard.
- **Source (installed):** `@tanstack/db/dist/esm/local-storage.d.ts:164` (`schema: T` overload) + `collection/index.d.ts:178,193,205` (`isReady`, `preload`, `size`). *Takeaway:* schema typing + readiness are supported APIs (AC-DLU2/3), not gaps.
- **Dependency graph:** `pnpm why @tanstack/react-query` → sole consumer `react-router-ssr-query`; both removed (−189 packages). `zod@4.4.3` promoted to direct exact-pin. *Takeaway:* AC-DLU5 safe.

## Recommended Next Stage

- **Option A (default):** `/wf verify waypoint-app tanstack-data-layer-unification` — the interactive ACs (AC-DLU1 single-fetch, AC-DLU6 per-entity SSR/hydration, AC-DLU7 two-identity isolation, AC-DLU8 optimistic UI) are the verify-owned half; `BETTER_AUTH_SECRET` is present so the seeded-session harness runs. Consider `/compact` first — workflow state lives in the artifacts.
- **Option B:** `/wf review waypoint-app tanstack-data-layer-unification` — only if the interactive data-flow proofs are deemed trivial (they are not, given RIM-E7).
