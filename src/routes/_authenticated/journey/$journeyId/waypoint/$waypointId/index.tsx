/**
 * Waypoint lesson page: /_authenticated/journey/$journeyId/waypoint/$waypointId
 *
 * Loader reads the D1 lesson for this waypoint (via getLessonByWaypointId) and
 * the waypoint completion status across all waypoints in the journey.
 *
 * - If a complete lesson exists: renders LessonView with the parsed LessonDocumentV1.
 * - If no lesson yet (null or empty content): renders LessonGeneratingView,
 *   which opens EventSource to /api/journey/$journeyId/lesson?waypointId=$waypointId
 *   and streams content progressively.
 *
 * "Take Quiz" CTA appears below a completed lesson (parsedDoc !== null).
 * Completion status is passed to the shell sidebar to mark completed waypoints.
 *
 * Verification seams:
 *   data-testid="waypoint-page"   — page wrapper (always present)
 *   data-testid="lesson-content"  — rendered by LessonGeneratingView when streaming
 *   data-testid="lesson-view"     — rendered by LessonView when content is complete
 *   data-testid="quiz-cta"        — "Take Quiz" link (only when lesson is complete)
 */

import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { getLessonByWaypointId } from "#/server/lessons";
import { getWaypointCompletionStatus } from "#/server/quiz";
import { LessonView } from "#/components/lesson/LessonView";
import { LessonGeneratingView } from "#/components/generation/LessonGeneratingView";
import { useShell } from "#/components/shell/AppShell";
import type { LessonDocumentV1, LessonSection } from "#/types/lesson-document";

export const Route = createFileRoute("/_authenticated/journey/$journeyId/waypoint/$waypointId/")({
  head: () => ({ meta: [{ title: "Waypoint — Lesson" }] }),
  loader: async ({ params }) => {
    const { journeyId, waypointId } = params;
    const [lesson, completionStatus] = await Promise.all([
      getLessonByWaypointId({ data: waypointId }),
      getWaypointCompletionStatus({ data: journeyId }),
    ]);
    return { lesson, completionStatus };
  },
  component: WaypointPage,
});

function WaypointPage() {
  const { journeyId, waypointId } = Route.useParams();
  const { lesson, completionStatus } = Route.useLoaderData();
  const { waypoints, setWaypoints } = useShell();

  // Update sidebar completion indicators whenever the status changes
  useEffect(() => {
    if (waypoints.length === 0) return;
    const updated = waypoints.map((wp) => ({
      ...wp,
      completed: completionStatus[wp.id] ?? wp.completed,
    }));
    // Only update if something changed to avoid an infinite effect loop
    const changed = updated.some((wp, i) => wp.completed !== waypoints[i]?.completed);
    if (changed) setWaypoints(updated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completionStatus]);

  // Parse the stored lesson content if available. `content` holds a full
  // LessonDocumentV1 for lessons persisted by the current SSE route, but older rows
  // may still hold the bare LessonSection[] array that shape replaced — accept both.
  // A non-empty array is a *complete* generation (the SSE route only ever wrote content
  // once, after the model finished), so it is wrapped into a document (using the
  // row's separate `sources` column) rather than treated as a stalled generation.
  let parsedDoc: LessonDocumentV1 | null = null;
  let resumeSections: LessonSection[] = [];

  if (lesson?.content) {
    try {
      const raw = JSON.parse(lesson.content) as unknown;
      if (Array.isArray(raw) && raw.length > 0) {
        resumeSections = raw as LessonSection[];
        let sourcesPayload: {
          sources: LessonDocumentV1["sources"];
          recommended_primary_source: LessonDocumentV1["recommended_primary_source"];
        } = { sources: [], recommended_primary_source: null };
        if (lesson.sources) {
          try {
            const parsedSources = JSON.parse(lesson.sources) as unknown;
            if (
              parsedSources &&
              typeof parsedSources === "object" &&
              !Array.isArray(parsedSources)
            ) {
              sourcesPayload = parsedSources as typeof sourcesPayload;
            }
          } catch {
            // fall back to empty sources
          }
        }
        // The legacy array shape carried no title or summary, but this path now renders
        // through LessonView rather than the generating skeleton, so an empty string paints
        // a blank <h1>. Fall back to the waypoint's own title — it is what the lesson is
        // about, and it is already on screen in the sidebar, so the page reads as coherent
        // rather than headless.
        parsedDoc = {
          version: 1,
          title: waypoints.find((wp) => wp.id === waypointId)?.label ?? "Lesson",
          summary: "",
          sections: resumeSections,
          sources: sourcesPayload.sources ?? [],
          recommended_primary_source: sourcesPayload.recommended_primary_source ?? null,
        };
      } else if (
        raw &&
        typeof raw === "object" &&
        !Array.isArray(raw) &&
        Array.isArray((raw as { sections?: unknown }).sections)
      ) {
        parsedDoc = raw as LessonDocumentV1;
      }
    } catch {
      parsedDoc = null;
    }
  }

  return (
    <div data-testid="waypoint-page" style={{ padding: "1.5rem 1rem" }}>
      {parsedDoc ? (
        <>
          <LessonView doc={parsedDoc} />
          <div className="mt-8 flex justify-end">
            <Link
              to="/journey/$journeyId/waypoint/$waypointId/quiz"
              params={{ journeyId, waypointId }}
              className="btn-base btn-primary btn-md"
              data-testid="quiz-cta"
            >
              Take Quiz →
            </Link>
          </div>
        </>
      ) : (
        <LessonGeneratingView
          journeyId={journeyId}
          waypointId={waypointId}
          initialSections={resumeSections}
        />
      )}
    </div>
  );
}
