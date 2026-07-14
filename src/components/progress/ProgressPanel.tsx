/**
 * ProgressPanel — full progress surface for one journey.
 *
 * Sections (left-to-right reading order):
 *   1. Roadmap progress — waypoints with mastery meters and completion check marks.
 *   2. Stats row        — streak chip, due-count, pass rate.
 *   3. Quiz history     — table of recent attempts (newest first, max 20).
 *   4. Empty state      — when no quiz attempts exist ("Your map starts here").
 *
 * The roadmap list always renders (even before any quiz). The stats row and
 * quiz history table are replaced by the empty state until the first attempt.
 *
 * Verification seams (data-testid):
 *   progress-page          — outer page wrapper (set by the route, not here)
 *   progress-roadmap       — waypoint list with mastery meters
 *   progress-stats         — stats row
 *   progress-streak        — streak chip
 *   progress-due-count     — review-due badge
 *   progress-pass-rate     — pass-rate display
 *   progress-quiz-history  — quiz history table
 *   progress-empty         — empty state (shown when no quiz attempts)
 */

import { Meter } from "#/components/ui/Meter";
import { computePassRate } from "#/lib/progress/metrics";
import type { Waypoint } from "#/db/schema";
import { Flame } from "lucide-react";

export interface ProgressPanelProps {
  waypoints: Waypoint[];
  completionStatus: Record<string, boolean>;
  masteryByWaypoint: Record<string, number>; // 0–100 pct
  quizHistory: Array<{
    waypointId: string;
    waypointTitle: string;
    date: number;
    score: number | null;
  }>;
  streak: number;
  dueCount: number;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StreakChip({ streak }: { streak: number }) {
  return (
    <div className="wp-streak-chip" data-testid="progress-streak">
      <Flame size={14} className="text-[var(--ember)]" aria-hidden="true" />
      <span className="font-semibold tabular-nums">{streak}</span>
      <span className="text-[var(--ink-muted)]">{streak === 1 ? "day streak" : "days streak"}</span>
    </div>
  );
}

function RoadmapList({
  waypoints,
  completionStatus,
  masteryByWaypoint,
}: {
  waypoints: Waypoint[];
  completionStatus: Record<string, boolean>;
  masteryByWaypoint: Record<string, number>;
}) {
  return (
    <ol className="wp-progress-roadmap" data-testid="progress-roadmap" aria-label="Journey roadmap">
      {waypoints.map((wp) => {
        const mastery = masteryByWaypoint[wp.id] ?? 0;
        const completed = completionStatus[wp.id] ?? false;
        return (
          <li key={wp.id} className="wp-progress-roadmap-item">
            <div className="wp-progress-roadmap-header">
              <span className="wp-progress-roadmap-title">{wp.title}</span>
              {completed && (
                <span className="text-[var(--success)] font-semibold" aria-label="Completed">
                  ✓
                </span>
              )}
            </div>
            <Meter
              value={mastery}
              label={`Mastery for ${wp.title}`}
              showValue
              className="text-xs"
            />
          </li>
        );
      })}
    </ol>
  );
}

function StatsRow({
  streak,
  dueCount,
  passRate,
}: {
  streak: number;
  dueCount: number;
  passRate: number;
}) {
  const pct = Math.round(passRate * 100);
  return (
    <div className="wp-progress-stats" data-testid="progress-stats">
      <StreakChip streak={streak} />

      <div className="wp-progress-stat-chip" data-testid="progress-due-count">
        <span className="font-semibold tabular-nums text-[var(--ember)]">{dueCount}</span>
        <span className="text-[var(--ink-muted)]">
          {dueCount === 1 ? "concept due" : "concepts due"}
        </span>
      </div>

      <div className="wp-progress-stat-chip" data-testid="progress-pass-rate">
        <span className="font-semibold tabular-nums">{pct}%</span>
        <span className="text-[var(--ink-muted)]">pass rate</span>
      </div>
    </div>
  );
}

function QuizHistoryTable({ history }: { history: ProgressPanelProps["quizHistory"] }) {
  return (
    <div className="wp-progress-quiz-table" data-testid="progress-quiz-history">
      <h3 className="text-sm font-semibold text-[var(--ink)] mb-3">Quiz history</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="pb-2 font-semibold text-[var(--ink-muted)]">Waypoint</th>
              <th className="pb-2 font-semibold text-[var(--ink-muted)]">Date</th>
              <th className="pb-2 font-semibold text-[var(--ink-muted)] text-right">Score</th>
            </tr>
          </thead>
          <tbody>
            {history.map((row, i) => (
              <tr key={i} className="border-b border-[var(--border)] last:border-0">
                <td className="py-2 pr-4 text-[var(--ink)] truncate max-w-[12rem]">
                  {row.waypointTitle}
                </td>
                <td className="py-2 pr-4 text-[var(--ink-muted)] whitespace-nowrap">
                  {new Date(row.date).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {row.score !== null ? (
                    <span
                      className={
                        row.score >= 1
                          ? "text-[var(--success)] font-semibold"
                          : "text-[var(--ink-muted)]"
                      }
                      aria-label={row.score >= 1 ? "Pass" : "Fail"}
                    >
                      {row.score >= 1 ? "✓" : "✗"}
                    </span>
                  ) : (
                    <span className="text-[var(--ink-muted)]" aria-label="No score">
                      —
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="wp-progress-empty" data-testid="progress-empty" role="status">
      <p className="text-sm font-semibold text-[var(--ink)]">Your map starts here</p>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">
        Complete your first quiz to see mastery stats, streaks, and review suggestions — your
        progress lives here as you learn.
      </p>
    </div>
  );
}

// ─── ProgressPanel ────────────────────────────────────────────────────────────

export function ProgressPanel({
  waypoints,
  completionStatus,
  masteryByWaypoint,
  quizHistory,
  streak,
  dueCount,
}: ProgressPanelProps) {
  const hasActivity = quizHistory.length > 0;
  const passRate = computePassRate(quizHistory.map((r) => r.score));

  return (
    <div className="wp-progress-page">
      {/* Roadmap — always visible */}
      <section aria-labelledby="progress-roadmap-heading" className="mb-8">
        <h2
          id="progress-roadmap-heading"
          className="display-title text-lg font-bold text-[var(--ink)] mb-4"
        >
          Roadmap
        </h2>
        <RoadmapList
          waypoints={waypoints}
          completionStatus={completionStatus}
          masteryByWaypoint={masteryByWaypoint}
        />
      </section>

      {/* Stats + history or empty state */}
      {hasActivity ? (
        <>
          <StatsRow streak={streak} dueCount={dueCount} passRate={passRate} />
          <QuizHistoryTable history={quizHistory} />
        </>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}
