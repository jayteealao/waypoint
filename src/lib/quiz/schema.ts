/**
 * Quiz output types, JSON schemas, validation, and prompt builders.
 *
 * This module is the single source of truth for:
 *  - TypeScript interfaces for model responses (QuizQuestionOutput, GradingOutput)
 *  - JSON Schema objects passed to callGateway as responseFormat
 *  - Pure validation functions (validateQuizQuestion, validateGrading)
 *  - MC equal-length lint gate (word count within 10% tolerance)
 *  - Prompt builder functions (buildQuizPrompt, buildGradingPrompt)
 *
 * All exports are pure (no side effects, no DB, no gateway calls).
 */

import type { QuizQuestion } from '#/db/schema'

// ─── TypeScript interfaces for model responses ────────────────────────────────

/** The model's response shape for one quiz question. */
export interface QuizQuestionOutput {
  type: 'mc' | 'frq'
  question: string
  /** 4 options for MC; empty array for FRQ. */
  options: string[]
  /** Verbatim correct option text for MC; null for FRQ. */
  correct_answer: string | null
  concept_tag: string
  /** Per-option explanations keyed by option index (string) for MC; empty for FRQ. */
  explanations: Record<string, string>
  /** Rubric string for FRQ; undefined or null for MC. */
  rubric?: string | null
}

/** The model's grading response shape for one free-response answer. */
export interface GradingOutput {
  verdict: 'correct' | 'incorrect' | 'partial'
  score: 0 | 1 | 2
  feedback: string
}

// ─── JSON Schemas (passed to callGateway responseFormat) ─────────────────────

/** JSON Schema for quiz question generation — used as callGateway responseFormat. */
export const QUIZ_QUESTION_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: ['type', 'question', 'options', 'correct_answer', 'concept_tag', 'explanations'],
  properties: {
    type: { type: 'string', enum: ['mc', 'frq'] },
    question: { type: 'string', minLength: 10 },
    options: {
      type: 'array',
      items: { type: 'string' },
    },
    correct_answer: { type: ['string', 'null'] },
    concept_tag: { type: 'string', minLength: 1 },
    explanations: {
      type: 'object',
      additionalProperties: { type: 'string' },
    },
    rubric: { type: ['string', 'null'] },
  },
  additionalProperties: false,
}

/** JSON Schema for grading responses — used as callGateway responseFormat. */
export const GRADING_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: ['verdict', 'score', 'feedback'],
  properties: {
    verdict: { type: 'string', enum: ['correct', 'incorrect', 'partial'] },
    score: { type: 'integer', enum: [0, 1, 2] },
    feedback: { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
}

// ─── MC equal-length lint ─────────────────────────────────────────────────────

/** Count words in a string using whitespace splitting. */
function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length
}

/**
 * Lint MC options for roughly equal word count (within 10% of the shortest).
 *
 * Returns null if all options pass, or an error string describing the violation.
 */
export function lintMcOptionLengths(options: string[]): string | null {
  if (options.length !== 4) {
    return `MC question must have exactly 4 options; got ${options.length}`
  }
  const counts = options.map(wordCount)
  const shortest = Math.min(...counts)
  const threshold = Math.ceil(shortest * 1.1)
  for (let i = 0; i < counts.length; i++) {
    if (counts[i]! > threshold) {
      return (
        `Option ${i} word count ${counts[i]} exceeds 10% of shortest (${shortest}); ` +
        `threshold is ${threshold}. Lengths: [${counts.join(', ')}]`
      )
    }
  }
  return null
}

// ─── Validation ──────────────────────────────────────────────────────────────

/** Thrown when quiz question validation fails. */
export class QuizValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QuizValidationError'
  }
}

/**
 * Validate and normalise a raw model response for one quiz question.
 *
 * Checks:
 * - All required fields present with correct types
 * - MC: exactly 4 options; options within 10% word count of shortest
 * - FRQ: rubric field present and non-empty
 *
 * @throws {QuizValidationError} on any violation.
 */
