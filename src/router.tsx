import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import type { RouterContext } from './routes/__root'

export function getRouter() {
  const router = createTanStackRouter({
    // Required now that the root context type is concrete: the root beforeLoad
    // overwrites this with the real session on every navigation (incl. SSR).
    context: { auth: null } satisfies RouterContext,
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
