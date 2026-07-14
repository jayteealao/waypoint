/**
 * Progress route: /_authenticated/journey/$journeyId/progress
 *
 * Loader: calls getJourneyProgress to fetch all progress data in one round trip.
 * Component: renders <ProgressPanel> inside a page wrapper.
 *
 * This is the "fifth core screen" of the AC-14 responsive sweep, home to the
 * learner's mastery map, streak, review-due count, quiz history, and the pending
 * adaptation card (if any).
 *
 * Verification seam:
 *   data-testid="progress-page"  — page wrapper (always present)
 */

import { createFileRoute } from "@tanstack/react-router";
import { getJourneyProgress } from "#/server/progress";
import { ProgressPanel } from "#/components/progress/ProgressPanel";

export const Route = createFileRoute("/_authenticated/journey/$journeyId/progress")({
  head: () => ({ meta: [{ title: "Waypoint — Progress" }] }),
  loader: async ({ params }) => {
    return getJourneyProgress({ data: params.journeyId });
  },
  component: ProgressPage,
});

function ProgressPage() {
  const loaderData = Route.useLoaderData();

  return (
    <div
      data-testid="progress-page"
      style={{ padding: "1.5rem 1rem", maxWidth: "56rem", margin: "0 auto" }}
    >
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 className="display-title m-0 text-2xl font-bold text-[var(--ink)]">Progress</h1>
        <p className="mt-1 m-0 text-sm text-[var(--ink-muted)]">
          Your mastery map — waypoints, streaks, and review-due concepts.
        </p>
      </header>

      <ProgressPanel
        waypoints={loaderData.waypoints}
        completionStatus={loaderData.completionStatus}
        masteryByWaypoint={loaderData.masteryByWaypoint}
        quizHistory={loaderData.quizHistory}
        streak={loaderData.streak}
        dueCount={loaderData.dueCount}
      />
    </div>
  );
}
