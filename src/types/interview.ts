/**
 * Interview domain types — tutor-interview slice.
 *
 * These interfaces mirror the `interview_records` table in
 * migrations/0001_interview_state.sql (snake_case column names).
 * CapturedRecord is the structured output produced when the interview
 * completes; it is extracted from the interview_records row and
 * returned to the client + stored back to the journey record.
 */

/** Progress stage of the consent-gated interview. */
export type InterviewStage =
  | 'consent'
  | 'mission'
  | 'scope'
  | 'prior_knowledge'
  | 'sources'
  | 'complete'
  | 'declined'

/** Lifecycle status of an interview_records row. */
export type InterviewStatus =
  | 'pending'
  | 'complete'
  | 'consent_declined'
  | 'best_effort'

/** One turn in the interview conversation. */
export interface InterviewTurn {
  role: 'user' | 'assistant'
  content: string
  stage: InterviewStage
}

/**
 * Row shape from the interview_records D1 table.
 * All columns are snake_case per project convention.
 */
export interface InterviewRecord {
  id: string
  journey_id: string
  user_id: string
  status: InterviewStatus
  stage: InterviewStage
  turns: string                   // JSON-serialised InterviewTurn[]
  captured_mission: string | null
  captured_scope: string | null
  captured_prior_knowledge: string | null
  captured_source_urls: string    // JSON-serialised string[]
  best_effort: number             // 0 | 1 (SQLite boolean)
  created_at: number              // Unix ms
  updated_at: number              // Unix ms
}

/**
 * Structured capture produced when the interview reaches `complete` or `declined`.
 * Returned by completeInterview() and stored for downstream generation slices.
 */
export interface CapturedRecord {
  mission: string | null
  scope: string | null
  priorKnowledge: string | null
  sourceUrls: string[]
  /** true when the learner declined probing consent; fields may be sparse. */
  bestEffort: boolean
}

/**
 * Per-stage quick-reply chip definitions.
 * The state machine returns the chips for the current stage so
 * the client never calls the model for chip generation.
 */
export const STAGE_CHIPS: Record<InterviewStage, string[]> = {
  consent:        ['Yes, let\'s explore', 'Just use my stated goal'],
  mission:        ['Help me refine it', 'That\'s my goal'],
  scope:          ['Complete beginner', 'Some experience', 'Fairly comfortable'],
  prior_knowledge: ['None at all', 'A little', 'Solid foundation'],
  sources:        ['No preferred sources', 'I have a URL to share'],
  complete:       [],
  declined:       [],
}

/** Return type of sendTurn — what the interview route renders next. */
export interface TurnResponse {
  question: string
  chips: string[]
  stage: InterviewStage
}
