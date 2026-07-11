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
 * Fetch a single lesson row by id.
 * Returns null if the lesson does not exist.
 * The `content` field is a JSON string — callers parse it with
 * `JSON.parse(row.content) as LessonDocumentV1` after receiving the row.
 * Does not enforce waypoint ownership — callers must check the lesson belongs
 * to the authenticated user's journey before rendering.
 *
 * Implementation note: content is returned as a raw string rather than a
 * parsed LessonDocumentV1 because TanStack Start's serialization validator
 * rejects `Record<string, unknown>` (WidgetSection.props) at the type level.
 * Parsing is deferred to the calling route loader.
 */
export const getLesson = createServerFn()
  .middleware([withSession])
  .validator((id: string) => id)
  .handler(async ({ data: lessonId }): Promise<Lesson | null> => {
    const row = await env.DB.prepare('SELECT * FROM lessons WHERE id = ?')
      .bind(lessonId)
      .first<Lesson>()
    if (!row) return null
    return row
  })
