/**
 * Standard domain-collection factory for Waypoint's TanStack DB data layer.
 *
 * One shape for every client-read entity: a schema-typed, localStorage-persisted
 * collection whose optimistic writes flush to D1 through the existing mutation
 * server functions. Replaces the per-entity ad-hoc `createCollection` call and
 * the bespoke fire-and-forget journeys syncer (shape D1 / Named Mechanisms).
 *
 * ── The seed mechanism (deviation from plan's literal wording) ───────────────
 * The plan said a `seed(rows)` helper "writes the SSR loader payload INTO the
 * collection." Reading the installed source shows that is wrong: a `.insert()`
 * on a localStorage collection routes through `wrappedOnInsert`, which invokes
 * our `onInsert` handler — i.e. it would flush the loader rows straight back to
 * D1 (a double-write).
 *   source: node_modules/@tanstack/db/dist/esm/local-storage.js:92-110
 *           (wrappedOnInsert → config.onInsert → saveToStorage)
 * The library's ONLY server-authoritative injection path is its sync source,
 * which for a localStorage collection IS localStorage: on sync-init it reads the
 * blob `{ "s:<key>": { versionKey, data } }` once and writes those rows as
 * synced (not optimistic) data.
 *   source: node_modules/@tanstack/db/dist/esm/local-storage.js:278-296
 *           (syncConfig.sync → loadFromStorage → write insert; markReady)
 * So the correct seed writes that blob directly BEFORE the collection is
 * created, and the collection's sync-init picks it up with no handler flush.
 * Because the seed must be keyed by the runtime `userId` (privacy namespacing,
 * AC-DLU7), collections cannot be module singletons anyway — they are created
 * lazily per user, which lines up exactly with seed-before-create.
 *
 * ── Consistency ceiling (matches the shape's named model) ────────────────────
 * The library reads localStorage once at sync-init and otherwise only reacts to
 * cross-tab `storage` events; it exposes no public same-tab re-sync. So a
 * server change made on ANOTHER device is reflected on next full load (fresh
 * isolate → loader re-seeds), not mid-session on this tab. That is precisely the
 * shape's consistency model: "eventually consistent on the client; D1
 * authoritative on refresh," with the LWW-by-`updated_at` merge (below) as the
 * tie-breaker at seed time. sdlc-debt: same-tab cross-device staleness until
 * refresh; upgrade path is a public collection re-sync hook if @tanstack/db adds
 * one, or a manual `utils.manualTrigger` if it is promoted to the public utils.
 */
import { createCollection, localStorageCollectionOptions } from '@tanstack/db'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { storageKey, type CollectionEntity } from './storage-keys'

/** The library's on-disk item envelope (see local-storage.js loadFromStorage). */
interface StoredItem {
  versionKey: string
  data: unknown
}

/** Encode a collection key the same way the library does (local-storage.js). */
function encodeStorageKey(key: string | number): string {
  return typeof key === 'number' ? `n:${key}` : `s:${key}`
}

function readBlob(key: string): Record<string, StoredItem> {
  if (typeof localStorage === 'undefined') return {}
  const raw = localStorage.getItem(key)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, StoredItem>) : {}
  } catch {
    return {}
  }
}

/**
 * LWW-merge server `rows` into the localStorage blob at `key`, then persist.
 *
 * For each server row: if the blob already holds that key with a `versionOf`
 * value >= the server's (a newer/equal local optimistic write not yet flushed),
 * keep the local copy; otherwise take the server row. Rows already local but
 * absent from `rows` are kept (unflushed local inserts are never dropped by a
 * partial seed). When `versionOf` is undefined the entity has no version column
 * (read-mostly/immutable rows — waypoints, lessons, quiz-questions, concepts),
 * so the server copy always wins.
 *
 * This is the AC-DLU8 "LWW-by-`updated_at`, D1 authoritative on refresh"
 * mechanism realised at the seam the library actually supports (the sync
 * source), and it is exported so the reconcile logic is unit-testable in Node.
 */
export function seedStorage<T extends object>(
  key: string,
  rows: T[],
  getKey: (row: T) => string,
  versionOf?: (row: T) => number,
): void {
  if (typeof localStorage === 'undefined') return
  const blob = readBlob(key)
  for (const row of rows) {
    const rowKey = getKey(row)
    const encoded = encodeStorageKey(rowKey)
    const existing = blob[encoded]
    if (existing !== undefined && versionOf !== undefined) {
      const localV = versionOf(existing.data as T)
      const serverV = versionOf(row)
      if (localV >= serverV) continue // local copy is newer or equal → keep it
    }
    blob[encoded] = { versionKey: crypto.randomUUID(), data: row }
  }
  try {
    localStorage.setItem(key, JSON.stringify(blob))
  } catch (err) {
    // Quota exceeded / storage disabled: the collection's in-memory fallback
    // still serves reads for this session; D1 remains authoritative. Degrade,
    // don't throw. sdlc-debt: session-only cache when the seed can't persist.
    console.warn('[collection-factory] seed persist failed; session-only cache:', err)
  }
}

