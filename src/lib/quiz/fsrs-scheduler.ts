/**
 * FSRS scheduler — ts-fsrs ↔ D1 bridge.
 *
 * Exports:
 *  - mapDbCardToFsrs   — converts snake_case D1 ConceptFsrsCard to ts-fsrs Card
 *  - mapFsrsToDb       — converts ts-fsrs Card back to D1 field subset
 *  - applyGradeToCard  — reads existing card (or creates via createEmptyCard),
 *                        calls fsrs.repeat() (or skips for Manual sentinel), writes UPSERT
 *  - getDueConceptIds  — SQL query for resurfacing: due concepts from prior waypoints
 *  - computeRetrievability — fsrs.get_retrievability(card, now)
 *
 * FSRS instance configured once at module scope:
 *   request_retention: 0.85, enable_fuzz: true (per shape §Freshness Research A6)
 *
 * Rating.Manual (= 0) is a sentinel meaning "new card, no history" —
 * applyGradeToCard upserts an empty card without updating stability.
 *
 * Rating enum values (ts-fsrs v5.4.1):
 *   Manual=0, Again=1, Hard=2, Good=3, Easy=4
 * State enum values:
 *   New=0, Learning=1, Review=2, Relearning=3
 */

import { FSRS, Rating, State, createEmptyCard } from 'ts-fsrs'
import type { Card } from 'ts-fsrs'
import type { ConceptFsrsCard } from '#/db/schema'

// ─── FSRS singleton (module-scope) ────────────────────────────────────────────

const fsrsInstance = new FSRS({ request_retention: 0.85, enable_fuzz: true })

// ─── State string → enum mapping ─────────────────────────────────────────────

const STATE_MAP: Record<ConceptFsrsCard['state'], State> = {
  New: State.New,
  Learning: State.Learning,
  Review: State.Review,
  Relearning: State.Relearning,
}

