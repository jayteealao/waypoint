/**
 * Quiz route: /_authenticated/journey/$journeyId/waypoint/$waypointId/quiz
 *
 * Loader: reads cached quiz_questions for this waypoint. If none exist yet,
 * calls generateQuiz to generate and persist them, then returns the list.
 *
 * Component: renders <QuizView mode="journey"> inside a quiz-page wrapper.
 * On quiz completion:
 *  1. Calls proposeAdaptation with the quiz score.
 *  2. If the score is below threshold and no pending adaptation exists,
 *     an adaptation proposal is returned and shown in the quiz-completion-overlay.
 *  3. The learner accepts (new waypoint inserted) or declines (no change).
 *  4. Either path navigates to the lesson page.
 *
 * The quiz-completion-overlay sits above the QuizView results screen. The
 * QuizView's own "← Back to Lesson" link remains as an alternative path.
 *
 * Verification seams:
 *   data-testid="quiz-page"              — page wrapper (always present)
 *   data-testid="quiz-completion-overlay"— overlay shown after quiz ends
 *   data-testid="adapt-card"             — adaptation card (when proposal exists)
 *   data-testid="adapt-accept"           — accept button
 *   data-testid="adapt-decline"          — decline button
 */

import { useState } from 'react'
import { createFileRoute, useRouter, Link } from '@tanstack/react-router'
import { getQuizQuestions, generateQuiz } from '#/server/quiz'
import { proposeAdaptation, respondToProposal } from '#/server/adaptation'
import { QuizView } from '#/components/quiz/QuizView'
import { AdaptationCard } from '#/components/progress/AdaptationCard'
import type { QuizQuestion, Adaptation } from '#/db/schema'

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
  const { questions }              = Route.useLoaderData()
  const router                     = useRouter()

  const [quizDone,   setQuizDone]   = useState(false)
  const [adaptation, setAdaptation] = useState<Adaptation | null>(null)
  const [adapting,   setAdapting]   = useState(false)   // loading flag while calling server

  async function handleComplete(score: number, total: number) {
    setQuizDone(true)
    // Call proposeAdaptation — returns null if score ≥ 50% or pending proposal exists
    try {
      const proposal = await proposeAdaptation({
        data: { journeyId, waypointId, quizScore: score, totalQuestions: total },
      })
      setAdaptation(proposal)
    } catch {
      // Non-fatal: adaptation check failed; proceed without proposal
      setAdaptation(null)
    }
  }

  async function handleAccept() {
    if (!adaptation) return
    setAdapting(true)
    try {
      await respondToProposal({ data: { adaptationId: adaptation.id, response: 'accepted' } })
    } catch {
      // Best-effort: acceptance recorded if possible
    }
    void router.navigate({ to: '/journey/$journeyId/waypoint/$waypointId', params: { journeyId, waypointId } })
  }

  async function handleDecline() {
    if (!adaptation) return
    setAdapting(true)
    try {
      await respondToProposal({ data: { adaptationId: adaptation.id, response: 'declined' } })
    } catch {
      // Best-effort: decline recorded if possible
    }
    void router.navigate({ to: '/journey/$journeyId/waypoint/$waypointId', params: { journeyId, waypointId } })
  }

  return (
    <div data-testid="quiz-page" style={{ padding: '1.5rem 1rem' }}>
      <QuizView
        mode="journey"
        questions={questions}
        journeyId={journeyId}
        waypointId={waypointId}
        onComplete={(score, total) => { void handleComplete(score, total) }}
      />

      {/* Overlay shown after quiz completion */}
      {quizDone && (
        <div
          className="wp-quiz-completion-overlay"
          data-testid="quiz-completion-overlay"
        >
          <AdaptationCard
            adaptation={adaptation}
            onAccept={handleAccept}
            onDecline={handleDecline}
            loading={adapting}
          />

          {/* Next lesson CTA — always visible regardless of proposal */}
          {!adaptation && (
            <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
              <Link
                to="/journey/$journeyId/waypoint/$waypointId"
                params={{ journeyId, waypointId }}
                className="btn-base btn-primary btn-md"
              >
                Next lesson →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
