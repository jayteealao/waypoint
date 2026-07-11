/**
 * Dev/test fixture route: /_authenticated/lesson/fixture
 *
 * Renders the canonical fixture lesson document. When `?stream=simulate` is
 * present, passes the document through `useSimulatedStream` so sections appear
 * one at a time — providing a deterministic surface for progressive-rendering
 * Playwright tests without any real network dependency.
 *
 * This route is intentionally behind the `_authenticated` layout so the
 * seeded-session helper pattern (same as auth-flow and design-system tests)
 * covers the Playwright AC verifications.
 *
 * Not exposed in the Sidebar nav — for dev and E2E use only.
 */

import { createFileRoute } from '@tanstack/react-router'
import { FIXTURE_LESSON } from '#/fixtures/lesson-fixture'
import { LessonView } from '#/components/lesson/LessonView'
import { useSimulatedStream } from '#/lib/lesson/stream-driver'

interface FixtureSearch {
  stream?: 'simulate'
}

function validateSearch(raw: Record<string, unknown>): FixtureSearch {
  return {
    stream: raw.stream === 'simulate' ? 'simulate' : undefined,
  }
}

export const Route = createFileRoute('/_authenticated/lesson/fixture')({
  validateSearch,
  head: () => ({
    meta: [{ title: 'Waypoint — Lesson Fixture' }],
  }),
  component: LessonFixturePage,
})

function LessonFixtureStream() {
  const partial = useSimulatedStream(FIXTURE_LESSON)
  return <LessonView doc={partial} />
}

function LessonFixturePage() {
  const { stream } = Route.useSearch()

  return (
    <div data-testid="lesson-fixture-page" style={{ paddingBlock: '1.5rem' }}>
      {stream === 'simulate' ? (
        <LessonFixtureStream />
      ) : (
        <LessonView doc={FIXTURE_LESSON} />
      )}
    </div>
  )
}
