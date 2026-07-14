import { createFileRoute } from '@tanstack/react-router'
import { JourneysDashboard } from '#/components/dashboard/JourneysDashboard'
import { listJourneys } from '#/server/journeys'
import { getProgressForDashboard } from '#/server/progress'

export const Route = createFileRoute('/_authenticated/')({
  head: () => ({
    meta: [{ title: 'Waypoint — Journeys' }],
  }),
  loader: async ({ context }) => {
    // Single D1 fetch per navigation (F8 / AC-DLU1): the loader is the ONLY
    // `listJourneys()` call. Its result is BOTH the mastery-query input and the
    // seed the dashboard hands to the journeys collection — the component no
    // longer re-fetches on mount.
    const journeys = await listJourneys()
    const ids = journeys.map((j) => j.id)
    const masteryByJourneyId = ids.length > 0
      ? await getProgressForDashboard({ data: ids })
      : {}
    // userId flows from the typed root context (auth is guaranteed on
    // _authenticated routes) and namespaces the client collection (AC-DLU7).
    const userId = context.auth?.user.id ?? ''
    return { journeys, masteryByJourneyId, userId }
  },
  component: IndexPage,
})

function IndexPage() {
  const { journeys, masteryByJourneyId, userId } = Route.useLoaderData()
  return (
    <JourneysDashboard
      journeys={journeys}
      masteryByJourneyId={masteryByJourneyId}
      userId={userId}
    />
  )
}
