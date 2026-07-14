/**
 * Chat message bubble — tutor-interview slice.
 *
 * Two variants: 'user' (self-end, ember-100 bg) and 'assistant' (self-start, surface bg).
 * Announcement of new assistant messages is handled by the parent container's aria-live="polite"
 * region (InterviewView). Individual bubbles do not carry their own live region so that the
 * container can batch-announce additions without redundant per-bubble reads.
 */

export interface ChatBubbleProps {
  role: "user" | "assistant";
  content: string;
  /** Identifies this bubble to Playwright tests. */
  testId?: string;
}

export function ChatBubble({ role, content, testId }: ChatBubbleProps) {
  if (role === "user") {
    return (
      <div
        className="wp-chat-bubble-user"
        data-testid={testId ?? "chat-bubble-user"}
        aria-label="Your message"
      >
        {content}
      </div>
    );
  }

  return (
    <div className="wp-chat-bubble-assistant" data-testid={testId ?? "chat-bubble-assistant"}>
      {content}
    </div>
  );
}
