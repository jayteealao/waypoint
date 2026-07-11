import { createFileRoute, redirect } from '@tanstack/react-router'
import { signIn } from '#/lib/auth-client'

export const Route = createFileRoute('/sign-in')({
  // Redirect authenticated users away from sign-in to the home page.
  // beforeLoad runs on navigation so no flash of sign-in for already-signed-in users.
  beforeLoad: async ({ context }) => {
    // context.auth is injected by the root loader in later slices (design-system-shell).
    // Here, fall back to checking sessionStorage for a quick client-side hint.
    // The real session is validated server-side on every data request via requireAuth().
    // For this slice, we skip the server-side check to avoid extra complexity;
    // the design-system-shell root loader will handle the canonical redirect.
    // sdlc-debt: add server-side session check in root loader (design-system-shell) for no-flash.
    const auth = (context as { auth?: { session: unknown } | null }).auth
    if (auth?.session) {
      throw redirect({ to: '/' })
    }
  },
  component: SignInPage,
})

function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--page-bg,#f8faf9)] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[rgba(23,58,64,0.12)] bg-white px-8 py-10 shadow-[0_2px_16px_rgba(23,58,64,0.08)]">
        {/* App identity */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--sea-ink,#173a40)]">
            Waypoint
          </h1>
          <p className="mt-1.5 text-sm text-[var(--sea-ink-soft,#4a6b72)]">
            Your AI-powered learning companion
          </p>
        </div>

        {/* OAuth provider buttons */}
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() =>
              signIn.social({ provider: 'google', callbackURL: '/' })
            }
            className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-[rgba(23,58,64,0.18)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--sea-ink,#173a40)] transition hover:bg-[rgba(23,58,64,0.04)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lagoon-deep,#328f97)] focus-visible:ring-offset-2 active:scale-[0.98]"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <button
            type="button"
            onClick={() =>
              signIn.social({ provider: 'github', callbackURL: '/' })
            }
            className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-[rgba(23,58,64,0.18)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--sea-ink,#173a40)] transition hover:bg-[rgba(23,58,64,0.04)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lagoon-deep,#328f97)] focus-visible:ring-offset-2 active:scale-[0.98]"
          >
            <GitHubIcon />
            Continue with GitHub
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-[var(--sea-ink-faint,#7a9ba2)]">
          By continuing you agree to our Terms of Service
        </p>
      </div>
    </main>
  )
}

// Inline minimal SVG icons — no extra dependency.
// These will be replaced with design-system icons in design-system-shell.

function GoogleIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908C16.658 14.166 17.64 11.9 17.64 9.2z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.909-2.259c-.806.54-1.837.86-3.047.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 0C5.37 0 0 5.373 0 12c0 5.303 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.298 24 12c0-6.627-5.373-12-12-12z"
      />
    </svg>
  )
}
