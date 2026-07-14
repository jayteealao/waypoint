/**
 * Journeys collection — the factory-standard, schema-typed, localStorage-backed
 * TanStack DB collection for the signed-in user's journeys.
 *
 * Rebuilt on `defineDomainCollection` (shape D1). The three "beta gap" comments
 * the old module carried were re-verified against installed source and found to
 * be misuse, not gaps (MEMORY: TanStack assume-missing anti-pattern):
 *  - the `as any` on `useLiveQuery` → gone; a Zod v4 `schema` makes types flow
 *    (source: @tanstack/db local-storage.d.ts:164 `schema: T`).
 *  - the fire-and-forget syncer → gone; the loader seeds the collection and the
 *    library's localStorage sync is the read source.
 *  - in-memory only → gone; `localStorageCollectionOptions` persists per user.
 *
 * Read path: the route loader passes its D1 result as `seed`; the collection is
 * seeded (LWW-by-`updated_at`) then read reactively — the loader is the single
 * fetch per navigation (F8 / AC-DLU1), not a second `listJourneys()` call.
 *
 * Write path: `onUpdate` flushes optimistic edits to D1 via `updateJourney`
 * (id-stable). CREATE deliberately stays on the `createJourney` server fn (see
 * `journey/new`), NOT an optimistic `collection.insert`: the journey PK is
 * generated server-side, so a client-assigned optimistic id would diverge from
 * the persisted row and orphan on the next seed. Recorded in the implement
 * artifact as a deliberate deviation from the plan's "onInsert→createJourney".
 */
import { useLiveQuery } from '@tanstack/react-db'
import { updateJourney } from '#/server/journeys'
import { journeySchema } from '#/lib/db/schemas'
import { defineDomainCollection } from '#/lib/db/collection-factory'
import type { Journey } from '#/db/schema'

const journeysHandle = defineDomainCollection({
  entity: 'journeys',
  schema: journeySchema,
  getKey: (j) => j.id,
  versionOf: (j) => j.updated_at,
  handlers: {
    onUpdate: async (j) => {
      await updateJourney({
        data: { id: j.id, patch: { title: j.title, goal: j.goal, status: j.status } },
      })
    },
  },
})

/**
 * Get (or lazily create) the current user's journeys collection, LWW-seeding it
 * from the loader's D1 payload when provided. Client-only cache; on the server
 * this returns a throwaway empty collection (SSR renders from loader data).
 */
export function getJourneysCollection(userId: string, seed?: Journey[]) {
  return journeysHandle.get(userId, seed)
}

/** Test-only: reset the per-user registry between specs. */
export const _resetJourneysRegistry = journeysHandle._resetRegistry

/**
 * Reactive live query over a journeys collection. Returns rows newest-first to
 * match the server function's ORDER BY created_at DESC. The collection is
 * schema-typed, so `data` is `Journey[]` with no `as any` (AC-DLU2).
 */
export function useJourneys(collection: ReturnType<typeof getJourneysCollection>) {
  return useLiveQuery((q) => q.from({ journey: collection }))
}
