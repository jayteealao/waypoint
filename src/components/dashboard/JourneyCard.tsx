import { Link } from "@tanstack/react-router";
import type { Journey } from "#/db/schema";
import { Meter } from "../ui/Meter";
import { ArrowRight } from "lucide-react";

export interface JourneyCardProps {
  journey: Journey;
  /** Overall mastery 0–100 from FSRS retrievability. Defaults to 0 before any quiz activity. */
  masteryPct?: number;
  /** True once the journey has a generated roadmap (i.e. at least one waypoint).
   *  False means the journey is still stuck at the interview stage — "Continue"
   *  must resume the interview instead of landing on an empty progress shell (IF-1). */
  hasRoadmap?: boolean;
}

function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (minutes < 60) return minutes <= 1 ? "just now" : `${minutes}m ago`;
  if (hours < 24) return hours === 1 ? "1h ago" : `${hours}h ago`;
  if (days < 7) return days === 1 ? "yesterday" : `${days}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Single journey card for the journeys dashboard.
 *
 * The masteryPct prop is supplied by the dashboard loader (getProgressForDashboard).
 * Cards rendered before any quiz activity default to 0.
 */
export function JourneyCard({ journey, masteryPct = 0, hasRoadmap = false }: JourneyCardProps) {
  // IF-1: a journey abandoned mid-interview has no waypoints yet, so "Continue"
  // must resume the interview rather than land on the empty /progress shell.
  const continueTo = hasRoadmap ? "/journey/$journeyId/progress" : "/journey/$journeyId/interview";

  return (
    <article className="wp-journey-card" data-testid="journey-card" aria-label={journey.title}>
      {/* Journey title — Fraunces display serif */}
      <h2 className="display-title m-0 text-lg font-bold leading-snug text-[var(--ink)] line-clamp-2">
        {journey.title}
      </h2>

      {/* Goal / description */}
      {journey.goal && (
        <p className="m-0 text-sm text-[var(--ink-muted)] line-clamp-2">{journey.goal}</p>
      )}

      {/* Progress meter — mastery from FSRS retrievability */}
      <Meter value={masteryPct} label="Mastery" showValue className="text-xs" />

      {/* Footer row: relative timestamp + continue CTA */}
      <div className="flex items-center justify-between gap-3 mt-auto pt-1">
        <time
          dateTime={new Date(journey.updated_at).toISOString()}
          className="text-xs text-[var(--ink-muted)]"
        >
          {formatRelativeTime(journey.updated_at)}
        </time>

        <Link
          to={continueTo}
          params={{ journeyId: journey.id }}
          className="btn-base btn-secondary btn-sm"
          aria-label={`Continue ${journey.title}`}
        >
          Continue
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
