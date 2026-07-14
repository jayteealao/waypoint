/**
 * Progress server functions — expose learner progress data for routes.
 *
 * Two server functions, both with `withSession` middleware (requireAuth):
 *
 *   getJourneyProgress         — full progress panel data for one journey
 *   getProgressForDashboard    — per-journey mastery summary (bulk, for dashboard)
 *
 * Both use the existing pattern from journeys.ts / quiz.ts.
 */

import { createServerFn, createMiddleware } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'
import { requireAuth, requireOwnership } from '#/lib/auth-guard'
import { computeRetrievability } from '#/lib/quiz/fsrs-scheduler'
import {
  computeStreak,
  groupMasteryByWaypoint,
} from '#/lib/progress/metrics'
import type { Waypoint, QuizAttempt, ConceptFsrsCard, Adaptation } from '#/db/schema'

// ─── withSession middleware (standard pattern) ────────────────────────────────

const withSession = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const sessionData = await requireAuth(env, getRequest())
    return next({ context: { session: sessionData } })
  },
)

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JourneyProgress {
  waypoints:          Waypoint[]
  completionStatus:   Record<string, boolean>   // waypointId → any attempt score ≥ 1
  masteryByWaypoint:  Record<string, number>    // waypointId → 0–100 pct
  quizHistory:        Array<{
    waypointId:    string
    waypointTitle: string
    date:          number    // Unix ms
    score:         number | null
  }>
  streak:             number
  dueCount:           number
  pendingAdaptation:  Adaptation | null
}

// ─── getJourneyProgress ───────────────────────────────────────────────────────

/**
 * Return everything the ProgressPanel needs for a single journey in one call.
 *
 * Verifies journey ownership, then queries in parallel:
 *  - All waypoints ordered by position
 *  - All quiz_attempts for this user in this journey (via quiz_questions → waypoints)
 *  - All FSRS cards for this user in this journey (via concepts)
 *    with a correlated subquery for the primary waypoint_id per concept
 *  - Count of due concepts (due ≤ now)
 *  - Any pending adaptation proposal
 */
