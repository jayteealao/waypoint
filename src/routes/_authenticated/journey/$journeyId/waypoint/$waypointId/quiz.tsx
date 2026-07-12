/**
 * Quiz route: /_authenticated/journey/$journeyId/waypoint/$waypointId/quiz
 *
 * Loader: reads cached quiz_questions for this waypoint. If none exist yet,
 * calls generateQuiz to generate and persist them, then returns the list.
 *
 * Component: renders <QuizView mode="journey"> inside a quiz-page wrapper.
 * On quiz completion, navigates back to the waypoint lesson page.
 *
 * Generation on first visit ensures the learner only waits for generation
 * when they explicitly request the quiz — not on every lesson page load.
 *
 * Verification seams:
 *   data-testid="quiz-page"         — page wrapper (always present)
 *   (QuizView seams are documented in QuizView.tsx)
 */

import { createFileRoute, useRouter } from '@tanstack/react-router'
import { getQuizQuestions, generateQuiz } from '#/server/quiz'
import { QuizView } from '#/components/quiz/QuizView'
import type { QuizQuestion } from '#/db/schema'

export const Route = createFileRoute(
  '/_authenticated/journey/$journeyId/waypoint/$waypointId/quiz',
)({
  head: () => ({ meta: [{ title: 'Waypoint — Quiz' }] }),
  loader: async ({ params }): Promise<{ questions: QuizQuestion[] }> => {
    const { journeyId, waypointId } = params

    let questions = await getQuizQuestions({ data: waypointId })

    if (questions.length === 0) {
      // First visit — generate and persist questions for this waypoint
      questions = await generateQuiz({ data: { waypointId, journeyId } })
    }

    return { questions }
  },
  component: QuizPage,
})

function QuizPage() {
  const { journeyId, waypointId } = Route.useParams()
  const { questions } = Route.useLoaderData()
  const router = useRouter()

  function handleComplete() {
    void router.navigate({
      to: '/journey/$journeyId/waypoint/$waypointId',
      params: { journeyId, waypointId },
    })
  }

  return (
    <div data-testid="quiz-page" style={{ padding: '1.5rem 1rem' }}>
      <QuizView
        mode="journey"
        questions={questions}
        journeyId={journeyId}
        waypointId={waypointId}
        onComplete={handleComplete}
      />
    </div>
  )
}
