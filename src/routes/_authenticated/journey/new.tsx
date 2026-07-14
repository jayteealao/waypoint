/**
 * New journey entry point: /_authenticated/journey/new
 *
 * Collects the learner's goal, creates a journey record, calls startInterview()
 * to get the first (consent) question from the interview model tier, then
 * navigates to the interview route.
 *
 * TanStack Form deviation: TanStack Form is not installed in this project.
 * Using a controlled React textarea with useState instead — same behaviour,
 * no additional dependency. Recorded as a deviation in the implementation record.
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { createJourney } from "#/server/journeys";
import { startInterview } from "#/server/interview";

export const Route = createFileRoute("/_authenticated/journey/new")({
  head: () => ({
    meta: [{ title: "Waypoint — Start a Journey" }],
  }),
  component: NewJourneyPage,
});

function NewJourneyPage() {
  const navigate = useNavigate();
  const [goal, setGoal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const MIN_GOAL_LENGTH = 5;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = goal.trim();

    if (trimmed.length < MIN_GOAL_LENGTH) {
      setError("Please describe your goal in a few words (at least 5 characters).");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      // Create the journey, then immediately start the interview.
      // Both happen before navigation so the interview route always
      // loads a hydrated record, avoiding a loader waterfall.
      const journey = await createJourney({ data: { title: trimmed, goal: trimmed } });
      await startInterview({ data: journey.id });
      await navigate({ to: "/journey/$journeyId/interview", params: { journeyId: journey.id } });
    } catch (err) {
      setError("Something went wrong — please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="wp-new-journey-page" style={{ padding: "2rem 1rem" }}>
      <header style={{ marginBottom: "2rem", maxWidth: "560px", marginInline: "auto" }}>
        <h1
          className="display-title"
          style={{
            fontSize: "1.75rem",
            fontWeight: 700,
            color: "var(--ink)",
            marginBottom: "0.5rem",
          }}
        >
          Start a new journey
        </h1>
        <p style={{ color: "var(--ink-muted)", fontSize: "1rem", lineHeight: 1.55 }}>
          Tell us what you want to learn. Your tutor will guide you from there.
        </p>
      </header>

      <form
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
        className="wp-new-journey-form"
      >
        <div>
          <label
            htmlFor="goal-input"
            style={{
              display: "block",
              fontSize: "0.9375rem",
              fontWeight: 600,
              color: "var(--ink)",
              marginBottom: "0.5rem",
            }}
          >
            What do you want to learn?
          </label>
          <textarea
            id="goal-input"
            data-testid="goal-input"
            className={["wp-new-journey-textarea", error ? "wp-new-journey-textarea--error" : ""]
              .filter(Boolean)
              .join(" ")}
            value={goal}
            onChange={(e) => {
              setGoal(e.target.value);
              if (error) setError(null);
            }}
            placeholder="e.g. Build a web app with TypeScript and React"
            disabled={isSubmitting}
            rows={3}
            aria-describedby={error ? "goal-error" : undefined}
            aria-invalid={error ? true : undefined}
          />
          {error && (
            <p id="goal-error" className="wp-new-journey-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <button
          type="submit"
          className="btn-base btn-primary btn-md"
          data-testid="start-journey-submit"
          disabled={isSubmitting || goal.trim().length < MIN_GOAL_LENGTH}
          aria-busy={isSubmitting}
        >
          {isSubmitting ? "Starting…" : "Start journey"}
        </button>
      </form>
    </div>
  );
}