const STATE_REVERSE: Record<State, ConceptFsrsCard['state']> = {
  [State.New]: 'New',
  [State.Learning]: 'Learning',
  [State.Review]: 'Review',
  [State.Relearning]: 'Relearning',
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

/**
 * Convert a D1 ConceptFsrsCard row to a ts-fsrs Card for scheduling calls.
 *
 * Null numeric fields (new cards before any review) are mapped to 0.
 * elapsed_days, scheduled_days, and learning_steps are not stored in D1;
 * they are zero-initialised and recalculated by ts-fsrs on repeat().
 */
export function mapDbCardToFsrs(row: ConceptFsrsCard): Card {
  return {
    due: row.due !== null ? new Date(row.due) : new Date(),
    stability: row.stability ?? 0,
    difficulty: row.difficulty ?? 0,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: row.reps,
    lapses: row.lapses,
    state: STATE_MAP[row.state] ?? State.New,
    last_review: row.last_review !== null ? new Date(row.last_review) : undefined,
  }
}

/**
 * Convert a ts-fsrs Card back to the D1 field subset for upsert.
 *
 * Omits id, user_id, concept_id — the caller supplies those for the WHERE clause.
 */
export function mapFsrsToDb(card: Card): Omit<ConceptFsrsCard, 'id' | 'user_id' | 'concept_id'> {
  return {
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    reps: card.reps,
    lapses: card.lapses,
    state: STATE_REVERSE[card.state] ?? 'New',
    last_review: card.last_review?.getTime() ?? null,
  }
}

// ─── Core scheduling operation ────────────────────────────────────────────────

/**
 * Read the existing FSRS card for (userId, conceptId), apply a grade, and
 * write the updated card back via UPSERT.
 *
 * Rating.Manual is a sentinel for "new card, no history": upserts an empty
 * card (New state, all zeros) without calling fsrs.repeat(). Use this to
 * initialise cards without consuming a review slot.
 *
 * For all other ratings (Again, Hard, Good, Easy), calls fsrs.repeat() and
 * writes the result for that rating.
 */
export async function applyGradeToCard(
  db: D1Database,
  userId: string,
  conceptId: string,
  rating: Rating,
  serverNow: Date,
): Promise<void> {
  if (rating === Rating.Manual) {
    // Sentinel: initialise only if no card exists yet
    const existing = await db
      .prepare(
        `SELECT id FROM concept_fsrs_cards WHERE user_id = ? AND concept_id = ? LIMIT 1`,
      )
      .bind(userId, conceptId)
      .first<{ id: string }>()

    if (!existing) {
      const emptyCard = createEmptyCard(serverNow)
      const fields = mapFsrsToDb(emptyCard)
      const id = crypto.randomUUID()
      await db
        .prepare(
          `INSERT INTO concept_fsrs_cards (id, user_id, concept_id, due, stability, difficulty, reps, lapses, state, last_review)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          userId,
          conceptId,
          fields.due,
          fields.stability,
          fields.difficulty,
          fields.reps,
          fields.lapses,
          fields.state,
          fields.last_review,
        )
        .run()
    }
    return
  }

  // Grade is a real rating — read existing card (or create empty base)
  const existing = await db
    .prepare(
      `SELECT * FROM concept_fsrs_cards WHERE user_id = ? AND concept_id = ? LIMIT 1`,
    )
    .bind(userId, conceptId)
    .first<ConceptFsrsCard>()

  const baseCard: Card = existing
    ? mapDbCardToFsrs(existing)
    : createEmptyCard(serverNow)

  // ts-fsrs repeat() returns a RecordLog keyed by Grade (Again=1..Easy=4)
  const recordLog = fsrsInstance.repeat(baseCard, serverNow)
  const result = recordLog[rating as unknown as keyof typeof recordLog]
  if (!result) {
    throw new Error(`fsrs.repeat() returned no result for rating ${rating}`)
  }
  const updatedCard = (result as { card: Card }).card
  const fields = mapFsrsToDb(updatedCard)

  if (existing) {
    await db
      .prepare(
        `UPDATE concept_fsrs_cards
         SET due = ?, stability = ?, difficulty = ?, reps = ?, lapses = ?, state = ?, last_review = ?
         WHERE id = ?`,
      )
      .bind(
        fields.due,
        fields.stability,
        fields.difficulty,
        fields.reps,
        fields.lapses,
        fields.state,
        fields.last_review,
        existing.id,
      )
      .run()
  } else {
    const id = crypto.randomUUID()
    await db
      .prepare(
        `INSERT INTO concept_fsrs_cards (id, user_id, concept_id, due, stability, difficulty, reps, lapses, state, last_review)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        userId,
        conceptId,
        fields.due,
        fields.stability,
        fields.difficulty,
        fields.reps,
        fields.lapses,
        fields.state,
        fields.last_review,
      )
      .run()
  }
}

// ─── Resurfacing query ────────────────────────────────────────────────────────

/**
 * Return concept IDs that are due for review (due <= serverNow) for this user,
 * from earlier waypoints in the journey (excluding current waypoint's concepts).
 *
 * Uses the `fsrs_user_due_idx ON concept_fsrs_cards(user_id, due)` index for
 * efficient lookup. The join on concepts.journey_id and exclusion of the current
 * waypoint's concepts are selective at v1 scale (< 200 rows per user).
 *
 * @param limit  Maximum number of resurfacing concepts to return (default: 2).
 */
export async function getDueConceptIds(
  db: D1Database,
  userId: string,
  journeyId: string,
  currentWaypointId: string,
  limit = 2,
): Promise<string[]> {
  const nowMs = Date.now()
  const result = await db
    .prepare(
      `SELECT c.id
       FROM concepts c
       JOIN concept_fsrs_cards fc ON fc.concept_id = c.id
       WHERE c.journey_id = ?
         AND fc.user_id = ?
         AND fc.due <= ?
         AND c.id NOT IN (
           SELECT concept_id FROM quiz_questions
           WHERE waypoint_id = ? AND concept_id IS NOT NULL
         )
       ORDER BY fc.due ASC
       LIMIT ?`,
    )
    .bind(journeyId, userId, nowMs, currentWaypointId, limit)
    .all<{ id: string }>()
  return result.results.map((r) => r.id)
}

// ─── Retrievability ───────────────────────────────────────────────────────────

/**
 * Compute the probability that the learner can recall a concept right now.
 *
 * Returns a value in [0, 1]. Returns ~1.0 immediately after a Good/Easy review.
 * New cards (no review history) return 1.0 by convention (they haven't been forgotten).
 *
 * @param card  The ConceptFsrsCard D1 row.
 * @param now   Current timestamp in milliseconds.
 */
export function computeRetrievability(card: ConceptFsrsCard, now: number): number {
  if (card.state === 'New' || card.last_review === null) {
    return 1.0
  }
  const fsrsCard = mapDbCardToFsrs(card)
  const r = fsrsInstance.get_retrievability(fsrsCard, new Date(now), false)
  return typeof r === 'number' ? r : 0
}
