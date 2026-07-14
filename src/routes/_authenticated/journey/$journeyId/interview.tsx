/**
 * Interview route: /_authenticated/journey/$journeyId/interview
 *
 * Loads interview state from D1 for resume hydration, then renders
 * the InterviewView chat surface. Handles both a freshly-started interview
 * (created by new.tsx → startInterview) and a resumed mid-interview session.
 *
 * The loader calls getInterviewState() — if the record doesn't exist yet
 * (edge case: navigating here before startInterview completed), the component
 * falls back to an empty interview starting at 'consent'.
 */

import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { InterviewStage, InterviewTurn, TurnResponse } from "#/types/interview";
import { STAGE_CHIPS } from "#/types/interview";
import { getInterviewState, sendTurn, completeInterview } from "#/server/interview";
import { generateRoadmap } from "#/server/roadmap";
import { InterviewView } from "#/components/interview/InterviewView";
import { RoadmapPendingCard } from "#/components/generation/RoadmapPendingCard";

/** Validate search params — `mock=1` enables scripted test responses. */
function validateSearch(raw: Record<string, unknown>): { mock?: boolean } {
  return {
    mock: raw["mock"] === "1" || raw["mock"] === 1 ? true : undefined,
  };
}

export const Route = createFileRoute("/_authenticated/journey/$journeyId/interview")({
  validateSearch,
  head: () => ({
    meta: [{ title: "Waypoint — Interview" }],
  }),
  loader: async ({ params }) => {
    const record = await getInterviewState({ data: params.journeyId });
    return { record };
  },
  component: InterviewPage,
});

function InterviewPage() {
  const { journeyId } = Route.useParams();
  const { mock } = Route.useSearch();
  const { record } = Route.useLoaderData();
  const navigate = useNavigate();

  const [generatingRoadmap, setGeneratingRoadmap] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Parse existing turns for resume hydration
  let initialTurns: InterviewTurn[] = [];
  let initialStage: InterviewStage = "consent";
  let initialChips: string[] = STAGE_CHIPS["consent"];

  if (record) {
    try {
      initialTurns = JSON.parse(record.turns) as InterviewTurn[];
    } catch {
      initialTurns = [];
    }
    initialStage = record.stage as InterviewStage;
    initialChips = STAGE_CHIPS[initialStage] ?? [];
  }

  async function handleSendTurn(userContent: string): Promise<TurnResponse> {
    // mock=true passes scripted responses in dev/test; guarded by NODE_ENV !== 'production'
    // in the server function so the mock gate never leaks to production.
    return sendTurn({ data: { journeyId, userContent, mock: mock === true } });
  }

  async function handleComplete(stage: "complete" | "declined") {
    if (stage !== "complete") return;

    try {
      await completeInterview({ data: journeyId });
    } catch {
      // Best-effort: completion was already persisted by sendTurn's terminal stage handling
    }

    // Show the roadmap pending card and trigger generation
    setGeneratingRoadmap(true);
    setGenerationError(null);

    try {
      const result = await generateRoadmap({ data: journeyId });
      // Navigate to the first waypoint lesson page
      await navigate({
        to: "/journey/$journeyId/waypoint/$waypointId",
        params: { journeyId, waypointId: result.firstWaypointId },
      });
    } catch (err) {
      setGeneratingRoadmap(false);
      setGenerationError(
        err instanceof Error ? err.message : "Roadmap generation failed. Please try again.",
      );
    }
  }

  // Roadmap generation in progress — replace the interview surface
  if (generatingRoadmap) {
    return (
      <div data-testid="interview-page">
        <RoadmapPendingCard />
      </div>
    );
  }

  // Generation error fallback
  if (generationError) {
    return (
      <div data-testid="interview-page" style={{ padding: "2rem 1rem", textAlign: "center" }}>
        <p style={{ color: "var(--error)", fontWeight: 600, marginBottom: "0.5rem" }}>
          Roadmap generation failed
        </p>
        <p style={{ color: "var(--ink-muted)", fontSize: "0.9rem", marginBottom: "1rem" }}>
          {generationError}
        </p>
        <button
          type="button"
          className="btn-base btn-primary"
          onClick={() => {
            setGenerationError(null);
            void handleComplete("complete");
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="interview-page"
      style={{
        padding: "1.5rem 1rem",
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 4rem)",
        minHeight: 0,
      }}
    >
      <header style={{ marginBottom: "1rem" }}>
        <h1
          style={{
            fontSize: "1.25rem",
            fontWeight: 700,
            color: "var(--ink)",
            margin: 0,
          }}
        >
          Tell me about your goal
        </h1>
        <p style={{ color: "var(--ink-muted)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
          Your tutor will ask a few questions to build a personalised roadmap.
        </p>
      </header>

      <InterviewView
        journeyId={journeyId}
        initialTurns={initialTurns}
        initialStage={initialStage}
        initialChips={initialChips}
        onSendTurn={handleSendTurn}
        onComplete={(stage) => {
          void handleComplete(stage);
        }}
      />
    </div>
  );
}
