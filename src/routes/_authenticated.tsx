import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { AppShell } from '#/components/shell/AppShell'

/**
 * Pathless layout route — wraps all signed-in surfaces.
 *
 * Runs `beforeLoad` on every navigation to a child route (/, /account, …).
 * If the session is absent, redirects to /sign-in before the child component mounts.
 * This replaces per-route auth guards on the individual child routes.
 */
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context }) => {
    const auth = (context as { auth?: { session: unknown } | null }).auth
    if (!auth?.session) {
      throw redirect({ to: '/sign-in' })
    }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
