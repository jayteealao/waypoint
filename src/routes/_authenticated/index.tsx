import { createFileRoute } from '@tanstack/react-router'
import { JourneysDashboard } from '#/components/dashboard/JourneysDashboard'
import { listJourneys } from '#/server/journeys'
import { getProgressForDashboard } from '#/server/progress'

export const Route = createFileRoute('/_authenticated/')({
  head: () => ({
    meta: [{ title: 'Waypoint — Journeys' }],
  }),
  loader: async () => {
    // Load journey list + per-journey mastery in parallel where possible.
    // listJourneys is needed first to extract IDs for the mastery query.
    const journeys = await listJourneys()
    const ids = journeys.map((j) => j.id)
    const masteryByJourneyId = ids.length > 0
      ? await getProgressForDashboard({ data: ids })
      : {}
    return { masteryByJourneyId }
  },
  component: IndexPage,
})

function IndexPage() {
  const { masteryByJourneyId } = Route.useLoaderData()
  return <JourneysDashboard masteryByJourneyId={masteryByJourneyId} />
}
