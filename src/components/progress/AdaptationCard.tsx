/**
 * AdaptationCard — consent-shaped proposal card for review waypoint suggestions.
 *
 * Design brief requirements (A5 register):
 *   - Accept and decline are visual equals (no red, no alarming colour on decline).
 *   - Card is warm (ember-subtle accent), not alarming.
 *   - Next-lesson CTA is visible regardless of choice.
 *
 * Renders null when adaptation is null — no-op for the happy (passing) path.
 *
 * Verification seams:
 *   data-testid="adapt-card"     — card wrapper
 *   data-testid="adapt-accept"   — accept button
 *   data-testid="adapt-decline"  — decline button
 */

import type { Adaptation } from '#/db/schema'
import { Button } from '#/components/ui/Button'

export interface AdaptationCardProps {
  adaptation: Adaptation | null
  onAccept:   () => Promise<void>
  onDecline:  () => Promise<void>
  loading:    boolean
}

export function AdaptationCard({
  adaptation,
  onAccept,
  onDecline,
  loading,
}: AdaptationCardProps) {
  if (!adaptation) return null

  return (
    <div className="wp-adapt-card" data-testid="adapt-card" role="region" aria-label="Learning suggestion">
      <p className="font-semibold text-[var(--ink)] mb-1">
        {adaptation.proposed_title}
      </p>
      <p className="text-sm text-[var(--ink-muted)] mb-4">
        I noticed you found some of this waypoint challenging. Would you like
        me to add a short review before we move on?
      </p>
      <div className="wp-adapt-actions">
        <Button
          variant="primary"
          size="sm"
          data-testid="adapt-accept"
          disabled={loading}
          onClick={() => { void onAccept() }}
        >
          Add review
        </Button>
        <Button
          variant="secondary"
          size="sm"
          data-testid="adapt-decline"
          disabled={loading}
          onClick={() => { void onDecline() }}
        >
          No thanks
        </Button>
      </div>
    </div>
  )
}
