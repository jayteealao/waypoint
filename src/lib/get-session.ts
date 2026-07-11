import { createServerFn, createMiddleware } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { createAuth } from '#/lib/auth'

// Capture the incoming request (this TanStack Start version does not expose
// getWebRequest()) — same adapted pattern as src/server/journeys.ts.
const withRequest = createMiddleware({ type: 'request' }).server(
  async ({ request, next }) => next({ context: { request } }),
)

/**
 * Reads the better-auth session from the incoming request cookies.
 *
 * Returns `{ session, user }` when signed in, or `null` when not. Unlike
 * `requireAuth` (which throws 401 for API routes), this is non-throwing so the
 * root route's `beforeLoad` can populate `context.auth` for the `_authenticated`
 * layout guard. Without this the guard's `context.auth` is always undefined and
 * every signed-in user is bounced back to /sign-in.
 */
export const getSession = createServerFn()
  .middleware([withRequest])
  .handler(async ({ context }) => {
    const { request } = context as { request: Request }
    const auth = createAuth(env)
    const result = await auth.api.getSession({ headers: request.headers })
    return result ?? null
  })
