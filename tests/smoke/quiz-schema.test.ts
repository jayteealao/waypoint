// @vitest-environment node
/**
 * Unit tests for quiz schema validation and prompt builders.
 *
 * Tests (8):
 *  1. validateQuizQuestion accepts a valid 4-option MC question with equal-length options.
 *  2. Rejects missing "question" field.
 *  3. Rejects MC with options.length !== 4.
 *  4. MC lint: rejects when one option is >10% longer in word count than the shortest.
 *  5. MC lint: accepts options within 10% word count tolerance.
 *  6. FRQ question with valid rubric passes.
 *  7. FRQ question without rubric fails.
 *  8. buildQuizPrompt returns a non-empty string containing the concept name.
 */

import { describe, it, expect } from 'vitest'
import {
  validateQuizQuestion,
  lintMcOptionLengths,
  buildQuizPrompt,
  buildGradingPrompt,
  QuizValidationError,
} from '#/lib/quiz/schema'
import type { QuizQuestion } from '#/db/schema'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const validMcQuestion = {
  type: 'mc' as const,
  question: 'What is the primary purpose of the event loop in Node.js?',
  options: [
    'To handle async operations without blocking the main thread',
    'To schedule CPU-intensive tasks across multiple worker threads',
    'To provide a synchronous interface for file system operations',
    'To manage memory allocation for heap-stored JavaScript objects',
  ],
  correct_answer: 'To handle async operations without blocking the main thread',
  concept_tag: 'Event Loop',
  explanations: {
    '0': 'Correct — the event loop enables non-blocking I/O.',
    '1': 'Incorrect — worker threads are a separate mechanism.',
    '2': 'Incorrect — fs operations are asynchronous by default.',
    '3': 'Incorrect — memory allocation is managed by V8, not the event loop.',
  },
}

const validFrqQuestion = {
  type: 'frq' as const,
  question: 'Explain why Promises are an improvement over callback-based async code.',
  options: [],
  correct_answer: null,
  concept_tag: 'Promises',
  explanations: {},
  rubric: '0: No mention of callbacks or Promises. 1: Identifies the benefit but misses specifics. 2: Explains callback hell and how Promises provide chaining and better error handling.',
}

// ── Test 1: Valid MC question ─────────────────────────────────────────────────

describe('validateQuizQuestion — MC (test 1)', () => {
  it('accepts a valid 4-option MC question with equal-length options', () => {
    const result = validateQuizQuestion(validMcQuestion)
    expect(result.type).toBe('mc')
    expect(result.question).toBe(validMcQuestion.question)
    expect(result.options).toHaveLength(4)
    expect(result.correct_answer).toBe(validMcQuestion.correct_answer)
    expect(result.concept_tag).toBe('Event Loop')
  })
})

// ── Test 2: Missing "question" field ─────────────────────────────────────────

describe('validateQuizQuestion — missing fields (test 2)', () => {
  it('throws QuizValidationError when "question" field is missing', () => {
    const invalid = { ...validMcQuestion, question: undefined }
    expect(() => validateQuizQuestion(invalid)).toThrow(QuizValidationError)
  })

  it('throws QuizValidationError when "question" field is an empty string', () => {
    const invalid = { ...validMcQuestion, question: '' }
    expect(() => validateQuizQuestion(invalid)).toThrow(QuizValidationError)
  })

  it('throws QuizValidationError when "type" is invalid', () => {
    const invalid = { ...validMcQuestion, type: 'task' }
    expect(() => validateQuizQuestion(invalid)).toThrow(QuizValidationError)
  })

  it('throws QuizValidationError when "concept_tag" is missing', () => {
    const invalid = { ...validMcQuestion, concept_tag: '' }
    expect(() => validateQuizQuestion(invalid)).toThrow(QuizValidationError)
  })
})

// ── Test 3: MC options count ─────────────────────────────────────────────────

describe('validateQuizQuestion — MC options count (test 3)', () => {
  it('rejects MC question with 3 options', () => {
    const invalid = { ...validMcQuestion, options: validMcQuestion.options.slice(0, 3) }
    expect(() => validateQuizQuestion(invalid)).toThrow(QuizValidationError)
  })

  it('rejects MC question with 5 options', () => {
    const invalid = {
      ...validMcQuestion,
      options: [...validMcQuestion.options, 'Fifth option that should not exist here'],
    }
    expect(() => validateQuizQuestion(invalid)).toThrow(QuizValidationError)
  })

  it('rejects MC question with empty options array', () => {
    const invalid = { ...validMcQuestion, options: [] }
    expect(() => validateQuizQuestion(invalid)).toThrow(QuizValidationError)
  })
})

// ── Test 4: MC lint — rejects unequal lengths ─────────────────────────────────

