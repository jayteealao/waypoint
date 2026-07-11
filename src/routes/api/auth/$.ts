import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { createAuth } from '#/lib/auth'

// Mounts better-auth on the /api/auth/* catch-all using the per-request
// client creation pattern. `env` is fully typed via worker-configuration.d.ts
// + the Env augmentation in src/cloudflare-workers.d.ts.
//
// A new `betterAuth` instance is created on every request so no module-scope
// state leaks between Workers invocations (AC-PP4).

const handleAuth = ({ request }: { request: Request }) => {
  return createAuth(env).handler(request)
}

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: handleAuth,
      POST: handleAuth,
    },
  },
})
