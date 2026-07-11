import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useSession, signOut } from '#/lib/auth-client'
import { Button } from '#/components/ui/Button'
import { useState } from 'react'

/**
 * Account settings page — rendered inside the AppShell via the
 * _authenticated layout route, which handles the auth guard.
 */
export const Route = createFileRoute('/_authenticated/account')({
  head: () => ({
    meta: [{ title: 'Waypoint — Account' }],
  }),
  component: AccountPage,
})

function AccountPage() {
  const { data: sessionData } = useSession()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)

  const user = sessionData?.user

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      await signOut()
    } catch (err) {
      console.error('Sign out failed:', err)
      setSigningOut(false)
      return
    }
    await navigate({ to: '/sign-in' })
  }

  if (!user) {
    // Layout route's beforeLoad redirects unauthenticated users.
    // This null prevents a brief flash before the hook hydrates.
    return null
  }

  return (
    <div className="wp-dashboard">
      <header className="mb-6">
        <h1 className="display-title m-0 text-2xl font-bold text-[var(--ink)]">
          Account
        </h1>
      </header>

      <div
        className="wp-card p-6 max-w-sm"
        data-testid="account-panel"
      >
        {/* Avatar + identity */}
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          {user.image ? (
            <img
              src={user.image}
              alt={user.name ?? 'User avatar'}
              className="h-16 w-16 rounded-full object-cover ring-2 ring-[oklch(0.54_0.19_32/0.25)]"
            />
          ) : (
            <div
              aria-hidden="true"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--ember-subtle)] text-xl font-semibold text-[var(--ember-dark)]"
            >
              {(user.name ?? 'U').charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p
              className="text-base font-semibold text-[var(--ink)]"
              data-testid="user-name"
            >
              {user.name}
            </p>
            {user.email && (
              <p className="mt-0.5 text-sm text-[var(--ink-muted)]">
                {user.email}
              </p>
            )}
          </div>
        </div>

        {/* Sign-out action */}
        <Button
          variant="danger"
          size="md"
          className="w-full justify-center"
          loading={signingOut}
          onClick={handleSignOut}
          data-testid="sign-out-button"
        >
          Sign out
        </Button>
      </div>
    </div>
  )
}