export const getJourneyProgress = createServerFn()
  .middleware([withSession])
  .validator((journeyId: string) => journeyId)
  .handler(async ({ data: journeyId, context }): Promise<JourneyProgress> => {
    const { session } = context as { session: Awaited<ReturnType<typeof requireAuth>> }
    const userId = session.user.id
    const nowMs  = Date.now()

    // Verify ownership
    const journey = await env.DB.prepare('SELECT user_id FROM journeys WHERE id = ?')
      .bind(journeyId)
      .first<{ user_id: string }>()
    if (!journey) throw new Response(null, { status: 404 })
    requireOwnership(userId, journey.user_id)

    // ── Parallel queries ──────────────────────────────────────────────────────

    const [
      waypointsResult,
      attemptsResult,
      fsrsResult,
      dueRow,
      adaptationResult,
    ] = await Promise.all([
      // 1. All waypoints ordered by position
      env.DB.prepare('SELECT * FROM waypoints WHERE journey_id = ? ORDER BY position ASC')
        .bind(journeyId)
        .all<Waypoint>(),

      // 2. All quiz attempts for this user × journey (join through quiz_questions → waypoints)
      env.DB.prepare(`
        SELECT qa.id, qa.user_id, qa.quiz_question_id, qa.response, qa.score,
               qa.feedback, qa.created_at,
               w.id AS waypoint_id, w.title AS waypoint_title
        FROM quiz_attempts qa
        JOIN quiz_questions qq ON qq.id = qa.quiz_question_id
        JOIN waypoints w       ON w.id  = qq.waypoint_id
        WHERE w.journey_id = ? AND qa.user_id = ?
        ORDER BY qa.created_at DESC
      `)
        .bind(journeyId, userId)
        .all<QuizAttempt & { waypoint_id: string; waypoint_title: string }>(),

      // 3. FSRS cards for this user × journey, with primary waypoint_id per concept.
      //    The correlated subquery picks the lowest-position waypoint that has a quiz
      //    question for this concept (the "defining" waypoint).
      env.DB.prepare(`
        SELECT fc.*,
               (SELECT qq.waypoint_id FROM quiz_questions qq
                JOIN waypoints w ON w.id = qq.waypoint_id
                WHERE qq.concept_id = fc.concept_id AND w.journey_id = ?
                ORDER BY w.position ASC LIMIT 1) AS waypoint_id
        FROM concept_fsrs_cards fc
        JOIN concepts c ON c.id = fc.concept_id
        WHERE fc.user_id = ? AND c.journey_id = ?
      `)
        .bind(journeyId, userId, journeyId)
        .all<ConceptFsrsCard & { waypoint_id: string | null }>(),

      // 4. Due count
      env.DB.prepare(`
        SELECT COUNT(*) AS cnt
        FROM concept_fsrs_cards fc
        JOIN concepts c ON c.id = fc.concept_id
        WHERE c.journey_id = ? AND fc.user_id = ? AND fc.due <= ?
      `)
        .bind(journeyId, userId, nowMs)
        .first<{ cnt: number }>(),

      // 5. Pending adaptation
      env.DB.prepare(
        `SELECT * FROM adaptations WHERE journey_id = ? AND user_id = ? AND status = 'proposed' LIMIT 1`,
      )
        .bind(journeyId, userId)
        .first<Adaptation>(),
    ])

    const waypoints = waypointsResult.results

    // ── Derive metrics ────────────────────────────────────────────────────────

    // Completion status: any attempt per waypoint with score ≥ 1
    const completionStatus: Record<string, boolean> = {}
    for (const wp of waypoints) {
      completionStatus[wp.id] = false
    }
    for (const row of attemptsResult.results) {
      if (!completionStatus[row.waypoint_id] && (row.score ?? 0) >= 1) {
        completionStatus[row.waypoint_id] = true
      }
    }

    // Mastery by waypoint using FSRS retrievability
    const retrievabilityRows = fsrsResult.results
      .filter((fc) => fc.waypoint_id !== null)
      .map((fc) => ({
        waypoint_id:    fc.waypoint_id as string,
        retrievability: computeRetrievability(fc, nowMs),
      }))
    const masteryMap        = groupMasteryByWaypoint(retrievabilityRows)
    const masteryByWaypoint: Record<string, number> = {}
    for (const [waypointId, avgR] of masteryMap) {
      masteryByWaypoint[waypointId] = Math.round(avgR * 100)
    }

    // Streak (UTC day-based)
    const attemptDates = attemptsResult.results.map((r) => r.created_at)
    const streak       = computeStreak(attemptDates, nowMs)

    // Quiz history — max 20 rows, newest first
    const quizHistory = attemptsResult.results
      .slice(0, 20)
      .map((row) => ({
        waypointId:    row.waypoint_id,
        waypointTitle: row.waypoint_title,
        date:          row.created_at,
        score:         row.score,
      }))

    // Due count
    const dueCount = dueRow?.cnt ?? 0

    return {
      waypoints,
      completionStatus,
      masteryByWaypoint,
      quizHistory,
      streak,
      dueCount,
      pendingAdaptation: adaptationResult ?? null,
    }
  })

// ─── getProgressForDashboard ─────────────────────────────────────────────────

/**
 * Return per-journey mastery percentage for the dashboard JourneyCard list.
 *
 * @param journeyIds  IDs of the journeys to query (typically the full user list).
 * @returns           Map of journeyId → masteryPct 0–100. Returns 0 for journeys
 *                    with no FSRS cards yet.
 */
export const getProgressForDashboard = createServerFn()
  .middleware([withSession])
  .validator((journeyIds: string[]) => journeyIds)
  .handler(async ({ data: journeyIds, context }): Promise<Record<string, number>> => {
    const { session } = context as { session: Awaited<ReturnType<typeof requireAuth>> }
    const userId      = session.user.id
    const nowMs       = Date.now()

    if (journeyIds.length === 0) return {}

    // Fetch all FSRS cards for this user across the requested journeys
    const placeholders = journeyIds.map(() => '?').join(', ')
    const result = await env.DB.prepare(
      `SELECT c.journey_id, fc.*
       FROM concept_fsrs_cards fc
       JOIN concepts c ON c.id = fc.concept_id
       WHERE fc.user_id = ? AND c.journey_id IN (${placeholders})`,
    )
      .bind(userId, ...journeyIds)
      .all<ConceptFsrsCard & { journey_id: string }>()

    // Group by journey and average retrievability
    const sumByJourney:   Record<string, number> = {}
    const countByJourney: Record<string, number> = {}

    for (const row of result.results) {
      const r = computeRetrievability(row, nowMs)
      sumByJourney[row.journey_id]   = (sumByJourney[row.journey_id]   ?? 0) + r
      countByJourney[row.journey_id] = (countByJourney[row.journey_id] ?? 0) + 1
    }

    const out: Record<string, number> = {}
    for (const id of journeyIds) {
      const cnt = countByJourney[id] ?? 0
      out[id] = cnt > 0 ? Math.round((sumByJourney[id]! / cnt) * 100) : 0
    }

    return out
  })
