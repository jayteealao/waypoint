import { useEffect, useState } from 'react'
import { useNavigate, Link } from '@tanstack/react-router'
import type { Journey } from '#/db/schema'
import { useJourneys } from '#/lib/store/journeys'
import { JourneyCard } from './JourneyCard'
import { Skeleton } from '../ui/Skeleton'
import { Compass } from 'lucide-react'
import { SAMPLE_JOURNEY_VISITED_KEY } from '#/fixtures/sample-journey'

/** Compass waypoint illustration for the empty state. */
function EmptyIllustration() {
  return (
    <svg
      width="80"
      height="80"
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Outer ring */}
      <circle cx="40" cy="40" r="36" stroke="var(--border)" strokeWidth="2" />
      {/* Inner ring */}
      <circle cx="40" cy="40" r="24" stroke="var(--ember-subtle)" strokeWidth="1.5" fill="var(--ember-subtle)" />
      {/* Compass needle — ember pointing up */}
      <polygon points="40,18 43,38 40,36 37,38" fill="var(--ember)" />
      {/* Compass needle — ink pointing down */}
      <polygon points="40,62 43,42 40,44 37,42" fill="var(--ink-faint)" />
      {/* Centre dot */}
      <circle cx="40" cy="40" r="3" fill="var(--ink)" />
    </svg>
  )
}

/** Empty state — shown when the signed-in user has no journeys yet. */
function EmptyState() {
  return (
    <div className="wp-empty-state" data-testid="empty-state">
      <EmptyIllustration />

      <div>
        <h2 className="display-title m-0 text-xl font-bold text-[var(--ink)]">
          Your first journey starts here
        </h2>
        <p className="mt-2 m-0 text-sm text-[var(--ink-muted)] leading-6">
          A journey is a learning goal you work through step by step. Waypoint
          guides you with AI-generated lessons, spaced-review, and a roadmap
          that adapts as you grow.
        </p>
      </div>

      <Link
        to="/journey/new"
        className="btn-base btn-primary btn-md inline-flex items-center gap-2"
        data-testid="create-journey-cta"
      >
        <Compass size={16} aria-hidden="true" />
        Start a journey
      </Link>
    </div>
  )
}

/** Loading skeleton grid — three card skeletons. */
function LoadingSkeleton() {
  return (
    <div className="wp-journey-grid" aria-busy="true" aria-label="Loading journeys">
      {[0, 1, 2].map((i) => (
        <div key={i} className="wp-card p-5 flex flex-col gap-3">
          <Skeleton height="1.5rem" width="75%" />
          <Skeleton height="0.875rem" width="90%" />
          <Skeleton height="0.875rem" width="60%" />
          <Skeleton height="0.5rem" />
          <div className="flex justify-between mt-2">
            <Skeleton height="0.875rem" width="4rem" />
            <Skeleton height="2rem" width="6rem" />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Journeys dashboard — the returning learner's "where was I?" surface.
 *
 * Loading state: renders skeletons for one frame after mount while the
 * TanStack DB syncer completes. The syncer calls `markReady()` asynchronously.
 *
 * sdlc-debt: TanStack DB@0.6.14 does not expose a collection `isReady` flag
 * on the public API. This component uses a useEffect-flipped boolean as a proxy.
 * When @tanstack/db stabilises a `useCollectionReady()` hook, replace the
 * boolean with that. Ceiling: 1-frame flash of skeleton on first mount.
 */
export function JourneysDashboard() {
  const [isReady, setIsReady] = useState(false)
  const navigate              = useNavigate()

  // Flip ready after the first paint so the syncer has time to call markReady().
  useEffect(() => {
    const id = requestAnimationFrame(() => setIsReady(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // useJourneys() returns any — @tanstack/react-db@0.1.92 type gap
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawRows: any = useJourneys()

  // Normalise: handle both Journey[] and { journeys: Journey }[] return shapes
  const journeys: Journey[] = Array.isArray(rawRows)
    ? rawRows.map((r: Journey | { journeys: Journey }) =>
        r && typeof r === 'object' && 'journeys' in r ? r.journeys : (r as Journey),
      )
    : []

  // First-login redirect: new users with no journeys land in the sample journey.
  // Returning users who have already visited the sample journey stay on the dashboard.
  // Only runs client-side (localStorage is not available during SSR).
  useEffect(() => {
    if (!isReady) return
    if (journeys.length !== 0) return
    if (typeof localStorage === 'undefined') return
    if (localStorage.getItem(SAMPLE_JOURNEY_VISITED_KEY) === 'true') return
    void navigate({ to: '/sample' })
  }, [isReady, journeys.length, navigate])

  return (
    <section
      className="wp-dashboard"
      data-testid="journeys-dashboard"
      aria-label="Your learning journeys"
    >
      <header className="mb-6">
        <h1 className="display-title m-0 text-2xl font-bold text-[var(--ink)]">
          Journeys
        </h1>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          Pick up where you left off, or start something new.
        </p>
      </header>

      {!isReady ? (
        <LoadingSkeleton />
      ) : journeys.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="wp-journey-grid">
          {journeys.map((journey) => (
            <JourneyCard key={journey.id} journey={journey} />
          ))}
        </div>
      )}
    </section>
  )
}
