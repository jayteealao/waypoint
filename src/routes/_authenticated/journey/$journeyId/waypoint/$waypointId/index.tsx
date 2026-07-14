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

  // Parse the stored lesson content if available
  let parsedDoc: LessonDocumentV1 | null = null;
  let resumeSections: LessonSection[] = [];

  if (lesson?.content) {
    try {
      const raw = JSON.parse(lesson.content) as unknown;
      if (Array.isArray(raw)) {
        resumeSections = raw as LessonSection[];
      } else {
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
