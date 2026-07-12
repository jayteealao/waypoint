/**
 * Quiz server functions — quiz generation, grading, FSRS scheduling.
 *
 * Five server functions, all with `withSession` middleware (requireAuth),
 * following the journeys.ts / roadmap.ts pattern:
 *
 *   generateQuiz              — on-demand quiz generation per waypoint
 *   getQuizQuestions          — read cached questions for a waypoint
 *   gradeAnswer               — AI grading of a free-response answer
 *   recordAttemptAndUpdateFsrs — persist attempt + update FSRS card
 *   getWaypointCompletionStatus — completion map for the sidebar
 *
 * Instrumentation: emits quiz.generated and quiz.graded signals on success.
 */

import { createServerFn, createMiddleware } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { Rating } from 'ts-fsrs'
import { requireAuth, requireOwnership } from '#/lib/auth-guard'
import { callGateway } from '#/lib/ai/gateway'
import { QUIZ_SYSTEM_PROMPT, GRADING_SYSTEM_PROMPT } from '#/lib/interview/prompts'
import {
  QUIZ_QUESTION_JSON_SCHEMA,
  GRADING_JSON_SCHEMA,
  validateQuizQuestion,
  validateGrading,
  buildQuizPrompt,
  buildGradingPrompt,
} from '#/lib/quiz/schema'
import { applyGradeToCard, getDueConceptIds } from '#/lib/quiz/fsrs-scheduler'
import type { QuizQuestion, Waypoint, Concept, Journey } from '#/db/schema'
import type { GradingOutput } from '#/lib/quiz/schema'

// ─── withSession middleware (standard pattern) ────────────────────────────────

const withSession = createMiddleware({ type: 'request' }).server(
  async ({ request, next }) => {
    const sessionData = await requireAuth(env, request)
    return next({ context: { session: sessionData } })
  },
)

// ─── generateQuiz ─────────────────────────────────────────────────────────────

/**
 * Generate quiz questions for a waypoint on first visit.
 *
 * Flow:
 *  1. Verify journey + waypoint ownership.
 *  2. Parse concepts JSON array from the waypoint row.
 *  3. Upsert concept rows (INSERT OR IGNORE) and collect concept IDs.
 *  4. Initialise FSRS cards for new concepts (Rating.Manual sentinel).
 *  5. Append up to 2 due-resurfacing concepts from earlier waypoints.
 *  6. Call callGateway once per concept (quiz tier, structured output).
 *  7. Validate response; one re-ask on malformed JSON.
 *  8. Batch-insert quiz_questions rows.
 *  9. Return the inserted question list.
 *
 * @throws 404 if the journey or waypoint is not found.
 * @throws 403 if the journey is not owned by the authenticated user.
 */
