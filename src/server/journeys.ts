/**
 * Journey server functions.
 *
 * All four functions enforce per-user isolation via `requireAuth` (session check)
 * and `requireOwnership` (cross-account denial). The `env` binding from
 * `cloudflare:workers` is safe here because server functions run in the Workers
 * runtime; `@cloudflare/vite-plugin` provides the shim in Vite dev mode.
 *
 * Request access: `withSession` reads the incoming request via the framework's
 * own `getRequest()` primitive and puts the authenticated session into the
 * server function context for downstream handlers.
 */
import { createServerFn, createMiddleware } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'
import { requireAuth, requireOwnership } from '#/lib/auth-guard'
import type { Journey, Waypoint } from '#/db/schema'

// Shared auth middleware: resolve the request via getRequest() and inject the
// authenticated session into the server function context.
const withSession = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const sessionData = await requireAuth(env, getRequest())
    return next({ context: { session: sessionData } })
  },
)

/** List all journeys for the authenticated user, newest first. */
export const listJourneys = createServerFn()
  .middleware([withSession])
  .handler(async ({ context }): Promise<Journey[]> => {
    const { session } = context as { session: Awaited<ReturnType<typeof requireAuth>> }
    const result = await env.DB.prepare(
      'SELECT * FROM journeys WHERE user_id = ? ORDER BY created_at DESC',
    )
      .bind(session.user.id)
      .all<Journey>()
    return result.results
  })

/** Get a single journey by id, enforcing ownership. */
export const getJourney = createServerFn()
  .middleware([withSession])
  .validator((id: string) => id)
  .handler(async ({ data: id, context }): Promise<Journey | null> => {
    const { session } = context as { session: Awaited<ReturnType<typeof requireAuth>> }
    const journey = await env.DB.prepare('SELECT * FROM journeys WHERE id = ?')
      .bind(id)
      .first<Journey>()
    if (!journey) return null
    requireOwnership(session.user.id, journey.user_id)
    return journey
  })

/** Create a new journey owned by the authenticated user. */
export const createJourney = createServerFn({ method: 'POST' })
  .middleware([withSession])
  .validator((input: { title: string; goal?: string }) => input)
  .handler(async ({ data, context }): Promise<Journey> => {
    const { session } = context as { session: Awaited<ReturnType<typeof requireAuth>> }
    const id = crypto.randomUUID()
    const now = Date.now()
    await env.DB.prepare(
      'INSERT INTO journeys (id, user_id, title, goal, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(id, session.user.id, data.title, data.goal ?? null, 'active', now, now)
      .run()
    return {
      id,
      user_id: session.user.id,
      title: data.title,
      goal: data.goal ?? null,
      status: 'active',
      created_at: now,
      updated_at: now,
    }
  })

/** Result type for getJourneyWithWaypoints. */
export interface JourneyWithWaypoints {
  journey: Journey
  waypoints: Waypoint[]
}

/**
 * Fetch a journey and all of its waypoints, ordered by position ASC.
 * Used by the _authenticated/$journeyId layout route to populate ShellContext.
 */
export const getJourneyWithWaypoints = createServerFn()
  .middleware([withSession])
  .validator((id: string) => id)
  .handler(async ({ data: id, context }): Promise<JourneyWithWaypoints | null> => {
    const { session } = context as { session: Awaited<ReturnType<typeof requireAuth>> }

    const journey = await env.DB.prepare('SELECT * FROM journeys WHERE id = ?')
      .bind(id)
      .first<Journey>()
    if (!journey) return null
    requireOwnership(session.user.id, journey.user_id)

    const waypointResult = await env.DB.prepare(
      'SELECT * FROM waypoints WHERE journey_id = ? ORDER BY position ASC',
    )
      .bind(id)
      .all<Waypoint>()

    return { journey, waypoints: waypointResult.results }
  })

/** Update title, goal, or status of a journey the authenticated user owns. */
export const updateJourney = createServerFn({ method: 'POST' })
  .middleware([withSession])
  .validator(
    (input: { id: string; patch: Partial<Pick<Journey, 'title' | 'goal' | 'status'>> }) =>
      input,
  )
  .handler(async ({ data, context }): Promise<Journey> => {
    const { session } = context as { session: Awaited<ReturnType<typeof requireAuth>> }

    // Fetch current values (needed to fill unpatched fields).
    const current = await env.DB.prepare('SELECT * FROM journeys WHERE id = ?')
      .bind(data.id)
      .first<Journey>()
    if (!current) throw new Response(null, { status: 404 })

    // Apply patch in TypeScript, then write atomically with ownership in the WHERE
    // clause — if the row doesn't belong to this user, meta.changes === 0 → 403.
    const now = Date.now()
    const updated: Journey = { ...current, ...data.patch, updated_at: now }
    const meta = await env.DB.prepare(
      'UPDATE journeys SET title = ?, goal = ?, status = ?, updated_at = ? WHERE id = ? AND user_id = ?',
    )
      .bind(updated.title, updated.goal, updated.status, updated.updated_at, data.id, session.user.id)
      .run()

    // D1 meta.changes is the number of rows affected; 0 means ownership check failed.
    if (meta.meta.changes === 0) throw new Response(null, { status: 403 })
    return updated
  })
