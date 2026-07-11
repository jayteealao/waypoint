/**
 * QuizView — single-question multiple-choice quiz flow.
 *
 * Renders one question at a time. After the learner selects an option,
 * immediate feedback (correct / incorrect + explanation) appears before
 * they advance. On the final question the results summary renders instead.
 *
 * localStorage: attempt state is persisted under SAMPLE_QUIZ_ATTEMPT_KEY
 * so the results screen survives a page reload (restored on mount).
 *
 * The `onComplete` callback fires once, after the attempt is written to
 * localStorage, so parent routes can dispatch side effects (e.g. updating
 * completion indicators) without coupling into this component's state.
 */

import { useState, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import type { SampleQuizQuestion } from '#/fixtures/sample-journey'
import { SAMPLE_QUIZ_ATTEMPT_KEY } from '#/fixtures/sample-journey'

// ─── Types ────────────────────────────────────────────────────────────────────

interface QuizAttempt {
  score:       number      // 0–1 fraction
  answers:     (number | null)[]
  completedAt: string      // ISO-8601
}

// ─── QuizView ─────────────────────────────────────────────────────────────────

export interface QuizViewProps {
  questions:  SampleQuizQuestion[]
  onComplete?: () => void
}

export function QuizView({ questions, onComplete }: QuizViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers,      setAnswers]      = useState<(number | null)[]>(
    () => Array(questions.length).fill(null),
  )
  const [revealed,     setRevealed]     = useState<boolean[]>(
    () => Array(questions.length).fill(false),
  )
  const [showResults, setShowResults]   = useState(false)
  const [restoredAttempt, setRestoredAttempt] = useState<QuizAttempt | null>(null)

  // On mount: restore completed attempt from localStorage if present
  useEffect(() => {
    if (typeof localStorage === 'undefined') return
    const raw = localStorage.getItem(SAMPLE_QUIZ_ATTEMPT_KEY)
    if (!raw) return
    try {
      const attempt = JSON.parse(raw) as QuizAttempt
      if (
        typeof attempt.score === 'number' &&
        Array.isArray(attempt.answers) &&
        typeof attempt.completedAt === 'string'
      ) {
        setAnswers(attempt.answers)
        setRestoredAttempt(attempt)
        setShowResults(true)
      }
    } catch {
      // Malformed attempt — start fresh
    }
  }, [])

  const question = questions[currentIndex]
  const isLastQuestion = currentIndex === questions.length - 1

  function handleOptionClick(optionIdx: number) {
    if (revealed[currentIndex]) return // already answered

    const next = answers.slice()
    next[currentIndex] = optionIdx
    setAnswers(next)

    const nextRevealed = revealed.slice()
    nextRevealed[currentIndex] = true
    setRevealed(nextRevealed)
  }

  function handleAdvance() {
    if (isLastQuestion) {
      const score = answers.reduce<number>((acc, ans, i) => {
        return acc + (ans === questions[i].correct_index ? 1 : 0)
      }, 0) / questions.length

      const attempt: QuizAttempt = {
        score,
        answers,
        completedAt: new Date().toISOString(),
      }

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SAMPLE_QUIZ_ATTEMPT_KEY, JSON.stringify(attempt))
      }

      setRestoredAttempt(attempt)
      setShowResults(true)
      onComplete?.()
    } else {
      setCurrentIndex((i) => i + 1)
    }
  }

  // ── Results screen ─────────────────────────────────────────────────────────

  if (showResults) {
    const attempt = restoredAttempt!
    const correct = Math.round(attempt.score * questions.length)

    return (
      <div className="wp-quiz" data-testid="quiz-view">
        <div className="wp-quiz-results" data-testid="quiz-results">
          <div className="wp-quiz-score" data-testid="quiz-score">
            {correct} / {questions.length}
          </div>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">
            {correct === questions.length
              ? 'Perfect score — well done!'
              : correct >= questions.length / 2
              ? 'Good effort — review the explanations below.'
              : 'Keep going — each attempt builds your recall.'}
          </p>

          {/* Per-question summary */}
          <ol className="mt-6 text-left space-y-3">
            {questions.map((q, i) => {
              const ans = attempt.answers[i]
              const isCorrect = ans === q.correct_index
              return (
                <li
                  key={q.id}
                  className={`wp-quiz-result-item ${isCorrect ? 'wp-quiz-result-item--correct' : 'wp-quiz-result-item--incorrect'}`}
                >
                  <span className="wp-quiz-result-icon" aria-hidden="true">
                    {isCorrect ? '✓' : '✗'}
                  </span>
                  <span className="wp-quiz-result-text">{q.question}</span>
                </li>
              )
            })}
          </ol>

          {/* Navigation CTAs */}
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/sample"
              className="btn-base btn-outline btn-md"
            >
              ← Back to Sample Journey
            </Link>
            <Link
              to="/"
              className="btn-base btn-primary btn-md"
            >
              Start a real journey
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Active question ────────────────────────────────────────────────────────

  const answered   = revealed[currentIndex]
  const userAnswer = answers[currentIndex]
  const isCorrect  = userAnswer === question.correct_index

  return (
    <div className="wp-quiz" data-testid="quiz-view">
      {/* Progress indicator */}
      <p className="text-xs font-semibold uppercase tracking-widest text-[var(--ink-muted)] mb-4">
        Question {currentIndex + 1} of {questions.length}
      </p>

      {/* Question */}
      <p
        className="wp-quiz-question"
        data-testid={`quiz-question-${question.id}`}
      >
        {question.question}
      </p>

      {/* Options */}
      <div className="space-y-2" role="group" aria-label="Answer options">
        {question.options.map((opt, idx) => {
          let extraClass = ''
          if (answered) {
            if (idx === question.correct_index) {
              extraClass = ' wp-quiz-option--correct'
            } else if (idx === userAnswer) {
              extraClass = ' wp-quiz-option--incorrect'
            }
            if (idx === userAnswer) {
              extraClass += ' wp-quiz-option--selected'
            }
          }

          return (
            <button
              key={idx}
              type="button"
              className={`wp-quiz-option${extraClass}`}
              data-testid={`quiz-option-${idx}`}
              onClick={() => handleOptionClick(idx)}
              disabled={answered}
              aria-pressed={answered && idx === userAnswer ? true : undefined}
            >
              <span className="wp-quiz-option-letter" aria-hidden="true">
                {String.fromCharCode(65 + idx)}
              </span>
              {opt}
            </button>
          )
        })}
      </div>

      {/* Feedback — shown immediately after selection */}
      {answered && (
        <div
          className={`wp-quiz-feedback ${isCorrect ? 'wp-quiz-feedback--correct' : ''}`}
          data-testid="quiz-feedback"
          role="status"
          aria-live="polite"
        >
          <strong>{isCorrect ? 'Correct!' : 'Not quite.'}</strong>{' '}
          {question.explanation}
        </div>
      )}

      {/* Advance button — only shown after answering */}
      {answered && (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="btn-base btn-primary btn-md"
            onClick={handleAdvance}
          >
            {isLastQuestion ? 'See Results' : 'Next Question →'}
          </button>
        </div>
      )}
    </div>
  )
}
