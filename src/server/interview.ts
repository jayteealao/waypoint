/**
 * Interview server functions — tutor-interview slice.
 *
 * Four functions using the withSession middleware pattern from src/server/journeys.ts.
 * All functions enforce per-user isolation via requireAuth + requireOwnership.
 *
 * Non-streaming: interview turns use a single callGateway() call (full response
 * then render). The interview model (z-ai/glm-5.2 at reasoning effort `low`) is fast enough for the < 3s
 * turn NFR without SSE streaming, and streaming a single short question offers
 * no perceivable benefit. Explicit autonomous decision per plan assumptions #1.
 *
 * Mock seam: sendTurn honors { mock: true } only when NODE_ENV !== 'production'.
 * Gated by process.env.NODE_ENV check to prevent production bypass.
 * This is the same test-harness pattern as lesson/fixture.tsx.
 */
import { createServerFn, createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { requireAuth, requireOwnership } from "#/lib/auth-guard";
import { callGateway } from "#/lib/ai/gateway";
import { InterviewStateMachine } from "#/lib/interview/state-machine";
import { INTERVIEW_SYSTEM_PROMPT } from "#/lib/interview/prompts";
import { fetchSourceUrl } from "#/lib/source-fetch";
import type { SourceContent } from "#/lib/source-fetch";
import type {
  InterviewRecord,
  InterviewStage,
  InterviewTurn,
  TurnResponse,
  CapturedRecord,
} from "#/types/interview";
import { STAGE_CHIPS } from "#/types/interview";
import type { Journey } from "#/db/schema";

// ── withSession middleware (reused pattern from journeys.ts) ───────────────

const withSession = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const sessionData = await requireAuth(env, getRequest());
  return next({ context: { session: sessionData } });
});

// ── Mock scripted questions (non-production only) ──────────────────────────

/** Scripted question per stage for deterministic E2E testing. */
const MOCK_QUESTIONS: Partial<Record<InterviewStage, string>> = {
  consent: "Welcome! May I ask a few questions to understand your goal better?",
  mission: "What specifically do you want to be able to build or do when you're done?",
  scope: "How much experience do you already have with this topic?",
  prior_knowledge: "What related concepts or skills do you already know well?",
  sources: "Do you have any preferred learning resources or URLs to include?",
  complete: "Your roadmap is being prepared — we'll have it ready shortly!",
  declined: "No problem! I'll use your stated goal to build your roadmap.",
};

// ── Template responses (no gateway call needed) ────────────────────────────

/**
 * Returned when fetchSourceUrl fails during the sources stage.
 * Matches the in-band failure response pattern used by the `declined` stage
 * (template message, no gateway call, stage stays at `sources`).
 */
const FETCH_FAILURE_CHIPS = ["Continue without it", "Try another URL"];

function buildFetchFailureResponse(url: string): string {
  return `I wasn't able to access ${url} — it may be behind a paywall, temporarily unavailable, or the URL may be incorrect. You can share another URL, or reply "continue" to proceed with your stated sources.`;
}

// ── Internal helpers ───────────────────────────────────────────────────────

/** Parse turns JSON from the DB row; returns empty array on malformed input. */
function parseTurns(turnsJson: string): InterviewTurn[] {
  try {
    const parsed = JSON.parse(turnsJson);
    return Array.isArray(parsed) ? (parsed as InterviewTurn[]) : [];
  } catch {
    return [];
  }
}

/** Parse source URL list from the DB row. */
function parseSourceUrls(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

/** Parse source content array from the DB row. */
function parseSourceContent(json: string): SourceContent[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as SourceContent[]) : [];
  } catch {
    return [];
  }
}

/** Extract a URL from free text, if present. */
function extractUrl(text: string): string | null {
  const match = text.match(/https?:\/\/\S+/);
  return match?.[0] ?? null;
}

// ── startInterview ─────────────────────────────────────────────────────────

/**
 * Create an interview record for a journey and return the first (consent) question.
 *
 * Inserts the interview_records row with status='pending' and stage='consent',
 * calls the gateway to generate the consent question (the tutor's opening message),
 * and returns { question, chips, stage }.
 *
 * Idempotent for in-progress interviews: if a record already exists and is pending,
 * returns the first assistant turn rather than creating a duplicate.
 */
