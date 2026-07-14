/**
 * Sample journey overview — /_authenticated/sample/
 *
 * The entry point for the sample journey. Shows the four waypoints with their
 * completion state (read from ShellContext, populated by the parent layout route)
 * and a "Start a real journey" CTA that returns the learner to the dashboard.
 *
 * The CTA links to / (the journeys dashboard) because the tutor-interview route
 * does not exist yet. The link target will be updated to /journey/new when that
 * slice ships — a one-line change in this file only.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useShell } from "#/components/shell/AppShell";
import { SAMPLE_WAYPOINTS } from "#/fixtures/sample-journey";
import { Compass } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sample/")({
  head: () => ({
    meta: [{ title: "Waypoint — How Waypoint Works" }],
  }),
  component: SampleOverviewPage,
});

function SampleOverviewPage() {
  const { waypoints } = useShell();

  // Prefer live completion state from ShellContext; fall back to static defaults
  // (handles the brief moment before the layout effect fires)
  const displayWaypoints = waypoints.length > 0 ? waypoints : SAMPLE_WAYPOINTS;

  return (
    <div className="wp-sample-overview" data-testid="sample-overview">
      {/* Header */}
      <header className="mb-6">
        <h1 className="display-title m-0 text-2xl font-bold text-[var(--ink)]">
          How Waypoint Works
        </h1>
        <p className="mt-2 text-sm text-[var(--ink-muted)] leading-6">
          A short guided tour through Waypoint's approach to adaptive learning. Two lessons, one
          quiz, zero AI costs — just the teaching loop in action.
        </p>
      </header>

      {/* Waypoint cards */}
      <ol className="list-none p-0 m-0" aria-label="Journey waypoints">
        {displayWaypoints.map((wp, i) => (
          <li key={wp.id}>
            <div
              className={`wp-sample-waypoint-card${wp.completed ? " wp-sample-waypoint-card--completed" : ""}`}
            >
              {/* Badge */}
              <div className="wp-sample-waypoint-card-info">
                <span className="wp-sample-waypoint-card-badge" aria-hidden="true">
                  {wp.completed ? "✓" : i + 1}
                </span>
                <span className="font-medium text-[var(--ink)] text-sm truncate">{wp.label}</span>
              </div>

              {/* CTA */}
              <Link
                to={wp.href}
                className="btn-base btn-outline btn-sm flex-shrink-0"
                aria-label={`${wp.completed ? "Revisit" : "Begin"}: ${wp.label}`}
              >
                {wp.completed ? "Revisit" : "Begin"}
              </Link>
            </div>
          </li>
        ))}
      </ol>

      {/* Start a real journey CTA */}
      {/* sdlc-debt: links to / (dashboard) until tutor-interview slice ships /journey/new */}
      <div className="mt-8 pt-6 border-t border-[var(--border)] text-center">
        <p className="text-sm text-[var(--ink-muted)] mb-3">
          Ready to start learning something new?
        </p>
        <Link
          to="/"
          className="btn-base btn-primary btn-md inline-flex items-center gap-2"
          data-testid="start-real-journey-cta"
        >
          <Compass size={16} aria-hidden="true" />
          Start a real journey
        </Link>
      </div>
    </div>
  );
}
