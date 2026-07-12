/**
 * Progress metric derivations — pure functions, no I/O.
 *
 * Three exports used by src/server/progress.ts and the unit test suite:
 *   computeStreak         — consecutive UTC days with quiz activity ending today/yesterday
 *   computePassRate       — fraction of attempts scoring ≥ 1
 *   groupMasteryByWaypoint — average FSRS retrievability per waypoint
 *
 * UTC throughout: the authoritative day boundary is UTC midnight as seen by
 * the Cloudflare Worker; clients display the count, not the cutoff time.
 *
 * Timezone note (A3 from plan):
 *   UTC day index = Math.floor(timestampMs / 86_400_000).
 *   A learner in UTC-8 studying at 11 pm local finishes at 7 am UTC the next
 *   day, so the system may credit the next UTC day. This is intentional;
 *   per shape's clock-skew note the client can label "today"/"yesterday" in
 *   local time while the underlying streak count uses UTC.
 */

// ─── computeStreak ────────────────────────────────────────────────────────────

/**
 * Return the current streak length in UTC calendar days.
 *
 * A streak is a run of consecutive UTC days starting from today (or yesterday)
 * where at least one attempt occurred on each day.
 *
 * Rules:
 *  - Returns 0 for empty input.
 *  - Returns 0 if no attempt on today's UTC day OR yesterday's UTC day
 *    (the streak is broken if the learner missed today AND yesterday).
 *  - Counts backward from the most recent activity day; a gap in the
 *    sequence breaks the streak.
 *
 * @param attemptDatesMs  Array of quiz attempt timestamps in milliseconds.
 * @param nowMs           Current server timestamp in milliseconds.
 */
export function computeStreak(attemptDatesMs: number[], nowMs: number): number {
  if (attemptDatesMs.length === 0) return 0

  const MS_PER_DAY = 86_400_000
  const todayIdx = Math.floor(nowMs / MS_PER_DAY)

  // Build a de-duplicated set of UTC day indices from the attempt timestamps
  const daySet = new Set(attemptDatesMs.map((ms) => Math.floor(ms / MS_PER_DAY)))

  // The streak must include today or yesterday to be active
  if (!daySet.has(todayIdx) && !daySet.has(todayIdx - 1)) return 0

  // Start from the most recent of today/yesterday that has an attempt
  const startDay = daySet.has(todayIdx) ? todayIdx : todayIdx - 1

  let streak = 0
  let day = startDay
  while (daySet.has(day)) {
    streak++
    day--
  }

  return streak
}

// ─── computePassRate ─────────────────────────────────────────────────────────

/**
 * Return the fraction of attempts with score ≥ 1.
 *
 * @param scores  Array of quiz attempt scores (null counts as a miss).
 * @returns       Float 0–1. Returns 0 for an empty array.
 */
export function computePassRate(scores: (number | null)[]): number {
  if (scores.length === 0) return 0
  const passing = scores.filter((s) => s !== null && s >= 1).length
  return passing / scores.length
}

// ─── groupMasteryByWaypoint ───────────────────────────────────────────────────

/**
 * Group FSRS retrievability scores by waypoint and average them.
 *
 * Waypoint-level mastery = average retrievability across all concepts in
 * the waypoint (per A4: the waypoint is the learner's mental unit).
 *
 * @param rows  Array of { waypoint_id, retrievability } pairs (one per concept card).
 * @returns     Map from waypoint_id → average retrievability in [0, 1].
 */
export function groupMasteryByWaypoint(
  rows: { waypoint_id: string; retrievability: number }[],
): Map<string, number> {
  const sums   = new Map<string, number>()
  const counts = new Map<string, number>()

  for (const row of rows) {
    sums.set(row.waypoint_id, (sums.get(row.waypoint_id) ?? 0) + row.retrievability)
    counts.set(row.waypoint_id, (counts.get(row.waypoint_id) ?? 0) + 1)
  }

  const result = new Map<string, number>()
  for (const [waypointId, sum] of sums) {
    result.set(waypointId, sum / counts.get(waypointId)!)
  }
  return result
}
