/**
 * TypeScript interfaces mirroring every domain table in migrations/0000_schema_v1.sql.
 * better-auth tables (user, session, account, verification) are typed by the
 * better-auth package; they are NOT duplicated here.
 *
 * Column naming follows the SQL schema exactly (snake_case).
 * D1 type conventions: TEXT → string, INTEGER → number, REAL → number.
 * Nullable columns are typed as `T | null`.
 */

/** A learning journey owned by a single user. */
export interface Journey {
  id: string;
  user_id: string;
  title: string;
  goal: string | null;
  status: "active" | "archived";
  created_at: number; // Unix ms
  updated_at: number; // Unix ms
}

/** An ordered waypoint (milestone) within a journey. */
export interface Waypoint {
  id: string;
  journey_id: string;
  position: number;
  title: string;
  goal: string | null;
  concepts: string; // JSON array of concept names, e.g. '["Async/Await", "Promises"]'
}

/** A generated lesson attached to a waypoint. */
export interface Lesson {
  id: string;
  waypoint_id: string;
  content: string | null;
  sources: string; // JSON array of source URLs/titles
  created_at: number; // Unix ms
}

/** A quiz question; type column extensible to future 'task' type. */
export interface QuizQuestion {
  id: string;
  waypoint_id: string;
  type: "mc" | "frq" | "task";
  question: string;
  options: string; // JSON array for MC choices
  correct_answer: string | null;
  concept_id: string | null;
  rubric: string | null;
}

/** A user's attempt at a quiz question. */
export interface QuizAttempt {
  id: string;
  user_id: string;
  quiz_question_id: string;
  response: string | null;
  score: number | null;
  feedback: string | null;
  created_at: number; // Unix ms
}

/** A concept node in the knowledge graph for a journey. */
export interface Concept {
  id: string;
  journey_id: string;
  name: string;
  description: string | null;
}

/**
 * FSRS scheduling card for a concept.
 * Seven fields per ts-fsrs v5.4.1 (FSRS-6) Card shape.
 * Field names use snake_case (SQL) → ts-fsrs uses camelCase; the quiz-fsrs slice bridges them.
 */
export interface ConceptFsrsCard {
  id: string;
  user_id: string;
  concept_id: string;
  due: number | null; // next review timestamp (ms) — ts-fsrs: due
  stability: number | null; // memory stability — ts-fsrs: stability
  difficulty: number | null; // retrievability difficulty — ts-fsrs: difficulty
  reps: number; // total reviews — ts-fsrs: reps
  lapses: number; // lapse count — ts-fsrs: lapses
  state: "New" | "Learning" | "Review" | "Relearning"; // ts-fsrs: state
  last_review: number | null; // last review timestamp (ms) — ts-fsrs: lastReview
}

/**
 * An adaptation proposal generated after a weak quiz result.
 * status: 'proposed' → the card is visible to the learner.
 * status: 'accepted' → the review waypoint was inserted into the roadmap.
 * status: 'declined' → the learner skipped the proposal; roadmap unchanged.
 * At most one 'proposed' row per journey at a time.
 */
export interface Adaptation {
  id: string;
  journey_id: string;
  user_id: string;
  waypoint_after_id: string | null;
  proposed_title: string;
  status: "proposed" | "accepted" | "declined";
  created_at: number; // Unix ms
}

/**
 * Usage event for cost attribution and quota enforcement.
 * Schema matches 04b-instrument.md design (ai-gateway slice inserts here).
 */
export interface UsageEvent {
  id: string;
  user_id: string;
  journey_id: string | null;
  model: string;
  type: "interview" | "lesson" | "quiz" | "roadmap";
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  duration_ms: number;
  outcome: string; // 'success' | 'failure'
  at: string; // ISO-8601 string (D1 datetime default)
}
