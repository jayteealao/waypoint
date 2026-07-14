/**
 * Journey layout route: /_authenticated/journey/$journeyId
 *
 * Wraps all journey-scoped child routes (interview, waypoint/*).
 * Loads the journey and its waypoints, then populates ShellContext via useEffect
 * so the Sidebar and DrawerNav show the real waypoint list for this journey.
 *
 * Deviation from plan: the plan named this as an extension to _authenticated.tsx,
 * but _authenticated.tsx is a pathless layout with no access to $journeyId params.
 * Creating a dedicated layout route here is the correct TanStack Router pattern.
 * Documented as autonomous decision AD-1 in 05-implement-roadmap-lesson-generation.md.
 */

import { useEffect } from 'react'
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { getJourneyWithWaypoints } from '#/server/journeys'
import { useShell } from '#/components/shell/AppShell'
import { getWaypointsCollection } from '#/lib/store/collections'

export const Route = createFileRoute('/_authenticated/journey/$journeyId')({
  loader: async ({ params, context }) => {
    const result = await getJourneyWithWaypoints({ data: params.journeyId })
    // userId namespaces the client waypoints collection (AC-DLU7).
    return { journeyData: result, userId: context.auth?.user.id ?? '' }
  },
  component: JourneyLayout,
})

function JourneyLayout() {
  const { journeyId } = Route.useParams()
  const { journeyData, userId } = Route.useLoaderData()
  const { setWaypoints } = useShell()

  // Seed the waypoints collection from the loader's D1 payload (shape D5 loader-
  // seed pattern, second read exemplar after journeys). Additive: the shell nav
  // still renders from loader data below, so SSR/hydration is unaffected; the
  // collection is warmed for client-side navigation reads.
  useEffect(() => {
    if (journeyData && userId) {
      getWaypointsCollection(userId, journeyData.waypoints)
    }
  }, [journeyData, userId])

  useEffect(() => {
    if (!journeyData) {
      setWaypoints([])
      return
    }

    const mapped = journeyData.waypoints.map((wp) => ({
      id: wp.id,
      label: wp.title,
      href: `/_authenticated/journey/${journeyId}/waypoint/${wp.id}`,
      completed: false, // completion tracking is a future slice (quiz-fsrs)
    }))

    setWaypoints(mapped)

    // Clear waypoints when leaving the journey context
    return () => setWaypoints([])
  }, [journeyId, journeyData, setWaypoints])

  return <Outlet />
}
