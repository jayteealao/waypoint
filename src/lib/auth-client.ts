import { createAuthClient } from 'better-auth/react'
import { purgeUserCache } from '#/lib/db/storage-keys'

/**
 * Client-side better-auth instance.
 *
 * Uses the `better-auth/react` variant which provides React hooks
 * (useSession) in addition to the vanilla client actions (signIn, signOut).
 *
 * baseURL must be an absolute URL — better-auth rejects relative paths.
 * In the browser we derive the origin at runtime; during SSR we fall back
 * to the well-known local dev origin (VITE_APP_URL env var → localhost:3000).
 *
 * No generic type parameter needed for the base social-provider config;
 * plugin-specific types would be added here in later slices if custom
 * better-auth plugins are introduced.
 */
const baseURL =
  typeof window !== 'undefined'
    ? `${window.location.origin}/api/auth`
    : `${process.env['VITE_APP_URL'] ?? 'http://localhost:3000'}/api/auth`

export const authClient = createAuthClient({
  baseURL,
})

// Named re-exports for ergonomic imports in route components.
export const { useSession, signIn } = authClient

/**
 * Sign out, purging every per-user client cache (`wp:*`) first (AC-DLU7).
 *
 * Wrapping the raw `authClient.signOut` guarantees that switching accounts on a
 * shared browser cannot surface user A's cached collection rows to user B: the
 * namespaced localStorage keys are removed before the session ends and the next
 * user seeds fresh. Signature mirrors the underlying action so existing call
 * sites are unchanged.
 */
export const signOut: typeof authClient.signOut = (...args) => {
  purgeUserCache()
  return authClient.signOut(...args)
}
