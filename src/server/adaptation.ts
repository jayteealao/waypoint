/**
 * Adaptation server functions.
 *
 * Two server functions, both with `withSession` middleware:
 *
 *   proposeAdaptation   — generate a review waypoint proposal after a weak quiz
 *   respondToProposal   — accept (insert waypoint) or decline (mark row) a proposal
 *
 * Design decision A5 (plan): adaptation proposal text is generated LLM-free
 * from FSRS + quiz data ("Review: ${weakestConceptName}"), keeping proposals
 * fast, cheap, and deterministic.
 *
 * Design decision A7 (plan): at most one 'proposed' adaptation per journey.
 * If a pending proposal exists, proposeAdaptation returns null.
 */

import { createServerFn, createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { requireAuth, requireOwnership } from "#/lib/auth-guard";
import type { Adaptation, Waypoint } from "#/db/schema";

// ─── withSession middleware ───────────────────────────────────────────────────

const withSession = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const sessionData = await requireAuth(env, getRequest());
  return next({ context: { session: sessionData } });
});

// ─── proposeAdaptation ────────────────────────────────────────────────────────

interface ProposeInput {
  journeyId: string;
  waypointId: string;
  quizScore: number; // number of questions answered correctly (score ≥ 1)
  totalQuestions: number;
}

/**
 * Evaluate the quiz result and, if below the 50% threshold, generate a
 * review waypoint proposal and persist it to the adaptations table.
 *
 * Returns null if:
 *  - The quiz score is ≥ 50%.
 *  - A pending (status='proposed') adaptation already exists for this journey.
 *
 * The weakest concept is the one with the lowest quiz_attempts score for this
 * waypoint; the proposed title is "Review: ${concept.name}".
 */
export const proposeAdaptation = createServerFn({ method: "POST" })
  .middleware([withSession])
  .validator((input: ProposeInput) => input)
  .handler(async ({ data, context }): Promise<Adaptation | null> => {
    const { session } = context as { session: Awaited<ReturnType<typeof requireAuth>> };
    const userId = session.user.id;
    const { journeyId, waypointId, quizScore, totalQuestions } = data;

    // ── 1. Verify ownership ───────────────────────────────────────────────────
    const journey = await env.DB.prepare("SELECT user_id FROM journeys WHERE id = ?")
      .bind(journeyId)
      .first<{ user_id: string }>();
    if (!journey) throw new Response(null, { status: 404 });
    requireOwnership(userId, journey.user_id);

    // ── 2. Threshold check (50%) ──────────────────────────────────────────────
    if (totalQuestions <= 0 || quizScore / totalQuestions >= 0.5) {
      return null;
    }

    // ── 3. Guard: no stacked proposals ───────────────────────────────────────
    const existing = await env.DB.prepare(
      `SELECT id FROM adaptations WHERE journey_id = ? AND user_id = ? AND status = 'proposed' LIMIT 1`,
    )
      .bind(journeyId, userId)
      .first<{ id: string }>();
    if (existing) return null;

    // ── 4. Find weakest concept for this waypoint ─────────────────────────────
    // The concept with the lowest average quiz attempt score.
    const weakRow = await env.DB.prepare(`
      SELECT c.id AS concept_id, c.name AS concept_name, AVG(qa.score) AS avg_score
      FROM quiz_attempts qa
      JOIN quiz_questions qq ON qq.id = qa.quiz_question_id
      JOIN concepts c        ON c.id  = qq.concept_id
      WHERE qq.waypoint_id = ? AND qa.user_id = ? AND qq.concept_id IS NOT NULL
      GROUP BY c.id, c.name
      ORDER BY avg_score ASC
      LIMIT 1
    `)
      .bind(waypointId, userId)
      .first<{ concept_id: string; concept_name: string; avg_score: number }>();

    const proposedTitle = weakRow ? `Review: ${weakRow.concept_name}` : "Review: key concepts";

    // ── 5. Insert adaptation row ──────────────────────────────────────────────
    const id = crypto.randomUUID();
    const createdAt = Date.now();

    await env.DB.prepare(`
      INSERT INTO adaptations (id, journey_id, user_id, waypoint_after_id, proposed_title, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'proposed', ?)
    `)
      .bind(id, journeyId, userId, waypointId, proposedTitle, createdAt)
      .run();

    const adaptation: Adaptation = {
      id,
      journey_id: journeyId,
      user_id: userId,
      waypoint_after_id: waypointId,
      proposed_title: proposedTitle,
      status: "proposed",
      created_at: createdAt,
    };

    return adaptation;
  });

