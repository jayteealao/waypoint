/**
 * Lesson server functions — D1 read path.
 *
 * Follows the exact same createServerFn + withSession pattern established in
 * src/server/journeys.ts (AC-accounts-data-layer, already implemented).
 *
 * The `content` column stores a serialized LessonDocumentV1 (JSON string) — title,
 * summary, sections, sources, and recommended_primary_source — written once a
 * generation completes. Older rows (written before this document shape existed) may
 * still hold a bare `LessonSection[]` array; callers that read `content` must accept
 * both shapes. Parse it on read; return null if absent so the route can render a
 * skeleton or empty state while generation is pending.
 */

import { createServerFn, createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { requireAuth } from "#/lib/auth-guard";
import { resolveOwnedWaypoint } from "#/server/lesson-access";
import type { Lesson } from "#/db/schema";

const withSession = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const sessionData = await requireAuth(env, getRequest());
  return next({ context: { session: sessionData } });
});

/**
 * Fetch a single lesson row by id, scoped to a waypoint the caller owns.
 *
 * Ownership is enforced by `resolveOwnedWaypoint`, which walks
 * `waypoints.journey_id → journeys.user_id` to the session user. The `WHERE id = ? AND
 * waypoint_id = ?` clause below is a compound key, not an ownership check — no user
 * participates in it — so on its own it let any signed-in caller read any lesson row.
 *
 * Returns null on not-found, ownership mismatch, or D1 error (logged). Callers cannot
 * distinguish "not found" from "not yours", which is the correct posture: it avoids
 * leaking which waypoint and lesson ids exist.
 * The `content` field is a JSON string — parse with
 * `JSON.parse(row.content) as LessonDocumentV1` in the calling route loader.
 *
 * Implementation note: content is returned as a raw string rather than a
 * parsed LessonDocumentV1 because TanStack Start's serialization validator
 * rejects `Record<string, unknown>` (WidgetSection.props) at the type level.
 * Parsing is deferred to the calling route loader.
 */
export const getLesson = createServerFn()
  .middleware([withSession])
  .validator((input: { lessonId: string; waypointId: string }) => input)
  .handler(async ({ data: { lessonId, waypointId }, context }): Promise<Lesson | null> => {
    const { session } = context as { session: Awaited<ReturnType<typeof requireAuth>> };
    const owned = await resolveOwnedWaypoint(env.DB, { waypointId, userId: session.user.id });
    if (!owned) return null;

    try {
      const row = await env.DB.prepare("SELECT * FROM lessons WHERE id = ? AND waypoint_id = ?")
        .bind(lessonId, waypointId)
        .first<Lesson>();
      if (!row) return null;
      return row;
    } catch (err) {
      console.error("[lessons] D1 error fetching lesson:", lessonId, err);
      return null;
    }
  });

/**
 * Fetch the lesson row for a waypoint (by waypoint_id, not lesson id).
 * Returns null when no lesson has been generated yet, and equally when the waypoint
 * belongs to someone else — this is a client-callable RPC, so the waypoint id arriving
 * here is caller-supplied and gets the same ownership walk as every other lesson path.
 * Used by the waypoint route loader to decide whether to show LessonView or LessonGeneratingView.
 */
export const getLessonByWaypointId = createServerFn()
  .middleware([withSession])
  .validator((waypointId: string) => waypointId)
  .handler(async ({ data: waypointId, context }): Promise<Lesson | null> => {
    const { session } = context as { session: Awaited<ReturnType<typeof requireAuth>> };
    const owned = await resolveOwnedWaypoint(env.DB, { waypointId, userId: session.user.id });
    if (!owned) return null;

    try {
      const row = await env.DB.prepare("SELECT * FROM lessons WHERE waypoint_id = ?")
        .bind(waypointId)
        .first<Lesson>();
      return row ?? null;
    } catch (err) {
      console.error("[lessons] D1 error fetching lesson by waypointId:", waypointId, err);
      return null;
    }
  });

/**
 * Build (without executing) the prepared statement that upserts a lesson row for a
 * waypoint. Used by the SSE lesson route to persist a completed lesson atomically
 * alongside its usage-metering write via `D1Database.batch([...])`.
 * The content column stores JSON.stringify(LessonDocumentV1) — the full document.
 *
 * NOT a createServerFn — called directly from the SSE route handler (not a client RPC call).
 */
export function upsertLessonStatement(
  db: D1Database,
  waypointId: string,
  lessonId: string,
  content: string, // JSON.stringify(LessonDocumentV1)
  sources: string, // JSON.stringify({ sources: LessonSource[], recommended_primary_source: LessonSource | null })
): D1PreparedStatement {
  const now = Date.now();
  return db
    .prepare(
      `INSERT INTO lessons (id, waypoint_id, content, sources, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         content = excluded.content,
         sources = excluded.sources`,
    )
    .bind(lessonId, waypointId, content, sources, now);
}

/**
 * Upsert a lesson row for a waypoint (INSERT OR REPLACE). See `upsertLessonStatement`
 * for the statement this executes and the shape it expects.
 *
 * Exported as a plain async function so callers that don't need batching can call it
 * directly with the D1 binding they have.
 */
export async function upsertLesson(
  db: D1Database,
  waypointId: string,
  lessonId: string,
  content: string,
  sources: string,
): Promise<void> {
  await upsertLessonStatement(db, waypointId, lessonId, content, sources).run();
}