export const startInterview = createServerFn({ method: "POST" })
  .middleware([withSession])
  .validator((journeyId: string) => journeyId)
  .handler(async ({ data: journeyId, context }): Promise<TurnResponse> => {
    const { session } = context as { session: Awaited<ReturnType<typeof requireAuth>> };

    // Verify ownership
    const journey = await env.DB.prepare("SELECT * FROM journeys WHERE id = ?")
      .bind(journeyId)
      .first<Journey>();
    if (!journey) throw new Response(null, { status: 404 });
    requireOwnership(session.user.id, journey.user_id);

    // Idempotency: return existing record if already started
    const existing = await env.DB.prepare(
      "SELECT * FROM interview_records WHERE journey_id = ? AND user_id = ?",
    )
      .bind(journeyId, session.user.id)
      .first<InterviewRecord>();

    if (existing) {
      const turns = parseTurns(existing.turns);
      const firstAssistant = turns.find((t) => t.role === "assistant");
      if (firstAssistant) {
        return {
          question: firstAssistant.content,
          chips: STAGE_CHIPS["consent"],
          stage: "consent",
        };
      }
    }

    // Build the initial message: user's goal triggers the consent question
    const goalMessage = journey.goal
      ? `My goal is: ${journey.goal}`
      : "I'd like to start a new learning journey.";

    // Call the gateway — interview tier (z-ai/glm-5.2 primary)
    const gatewayResult = await callGateway({
      env: { DB: env.DB, OPENROUTER_API_KEY: env.OPENROUTER_API_KEY },
      userId: session.user.id,
      journeyId,
      type: "interview",
      messages: [{ role: "user", content: `${INTERVIEW_SYSTEM_PROMPT}\n\n${goalMessage}` }],
    });

    const rawText =
      gatewayResult.text ?? "Welcome! May I ask a few questions to understand your goal better?";
    const sm = new InterviewStateMachine("consent");
    const question = sm.extractFirstQuestion(rawText);

    // Build the initial turns array: user goal + assistant consent question
    const initialTurns: InterviewTurn[] = [
      { role: "user", content: goalMessage, stage: "consent" },
      { role: "assistant", content: question, stage: "consent" },
    ];

    // Insert the interview record
    const recordId = crypto.randomUUID();
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO interview_records
       (id, journey_id, user_id, status, stage, turns, captured_source_urls, captured_source_content, best_effort, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', 'consent', ?, '[]', '[]', 0, ?, ?)`,
    )
      .bind(recordId, journeyId, session.user.id, JSON.stringify(initialTurns), now, now)
      .run();

    return {
      question,
      chips: STAGE_CHIPS["consent"],
      stage: "consent",
    };
  });

// ── sendTurn ───────────────────────────────────────────────────────────────

/**
 * Process one user turn in the interview.
 *
 * Appends the user message to the turns array, runs the state machine
 * transition, calls the gateway (or returns a mock in test mode), extracts
 * the first question from the model response, captures any stage-specific
 * fields, and persists the updated record.
 *
 * Mock seam: when mock === true AND NODE_ENV !== 'production', returns scripted
 * responses from MOCK_QUESTIONS without calling the gateway.
 */