// ─── respondToProposal ────────────────────────────────────────────────────────

interface RespondInput {
  adaptationId: string;
  response: "accepted" | "declined";
}

/**
 * Accept or decline an adaptation proposal.
 *
 * On 'accepted':
 *   1. Reads the waypoint_after_id (the current waypoint the review follows).
 *   2. Shifts all subsequent waypoints' positions up by 1 (UPDATE … position+1).
 *   3. Inserts a new review waypoint at position+1.
 *   4. Marks the adaptation as 'accepted'.
 *   Returns the updated full waypoint list ordered by position.
 *
 * On 'declined':
 *   Marks the adaptation as 'declined'. Returns [].
 *
 * D1 batch is sequential in a single transaction; the UPDATE must precede INSERT.
 */
export const respondToProposal = createServerFn({ method: "POST" })
  .middleware([withSession])
  .validator((input: RespondInput) => input)
  .handler(async ({ data, context }): Promise<Waypoint[]> => {
    const { session } = context as { session: Awaited<ReturnType<typeof requireAuth>> };
    const userId = session.user.id;
    const { adaptationId, response } = data;

    // ── 1. Load and verify proposal ───────────────────────────────────────────
    const adaptation = await env.DB.prepare("SELECT * FROM adaptations WHERE id = ?")
      .bind(adaptationId)
      .first<Adaptation>();
    if (!adaptation) throw new Response(null, { status: 404 });
    requireOwnership(userId, adaptation.user_id);

    if (response === "declined") {
      await env.DB.prepare(`UPDATE adaptations SET status = 'declined' WHERE id = ?`)
        .bind(adaptationId)
        .run();
      return [];
    }

    // ── 2. Accept path ────────────────────────────────────────────────────────
    const journeyId = adaptation.journey_id;
    const afterWaypointId = adaptation.waypoint_after_id;

    if (!afterWaypointId) {
      // Edge case: no anchor waypoint — just mark accepted without inserting
      await env.DB.prepare(`UPDATE adaptations SET status = 'accepted' WHERE id = ?`)
        .bind(adaptationId)
        .run();
      const existing = await env.DB.prepare(
        "SELECT * FROM waypoints WHERE journey_id = ? ORDER BY position ASC",
      )
        .bind(journeyId)
        .all<Waypoint>();
      return existing.results;
    }

    // Read the anchor waypoint's position
    const anchor = await env.DB.prepare("SELECT position FROM waypoints WHERE id = ?")
      .bind(afterWaypointId)
      .first<{ position: number }>();
    if (!anchor) throw new Response(null, { status: 404 });

    const insertPosition = anchor.position + 1;
    const newWaypointId = crypto.randomUUID();

    // D1 batch: shift + insert + mark accepted (sequential in one transaction)
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE waypoints
        SET position = position + 1
        WHERE journey_id = ? AND position >= ?
      `).bind(journeyId, insertPosition),

      env.DB.prepare(`
        INSERT INTO waypoints (id, journey_id, position, title, goal, concepts)
        VALUES (?, ?, ?, ?, NULL, '[]')
      `).bind(newWaypointId, journeyId, insertPosition, adaptation.proposed_title),

      env.DB.prepare(`UPDATE adaptations SET status = 'accepted' WHERE id = ?`).bind(adaptationId),
    ]);

    // Return updated waypoint list
    const result = await env.DB.prepare(
      "SELECT * FROM waypoints WHERE journey_id = ? ORDER BY position ASC",
    )
      .bind(journeyId)
      .all<Waypoint>();

    return result.results;
  });
