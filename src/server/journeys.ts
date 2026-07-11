/**
 * Journey server functions.
 *
 * All four functions enforce per-user isolation via `requireAuth` (session check)
 * and `requireOwnership` (cross-account denial). The `env` binding from
 * `cloudflare:workers` is safe here because server functions run in the Workers
 * runtime; `@cloudflare/vite-plugin` provides the shim in Vite dev mode.
 *
 * Request access: TanStack Start v1.x exposes the raw request in `type: 'request'`
 * middleware. `withSession` captures it and puts the authenticated session into
 * the server function context. This is the adapted pattern for `getWebRequest()`
 * (which is not present in the installed @tanstack/react-start@1.168.x).
 */
import { createServerFn, createMiddleware } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { requireAuth, requireOwnership } from '#/lib/auth-guard'
import type { Journey } from '#/db/schema'

// Triage deviation from plan: TanStack Start v1.168.x does not expose
// `getWebRequest()`. Using a `type: 'request'` middleware to capture the
// request and inject the authenticated session into the server function context.
const withSession = createMiddleware({ type: 'request' }).server(
  async ({ request, next }) => {
    const sessionData = await requireAuth(env, request)
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
