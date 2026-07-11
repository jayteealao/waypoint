import { createAuthClient } from 'better-auth/react'

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
export const { useSession, signIn, signOut } = authClient
