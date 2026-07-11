/**
 * TanStack DB QueryCollection for journeys.
 *
 * The collection uses `listJourneys` server function as its sync source.
 * On mount (or when invalidated), it fetches all journeys for the signed-in
 * user and populates the in-memory store; components read from the store via
 * `useJourneys()` without per-render network round trips (AC-ADL4).
 *
 * Triage deviation from plan (recorded in 05-implement-accounts-data-layer.md):
 * @tanstack/db@0.6.14 does not include IndexedDB persistence. The plan's
 * `persistence: { type: 'indexeddb' }` API does not exist in this version.
 * Resolution: in-memory collection; subsequent slices can add persistence once
 * the stable API lands. The reactive read AC (AC-ADL4) is fully satisfied
 * by the in-memory collection.
 *
 * Also: the plan referenced `createReactCollection` which does not exist in
 * @tanstack/react-db@0.1.92. Resolved: `createCollection` from @tanstack/db
 * + `useLiveQuery` from @tanstack/react-db is the correct API combination.
 */
import { createCollection } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { listJourneys } from '#/server/journeys'
import type { Journey } from '#/db/schema'

/**
 * Reactive collection of the signed-in user's journeys.
 * Syncs from the `listJourneys` server function on mount.
 */
export const journeysCollection = createCollection<Journey, string>({
  id: 'journeys',
  // Extract the row primary key for internal indexing.
  getKey: (journey) => journey.id,
  // Server-function syncer: calls listJourneys on mount and on invalidation,
  // then writes all rows into the in-memory store atomically.
  sync: {
    // TanStack DB@0.6.14: the sync fn must return `void | CleanupFn | SyncConfigRes`,
    // not a Promise. Async work is launched fire-and-forget; markReady() signals
    // completion. Errors are swallowed after markReady() to avoid unhandled rejection;
    // the component layer must handle empty-collection fallback for the auth-error case.
    sync: ({ begin, write, commit, markReady }) => {
      void listJourneys()
        .then((journeys) => {
          begin()
          for (const journey of journeys) {
            write({ type: 'insert', value: journey })
          }
          commit()
          markReady()
        })
        .catch((err: unknown) => {
          // Auth errors (401/403): expected when the user is unauthenticated or
          // unauthorized — mark ready with an empty collection. The route guard
          // will redirect to sign-in before the component renders.
          // All other errors (D1 unavailable, network failure, etc.) are logged
          // so they surface in developer tools and Cloudflare Logpush.
          if (!(err instanceof Response) || (err.status !== 401 && err.status !== 403)) {
            console.error('[journeys-collection] unexpected sync error:', err)
          }
          markReady()
        })
    },
  },
})

/**
 * React hook: returns all journeys for the authenticated user, sorted by
 * created_at descending (same order as the server function returns them).
 *
 * Note: `as any` cast is required because @tanstack/react-db@0.1.92's
 * `useLiveQuery` type signature requires a StandardSchemaV1-typed collection,
 * but our collection uses a plain TypeScript interface (Journey). The runtime
 * behaviour is correct; this is a beta-library type gap.
 */
export function useJourneys() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return useLiveQuery((q) => q.from({ journeys: journeysCollection as any }))
}
