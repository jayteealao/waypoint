/**
 * Sample journey layout route — /_authenticated/sample
 *
 * Wraps all /sample/* child routes. Responsibilities:
 *   1. Inject sample waypoints into ShellContext (populates Sidebar + DrawerNav).
 *   2. Mark the journey as visited (localStorage) on first entry.
 *   3. Recompute completion state whenever a child route completes a waypoint
 *      (via the `wp:sample-progress` custom DOM event).
 *   4. Clear waypoints from ShellContext on unmount (navigating away from /sample).
 *
 * No D1 rows are created — the sample journey is entirely fixture-driven.
 */

import { createFileRoute, Outlet } from '@tanstack/react-router'
import { useEffect, useCallback } from 'react'
import { useShell } from '#/components/shell/AppShell'
import {
  SAMPLE_WAYPOINTS,
  SAMPLE_JOURNEY_VISITED_KEY,
  LESSON_1_VISITED_KEY,
  LESSON_2_VISITED_KEY,
  SAMPLE_QUIZ_ATTEMPT_KEY,
} from '#/fixtures/sample-journey'

export const Route = createFileRoute('/_authenticated/sample')({
  head: () => ({
    meta: [{ title: 'Waypoint — Sample Journey' }],
  }),
  component: SampleLayout,
})

function SampleLayout() {
  const { setWaypoints } = useShell()

  /**
   * Derive completion state from localStorage and update ShellContext.
   * Called on mount and whenever `wp:sample-progress` fires.
   */
  const recompute = useCallback(() => {
    if (typeof localStorage === 'undefined') return

    const lesson1Done = localStorage.getItem(LESSON_1_VISITED_KEY) === 'true'
    const lesson2Done = localStorage.getItem(LESSON_2_VISITED_KEY) === 'true'
    const quizDone    = localStorage.getItem(SAMPLE_QUIZ_ATTEMPT_KEY) !== null

    // sw-intro is always complete once the user has entered the sample journey
    // (the visited key is set below on mount, so it is already true here)
    const completedIds = new Set<string>(['sw-intro'])
    if (lesson1Done) completedIds.add('sw-lesson-1')
    if (lesson2Done) completedIds.add('sw-lesson-2')
    if (quizDone)    completedIds.add('sw-quiz')

    setWaypoints(
      SAMPLE_WAYPOINTS.map((wp) => ({ ...wp, completed: completedIds.has(wp.id) })),
    )
  }, [setWaypoints])

  useEffect(() => {
    // Mark sample journey visited (suppresses first-login redirect on return visits)
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SAMPLE_JOURNEY_VISITED_KEY, 'true')
    }

    recompute()

    // Listen for progress events dispatched by child routes when they complete a waypoint
    window.addEventListener('wp:sample-progress', recompute)

    return () => {
      window.removeEventListener('wp:sample-progress', recompute)
      setWaypoints([]) // clear waypoints when navigating away from /sample
    }
  }, [recompute, setWaypoints])

  return (
    <div data-testid="sample-layout">
      <Outlet />
    </div>
  )
}
