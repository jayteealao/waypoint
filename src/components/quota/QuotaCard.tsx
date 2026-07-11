/**
 * QuotaCard — shown when the user's daily AI generation limit is reached.
 *
 * Warm, honest, no dark patterns: tells the user what they used, what the limit
 * is, and exactly when it resets. No paywall language, no upsell path.
 *
 * Used by the quota-fixture test route and composed into generation-consuming
 * features (tutor-interview, roadmap-lesson-generation, quiz-fsrs) by those slices.
 */

import { Card } from '#/components/ui/Card'
import { Meter } from '#/components/ui/Meter'
import type { QuotaStatus } from '#/lib/ai/quota'

export interface QuotaCardProps {
  status: QuotaStatus
}

/**
 * Formats a Date as a friendly local time string, e.g. "12:00 AM".
 * Uses Intl.DateTimeFormat for locale-aware formatting.
 */
function formatResetTime(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export default function QuotaCard({ status }: QuotaCardProps) {
  const { used, limit, resetAt } = status
  const usedPct = limit > 0 ? Math.min(100, (used / limit) * 100) : 100
  const usedFormatted = `$${used.toFixed(4)}`
  const limitFormatted = `$${limit.toFixed(2)}`
  const resetTimeStr = formatResetTime(resetAt)

  return (
    // Outer div carries data-testid; Card does not spread unknown props.
    <div data-testid="quota-card">
      <Card className="quota-card">
        <div className="quota-card__inner">
          <h2 className="quota-card__heading">Daily generation limit reached</h2>
          <p className="quota-card__body">
            You&rsquo;ve used{' '}
            <strong>{usedFormatted}</strong> of your{' '}
            <strong>{limitFormatted}</strong> daily allowance.
          </p>
          <Meter
            value={usedPct}
            label={`Usage: ${usedFormatted} of ${limitFormatted}`}
            className="quota-card__meter"
          />
          <p className="quota-card__reset" data-testid="quota-reset-time">
            Resets at {resetTimeStr}
          </p>
        </div>
      </Card>
    </div>
  )
}
