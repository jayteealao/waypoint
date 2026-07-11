import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { createAuth } from '#/lib/auth'

// Mounts better-auth on the /api/auth/* catch-all using the per-request
// client creation pattern. `env.DB` is the D1Database binding configured in
// wrangler.jsonc. A new `betterAuth` instance is created on every request so
// no module-scope state leaks between Workers invocations (AC-PP4).

// Shared handler for all HTTP methods — better-auth processes both GET (session
// reads) and POST (sign-in/sign-out) via a single auth.handler(request) entry point.
const handleAuth = ({ request }: { request: Request }) => {
  const auth = createAuth(env['DB'])
  return auth.handler(request)
}

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: handleAuth,
      POST: handleAuth,
    },
  },
})