export const generateQuiz = createServerFn({ method: 'POST' })
  .middleware([withSession])
  .validator((input: { waypointId: string; journeyId: string }) => input)
  .handler(async ({ data, context }): Promise<QuizQuestion[]> => {
    const { session } = context as { session: Awaited<ReturnType<typeof requireAuth>> }
    const { waypointId, journeyId } = data
    const userId = session.user.id

    // ── 1. Verify journey ownership ──────────────────────────────────────────
    const journey = await env.DB.prepare('SELECT * FROM journeys WHERE id = ?')
      .bind(journeyId)
      .first<Journey>()
    if (!journey) throw new Response(null, { status: 404 })
    requireOwnership(userId, journey.user_id)

    // ── 2. Load waypoint ─────────────────────────────────────────────────────
    const waypoint = await env.DB.prepare(
      'SELECT * FROM waypoints WHERE id = ? AND journey_id = ?',
    )
      .bind(waypointId, journeyId)
      .first<Waypoint>()
    if (!waypoint) throw new Response(null, { status: 404 })

    const conceptNames: string[] = (() => {
      try {
        const parsed = JSON.parse(waypoint.concepts)
        return Array.isArray(parsed) ? (parsed as string[]) : []
      } catch {
        return []
      }
    })()

    // ── 3. Upsert concepts + collect IDs ─────────────────────────────────────
    const waypointContext = `${waypoint.title}${waypoint.goal ? ` — ${waypoint.goal}` : ''}`
    const conceptIdByName = new Map<string, string>()

    for (const name of conceptNames) {
      // Upsert: insert only if not already there
      const existing = await env.DB.prepare(
        'SELECT id FROM concepts WHERE journey_id = ? AND name = ?',
      )
        .bind(journeyId, name)
        .first<{ id: string }>()

      let conceptId: string
      if (existing) {
        conceptId = existing.id
      } else {
        conceptId = crypto.randomUUID()
        await env.DB.prepare(
          'INSERT OR IGNORE INTO concepts (id, journey_id, name, description) VALUES (?, ?, ?, NULL)',
        )
          .bind(conceptId, journeyId, name)
          .run()
      }
      conceptIdByName.set(name, conceptId)
    }

    // ── 4. Initialise FSRS cards for new concepts ─────────────────────────────
    const serverNow = new Date()
    for (const [, conceptId] of conceptIdByName) {
      await applyGradeToCard(env.DB, userId, conceptId, Rating.Manual, serverNow)
    }

    // ── 5. Resurfacing: append up to 2 due concepts from earlier waypoints ────
    const dueConceptIds = await getDueConceptIds(env.DB, userId, journeyId, waypointId, 2)

    // Build the ordered concept list: waypoint concepts first, then resurfaced
    interface ConceptItem {
      conceptId: string
      name: string
      type: 'mc' | 'frq'
    }
    const conceptQueue: ConceptItem[] = []

    for (const name of conceptNames) {
      const conceptId = conceptIdByName.get(name)!
      // Alternate between MC and FRQ for variety (first is always MC)
      const type: 'mc' | 'frq' = conceptQueue.length % 3 === 2 ? 'frq' : 'mc'
      conceptQueue.push({ conceptId, name, type })
    }

    for (const conceptId of dueConceptIds) {
      const conceptRow = await env.DB.prepare('SELECT name FROM concepts WHERE id = ?')
        .bind(conceptId)
        .first<{ name: string }>()
      if (conceptRow) {
        conceptQueue.push({ conceptId, name: conceptRow.name, type: 'mc' })
      }
    }

    // ── 6. Generate questions via gateway ─────────────────────────────────────
    const systemMsg = { role: 'user' as const, content: QUIZ_SYSTEM_PROMPT }

    interface GeneratedQuestion {
      conceptId: string
      name: string
      type: 'mc' | 'frq'
      output: ReturnType<typeof validateQuizQuestion>
    }
    const generated: GeneratedQuestion[] = []

    for (const item of conceptQueue) {
      const userContent = buildQuizPrompt(item.name, waypointContext, item.type)
      const messages = [
        systemMsg,
        { role: 'user' as const, content: userContent },
      ]

      let questionOutput: ReturnType<typeof validateQuizQuestion> | null = null

      for (let attempt = 0; attempt <= 1; attempt++) {
        try {
          const response = await callGateway({
            env,
            userId,
            journeyId,
            type: 'quiz',
            messages,
            responseFormat: QUIZ_QUESTION_JSON_SCHEMA,
          })

          const rawText = response.text ?? ''
          let parsed: unknown
          try {
            parsed = JSON.parse(rawText)
          } catch {
            // Not valid JSON — let validateQuizQuestion throw on next attempt
            if (attempt === 0) continue
            break
          }
          questionOutput = validateQuizQuestion(parsed)
          break
        } catch {
          if (attempt === 1) {
            // Second failure — skip this concept rather than blocking the whole quiz
            console.log(
              JSON.stringify({
                event: 'quiz.question_generation_failed',
                user_id: userId,
                waypoint_id: waypointId,
                concept: item.name,
                attempt,
              }),
            )
          }
        }
      }

      if (questionOutput) {
        generated.push({ conceptId: item.conceptId, name: item.name, type: item.type, output: questionOutput })
      }
    }

    // ── 7. Batch-insert quiz_questions rows ───────────────────────────────────
    const insertedQuestions: QuizQuestion[] = []

    for (const gen of generated) {
      const id = crypto.randomUUID()
      const optionsJson = JSON.stringify(gen.output.options)
      const correctAnswer = gen.output.correct_answer ?? null
      const rubric = gen.output.rubric ?? null

      await env.DB.prepare(
        `INSERT INTO quiz_questions (id, waypoint_id, type, question, options, correct_answer, concept_id, rubric)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          id,
          waypointId,
          gen.output.type,
          gen.output.question,
          optionsJson,
          correctAnswer,
          gen.conceptId,
          rubric,
        )
        .run()

      insertedQuestions.push({
        id,
        waypoint_id: waypointId,
        type: gen.output.type,
        question: gen.output.question,
        options: optionsJson,
        correct_answer: correctAnswer,
        concept_id: gen.conceptId,
        rubric,
      })
    }

    console.log(
      JSON.stringify({
        event: 'quiz.generated',
        user_id: userId,
        waypoint_id: waypointId,
        question_count: insertedQuestions.length,
        resurfaced_count: dueConceptIds.length,
      }),
    )

    return insertedQuestions
  })

// ─── getQuizQuestions ─────────────────────────────────────────────────────────

/**
 * Return the cached quiz questions for a waypoint, ordered by rowid.
 * Returns an empty array if none have been generated yet.
 */
export const getQuizQuestions = createServerFn()
  .middleware([withSession])
  .validator((waypointId: string) => waypointId)
  .handler(async ({ data: waypointId }): Promise<QuizQuestion[]> => {
    const result = await env.DB.prepare(
      'SELECT * FROM quiz_questions WHERE waypoint_id = ? ORDER BY rowid',
    )
      .bind(waypointId)
      .all<QuizQuestion>()
    return result.results
  })

// ─── gradeAnswer ──────────────────────────────────────────────────────────────

/**
 * Grade a free-response answer using the AI gateway (quiz tier, structured output).
 *
 * Reads the quiz_questions row for context (question text + rubric), calls
 * callGateway with the grading system prompt, validates the response, and
 * returns the GradingOutput.
 *
 * MC answers are graded client-side and should NOT be sent here.
 *
 * @throws 404 if the question is not found.
 */
export const gradeAnswer = createServerFn({ method: 'POST' })
  .middleware([withSession])
  .validator((input: { questionId: string; response: string; journeyId?: string }) => input)
  .handler(async ({ data, context }): Promise<GradingOutput> => {
    const { session } = context as { session: Awaited<ReturnType<typeof requireAuth>> }
    const { questionId, response: learnerResponse, journeyId = null } = data
    const userId = session.user.id

    // Read question for context — and verify it belongs to a journey owned by this user
    const question = await env.DB.prepare(
      `SELECT q.* FROM quiz_questions q
       JOIN waypoints w ON w.id = q.waypoint_id
       JOIN journeys j ON j.id = w.journey_id
       WHERE q.id = ? AND j.user_id = ?`,
    )
      .bind(questionId, userId)
      .first<QuizQuestion>()
    if (!question) throw new Response(null, { status: 404 })

    const userContent = buildGradingPrompt(question, learnerResponse)
    const messages = [
      { role: 'user' as const, content: GRADING_SYSTEM_PROMPT },
      { role: 'user' as const, content: userContent },
    ]

    const gatewayResponse = await callGateway({
      env,
      userId,
      journeyId,
      type: 'quiz',
      messages,
      responseFormat: GRADING_JSON_SCHEMA,
    })

    const rawText = gatewayResponse.text ?? ''
    let parsed: unknown
    try {
      parsed = JSON.parse(rawText)
    } catch {
      // Malformed JSON from grader — return safe fallback (incorrect, gentle)
      console.log(
        JSON.stringify({
          event: 'quiz.grading_parse_error',
          user_id: userId,
          question_id: questionId,
          raw_text: rawText.slice(0, 200),
        }),
      )
      return { verdict: 'incorrect', score: 0, feedback: 'Could not parse the grading response — please try again.' }
    }

    const grading = validateGrading(parsed)

    console.log(
      JSON.stringify({
        event: 'quiz.graded',
        user_id: userId,
        question_id: questionId,
        verdict: grading.verdict,
        score: grading.score,
      }),
    )

    return grading
  })

// ─── recordAttemptAndUpdateFsrs ───────────────────────────────────────────────

/**
 * Persist a quiz attempt and update the concept's FSRS card.
 *
 * Authorisation: verifies the question belongs to a waypoint in a journey
 * owned by the authenticated user.
 *
 * FSRS rating mapping:
 *   score=2 → Rating.Good (fully correct, consolidates memory)
 *   score=1 → Rating.Hard (partially correct, harder scheduling)
 *   score=0 → Rating.Again (incorrect, resets to learning)
 */
export const recordAttemptAndUpdateFsrs = createServerFn({ method: 'POST' })
  .middleware([withSession])
  .validator(
    (input: {
      questionId: string
      response: string
      score: 0 | 1 | 2
      feedback: string
      journeyId: string
    }) => input,
  )
  .handler(async ({ data, context }): Promise<void> => {
    const { session } = context as { session: Awaited<ReturnType<typeof requireAuth>> }
    const { questionId, response: learnerResponse, score, feedback, journeyId } = data
    const userId = session.user.id

    // ── Authorisation check ──────────────────────────────────────────────────
    // Verify the question belongs to a waypoint in a journey owned by this user
    const authCheck = await env.DB.prepare(
      `SELECT q.id, q.concept_id FROM quiz_questions q
       JOIN waypoints w ON w.id = q.waypoint_id
       JOIN journeys j ON j.id = w.journey_id
       WHERE q.id = ? AND j.user_id = ? AND j.id = ?`,
    )
      .bind(questionId, userId, journeyId)
      .first<{ id: string; concept_id: string | null }>()
    if (!authCheck) throw new Response(null, { status: 403 })

    // ── Insert attempt ───────────────────────────────────────────────────────
    const attemptId = crypto.randomUUID()
    const now = Date.now()
    await env.DB.prepare(
      `INSERT INTO quiz_attempts (id, user_id, quiz_question_id, response, score, feedback, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(attemptId, userId, questionId, learnerResponse, score, feedback, now)
      .run()

    // ── Update FSRS card ─────────────────────────────────────────────────────
    if (authCheck.concept_id) {
      const ratingMap: Record<0 | 1 | 2, Rating> = {
        0: Rating.Again,
        1: Rating.Hard,
        2: Rating.Good,
      }
      await applyGradeToCard(
        env.DB,
        userId,
        authCheck.concept_id,
        ratingMap[score],
        new Date(now),
      )
    }
  })

// ─── getWaypointCompletionStatus ──────────────────────────────────────────────

/**
 * Return a map of { [waypointId]: boolean } indicating which waypoints have
 * at least one passing attempt (score >= 1) for each of their quiz questions.
 *
 * A waypoint is "complete" if every quiz question in that waypoint has at least
 * one passing attempt by the authenticated user (score >= 1 = partial or correct).
 */
export const getWaypointCompletionStatus = createServerFn()
  .middleware([withSession])
  .validator((journeyId: string) => journeyId)
  .handler(async ({ data: journeyId, context }): Promise<Record<string, boolean>> => {
    const { session } = context as { session: Awaited<ReturnType<typeof requireAuth>> }
    const userId = session.user.id

    // Verify journey ownership before revealing waypoint IDs
    const journey = await env.DB.prepare('SELECT id FROM journeys WHERE id = ? AND user_id = ?')
      .bind(journeyId, userId)
      .first<{ id: string }>()
    if (!journey) throw new Response(null, { status: 404 })

    // Get all waypoint IDs in this journey that have quiz questions
    const waypointIds = await env.DB.prepare(
      `SELECT DISTINCT q.waypoint_id
       FROM quiz_questions q
       JOIN waypoints w ON w.id = q.waypoint_id
       WHERE w.journey_id = ?`,
    )
      .bind(journeyId)
      .all<{ waypoint_id: string }>()

    const result: Record<string, boolean> = {}

    for (const { waypoint_id: waypointId } of waypointIds.results) {
      // Count total questions for this waypoint
      const totalRow = await env.DB.prepare(
        'SELECT COUNT(*) as total FROM quiz_questions WHERE waypoint_id = ?',
      )
        .bind(waypointId)
        .first<{ total: number }>()
      const total = totalRow?.total ?? 0
      if (total === 0) {
        result[waypointId] = false
        continue
      }

      // Count how many questions have a passing attempt
      const passedRow = await env.DB.prepare(
        `SELECT COUNT(DISTINCT q.id) as passed
         FROM quiz_questions q
         JOIN quiz_attempts a ON a.quiz_question_id = q.id AND a.user_id = ? AND a.score >= 1
         WHERE q.waypoint_id = ?`,
      )
        .bind(userId, waypointId)
        .first<{ passed: number }>()
      const passed = passedRow?.passed ?? 0

      result[waypointId] = passed >= total
    }

    return result
  })

// Re-export Concept type for convenience
export type { Concept }
