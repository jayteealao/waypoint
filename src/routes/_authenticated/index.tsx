import { createFileRoute } from '@tanstack/react-router'
import { JourneysDashboard } from '#/components/dashboard/JourneysDashboard'

export const Route = createFileRoute('/_authenticated/')({
  head: () => ({
    meta: [{ title: 'Waypoint — Journeys' }],
  }),
  component: IndexPage,
})

function IndexPage() {
  return <JourneysDashboard />
}
