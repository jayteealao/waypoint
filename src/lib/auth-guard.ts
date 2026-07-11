import { createAuth } from '#/lib/auth'

/**
 * Requires an authenticated session for the incoming request.
 *
 * Calls better-auth's getSession API with the request headers.
 * Throws a 401 Response if no valid session exists.
 *
 * @param env - Worker environment (for per-request auth factory)
 * @param request - Incoming Worker request
 * @returns The authenticated session { session, user }
 * @throws {Response} 401 if unauthenticated
 */
export async function requireAuth(
  env: Env,
  request: Request,
): Promise<{ session: { id: string; userId: string; expiresAt: Date }; user: { id: string; name: string; email: string; image: string | null } }> {
  const auth = createAuth(env)
  const result = await auth.api.getSession({ headers: request.headers })
  if (!result?.session) {
    throw new Response(null, { status: 401 })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return result as any
}

/**
 * Enforces per-user resource ownership.
 *
 * Compares the session's user ID against the resource's owner ID.
 * Throws a 403 Response on mismatch.
 *
 * Pure synchronous function — no Workers runtime needed.
 * Testable in standard Vitest (no @cloudflare/vitest-pool-workers required).
 *
 * @param sessionUserId - User ID from the authenticated session
 * @param resourceUserId - User ID stored on the resource row
 * @throws {Response} 403 if IDs do not match or either is falsy
 */
export function requireOwnership(
  sessionUserId: string,
  resourceUserId: string,
): void {
  if (!sessionUserId || !resourceUserId || sessionUserId !== resourceUserId) {
    throw new Response(null, { status: 403 })
  }
}
