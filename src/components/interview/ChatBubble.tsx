/**
 * Chat message bubble — tutor-interview slice.
 *
 * Two variants: 'user' (self-end, ember-100 bg) and 'assistant' (self-start, surface bg).
 * 'assistant' bubbles use role="status" so screen readers announce new tutor messages.
 */

export interface ChatBubbleProps {
  role: 'user' | 'assistant'
  content: string
  /** Identifies this bubble to Playwright tests. */
  testId?: string
}

export function ChatBubble({ role, content, testId }: ChatBubbleProps) {
  if (role === 'user') {
    return (
      <div
        className="wp-chat-bubble-user"
        data-testid={testId ?? 'chat-bubble-user'}
        aria-label="Your message"
      >
        {content}
      </div>
    )
  }

  return (
    <div
      className="wp-chat-bubble-assistant"
      data-testid={testId ?? 'chat-bubble-assistant'}
      role="status"
      aria-live="polite"
    >
      {content}
    </div>
  )
}
