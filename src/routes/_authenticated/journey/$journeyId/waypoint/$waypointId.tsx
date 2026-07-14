/**
 * Waypoint layout route: /_authenticated/journey/$journeyId/waypoint/$waypointId
 *
 * Pure layout route that renders <Outlet /> so child routes (index, quiz) can
 * be nested under the $waypointId path segment. No loader or UI of its own —
 * lesson content lives in $waypointId/index.tsx and the quiz in
 * $waypointId/quiz.tsx.
 *
 * Deviation from plan step 8: the plan specified modifying this file to add
 * lesson content + completion status + "Take Quiz" link. In TanStack Router
 * file-based routing, a route file that also has a child directory MUST render
 * <Outlet /> for children to display. Moving the page content to index.tsx and
 * making this a pure layout is the correct pattern (matches $journeyId.tsx).
 * Recorded as plan deviation PD-1.
 */

import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/journey/$journeyId/waypoint/$waypointId")({
  component: WaypointLayout,
});

function WaypointLayout() {
  return <Outlet />;
}
