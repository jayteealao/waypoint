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

import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { InterviewStage, InterviewTurn, TurnResponse } from "#/types/interview";
import { STAGE_CHIPS } from "#/types/interview";
import { getInterviewState, sendTurn, completeInterview } from "#/server/interview";
import { generateRoadmap } from "#/server/roadmap";
import { parseMockFlag } from "#/lib/interview/mock-flag";
import { InterviewView } from "#/components/interview/InterviewView";
import { RoadmapPendingCard } from "#/components/generation/RoadmapPendingCard";

/**
 * Validate search params — `mock=1` enables scripted test responses.
 * Delegates to the round-trip-idempotent `parseMockFlag` (see that module for
 * why the boolean/`"true"` canonical forms must be accepted, not just `1`).
 */
function validateSearch(raw: Record<string, unknown>): { mock?: boolean } {
  return { mock: parseMockFlag(raw["mock"]) ? true : undefined };
}

/**
 * Minimum time the completion card stays on screen after the final answer.
 *
 * Without it the card's visible lifetime is one server round-trip: a fast reply swaps in
 * the roadmap-pending view before the confirmation ever paints, and the learner goes
 * straight from answering a question to "Building your roadmap…". Roadmap generation is
 * started before the hold begins, so this overlaps the work rather than adding to it.
 */
const COMPLETION_HOLD_MS = 1000;

/**
 * Minimum time the roadmap-pending card stays on screen once it replaces the completion card.
 *
 * Generation is started before the completion hold begins, so on a fast backend it can settle
 * during that hold. Without this floor, swapping to the pending card and immediately awaiting
 * an already-resolved promise gives React no guaranteed paint before navigate() unmounts it.
 */
const PENDING_HOLD_MS = 400;

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

  // Completion-hold timer. Cleared on unmount so navigating away mid-hold cannot resume
  // into setState on an unmounted component.
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);
  useEffect(() => {
    return () => {
      unmountedRef.current = true;
      if (holdTimerRef.current !== null) clearTimeout(holdTimerRef.current);
    };
  }, []);

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

    // The hold starts HERE, not before the await: the card the hold exists to make visible is
    // only on screen once completion has persisted. Starting the clock earlier meant a slow
    // round-trip spent the whole budget before the card painted, so the confirmation could be
    // replaced almost immediately — the exact defect the hold was added to prevent.
    const holdUntil = Date.now() + COMPLETION_HOLD_MS;

    // Start generation now but do not await it yet — the completion card holds while this
    // runs, so the confirmation costs nothing when generation is slower than the hold.
    const generation = generateRoadmap({ data: { journeyId, mock: mock === true } });
    // Attach a no-op catch immediately: a rejection during the hold would otherwise be an
    // unhandled rejection. The real handling is the awaited catch below.
    generation.catch(() => {});

    await new Promise<void>((resolve) => {
      holdTimerRef.current = setTimeout(resolve, Math.max(0, holdUntil - Date.now()));
    });
    if (unmountedRef.current) return;

    // Hold satisfied — swap in the roadmap pending card and wait out generation.
    setGeneratingRoadmap(true);
    setGenerationError(null);

    try {
      const [result] = await Promise.all([
        generation,
        new Promise<void>((resolve) => setTimeout(resolve, PENDING_HOLD_MS)),
      ]);
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
