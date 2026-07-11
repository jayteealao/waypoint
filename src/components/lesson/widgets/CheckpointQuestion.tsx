/**
 * Inline checkpoint question widget.
 *
 * Renders a question with radio-button-style options (keyboard navigable via
 * role="radio" / aria-checked). On selection: shows explanation, persists
 * the answer to localStorage so progress survives a page reload.
 *
 * The quiz-fsrs slice migrates this to a server call later; the localStorage
 * key format ('wp:checkpoint:{id}') is stable.
 *
 * Accessibility: ARIA radiogroup/radio pattern; focus-visible ring on options;
 * explanation region announced via aria-live="polite".
 */

import { useState, useEffect } from 'react'
import type { CheckpointProps } from '#/types/lesson-document'

interface CheckpointQuestionProps extends CheckpointProps {
  id: string
}

export function CheckpointQuestion({
  id,
  question,
  options,
  correct_index,
  explanation,
}: CheckpointQuestionProps) {
  const storageKey = `wp:checkpoint:${id}`
  const [selected, setSelected] = useState<number | null>(null)

  // Restore a prior answer from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored !== null) {
        const parsed = parseInt(stored, 10)
        if (!Number.isNaN(parsed)) setSelected(parsed)
      }
    } catch {
      // localStorage unavailable (SSR guard / private browsing)
    }
  }, [storageKey])

  const answered = selected !== null

  function choose(index: number) {
    if (answered) return
    setSelected(index)
    try {
      localStorage.setItem(storageKey, String(index))
    } catch {
      // localStorage unavailable — answer still shows in session
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      choose(index)
    }
  }

  return (
    <div
      className="wp-checkpoint"
      data-testid="checkpoint-question"
      aria-label="Checkpoint question"
    >
      <p className="wp-checkpoint-question">{question}</p>

      <div
        className="wp-checkpoint-options"
        role="radiogroup"
        aria-label={question}
      >
        {options.map((option, i) => {
          const isSelected = selected === i
          return (
            // div rather than button: role="radio" on a native <button> can produce
            // conflicting announcements in some AT (e.g., "button — radio button").
            // Using a non-interactive host with explicit keyboard handling matches
            // the WAI-ARIA radiogroup/radio Authoring Practices Guide pattern.
            <div
              key={i}
              role="radio"
              aria-checked={isSelected}
              aria-disabled={answered && !isSelected}
              className="wp-checkpoint-option"
              data-testid={`checkpoint-option-${i}`}
              onClick={() => choose(i)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              tabIndex={!answered || isSelected ? 0 : -1}
            >
              <span aria-hidden="true">
                {isSelected ? '●' : '○'}
              </span>
              {option}
            </div>
          )
        })}
      </div>

      {answered && (
        <div
          className="wp-checkpoint-explanation"
          role="status"
          aria-live="polite"
          data-testid="checkpoint-explanation"
        >
          <strong>
            {selected === correct_index ? 'Correct! ' : 'Not quite — '}
          </strong>
          {explanation}
        </div>
      )}
    </div>
  )
}
