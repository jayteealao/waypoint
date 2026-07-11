/**
 * Sample journey lesson 1 — /_authenticated/sample/lesson-1
 *
 * Renders SAMPLE_LESSON_1 through the production LessonView component.
 * Marks lesson-1 as visited in localStorage on mount and dispatches
 * `wp:sample-progress` (in a setTimeout to ensure the layout's recompute
 * listener sees the updated localStorage value, per the risk-mitigation note
 * in the implementation plan).
 */

import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect } from 'react'
import { SAMPLE_LESSON_1, LESSON_1_VISITED_KEY } from '#/fixtures/sample-journey'
import { LessonView } from '#/components/lesson/LessonView'

export const Route = createFileRoute('/_authenticated/sample/lesson-1')({
  head: () => ({
    meta: [{ title: 'Waypoint — How Waypoint Teaches' }],
  }),
  component: SampleLesson1Page,
})

function SampleLesson1Page() {
  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LESSON_1_VISITED_KEY, 'true')
    }
    // Dispatch after current effect batch so the layout recompute sees fresh localStorage
    const id = setTimeout(() => {
      window.dispatchEvent(new Event('wp:sample-progress'))
    }, 0)
    return () => clearTimeout(id)
  }, [])

  return (
    <div data-testid="sample-lesson-1">
      <LessonView doc={SAMPLE_LESSON_1} />

      {/* Lesson navigation */}
      <nav
        className="max-w-[640px] mx-auto px-4 pb-8 flex items-center justify-between mt-4 gap-4"
        aria-label="Lesson navigation"
      >
        <Link
          to="/sample"
          className="btn-base btn-outline btn-sm"
        >
          ← Overview
        </Link>
        <Link
          to="/sample/lesson-2"
          className="btn-base btn-primary btn-sm"
        >
          Next: Spaced Repetition →
        </Link>
      </nav>
    </div>
  )
}
