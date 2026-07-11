/**
 * AI server functions — surface for generation-consuming routes and the quota-fixture.
 *
 * Follows the `withSession` middleware pattern established in `src/server/journeys.ts`.
 * Consumer slices (tutor-interview, roadmap-lesson-generation, quiz-fsrs,
 * adaptation-progress) import from here rather than calling the gateway directly
 * from client-side code.
 */
import { createServerFn, createMiddleware } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { requireAuth } from '#/lib/auth-guard'
import { checkQuota } from '#/lib/ai/quota'

// Triage: TanStack Start v1.168.x does not expose `getWebRequest()`.
// Using a `type: 'request'` middleware to capture the request and inject
// the authenticated session into the server function context.
// (Same deviation documented in src/server/journeys.ts.)
const withSession = createMiddleware({ type: 'request' }).server(
  async ({ request, next }) => {
    const sessionData = await requireAuth(env, request)
    return next({ context: { session: sessionData } })
  },
)

/**
 * Return the authenticated user's current quota status.
 *
 * Used by:
 * - `/_authenticated/quota-fixture` (dev/test harness route, this slice)
 * - tutor-interview, roadmap-lesson-generation, quiz-fsrs (future slices)
 *
 * Returns a `QuotaStatus` with `allowed`, `used`, `limit`, and `resetAt`.
 * The caller is responsible for rendering `<QuotaCard>` when `!allowed`.
 */
/** Serialized QuotaStatus — resetAt sent as ISO-8601 string over the server-fn boundary. */
export interface QuotaStatusSerialized {
  allowed: boolean
  used: number
  limit: number
  /** ISO-8601 string (Date serialized for JSON transport). */
  resetAt: string
}

export const getQuotaStatus = createServerFn()
  .middleware([withSession])
  .handler(async ({ context }): Promise<QuotaStatusSerialized> => {
    const { session } = context as { session: Awaited<ReturnType<typeof requireAuth>> }
    const status = await checkQuota(env.DB, session.user.id)
    // Serialize Date to ISO string for JSON transport (TanStack Start server fn boundary).
    return {
      allowed: status.allowed,
      used: status.used,
      limit: status.limit,
      resetAt: status.resetAt.toISOString(),
    }
  })