describe('lintMcOptionLengths — rejects options >10% longer (test 4)', () => {
  it('rejects when one option is significantly longer than the others', () => {
    const options = [
      'Short answer here',   // 3 words
      'Short answer too',    // 3 words
      'Short answer one',    // 3 words
      'This option is much longer than any of the three other options so it should fail the lint gate', // way more than 3 × 1.1
    ]
    const result = lintMcOptionLengths(options)
    expect(result).not.toBeNull()
    expect(result).toContain('word count')
  })

  it('validateQuizQuestion throws on MC lint failure', () => {
    const invalid = {
      ...validMcQuestion,
      options: [
        'Short',
        'Short two',
        'Short three',
        'This option is considerably longer than the short ones and must fail the lint gate for equal lengths',
      ],
    }
    expect(() => validateQuizQuestion(invalid)).toThrow(QuizValidationError)
  })
})

// ── Test 5: MC lint — accepts within 10% tolerance ────────────────────────────

describe('lintMcOptionLengths — accepts within tolerance (test 5)', () => {
  it('accepts 4 options with the same word count', () => {
    const options = [
      'Alpha beta gamma delta',
      'Alpha beta gamma zeta',
      'Alpha beta gamma theta',
      'Alpha beta gamma omega',
    ]
    const result = lintMcOptionLengths(options)
    expect(result).toBeNull()
  })

  it('accepts options where longest is exactly at the 10% boundary', () => {
    // Shortest: 10 words. 10% of 10 = 1. So max allowed = 11 words.
    const shortest = 'one two three four five six seven eight nine ten'         // 10 words
    const atBoundary = 'one two three four five six seven eight nine ten eleven' // 11 words
    const options = [shortest, shortest, shortest, atBoundary]
    const result = lintMcOptionLengths(options)
    expect(result).toBeNull()
  })

  it('the valid fixture passes lint', () => {
    const result = lintMcOptionLengths(validMcQuestion.options)
    expect(result).toBeNull()
  })
})

// ── Test 6: FRQ with valid rubric ─────────────────────────────────────────────

describe('validateQuizQuestion — FRQ with rubric (test 6)', () => {
  it('accepts a valid FRQ question with a non-empty rubric', () => {
    const result = validateQuizQuestion(validFrqQuestion)
    expect(result.type).toBe('frq')
    expect(result.rubric).toBeTruthy()
    expect(result.correct_answer).toBeNull()
    expect(result.options).toHaveLength(0)
  })
})

// ── Test 7: FRQ without rubric fails ─────────────────────────────────────────

describe('validateQuizQuestion — FRQ without rubric (test 7)', () => {
  it('rejects a FRQ question with a missing rubric', () => {
    const invalid = { ...validFrqQuestion, rubric: undefined }
    expect(() => validateQuizQuestion(invalid)).toThrow(QuizValidationError)
  })

  it('rejects a FRQ question with an empty rubric string', () => {
    const invalid = { ...validFrqQuestion, rubric: '' }
    expect(() => validateQuizQuestion(invalid)).toThrow(QuizValidationError)
  })
})

// ── Test 8: buildQuizPrompt ────────────────────────────────────────────────────

describe('buildQuizPrompt (test 8)', () => {
  it('returns a non-empty string containing the concept name', () => {
    const prompt = buildQuizPrompt('Async/Await', 'Intro to TypeScript — understand the basics')
    expect(typeof prompt).toBe('string')
    expect(prompt.length).toBeGreaterThan(0)
    expect(prompt).toContain('Async/Await')
  })

  it('includes the question type in the prompt', () => {
    const mcPrompt  = buildQuizPrompt('Promises', 'JS Async — why promises matter', 'mc')
    const frqPrompt = buildQuizPrompt('Promises', 'JS Async — why promises matter', 'frq')
    expect(mcPrompt).toContain('mc')
    expect(frqPrompt).toContain('frq')
  })

  it('defaults to mc when no type is specified', () => {
    const prompt = buildQuizPrompt('Event Loop', 'Node.js — event loop explained')
    expect(prompt).toContain('mc')
  })
})

// ── buildGradingPrompt ────────────────────────────────────────────────────────

describe('buildGradingPrompt', () => {
  it('returns a string containing the question text and rubric', () => {
    const question: QuizQuestion = {
      id: 'q-1',
      waypoint_id: 'wp-1',
      type: 'frq',
      question: 'Explain async/await in your own words.',
      options: '[]',
      correct_answer: null,
      concept_id: null,
      rubric: '0: Incorrect. 1: Partial. 2: Complete explanation.',
    }
    const prompt = buildGradingPrompt(question, 'async/await lets you write async code like sync code')
    expect(prompt).toContain('Explain async/await')
    expect(prompt).toContain('0: Incorrect')
    expect(prompt).toContain('async/await lets you write async code like sync code')
  })

  it('handles an empty learner response gracefully', () => {
    const question: QuizQuestion = {
      id: 'q-2',
      waypoint_id: 'wp-1',
      type: 'frq',
      question: 'What is a closure?',
      options: '[]',
      correct_answer: null,
      concept_id: null,
      rubric: '0: Incorrect. 1: Partial. 2: Correct.',
    }
    const prompt = buildGradingPrompt(question, '')
    expect(prompt).toContain('(empty)')
  })
})
