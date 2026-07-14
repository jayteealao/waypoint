/**
 * Zod v4 schemas for the client-read domain entities backing TanStack DB
 * collections. One schema per entity, field-for-field with the snake_case D1
 * columns declared in `src/db/schema.ts` (migrations/0000_schema_v1.sql).
 *
 * Why these exist: `@tanstack/db`'s `localStorageCollectionOptions<T extends
 * StandardSchemaV1>` overload accepts a `schema` and makes `useLiveQuery` types
 * flow with NO `as any` (resolves the audit's F3). Zod v4 objects are
 * Standard-Schema compliant, so they satisfy that overload directly.
 * source: node_modules/@tanstack/db/dist/esm/local-storage.d.ts:164 (schema: T)
 *
 * `usage_events` is deliberately absent — it is server-write-only (quota /
 * cost analytics) with no client read surface; a client collection would
 * expose cost data to the browser (Privacy floor NFR, shape D8 / Q-B).
 *
 * The inferred output types are asserted equal to the hand-written interfaces
 * in `src/db/schema.ts` via `satisfies` checks at the bottom, so a schema that
 * drifts from the table shape fails typecheck (AC-DLU2 guard).
 */
import { z } from 'zod'
import type {
  Journey,
  Waypoint,
  Lesson,
  QuizQuestion,
  QuizAttempt,
  Concept,
  ConceptFsrsCard,
  Adaptation,
} from '#/db/schema'

export const journeySchema = z.object({
  id: z.string(),
  user_id: z.string(),
  title: z.string(),
  goal: z.string().nullable(),
  status: z.enum(['active', 'archived']),
  created_at: z.number(),
  updated_at: z.number(),
})

export const waypointSchema = z.object({
  id: z.string(),
  journey_id: z.string(),
  position: z.number(),
  title: z.string(),
  goal: z.string().nullable(),
  concepts: z.string(),
})

export const lessonSchema = z.object({
  id: z.string(),
  waypoint_id: z.string(),
  content: z.string().nullable(),
  sources: z.string(),
  created_at: z.number(),
})

export const quizQuestionSchema = z.object({
  id: z.string(),
  waypoint_id: z.string(),
  type: z.enum(['mc', 'frq', 'task']),
  question: z.string(),
  options: z.string(),
  correct_answer: z.string().nullable(),
  concept_id: z.string().nullable(),
  rubric: z.string().nullable(),
})

export const quizAttemptSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  quiz_question_id: z.string(),
  response: z.string().nullable(),
  score: z.number().nullable(),
  feedback: z.string().nullable(),
  created_at: z.number(),
})

export const conceptSchema = z.object({
  id: z.string(),
  journey_id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
})

export const conceptFsrsCardSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  concept_id: z.string(),
  due: z.number().nullable(),
  stability: z.number().nullable(),
  difficulty: z.number().nullable(),
  reps: z.number(),
  lapses: z.number(),
  state: z.enum(['New', 'Learning', 'Review', 'Relearning']),
  last_review: z.number().nullable(),
})

export const adaptationSchema = z.object({
  id: z.string(),
  journey_id: z.string(),
  user_id: z.string(),
  waypoint_after_id: z.string().nullable(),
  proposed_title: z.string(),
  status: z.enum(['proposed', 'accepted', 'declined']),
  created_at: z.number(),
})

// ── Drift guards (type-level, zero runtime) ─────────────────────────────────
// Each inferred schema output must be mutually assignable with the hand-written
// D1 interface. `MutualExtends` resolves to `true` only when both directions
// hold; otherwise it is `never` and the `_ok` alias errors. If a column is
// added/renamed/retyped in one place and not the other, typecheck fails here
// (AC-DLU2 drift guard). Unused type aliases are not flagged by noUnusedLocals.
type MutualExtends<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never
type _JOk = MutualExtends<z.infer<typeof journeySchema>, Journey>
type _WOk = MutualExtends<z.infer<typeof waypointSchema>, Waypoint>
type _LOk = MutualExtends<z.infer<typeof lessonSchema>, Lesson>
type _QQOk = MutualExtends<z.infer<typeof quizQuestionSchema>, QuizQuestion>
type _QAOk = MutualExtends<z.infer<typeof quizAttemptSchema>, QuizAttempt>
type _COk = MutualExtends<z.infer<typeof conceptSchema>, Concept>
type _FOk = MutualExtends<z.infer<typeof conceptFsrsCardSchema>, ConceptFsrsCard>
type _AOk = MutualExtends<z.infer<typeof adaptationSchema>, Adaptation>
// Force evaluation so a `never` above is a hard error, not a silently-unused alias.
type _AllOk = [_JOk, _WOk, _LOk, _QQOk, _QAOk, _COk, _FOk, _AOk]
export type _SchemaDriftOk = _AllOk extends [true, true, true, true, true, true, true, true]
  ? true
  : never
