/**
 * Sample journey quiz — /_authenticated/sample/quiz
 *
 * Renders the QuizView component with the SAMPLE_QUIZ fixture questions.
 * When the quiz completes (onComplete callback), dispatches `wp:sample-progress`
 * so the parent layout route updates the sidebar's quiz completion indicator.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";
import { SAMPLE_QUIZ } from "#/fixtures/sample-journey";
import { QuizView } from "#/components/quiz/QuizView";

export const Route = createFileRoute("/_authenticated/sample/quiz")({
  head: () => ({
    meta: [{ title: "Waypoint — Check Your Understanding" }],
  }),
  component: SampleQuizPage,
});

function SampleQuizPage() {
  const handleComplete = useCallback(() => {
    // Dispatch after the quiz attempt has been written to localStorage
    // (QuizView writes it synchronously before calling onComplete)
    window.dispatchEvent(new Event("wp:sample-progress"));
  }, []);

  return (
    <div data-testid="sample-quiz">
      <div className="max-w-[640px] mx-auto px-4 pt-6">
        <h1 className="display-title m-0 mb-6 text-2xl font-bold text-[var(--ink)]">
          Check Your Understanding
        </h1>
      </div>
      <QuizView mode="sample" questions={SAMPLE_QUIZ} onComplete={handleComplete} />
    </div>
  );
}
