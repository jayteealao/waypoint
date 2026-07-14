// @vitest-environment node
/**
 * SSR safety of the data layer (shape D3 / AC-DLU6, automated half).
 *
 * Node env has no `window`/`localStorage`, so this reproduces the Cloudflare
 * `workerd` SSR condition: importing and using a collection module must NOT
 * throw, must fall back to the library's in-memory storage, and must NEVER cache
 * a server-side collection in the module registry (which would bleed one user's
 * rows into another's warm-isolate request). The interactive per-entity SSR/
 * hydration proof (no mismatch at 3 breakpoints) is verify-owned.
 */
import { describe, it, expect } from 'vitest'
import { defineDomainCollection } from '#/lib/db/collection-factory'
import { journeySchema } from '#/lib/db/schemas'

// The factory is imported directly rather than via `store/journeys` because the
// store modules transitively import `cloudflare:workers` (server mutation fns),
// which only resolves on `workerd`. This tests the SSR behaviour of the factory
// itself — the code path every collection module runs on the server.
function makeHandle() {
  return defineDomainCollection({
    entity: 'journeys',
    schema: journeySchema,
    getKey: (j) => j.id,
  })
}

describe('collections under SSR (no window/localStorage)', () => {
  it('creates a collection without throwing (in-memory fallback)', async () => {
    expect(typeof window).toBe('undefined')
    const col = makeHandle().get('u-alice')
    await col.preload()
    expect(col.size).toBe(0)
  })

  it('does not cache server-side collections (no cross-request isolate bleed)', () => {
    // Two calls for the same user on the server return DISTINCT instances —
    // proof the module registry is never populated off the client.
    const handle = makeHandle()
    const a = handle.get('u-alice')
    const b = handle.get('u-alice')
    expect(a).not.toBe(b)
  })
})
