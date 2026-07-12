/**
 * Unit tests for progress metric derivation functions.
 *
 * AC-10 (metric derivation): "Given the metric derivations, When computed
 * from fixture data, Then mastery-from-retrievability, pass rates, streak
 * arithmetic (timezone/day-boundary rules), and due counts match hand-computed
 * expectations."
 *
 * These tests pin the streak arithmetic at UTC midnight boundaries (the
 * most failure-prone case, per A3 in the plan). All timestamps are expressed
 * as UTC milliseconds from the Unix epoch.
 *
 * constraint-resolution: po-accepted — deterministic Vitest unit tests with
 * clock control; no runtime environment dependency.
 */

import { describe, it, expect } from 'vitest'
import {
  computeStreak,
  computePassRate,
  groupMasteryByWaypoint,
} from '#/lib/progress/metrics'

const MS_PER_DAY = 86_400_000

// A fixed "now" anchor: 2026-07-12T10:00:00Z (10am UTC, well into the day)
const NOW_MS = Date.UTC(2026, 6, 12, 10, 0, 0)   // months are 0-indexed

// Helpers
function daysAgoMs(n: number, nowMs = NOW_MS): number {
  return Math.floor(nowMs / MS_PER_DAY) * MS_PER_DAY - n * MS_PER_DAY + MS_PER_DAY / 2
  // Uses midday of n days ago to avoid midnight rounding issues in the helper itself
}

// ─── computeStreak ────────────────────────────────────────────────────────────

describe('computeStreak', () => {
  it('returns 0 for empty array', () => {
    expect(computeStreak([], NOW_MS)).toBe(0)
  })

  it('returns 1 for a single attempt today', () => {
    const todayMidday = daysAgoMs(0)
    expect(computeStreak([todayMidday], NOW_MS)).toBe(1)
  })

  it('returns 2 for attempts today and yesterday', () => {
    const today     = daysAgoMs(0)
    const yesterday = daysAgoMs(1)
    expect(computeStreak([today, yesterday], NOW_MS)).toBe(2)
  })

  it('breaks on a gap: today + 3 days ago → streak = 1', () => {
    const today     = daysAgoMs(0)
    const threeDays = daysAgoMs(3)
    expect(computeStreak([today, threeDays], NOW_MS)).toBe(1)
  })

  it('counts only consecutive days backward from latest', () => {
    // today, yesterday, day-before-yesterday = 3
    // but day 4 ago is missing, so streak is 3
    const dates = [daysAgoMs(0), daysAgoMs(1), daysAgoMs(2), daysAgoMs(5)]
    expect(computeStreak(dates, NOW_MS)).toBe(3)
  })

  it('returns 0 when only attempt was 2+ days ago (streak broken)', () => {
    const twoDaysAgo = daysAgoMs(2)
    expect(computeStreak([twoDaysAgo], NOW_MS)).toBe(0)
  })

  it('handles UTC midnight boundary: 1ms before midnight is previous UTC day', () => {
    // Use exactly midnight UTC as "now"; an attempt at 23:59:59.999 the day
    // before is day -1 (yesterday index), so streak should be 1.
    const midnightNow = Math.floor(NOW_MS / MS_PER_DAY) * MS_PER_DAY  // midnight of today UTC
    const justBeforeMidnight = midnightNow - 1  // still yesterday's UTC day

    expect(computeStreak([justBeforeMidnight], midnightNow)).toBe(1)
  })

  it('returns 1 for yesterday-only attempt (active streak, missed today)', () => {
    const yesterday = daysAgoMs(1)
    expect(computeStreak([yesterday], NOW_MS)).toBe(1)
  })

  it('deduplicates multiple attempts on the same day', () => {
    // Three attempts today (different times) should still count as 1 day
    const today1 = daysAgoMs(0) - 3_600_000
    const today2 = daysAgoMs(0)
    const today3 = daysAgoMs(0) + 3_600_000
    expect(computeStreak([today1, today2, today3], NOW_MS)).toBe(1)
  })
})

// ─── computePassRate ─────────────────────────────────────────────────────────

describe('computePassRate', () => {
  it('returns 0 for empty array', () => {
    expect(computePassRate([])).toBe(0)
  })

  it('returns 0 when all scores are null or 0', () => {
    expect(computePassRate([null, 0, null, 0])).toBe(0)
  })

  it('returns 0.5 for [null, 0, 1, 2]', () => {
    // 2 passing (score ≥ 1), 4 total → 0.5
    expect(computePassRate([null, 0, 1, 2])).toBe(0.5)
  })

  it('returns 1 when all scores are ≥ 1', () => {
    expect(computePassRate([1, 2, 3])).toBe(1)
  })

  it('treats score = 1 as passing', () => {
    expect(computePassRate([1])).toBe(1)
  })

  it('treats score = 0.9 as failing (< 1)', () => {
    expect(computePassRate([0.9])).toBe(0)
  })
})

// ─── groupMasteryByWaypoint ───────────────────────────────────────────────────

describe('groupMasteryByWaypoint', () => {
  it('returns empty map for empty input', () => {
    const result = groupMasteryByWaypoint([])
    expect(result.size).toBe(0)
  })

  it('returns single-waypoint mastery correctly', () => {
    const rows = [{ waypoint_id: 'wp1', retrievability: 0.8 }]
    const result = groupMasteryByWaypoint(rows)
    expect(result.get('wp1')).toBe(0.8)
  })

  it('averages multiple concepts for the same waypoint', () => {
    const rows = [
      { waypoint_id: 'wp1', retrievability: 0.6 },
      { waypoint_id: 'wp1', retrievability: 0.4 },
    ]
    const result = groupMasteryByWaypoint(rows)
    // Average of 0.6 + 0.4 = 0.5
    expect(result.get('wp1')).toBeCloseTo(0.5)
  })

  it('handles two waypoints independently', () => {
    const rows = [
      { waypoint_id: 'wp1', retrievability: 1.0 },
      { waypoint_id: 'wp2', retrievability: 0.0 },
    ]
    const result = groupMasteryByWaypoint(rows)
    expect(result.get('wp1')).toBe(1.0)
    expect(result.get('wp2')).toBe(0.0)
  })

  it('correctly handles an uneven distribution across waypoints', () => {
    const rows = [
      { waypoint_id: 'wp1', retrievability: 0.9 },
      { waypoint_id: 'wp1', retrievability: 0.7 },
      { waypoint_id: 'wp1', retrievability: 0.8 },
      { waypoint_id: 'wp2', retrievability: 0.5 },
    ]
    const result = groupMasteryByWaypoint(rows)
    expect(result.get('wp1')).toBeCloseTo(0.8, 10)   // (0.9+0.7+0.8)/3
    expect(result.get('wp2')).toBe(0.5)
  })
})
