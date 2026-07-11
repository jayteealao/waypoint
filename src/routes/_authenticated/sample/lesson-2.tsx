/**
 * Sample journey lesson 2 — /_authenticated/sample/lesson-2
 *
 * Renders SAMPLE_LESSON_2 through the production LessonView component.
 * Marks lesson-2 as visited in localStorage on mount and dispatches
 * `wp:sample-progress` so the sidebar updates the lesson-2 completion indicator.
 */

import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect } from 'react'
import { SAMPLE_LESSON_2, LESSON_2_VISITED_KEY } from '#/fixtures/sample-journey'
import { LessonView } from '#/components/lesson/LessonView'

export const Route = createFileRoute('/_authenticated/sample/lesson-2')({
  head: () => ({
    meta: [{ title: 'Waypoint — Spaced Repetition' }],
  }),
  component: SampleLesson2Page,
})

function SampleLesson2Page() {
  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LESSON_2_VISITED_KEY, 'true')
    }
    const id = setTimeout(() => {
      window.dispatchEvent(new Event('wp:sample-progress'))
    }, 0)
    return () => clearTimeout(id)
  }, [])

  return (
    <div data-testid="sample-lesson-2">
      <LessonView doc={SAMPLE_LESSON_2} />

      {/* Lesson navigation */}
      <nav
        className="max-w-[640px] mx-auto px-4 pb-8 flex items-center justify-between mt-4 gap-4"
        aria-label="Lesson navigation"
      >
        <Link
          to="/sample/lesson-1"
          className="btn-base btn-outline btn-sm"
        >
          ← Lesson 1
        </Link>
        <Link
          to="/sample/quiz"
          className="btn-base btn-primary btn-sm"
        >
          Take the quiz →
        </Link>
      </nav>
    </div>
  )
}