export const sendTurn = createServerFn({ method: "POST" })
  .middleware([withSession])
  .validator((input: { journeyId: string; userContent: string; mock?: boolean }) => input)
  .handler(async ({ data, context }): Promise<TurnResponse> => {
    const { session } = context as { session: Awaited<ReturnType<typeof requireAuth>> };
    const { journeyId, userContent, mock = false } = data;
    const turnStart = Date.now();

    // Load the interview record
    const record = await env.DB.prepare(
      "SELECT * FROM interview_records WHERE journey_id = ? AND user_id = ?",
    )
      .bind(journeyId, session.user.id)
      .first<InterviewRecord>();
    if (!record) throw new Response(null, { status: 404 });

    // Verify journey ownership (defence in depth)
    const journey = await env.DB.prepare("SELECT user_id FROM journeys WHERE id = ?")
      .bind(journeyId)
      .first<Pick<Journey, "user_id">>();
    if (!journey) throw new Response(null, { status: 404 });
    requireOwnership(session.user.id, journey.user_id);

    const turns = parseTurns(record.turns);
    const currentStage = record.stage as InterviewStage;

    // Append user turn
    const userTurn: InterviewTurn = { role: "user", content: userContent, stage: currentStage };
    turns.push(userTurn);

    // Advance state machine
    const sm = new InterviewStateMachine(currentStage);
    // eslint-disable-next-line prefer-const
    let nextStage = sm.transition(userContent);

    // Capture field for the stage we just completed — only when the stage actually advanced.
    // If nextStage === currentStage (e.g. vague mission answer), captureField is skipped so
    // transient/rejected answers are never written to the captured_* columns.
    // `let` because source-grounding may override back to currentStage on fetch failure.
    let captured = nextStage !== currentStage ? sm.captureField(currentStage, userContent) : {};

    // Extract any source URL from the sources stage and accumulate it
    let sourceUrls = parseSourceUrls(record.captured_source_urls);
    const extractedUrl = currentStage === "sources" ? extractUrl(userContent) : null;
    if (extractedUrl) sourceUrls = [...sourceUrls, extractedUrl];

    // Source-grounding: fetch and store source content at interview-time.
    // Skipped in mock mode (E2E tests inject pre-seeded content instead).
    let sourceContent = parseSourceContent(record.captured_source_content ?? "[]");
    let fetchFailedQuestion: string | null = null;

    // Note: URL fetch runs regardless of mock mode. The mock flag only suppresses
    // the AI gateway call; source-URL fetch is a side effect worth testing in E2E.
    if (currentStage === "sources" && extractedUrl !== null) {
      const fetchResult = await fetchSourceUrl(extractedUrl);
      if (fetchResult.ok) {
        sourceContent = [
          ...sourceContent,
          {
            url: fetchResult.url,
            title: fetchResult.title,
            extractedText: fetchResult.extractedText,
          },
        ];
      } else {
        // Fetch failed — stay at sources stage with template response.
        // Override nextStage back to sources and clear captured so the stage
        // machine acts as if no transition occurred.
        fetchFailedQuestion = buildFetchFailureResponse(extractedUrl);
        // Remove the unfetchable URL so it is not stored in captured_source_urls
        sourceUrls = sourceUrls.filter((u) => u !== extractedUrl);
        nextStage = currentStage;
        captured = {};
        console.log(
          JSON.stringify({
            event: "interview.source_fetch_failed",
            user_id: session.user.id,
            journey_id: journeyId,
            url: extractedUrl,
            reason: fetchResult.reason,
          }),
        );
      }
    }

    // Determine the question for the next stage
    let question: string;
    const isTerminal = nextStage === "complete" || nextStage === "declined";

    if (fetchFailedQuestion !== null) {
      // Fetch failure: template message, no gateway call, stage stays at sources
      question = fetchFailedQuestion;
    } else if (isTerminal) {
      // No gateway call needed for terminal stages
      question =
        nextStage === "declined"
          ? "No problem! I'll use your stated goal to build your personalised roadmap. It's on its way."
          : "Thank you! I have everything I need. Your personalised roadmap is being prepared.";
    } else if (mock === true && process.env.NODE_ENV !== "production") {
      // Mock mode: deterministic scripted response for E2E tests
      question = MOCK_QUESTIONS[nextStage] ?? `Tell me more about stage: ${nextStage}`;
    } else {
      // Live mode: call the gateway with accumulated conversation turns
      const gatewayMessages = turns.map((t) => ({ role: t.role, content: t.content }));
      const gatewayResult = await callGateway({
        env: { DB: env.DB, OPENROUTER_API_KEY: env.OPENROUTER_API_KEY },
        userId: session.user.id,
        journeyId,
        type: "interview",
        messages: [{ role: "user", content: INTERVIEW_SYSTEM_PROMPT }, ...gatewayMessages],
      });
      const rawText = gatewayResult.text ?? MOCK_QUESTIONS[nextStage] ?? "";
      question = new InterviewStateMachine(nextStage).extractFirstQuestion(rawText);
    }

    // Append assistant turn
    const assistantTurn: InterviewTurn = { role: "assistant", content: question, stage: nextStage };
    turns.push(assistantTurn);

    // Build declined record if needed
    let bestEffort = record.best_effort === 1;
    if (nextStage === "declined") {
      bestEffort = true;
    }

    // Persist updated record
    const now = Date.now();
    const newStatus =
      nextStage === "complete" ? "complete" : nextStage === "declined" ? "best_effort" : "pending";

    await env.DB.prepare(
      `UPDATE interview_records SET
         stage = ?, status = ?, turns = ?,
         captured_mission = ?,
         captured_scope = ?,
         captured_prior_knowledge = ?,
         captured_source_urls = ?,
         captured_source_content = ?,
         best_effort = ?,
         updated_at = ?
       WHERE id = ?`,
    )
      .bind(
        nextStage,
        newStatus,
        JSON.stringify(turns),
        captured.mission ?? record.captured_mission,
        captured.scope ?? record.captured_scope,
        captured.priorKnowledge ?? record.captured_prior_knowledge,
        JSON.stringify(sourceUrls),
        JSON.stringify(sourceContent),
        bestEffort ? 1 : 0,
        now,
        record.id,
      )
      .run();

    // Instrumentation: interview.turn_completed (04b-instrument.md §2)
    console.log(
      JSON.stringify({
        event: "interview.turn_completed",
        user_id: session.user.id,
        journey_id: journeyId,
        turn_number: turns.length,
        question_type: nextStage,
        latency_ms: Date.now() - turnStart,
      }),
    );

    return {
      question,
      chips: fetchFailedQuestion !== null ? FETCH_FAILURE_CHIPS : STAGE_CHIPS[nextStage],
      stage: nextStage,
    };
  });

