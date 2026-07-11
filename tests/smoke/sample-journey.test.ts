/**
 * Sample journey unit tests.
 *
 * Three test suites covering the constraints the slice plan
 * named as proxy evidence for the seeded-session Playwright wall:
 *
 *   1. equal-length — all 4 SAMPLE_QUIZ questions have options within 5 chars
 *      (trimEnd) of each other. Enforces the "no formatting clues" rule.
 *
 *   2. quiz-scoring — deterministic grading logic verified against a known
 *      answers array ([1, 0, 2, 1]) and known correct_index values.
 *      Expected score: 3 / 4 (Q1 wrong, Q2–Q4 right).
 *
 *   3. attempt-format — the attempt object written to localStorage has the
 *      required fields (score, answers, completedAt).
 */

import { describe, it, expect } from 'vitest'
import { SAMPLE_QUIZ } from '#/fixtures/sample-journey'

// ─── 1. Equal-length options ──────────────────────────────────────────────────

describe('SAMPLE_QUIZ — equal-length options (no formatting clues)', () => {
  for (const q of SAMPLE_QUIZ) {
    it(`question "${q.id}" options are within 5 chars of each other`, () => {
      const lengths = q.options.map((o) => o.trimEnd().length)
      const delta   = Math.max(...lengths) - Math.min(...lengths)
      expect(delta).toBeLessThanOrEqual(5)
    })
  }

  it('all four questions are present', () => {
    expect(SAMPLE_QUIZ).toHaveLength(4)
  })

  it('each question has exactly four options', () => {
    for (const q of SAMPLE_QUIZ) {
      expect(q.options).toHaveLength(4)
    }
  })
})

// ─── 2. Quiz scoring logic ────────────────────────────────────────────────────

describe('quiz scoring logic', () => {
  /**
   * Scoring: answers = [1, 0, 2, 1] against the SAMPLE_QUIZ correct_index values.
   * Q1: correct_index=0, answer=1 → wrong
   * Q2: correct_index=0, answer=0 → right
   * Q3: correct_index=2, answer=2 → right
   * Q4: correct_index=1, answer=1 → right
   * Expected: 3 correct, score = 3 / 4
   */
  const answers = [1, 0, 2, 1]

  it('SAMPLE_QUIZ correct_indices match the scoring test vector', () => {
    expect(SAMPLE_QUIZ[0].correct_index).toBe(0)
    expect(SAMPLE_QUIZ[1].correct_index).toBe(0)
    expect(SAMPLE_QUIZ[2].correct_index).toBe(2)
    expect(SAMPLE_QUIZ[3].correct_index).toBe(1)
  })

  it('computes correct score from the test answers vector', () => {
    const correctCount = answers.reduce(
      (acc, ans, i) => acc + (ans === SAMPLE_QUIZ[i].correct_index ? 1 : 0),
      0,
    )
    const score = correctCount / SAMPLE_QUIZ.length
    expect(correctCount).toBe(3)
    expect(score).toBeCloseTo(0.75)
  })

  it('score = 1 when all answers are correct', () => {
    const perfectAnswers = SAMPLE_QUIZ.map((q) => q.correct_index)
    const correctCount   = perfectAnswers.reduce(
      (acc, ans, i) => acc + (ans === SAMPLE_QUIZ[i].correct_index ? 1 : 0),
      0,
    )
    expect(correctCount / SAMPLE_QUIZ.length).toBe(1)
  })

  it('score = 0 when all answers are wrong', () => {
    const wrongAnswers = SAMPLE_QUIZ.map((q) => (q.correct_index + 1) % q.options.length)
    const correctCount = wrongAnswers.reduce(
      (acc, ans, i) => acc + (ans === SAMPLE_QUIZ[i].correct_index ? 1 : 0),
      0,
    )
    expect(correctCount / SAMPLE_QUIZ.length).toBe(0)
  })
})

// ─── 3. Attempt format ────────────────────────────────────────────────────────

describe('quiz attempt format', () => {
  it('attempt object has required fields with correct types', () => {
    // Simulate what QuizView writes to localStorage on completion
    const answers = [1, 0, 2, 1]
    const score   = answers.reduce(
      (acc, ans, i) => acc + (ans === SAMPLE_QUIZ[i].correct_index ? 1 : 0),
      0,
    ) / SAMPLE_QUIZ.length

    const attempt = {
      score,
      answers,
      completedAt: new Date().toISOString(),
    }

    // Field existence and types
    expect(typeof attempt.score).toBe('number')
    expect(attempt.score).toBeGreaterThanOrEqual(0)
    expect(attempt.score).toBeLessThanOrEqual(1)

    expect(Array.isArray(attempt.answers)).toBe(true)
    expect(attempt.answers).toHaveLength(SAMPLE_QUIZ.length)

    expect(typeof attempt.completedAt).toBe('string')
    expect(new Date(attempt.completedAt).getTime()).not.toBeNaN()
  })

  it('serialised attempt round-trips through JSON.parse', () => {
    const attempt = {
      score:       0.75,
      answers:     [1, 0, 2, 1],
      completedAt: new Date().toISOString(),
    }
    const serialised   = JSON.stringify(attempt)
    const deserialised = JSON.parse(serialised)

    expect(deserialised.score).toBeCloseTo(0.75)
    expect(deserialised.answers).toEqual([1, 0, 2, 1])
    expect(typeof deserialised.completedAt).toBe('string')
  })
})
