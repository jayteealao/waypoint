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
 * which carries the user, journey and waypoint ids. A D1 outage is logged separately as
 * `lesson.access_error` (see `resolveOwnedWaypointDetailed` below) so the two causes are
 * distinguishable in the operator-facing logs even though every existing caller still
 * sees a plain `null`.
 *
 * Callers: the SSE lesson route (`src/routes/api/journey/$journeyId/lesson.ts`) and both
 * client-callable lesson server functions (`src/server/lessons.ts`). Every raw
 * `FROM lessons` query in this codebase must sit in one of those two files, immediately
 * after a `resolveOwnedWaypoint` (or `resolveOwnedWaypointScoped`) call in the same
 * function — enforced mechanically by `scripts/lesson-query-guard.mjs` in CI.
 */

/** A waypoint the caller is confirmed to own, with the context the lesson prompt needs. */
export interface OwnedWaypoint {
  id: string;
  journey_id: string;
  title: string;
  goal: string | null;
  concepts: string;
}

/**
 * Discriminated result for callers that need to tell an infrastructure failure apart
 * from a legitimate ownership denial (e.g. to answer 503-with-retry instead of 404).
 * The deny-by-default posture is unchanged either way: only `ok: true` carries data.
 */
export type OwnedWaypointResult =
  | { readonly ok: true; readonly waypoint: OwnedWaypoint }
  | { readonly ok: false; readonly reason: "denied" }
  | { readonly ok: false; readonly reason: "error" };

const SELECT_OWNED_WAYPOINT = `SELECT w.id, w.journey_id, w.title, w.goal, w.concepts
   FROM waypoints w
   JOIN journeys j ON j.id = w.journey_id
  WHERE w.id = ? AND j.user_id = ?`;

interface ResolveArgs {
  waypointId: string;
  journeyId?: string;
  userId: string;
}

function logDenial(
  event: "lesson.access_denied" | "lesson.access_error",
  { waypointId, journeyId, userId }: ResolveArgs,
) {
  console.log(
    JSON.stringify({
      event,
      user_id: userId,
      journey_id: journeyId ?? null,
      waypoint_id: waypointId,
    }),
  );
}

async function queryOwnedWaypoint(db: D1Database, args: ResolveArgs): Promise<OwnedWaypointResult> {
  const { waypointId, journeyId, userId } = args;

  if (!waypointId || !userId) {
    logDenial("lesson.access_denied", args);
    return { ok: false, reason: "denied" };
  }

  const sql = journeyId ? `${SELECT_OWNED_WAYPOINT} AND w.journey_id = ?` : SELECT_OWNED_WAYPOINT;
  const binds = journeyId ? [waypointId, userId, journeyId] : [waypointId, userId];

  try {
    const row = (await db
      .prepare(sql)
      .bind(...binds)
      .first<OwnedWaypoint>()) as OwnedWaypoint | null;
    if (!row) {
      logDenial("lesson.access_denied", args);
      return { ok: false, reason: "denied" };
    }
    return { ok: true, waypoint: row };
  } catch (err) {
    // A D1 failure must deny, not open. Log and fall through to the denial path, but
    // under a distinct event name so an infra outage is not mistaken for "not yours".
    console.error("[lesson-access] D1 error resolving waypoint ownership:", waypointId, err);
    logDenial("lesson.access_error", args);
    return { ok: false, reason: "error" };
  }
}

/**
 * Resolve a waypoint only if the authenticated user owns the journey it belongs to,
 * distinguishing an ownership denial from a D1 infrastructure failure.
 *
 * Pass `journeyId` when the request names one (the SSE route does) so a waypoint that is
 * owned but belongs to a *different* journey than the URL claims is also refused.
 *
 * Added for RV-12: infrastructure failures were previously indistinguishable from a
 * legitimate denial to every caller, so a D1 outage presented to the learner as a plain
 * 404 with no retry affordance. Callers that want to answer differently on outage (e.g.
 * 503 instead of 404) should use this function and branch on `result.reason`; callers
 * that only need the existing deny-by-default behavior can keep using
 * `resolveOwnedWaypoint`, which wraps this and collapses both failure cases to `null`.
 */
export async function resolveOwnedWaypointDetailed(
  db: D1Database,
  args: ResolveArgs,
): Promise<OwnedWaypointResult> {
  return queryOwnedWaypoint(db, args);
}

/**
 * Resolve a waypoint only if the authenticated user owns the journey it belongs to.
 *
 * Pass `journeyId` when the request names one (the SSE route does) so a waypoint that is
 * owned but belongs to a *different* journey than the URL claims is also refused. Returns
 * the waypoint row, or null for every denial and every not-found — deliberately
 * indistinguishable to the caller.
 *
 * @deprecated The optional `journeyId` parameter lets a caller silently opt into the
 * weaker "ownership alone" posture just by omitting it, with nothing at the type level
 * catching the mistake (RV-14). Prefer `resolveOwnedWaypointScoped`, which forces the
 * caller to name the posture explicitly (`{ scope: "journey", journeyId, ... }` vs
 * `{ scope: "owner", ... }`). This function is kept, unchanged, for the existing call
 * sites in `src/routes/api/journey/$journeyId/lesson.ts` and `src/server/lessons.ts`.
 * Also see `resolveOwnedWaypointDetailed` if you need to distinguish a D1 outage from a
 * legitimate denial (RV-12).
 */
export async function resolveOwnedWaypoint(
  db: D1Database,
  args: ResolveArgs,
): Promise<OwnedWaypoint | null> {
  const result = await queryOwnedWaypoint(db, args);
  return result.ok ? result.waypoint : null;
}

/**
 * Explicit-posture variant of `resolveOwnedWaypoint` (RV-14). The caller must state
 * which ownership check it wants instead of relying on whether it happened to pass
 * `journeyId`:
 *
 * - `{ scope: "journey", journeyId, ... }` — strict: the waypoint must belong to THAT
 *   journey (what the SSE route needs).
 * - `{ scope: "owner", ... }` — ownership alone, any journey the user owns (what the
 *   client-callable RPCs need).
 *
 * New lesson-access call sites should use this instead of `resolveOwnedWaypoint`.
 */
export async function resolveOwnedWaypointScoped(
  db: D1Database,
  params:
    | { scope: "journey"; waypointId: string; journeyId: string; userId: string }
    | { scope: "owner"; waypointId: string; userId: string },
): Promise<OwnedWaypoint | null> {
  const journeyId = params.scope === "journey" ? params.journeyId : undefined;
  return resolveOwnedWaypoint(db, {
    waypointId: params.waypointId,
    journeyId,
    userId: params.userId,
  });
}
