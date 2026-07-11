import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useSession, signOut } from '#/lib/auth-client'

export const Route = createFileRoute('/account')({
  // Protect the route: redirect to /sign-in if there is no active session.
  // This guard runs on every navigation to /account; a root-level redirect
  // will be added by design-system-shell when the full nav shell ships.
  beforeLoad: async ({ context }) => {
    const auth = (context as { auth?: { session: unknown } | null }).auth
    if (!auth?.session) {
      throw redirect({ to: '/sign-in' })
    }
  },
  component: AccountPage,
})

function AccountPage() {
  const { data: sessionData } = useSession()
  const navigate = useNavigate()

  const user = sessionData?.user

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (err) {
      // Log the failure but do not navigate — the user remains signed in
      // and can retry. A future slice can surface a toast or error message here.
      console.error('Sign out failed:', err)
      return
    }
    await navigate({ to: '/sign-in' })
  }

  if (!user) {
    // Should not render — beforeLoad redirects unauthenticated users.
    // This guard prevents a flash before the hook hydrates.
    return null
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--page-bg,#f8faf9)] px-4">
      <div
        className="w-full max-w-sm rounded-2xl border border-[rgba(23,58,64,0.12)] bg-white px-8 py-10 shadow-[0_2px_16px_rgba(23,58,64,0.08)]"
        data-testid="account-panel"
      >
        {/* Identity display */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          {user.image ? (
            <img
              src={user.image}
              alt={user.name ?? 'User avatar'}
              className="h-16 w-16 rounded-full object-cover ring-2 ring-[rgba(79,184,178,0.3)]"
            />
          ) : (
            // Fallback avatar initials
            <div
              aria-hidden="true"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-[rgba(79,184,178,0.18)] text-xl font-semibold text-[var(--lagoon-deep,#328f97)]"
            >
              {(user.name ?? 'U').charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p
              className="text-base font-semibold text-[var(--sea-ink,#173a40)]"
              data-testid="user-name"
            >
              {user.name}
            </p>
            {user.email && (
              <p className="mt-0.5 text-sm text-[var(--sea-ink-soft,#4a6b72)]">
                {user.email}
              </p>
            )}
          </div>
        </div>

        {/* Sign-out action */}
        <button
          type="button"
          onClick={handleSignOut}
          data-testid="sign-out-button"
          className="w-full rounded-xl border border-[rgba(23,58,64,0.18)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--sea-ink,#173a40)] transition hover:bg-[rgba(239,68,68,0.06)] hover:border-[rgba(239,68,68,0.3)] hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 active:scale-[0.98]"
        >
          Sign out
        </button>
      </div>
    </main>
  )
}
