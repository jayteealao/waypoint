/**
 * Lesson access gate — the single ownership check every lesson access path must call.
 *
 * A lesson row is reachable only through its waypoint, and a waypoint is owned only
 * through its journey: `lessons.waypoint_id → waypoints.journey_id → journeys.user_id`
 * (migrations/0000_schema_v1.sql). Checking the journey and then reading by waypoint id
 * is NOT an ownership check — that gap let an authenticated caller read another user's
 * lesson by naming their own journey alongside a foreign waypoint id.
 *
 * Denial semantics: callers get "not found", never "not yours". `resolveOwnedWaypoint`
 * returns null for every miss — unknown id, foreign owner, or wrong journey — so a
 * probing caller cannot use the response to confirm which waypoint ids are real. The
 * operator-facing distinction survives in the `lesson.access_denied` log emitted here,
 * which carries the user, journey and waypoint ids.
 *
 * Callers: the SSE lesson route (`src/routes/api/journey/$journeyId/lesson.ts`) and both
 * client-callable lesson server functions (`src/server/lessons.ts`).
 */

/** A waypoint the caller is confirmed to own, with the context the lesson prompt needs. */
export interface OwnedWaypoint {
  id: string;
  journey_id: string;
  title: string;
  goal: string | null;
  concepts: string;
}

const SELECT_OWNED_WAYPOINT = `SELECT w.id, w.journey_id, w.title, w.goal, w.concepts
   FROM waypoints w
   JOIN journeys j ON j.id = w.journey_id
  WHERE w.id = ? AND j.user_id = ?`;

/**
 * Resolve a waypoint only if the authenticated user owns the journey it belongs to.
 *
 * Pass `journeyId` when the request names one (the SSE route does) so a waypoint that is
 * owned but belongs to a *different* journey than the URL claims is also refused. Returns
 * the waypoint row, or null for every denial and every not-found — deliberately
 * indistinguishable to the caller.
 */
export async function resolveOwnedWaypoint(
  db: D1Database,
  { waypointId, journeyId, userId }: { waypointId: string; journeyId?: string; userId: string },
): Promise<OwnedWaypoint | null> {
  let row: OwnedWaypoint | null = null;

  if (waypointId && userId) {
    const sql = journeyId ? `${SELECT_OWNED_WAYPOINT} AND w.journey_id = ?` : SELECT_OWNED_WAYPOINT;
    const binds = journeyId ? [waypointId, userId, journeyId] : [waypointId, userId];
    try {
      row = (await db
        .prepare(sql)
        .bind(...binds)
        .first<OwnedWaypoint>()) as OwnedWaypoint | null;
    } catch (err) {
      // A D1 failure must deny, not open. Log and fall through to the denial path.
      console.error("[lesson-access] D1 error resolving waypoint ownership:", waypointId, err);
      row = null;
    }
  }

  if (!row) {
    console.log(
      JSON.stringify({
        event: "lesson.access_denied",
        user_id: userId,
        journey_id: journeyId ?? null,
        waypoint_id: waypointId,
      }),
    );
  }

  return row;
}