// ── getInterviewState ──────────────────────────────────────────────────────

/**
 * Load the full interview record for a journey.
 * Used for resume hydration in the interview route's loader.
 */
export const getInterviewState = createServerFn()
  .middleware([withSession])
  .validator((journeyId: string) => journeyId)
  .handler(async ({ data: journeyId, context }): Promise<InterviewRecord | null> => {
    const { session } = context as { session: Awaited<ReturnType<typeof requireAuth>> };

    const record = await env.DB.prepare(
      "SELECT * FROM interview_records WHERE journey_id = ? AND user_id = ?",
    )
      .bind(journeyId, session.user.id)
      .first<InterviewRecord>();

    if (!record) return null;

    // Verify ownership
    const journey = await env.DB.prepare("SELECT user_id FROM journeys WHERE id = ?")
      .bind(journeyId)
      .first<Pick<Journey, "user_id">>();
    if (!journey) throw new Response(null, { status: 404 });
    requireOwnership(session.user.id, journey.user_id);

    return record;
  });

// ── completeInterview ──────────────────────────────────────────────────────

/**
 * Mark the interview as complete and return the captured record.
 * Sets interview_records.status = 'complete'.
 *
 * The captured record is used by roadmap-lesson-generation to seed the roadmap.
 */
export const completeInterview = createServerFn({ method: "POST" })
  .middleware([withSession])
  .validator((journeyId: string) => journeyId)
  .handler(async ({ data: journeyId, context }): Promise<CapturedRecord> => {
    const { session } = context as { session: Awaited<ReturnType<typeof requireAuth>> };

    const record = await env.DB.prepare(
      "SELECT * FROM interview_records WHERE journey_id = ? AND user_id = ?",
    )
      .bind(journeyId, session.user.id)
      .first<InterviewRecord>();
    if (!record) throw new Response(null, { status: 404 });

    requireOwnership(session.user.id, record.user_id);

    // Mark as complete (idempotent)
    const now = Date.now();
    await env.DB.prepare(
      "UPDATE interview_records SET status = 'complete', updated_at = ? WHERE id = ?",
    )
      .bind(now, record.id)
      .run();

    return {
      mission: record.captured_mission,
      scope: record.captured_scope,
      priorKnowledge: record.captured_prior_knowledge,
      sourceUrls: parseSourceUrls(record.captured_source_urls),
      bestEffort: record.best_effort === 1,
    };
  });
