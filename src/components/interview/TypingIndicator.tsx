/**
 * Typing indicator — tutor-interview slice.
 *
 * Three animated dots with a CSS keyframe bounce animation.
 * Motion is disabled when prefers-reduced-motion: reduce is set.
 * Hidden when not visible via conditional rendering (not CSS display:none)
 * so it doesn't consume aria-live budget when the tutor isn't typing.
 */

export function TypingIndicator() {
  return (
    <div
      className="wp-typing-indicator"
      aria-label="Tutor is thinking"
      data-testid="typing-indicator"
      role="status"
    >
      <span className="wp-typing-dot" aria-hidden="true" />
      <span className="wp-typing-dot" aria-hidden="true" />
      <span className="wp-typing-dot" aria-hidden="true" />
    </div>
  );
}
