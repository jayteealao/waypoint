/**
 * Lesson server functions — D1 read path.
 *
 * Follows the exact same createServerFn + withSession pattern established in
 * src/server/journeys.ts (AC-accounts-data-layer, already implemented).
 *
 * The `content` column stores a serialized LessonDocumentV1 (JSON string).
 * Parse it on read; return null if absent so the route can render a skeleton
 * or empty state while generation is pending.
 */

import { createServerFn, createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { requireAuth } from "#/lib/auth-guard";
import type { Lesson } from "#/db/schema";

const withSession = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const sessionData = await requireAuth(env, getRequest());
  return next({ context: { session: sessionData } });
});

/**
 * Fetch a single lesson row by id, scoped to the owning waypoint.
 *
 * Ownership is enforced at the query level: `WHERE id = ? AND waypoint_id = ?`.
 * A lesson that exists but belongs to a different waypoint returns null — callers
 * cannot distinguish "not found" from "not yours", which is the correct security
 * posture (avoids leaking existence information).
 *
 * Returns null on not-found, ownership mismatch, or D1 error (logged).
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
  .handler(async ({ data: { lessonId, waypointId } }): Promise<Lesson | null> => {
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
 * Returns null when no lesson has been generated yet.
 * Used by the waypoint route loader to decide whether to show LessonView or LessonGeneratingView.
 */
export const getLessonByWaypointId = createServerFn()
  .middleware([withSession])
  .validator((waypointId: string) => waypointId)
  .handler(async ({ data: waypointId }): Promise<Lesson | null> => {
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
 * Upsert a lesson row for a waypoint (INSERT OR REPLACE).
 * Used by the SSE lesson route to persist completed sections progressively.
 * The content column stores JSON.stringify(LessonSection[]) — accumulated sections.
 *
 * NOT a createServerFn — called directly from the SSE route handler (not a client RPC call).
 * Exported as a plain async function so the SSE handler can call it with the D1 binding it has.
 */
export async function upsertLesson(
  db: D1Database,
  waypointId: string,
  lessonId: string,
  content: string, // JSON.stringify(sections[])
  sources: string, // JSON.stringify(LessonSource[])
): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO lessons (id, waypoint_id, content, sources, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         content = excluded.content,
         sources = excluded.sources`,
    )
    .bind(lessonId, waypointId, content, sources, now)
    .run();
}
