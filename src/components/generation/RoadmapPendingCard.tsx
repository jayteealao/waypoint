/**
 * RoadmapPendingCard — shown in the interview route while roadmap generation
 * is in progress. Full-page centered card with an ember spinner and message.
 *
 * Design: ember-accented surface card (wp-roadmap-pending from styles.css).
 */
export function RoadmapPendingCard() {
  return (
    <div className="wp-roadmap-pending" data-testid="roadmap-pending-card" role="status" aria-live="polite">
      <div className="wp-roadmap-pending__spinner" aria-hidden="true" />
      <p className="wp-roadmap-pending__title">Building your roadmap…</p>
      <p className="wp-roadmap-pending__subtitle">
        Your personalised learning journey is being prepared. This takes just a moment.
      </p>
    </div>
  )
}
