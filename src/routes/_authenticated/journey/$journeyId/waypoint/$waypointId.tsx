/**
 * Waypoint lesson page: /_authenticated/journey/$journeyId/waypoint/$waypointId
 *
 * Loader reads the D1 lesson for this waypoint (via getLessonByWaypointId).
 * - If a complete lesson exists: renders LessonView with the parsed LessonDocumentV1.
 * - If no lesson yet (null or empty content): renders LessonGeneratingView,
 *   which opens EventSource to /api/journey/$journeyId/lesson?waypointId=$waypointId
 *   and streams content progressively.
 *
 * Verification seams:
 *   data-testid="waypoint-page"  — page wrapper (always present)
 *   data-testid="lesson-content" — rendered by LessonGeneratingView when streaming
 *   data-testid="lesson-view"    — rendered by LessonView when content is complete
 */

import { createFileRoute } from '@tanstack/react-router'
import { getLessonByWaypointId } from '#/server/lessons'
import { LessonView } from '#/components/lesson/LessonView'
import { LessonGeneratingView } from '#/components/generation/LessonGeneratingView'
import type { LessonDocumentV1, LessonSection } from '#/types/lesson-document'

export const Route = createFileRoute(
  '/_authenticated/journey/$journeyId/waypoint/$waypointId',
)({
  head: () => ({ meta: [{ title: 'Waypoint — Lesson' }] }),
  loader: async ({ params }) => {
    const lesson = await getLessonByWaypointId({ data: params.waypointId })
    return { lesson }
  },
  component: WaypointPage,
})

function WaypointPage() {
  const { journeyId, waypointId } = Route.useParams()
  const { lesson } = Route.useLoaderData()

  // Parse the stored lesson content if available
  let parsedDoc: LessonDocumentV1 | null = null
  let resumeSections: LessonSection[] = []

  if (lesson?.content) {
    // Attempt to parse as a full LessonDocumentV1 first
    try {
      const raw = JSON.parse(lesson.content) as unknown
      // If it's an array, it's the progressive sections format used during streaming
      if (Array.isArray(raw)) {
        resumeSections = raw as LessonSection[]
      } else {
        // Full document (e.g. from an older format or future format)
        parsedDoc = raw as LessonDocumentV1
      }
    } catch {
      parsedDoc = null
    }
  }

  return (
    <div data-testid="waypoint-page" style={{ padding: '1.5rem 1rem' }}>
      {parsedDoc ? (
        // Complete stored lesson — render directly
        <LessonView doc={parsedDoc} />
      ) : (
        // No complete lesson or partial sections — stream/resume
        <LessonGeneratingView
          journeyId={journeyId}
          waypointId={waypointId}
          initialSections={resumeSections}
        />
      )}
    </div>
  )
}