export function validateQuizQuestion(value: unknown): QuizQuestionOutput {
  if (typeof value !== 'object' || value === null) {
    throw new QuizValidationError('Quiz question must be a JSON object')
  }
  const obj = value as Record<string, unknown>

  // Required fields
  if (typeof obj['question'] !== 'string' || !obj['question']) {
    throw new QuizValidationError('Missing or empty "question" field')
  }
  if (obj['type'] !== 'mc' && obj['type'] !== 'frq') {
    throw new QuizValidationError(`Invalid "type"; must be "mc" or "frq", got ${String(obj['type'])}`)
  }
  if (!Array.isArray(obj['options'])) {
    throw new QuizValidationError('"options" must be an array')
  }
  if (typeof obj['concept_tag'] !== 'string' || !obj['concept_tag']) {
    throw new QuizValidationError('Missing or empty "concept_tag" field')
  }
  if (typeof obj['explanations'] !== 'object' || obj['explanations'] === null || Array.isArray(obj['explanations'])) {
    throw new QuizValidationError('"explanations" must be a non-array object')
  }

  const options = obj['options'] as unknown[]

  if (obj['type'] === 'mc') {
    // MC-specific validation
    if (options.length !== 4) {
      throw new QuizValidationError(`MC question must have exactly 4 options; got ${options.length}`)
    }
    for (let i = 0; i < options.length; i++) {
      if (typeof options[i] !== 'string') {
        throw new QuizValidationError(`Option ${i} must be a string`)
      }
    }
    if (typeof obj['correct_answer'] !== 'string' || !obj['correct_answer']) {
      throw new QuizValidationError('MC question must have a non-empty "correct_answer" string')
    }
    // MC equal-length lint
    const lintError = lintMcOptionLengths(options as string[])
    if (lintError) {
      throw new QuizValidationError(lintError)
    }
  } else {
    // FRQ-specific validation
    if (typeof obj['rubric'] !== 'string' || !obj['rubric']) {
      throw new QuizValidationError('FRQ question must have a non-empty "rubric" field')
    }
  }

  return {
    type: obj['type'] as 'mc' | 'frq',
    question: obj['question'] as string,
    options: options as string[],
    correct_answer: (obj['correct_answer'] as string | null) ?? null,
    concept_tag: obj['concept_tag'] as string,
    explanations: obj['explanations'] as Record<string, string>,
    rubric: (obj['rubric'] as string | undefined | null) ?? null,
  }
}

/**
 * Validate a raw model response for grading.
 * @throws {QuizValidationError} on any violation.
 */
export function validateGrading(value: unknown): GradingOutput {
  if (typeof value !== 'object' || value === null) {
    throw new QuizValidationError('Grading response must be a JSON object')
  }
  const obj = value as Record<string, unknown>

  if (obj['verdict'] !== 'correct' && obj['verdict'] !== 'incorrect' && obj['verdict'] !== 'partial') {
    throw new QuizValidationError(
      `Invalid "verdict"; must be "correct", "incorrect", or "partial"; got ${String(obj['verdict'])}`,
    )
  }
  if (obj['score'] !== 0 && obj['score'] !== 1 && obj['score'] !== 2) {
    throw new QuizValidationError(`Invalid "score"; must be 0, 1, or 2; got ${String(obj['score'])}`)
  }
  if (typeof obj['feedback'] !== 'string' || !obj['feedback']) {
    throw new QuizValidationError('Missing or empty "feedback" field')
  }

  return {
    verdict: obj['verdict'] as 'correct' | 'incorrect' | 'partial',
    score: obj['score'] as 0 | 1 | 2,
    feedback: obj['feedback'] as string,
  }
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

/**
 * Build the user message for quiz question generation.
 *
 * @param conceptName  The concept being tested (from waypoint.concepts array).
 * @param waypointContext  The waypoint title and goal for context calibration.
 * @param questionType  'mc' or 'frq'; defaults to 'mc'.
 */
export function buildQuizPrompt(
  conceptName: string,
  waypointContext: string,
  questionType: 'mc' | 'frq' = 'mc',
): string {
  return [
    `Concept to test: ${conceptName}`,
    `Waypoint context: ${waypointContext}`,
    `Question type: ${questionType}`,
    '',
    'Generate one quiz question for this concept. Follow the output JSON schema exactly.',
  ].join('\n')
}

/**
 * Build the user message for grading a free-response answer.
 *
 * @param question  The quiz_questions D1 row.
 * @param response  The learner's answer text.
 */
export function buildGradingPrompt(question: QuizQuestion, response: string): string {
  return [
    `Question: ${question.question}`,
    `Rubric: ${question.rubric ?? 'Score 0 if incorrect, 1 if partial, 2 if fully correct.'}`,
    '',
    `Learner answer: ${response || '(empty)'}`,
    '',
    'Grade this answer. Follow the output JSON schema exactly.',
  ].join('\n')
}
