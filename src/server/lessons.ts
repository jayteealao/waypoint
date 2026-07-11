/**
 * Lesson server functions — D1 read path.
 *
 * Follows the exact same createServerFn + withSession pattern established in
 * src/server/journeys.ts (AC-accounts-data-layer, already implemented).
 *
 * The `content` column stores a serialized LessonDocumentV1 (JSON string).
 * Parse it on read; return null if absent so the route can render a skeleton
 * or empty state while generation is pending.
 */

import { createServerFn, createMiddleware } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { requireAuth } from '#/lib/auth-guard'
import type { Lesson } from '#/db/schema'

const withSession = createMiddleware({ type: 'request' }).server(
  async ({ request, next }) => {
    const sessionData = await requireAuth(env, request)
    return next({ context: { session: sessionData } })
  },
)

/**
 * Fetch a single lesson row by id, scoped to the owning waypoint.
 *
 * Ownership is enforced at the query level: `WHERE id = ? AND waypoint_id = ?`.
 * A lesson that exists but belongs to a different waypoint returns null — callers
 * cannot distinguish "not found" from "not yours", which is the correct security
 * posture (avoids leaking existence information).
 *
 * Returns null on not-found, ownership mismatch, or D1 error (logged).
 * The `content` field is a JSON string — parse with
 * `JSON.parse(row.content) as LessonDocumentV1` in the calling route loader.
 *
 * Implementation note: content is returned as a raw string rather than a
 * parsed LessonDocumentV1 because TanStack Start's serialization validator
 * rejects `Record<string, unknown>` (WidgetSection.props) at the type level.
 * Parsing is deferred to the calling route loader.
 */
export const getLesson = createServerFn()
  .middleware([withSession])
  .validator((input: { lessonId: string; waypointId: string }) => input)
  .handler(async ({ data: { lessonId, waypointId } }): Promise<Lesson | null> => {
    try {
      const row = await env.DB.prepare(
        'SELECT * FROM lessons WHERE id = ? AND waypoint_id = ?',
      )
        .bind(lessonId, waypointId)
        .first<Lesson>()
      if (!row) return null
      return row
    } catch (err) {
      console.error('[lessons] D1 error fetching lesson:', lessonId, err)
      return null
    }
  })
