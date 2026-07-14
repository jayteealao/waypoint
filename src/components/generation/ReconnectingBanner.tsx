/**
 * ReconnectingBanner — fixed-top ember-accented banner shown when EventSource
 * fires onerror. Auto-dismissed when the parent detects reconnection.
 *
 * design: wp-reconnecting-banner (position:fixed, top:0, ember background, slide-in).
 * prefers-reduced-motion: slide-in animation suppressed.
 */
export interface ReconnectingBannerProps {
  /** When false, the banner is not rendered. */
  visible: boolean;
}

export function ReconnectingBanner({ visible }: ReconnectingBannerProps) {
  if (!visible) return null;

  return (
    <div
      className="wp-reconnecting-banner"
      data-testid="reconnecting-banner"
      role="alert"
      aria-live="assertive"
    >
      <span className="wp-reconnecting-banner__dot" aria-hidden="true" />
      Reconnecting to lesson stream…
    </div>
  );
}
