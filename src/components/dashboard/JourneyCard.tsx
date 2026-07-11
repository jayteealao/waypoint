import type { Journey } from '#/db/schema'
import { Meter } from '../ui/Meter'
import { Button } from '../ui/Button'
import { ArrowRight } from 'lucide-react'

export interface JourneyCardProps {
  journey: Journey
}

function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms
  const minutes = Math.floor(diff / 60_000)
  const hours   = Math.floor(diff / 3_600_000)
  const days    = Math.floor(diff / 86_400_000)

  if (minutes < 60) return minutes <= 1 ? 'just now' : `${minutes}m ago`
  if (hours   < 24) return hours  === 1 ? '1h ago'   : `${hours}h ago`
  if (days    <  7) return days   === 1 ? 'yesterday' : `${days}d ago`
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/**
 * Single journey card for the journeys dashboard.
 *
 * Progress value is 0 for the initial implementation — populated when
 * the quiz-fsrs and adaptation-progress slices add mastery data.
 */
export function JourneyCard({ journey }: JourneyCardProps) {
  return (
    <article
      className="wp-journey-card"
      data-testid="journey-card"
      aria-label={journey.title}
    >
      {/* Journey title — Fraunces display serif */}
      <h2 className="display-title m-0 text-lg font-bold leading-snug text-[var(--ink)] line-clamp-2">
        {journey.title}
      </h2>

      {/* Goal / description */}
      {journey.goal && (
        <p className="m-0 text-sm text-[var(--ink-muted)] line-clamp-2">
          {journey.goal}
        </p>
      )}

      {/* Progress meter — progress added by later slices */}
      <Meter
        value={0}
        label="Progress"
        showValue
        className="text-xs"
      />

      {/* Footer row: relative timestamp + continue CTA */}
      <div className="flex items-center justify-between gap-3 mt-auto pt-1">
        <time
          dateTime={new Date(journey.updated_at).toISOString()}
          className="text-xs text-[var(--ink-faint)]"
        >
          {formatRelativeTime(journey.updated_at)}
        </time>

        <Button
          variant="secondary"
          size="sm"
          aria-label={`Continue ${journey.title}`}
        >
          Continue
          <ArrowRight size={14} aria-hidden="true" />
        </Button>
      </div>
    </article>
  )
}
