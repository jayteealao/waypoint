/**
 * Interview chat surface — tutor-interview slice.
 *
 * Renders the full interview conversation: message bubbles, typing indicator,
 * quick-reply chips, and a free-text input. Handles both the live interview
 * flow and the completion/decline states.
 *
 * TanStack Form deviation: TanStack Form was specified in the plan but is not
 * installed in this project. Using a controlled React textarea + submit handler
 * instead — this is the rung-2 (native React) equivalent with less complexity.
 * Recorded as a deviation in the implementation record.
 */

import { useState, useRef, useEffect } from 'react'
import type { InterviewStage, InterviewTurn, TurnResponse } from '#/types/interview'
import { STAGE_CHIPS } from '#/types/interview'
import { ChatBubble } from './ChatBubble'
import { ChatChips } from './ChatChips'
import { TypingIndicator } from './TypingIndicator'

export interface InterviewViewProps {
  journeyId: string
  /** Initial turns to render (for resume — hydrated from server). */
  initialTurns?: InterviewTurn[]
  /** Initial stage (for resume). Defaults to 'consent'. */
  initialStage?: InterviewStage
  /** Initial question to show (first assistant message). */
  initialQuestion?: string
  /** Initial chips for the current stage. */
  initialChips?: string[]
  /**
   * Called when the user submits a turn (chip or free text).
   * Returns the updated { question, chips, stage } for the next turn.
   */
  onSendTurn: (userContent: string) => Promise<TurnResponse>
  /**
   * Called when the interview reaches a terminal state (complete or declined).
   * The parent route can use this to trigger roadmap preparation.
   */
  onComplete?: (stage: 'complete' | 'declined') => void
  /** Pass true to use mock scripted responses (dev/test only). */
  mock?: boolean
}

/** Completion card shown when stage reaches 'complete' or 'declined'. */
function CompletionCard({ stage }: { stage: 'complete' | 'declined' }) {
  const message =
    stage === 'declined'
      ? 'No problem — your roadmap will be built from your stated goal. Check back shortly.'
      : 'Your roadmap is being prepared. Come back in a moment to start your first lesson.'

  const label = stage === 'declined' ? 'Journey started' : 'Roadmap coming'

  return (
    <div className="wp-interview-complete-card" data-testid="interview-complete-card">
      <p className="wp-interview-complete-label">{label}</p>
      <p className="wp-interview-complete-message">{message}</p>
    </div>
  )
}

export function InterviewView({
  journeyId: _journeyId,
  initialTurns = [],
  initialStage = 'consent',
  initialQuestion,
  initialChips,
  onSendTurn,
  onComplete,
  mock: _mock,
}: InterviewViewProps) {
  const [turns, setTurns] = useState<InterviewTurn[]>(initialTurns)
  const [stage, setStage] = useState<InterviewStage>(initialStage)
  const [chips, setChips] = useState<string[]>(
    initialChips ?? STAGE_CHIPS[initialStage],
  )
  const [inputValue, setInputValue] = useState('')
  const [isWaiting, setIsWaiting] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Show initial question as first assistant bubble if no turns yet
  useEffect(() => {
    if (initialQuestion && turns.length === 0) {
      setTurns([{ role: 'assistant', content: initialQuestion, stage: initialStage }])
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Scroll to bottom on new turns or typing indicator
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [turns, isWaiting])

  const isTerminal = stage === 'complete' || stage === 'declined'

  async function submitUserContent(content: string) {
    if (!content.trim() || isWaiting || isTerminal) return

    const userTurn: InterviewTurn = { role: 'user', content: content.trim(), stage }
    setTurns((prev) => [...prev, userTurn])
    setInputValue('')
    setIsWaiting(true)

    try {
      const result = await onSendTurn(content.trim())
      const assistantTurn: InterviewTurn = {
        role: 'assistant',
        content: result.question,
        stage: result.stage,
      }
      setTurns((prev) => [...prev, assistantTurn])
      setStage(result.stage)
      setChips(result.chips)

      if (result.stage === 'complete' || result.stage === 'declined') {
        onComplete?.(result.stage)
      }
    } catch (err) {
      // Show error as an assistant message so the user knows something went wrong
      const errorTurn: InterviewTurn = {
        role: 'assistant',
        content: 'Something went wrong — please try again.',
        stage,
      }
      setTurns((prev) => [...prev, errorTurn])
    } finally {
      setIsWaiting(false)
    }
  }

  function handleChipSelect(label: string) {
    void submitUserContent(label)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    void submitUserContent(inputValue)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Submit on Enter without Shift (Shift+Enter = new line)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void submitUserContent(inputValue)
    }
  }

  return (
    <div className="wp-interview-container" data-testid="interview-view">
      {/* Message history */}
      <div className="wp-chat-scroll" ref={scrollRef} aria-label="Interview conversation" aria-live="off">
        {turns.map((turn, i) => (
          <ChatBubble
            key={i}
            role={turn.role}
            content={turn.content}
            testId={turn.role === 'user' ? `chat-bubble-user-${i}` : `chat-bubble-assistant-${i}`}
          />
        ))}
        {isWaiting && <TypingIndicator />}
      </div>

      {/* Terminal state: show completion card */}
      {isTerminal && <CompletionCard stage={stage} />}

      {/* Input area: hidden when terminal */}
      {!isTerminal && (
        <div className="wp-chat-input-area">
          {/* Quick-reply chips */}
          <ChatChips chips={chips} onSelect={handleChipSelect} disabled={isWaiting} />

          {/* Free-text form */}
          <form onSubmit={handleSubmit} className="wp-chat-form">
            <textarea
              className="wp-chat-textarea"
              data-testid="chat-input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your answer…"
              disabled={isWaiting}
              rows={2}
              aria-label="Your answer"
            />
            <button
              type="submit"
              className="btn-base btn-primary btn-md"
              data-testid="chat-submit"
              disabled={isWaiting || !inputValue.trim()}
              aria-label="Send"
            >
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
