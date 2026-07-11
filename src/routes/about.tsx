import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: About,
})

function About() {
  return (
    <main
      className="min-h-screen bg-[var(--paper)] px-4 py-8"
      style={{ color: 'var(--ink)' }}
    >
      <div className="page-wrap">
        <nav className="mb-8">
          <Link
            to="/"
            className="text-sm text-[var(--ink-muted)] no-underline hover:text-[var(--ink)]"
          >
            ← Back to Waypoint
          </Link>
        </nav>
        <section className="wp-card p-6 sm:p-8">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--ember)]">
            About
          </p>
          <h1 className="display-title mb-3 text-3xl font-bold text-[var(--ink)] sm:text-4xl">
            A learning companion built to last.
          </h1>
          <p className="m-0 max-w-3xl text-base leading-8 text-[var(--ink-muted)]">
            Waypoint pairs adaptive AI with spaced-repetition science so you can
            make measurable progress on any topic — on any device, at any pace.
          </p>
        </section>
      </div>
    </main>
  )
}