/** Per-row write handlers an entity supplies; the factory adapts them to the
 *  library's batched-transaction handler shape. Throwing rolls the optimistic
 *  mutation back (library transaction-rolls-back-on-handler-throw). */
export interface WriteHandlers<T> {
  onInsert?: (row: T) => Promise<void>
  onUpdate?: (row: T) => Promise<void>
  onDelete?: (row: T) => Promise<void>
}

export interface DomainCollectionDef<TSchema extends StandardSchemaV1<unknown, object>> {
  entity: CollectionEntity
  schema: TSchema
  getKey: (row: StandardSchemaV1.InferOutput<TSchema>) => string
  /** Version selector for LWW at seed time (e.g. `r => r.updated_at`). Omit for
   *  entities with no version column (server always wins). */
  versionOf?: (row: StandardSchemaV1.InferOutput<TSchema>) => number
  handlers?: WriteHandlers<StandardSchemaV1.InferOutput<TSchema>>
}

/**
 * Define a per-entity collection. The returned handle's `get(userId, seed?)`
 * LWW-seeds the user's namespaced storage (when a loader payload is passed) and
 * returns the lazily created, cached collection for that user. The collection
 * type is inferred from `createCollection` so all of its surface (`insert`,
 * `update`, `toArray`, `isReady`, `preload`) is precisely typed at call sites
 * with no `as any` (AC-DLU2).
 */
export function defineDomainCollection<TSchema extends StandardSchemaV1<unknown, object>>(
  def: DomainCollectionDef<TSchema>,
) {
  type Row = StandardSchemaV1.InferOutput<TSchema>
  const h = def.handlers
  const build = (key: string) =>
    createCollection(
      localStorageCollectionOptions<TSchema, string>({
        storageKey: key,
        schema: def.schema,
        getKey: def.getKey,
        ...(h?.onInsert && {
          onInsert: async ({ transaction }) => {
            for (const m of transaction.mutations) await h.onInsert!(m.modified as Row)
          },
        }),
        ...(h?.onUpdate && {
          onUpdate: async ({ transaction }) => {
            for (const m of transaction.mutations) await h.onUpdate!(m.modified as Row)
          },
        }),
        ...(h?.onDelete && {
          onDelete: async ({ transaction }) => {
            for (const m of transaction.mutations) await h.onDelete!(m.modified as Row)
          },
        }),
      }),
    )

  const registry = new Map<string, ReturnType<typeof build>>()
  // Tracks the last seed reference applied per key, so a reactive re-render that
  // passes the SAME loader payload does not rewrite localStorage every render.
  const lastSeed = new Map<string, unknown>()

  return {
    get(userId: string, seed?: Row[]): ReturnType<typeof build> {
      // Fail closed on a missing user id: an empty id must never collapse
      // distinct users onto one shared cache namespace (the isolation guarantee
      // this data layer exists to hold). Authenticated routes always supply a
      // real id; if one is ever absent, hand back an unseeded, uncached throwaway
      // so no user's rows can persist under, or be read from, a shared key.
      if (!userId) return build(storageKey('__anon__', def.entity))
      const key = storageKey(userId, def.entity)
      const isClient = typeof window !== 'undefined'
      // Seed BEFORE (re)creating so sync-init reads it; on an already-created
      // collection this refreshes localStorage for the next full load. Guard on
      // the seed reference: a new navigation/loader run brings a fresh array and
      // re-seeds, but a re-render with the same payload is a no-op.
      if (seed !== undefined && isClient && lastSeed.get(key) !== seed) {
        seedStorage(key, seed, def.getKey, def.versionOf)
        lastSeed.set(key, seed)
      }
      // Collections are CLIENT-ONLY (shape D3). On the server we never cache: a
      // module-level registry in a warm Cloudflare isolate would bleed one
      // user's rows into another's request. The server build is a throwaway
      // empty in-memory collection (localStorage absent → library in-memory
      // fallback); SSR output is rendered from loader data, never from this
      // empty collection, so it is safe and never read for isolation-sensitive
      // output. source: node_modules/@tanstack/db/dist/esm/local-storage.js:56
      // (createInMemoryStorage when window absent).
      if (!isClient) return build(key)
      const cached = registry.get(key)
      if (cached) return cached
      const collection = build(key)
      registry.set(key, collection)
      return collection
    },
    /** Test-only: drop the per-user registry so specs start clean. */
    _resetRegistry() {
      registry.clear()
      lastSeed.clear()
    },
  }
}
