/**
 * Roadmap generation server function — roadmap-lesson-generation slice.
 *
 * Reads the completed interview record, calls callGateway with the roadmap tier
 * (JSON comes from the system prompt), validates the model's JSON array, and
 * inserts waypoints atomically via D1 batch. On malformed JSON, one re-ask is
 * sent before throwing GenerationError.
 *
 * Returns { firstWaypointId } so the interview route can navigate directly.
 *
 * Pattern: withSession middleware + requireOwnership (same as journeys.ts).
 * Instrumentation: emits roadmap.generated signal on success.
 */
import { createServerFn, createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { requireAuth, requireOwnership } from "#/lib/auth-guard";
import { callGateway } from "#/lib/ai/gateway";
import { ROADMAP_SYSTEM_PROMPT } from "#/lib/interview/prompts";
import { validateRoadmap, buildRoadmapPrompt, GenerationError } from "#/lib/roadmap/schema";
import type { WaypointOutput } from "#/lib/roadmap/schema";
import type { InterviewRecord } from "#/types/interview";
import type { Journey } from "#/db/schema";

// ── withSession middleware (reused pattern) ────────────────────────────────────

const withSession = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const sessionData = await requireAuth(env, getRequest());
  return next({ context: { session: sessionData } });
});

// ── Result type ───────────────────────────────────────────────────────────────

export interface GenerateRoadmapResult {
  /** ID of the first waypoint (position 0) — used to navigate after generation. */
  firstWaypointId: string;
  /** Number of waypoints generated and inserted. */
  waypointCount: number;
}

/**
 * NODE_ENV values where the mock seam is allowed to engage. An explicit allow-list
 * (rather than `!== "production"`) so staging or any environment with an unset/unknown
 * NODE_ENV falls through to the real gateway call instead of persisting canned data.
 */
const MOCK_ALLOWED_NODE_ENVS = new Set(["development", "dev", "test", "ci"]);

/**
 * Scripted roadmap for E2E runs (`?mock=1`), the counterpart to interview.ts's
 * MOCK_QUESTIONS. Gated on an explicit NODE_ENV allow-list at the call site, so the seam
 * cannot leak to a real deployment.
 *
 * Deliberately shaped like a plausible model response — three waypoints with goals and
 * concepts — so the specs that read the roadmap surface exercise real rendering rather
 * than a degenerate one-item list.
 */
const MOCK_ROADMAP: WaypointOutput[] = [
  {
    title: "Orient: what this topic is for",
    goal: "Explain the problem the topic solves and when to reach for it.",
    concepts: ["Scope", "Motivation"],
  },
  {
    title: "Work the core mechanics",
    goal: "Apply the central technique to a worked example end to end.",
    concepts: ["Core technique", "Worked example", "Common pitfalls"],
  },
  {
    title: "Extend and check yourself",
    goal: "Adapt the technique to an unfamiliar case and verify the result.",
    concepts: ["Generalisation", "Self-check"],
  },
];

// ── Server function ───────────────────────────────────────────────────────────

/**
 * Generate a roadmap from a completed interview record.
 *
 * Preconditions:
 * - `journeyId` must exist and be owned by the authenticated user.
 * - An interview_records row must exist with status 'complete' or 'best_effort'.
 *
 * Side effects:
 * - Inserts waypoints into D1 `waypoints` table (atomic batch).
 * - Updates `journeys.status` to 'roadmap_ready'.
 * - Emits `roadmap.generated` instrumentation signal.
 *
 * @throws {GenerationError} if the model returns malformed JSON twice.
 */
export const generateRoadmap = createServerFn({ method: "POST" })
  .middleware([withSession])
  .validator((input: { journeyId: string; mock?: boolean }) => input)
  .handler(async ({ data, context }): Promise<GenerateRoadmapResult> => {
    const { journeyId, mock = false } = data;
    const { session } = context as { session: Awaited<ReturnType<typeof requireAuth>> };
    const startTime = Date.now();

    // ── 1. Verify journey ownership ────────────────────────────────────────────
    const journey = await env.DB.prepare("SELECT * FROM journeys WHERE id = ?")
      .bind(journeyId)
      .first<Journey>();
    if (!journey) throw new Response(null, { status: 404 });
    requireOwnership(session.user.id, journey.user_id);

    // ── 2. Load completed interview record ─────────────────────────────────────
    const record = await env.DB.prepare(
      `SELECT * FROM interview_records
       WHERE journey_id = ? AND user_id = ? AND status IN ('complete', 'best_effort')`,
    )
      .bind(journeyId, session.user.id)
      .first<InterviewRecord>();

    if (!record) {
      throw new Response(
        JSON.stringify({ error: "Interview must be complete before generating a roadmap" }),
        { status: 422, headers: { "Content-Type": "application/json" } },
      );
    }

    // ── 3. Assemble capture from the record ────────────────────────────────────
    let sourceUrls: string[] = [];
    try {
      sourceUrls = JSON.parse(record.captured_source_urls);
    } catch {
      sourceUrls = [];
    }

    // Load fetched source content for grounding (source-grounding slice)
    let sourceContent: Array<{ url: string; title: string; extractedText: string }> = [];
    try {
      const raw = JSON.parse(record.captured_source_content ?? "[]");
      if (Array.isArray(raw)) sourceContent = raw;
    } catch {
      sourceContent = [];
    }

    const capture = {
      mission: record.captured_mission,
      scope: record.captured_scope,
      priorKnowledge: record.captured_prior_knowledge,
      sourceUrls,
      bestEffort: record.best_effort === 1,
    };

    const userMessage = buildRoadmapPrompt(
      capture,
      sourceContent.length > 0 ? sourceContent : undefined,
    );

    // ── 4. Build messages for the gateway ─────────────────────────────────────
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      { role: "user", content: ROADMAP_SYSTEM_PROMPT + "\n\n" + userMessage },
    ];

    // ── 5. Call gateway — first attempt ───────────────────────────────────────
    // Mock seam, mirroring sendTurn's: scripted output for E2E, never reachable in
    // production. Without it the roadmap path is the one E2E flow that still needs a
    // live, paid model call, so it fails on any runner without a real OPENROUTER key —
    // which is how AC-P5 passed locally and failed on CI with "model returned invalid
    // JSON twice".
    let parsedRoadmap =
      mock === true && MOCK_ALLOWED_NODE_ENVS.has(process.env.NODE_ENV ?? "")
        ? MOCK_ROADMAP
        : await attemptRoadmapCall(session.user.id, journeyId, messages);

    // ── 6. One re-ask on failure ───────────────────────────────────────────────
    if (parsedRoadmap === null) {
      // Append the error context and try once more
      messages.push({
        role: "user",
        content:
          'The previous response was not valid JSON. Return ONLY a JSON array of waypoint objects with "title", "goal", and "concepts" fields. No markdown, no prose, no code blocks.',
      });
      parsedRoadmap = await attemptRoadmapCall(session.user.id, journeyId, messages);
      if (parsedRoadmap === null) {
        throw new GenerationError("Roadmap generation failed: model returned invalid JSON twice");
      }
    }

    // ── 7. Batch-insert waypoints ──────────────────────────────────────────────
    const waypointIds: string[] = parsedRoadmap.map(() => crypto.randomUUID());

    const insertStatements = parsedRoadmap.map((wp, i) =>
      env.DB.prepare(
        "INSERT INTO waypoints (id, journey_id, position, title, goal, concepts) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(waypointIds[i], journeyId, i, wp.title, wp.goal ?? null, JSON.stringify(wp.concepts)),
    );

    // Prepend a DELETE to replace any prior roadmap atomically (idempotency)
    const deleteStmt = env.DB.prepare("DELETE FROM waypoints WHERE journey_id = ?").bind(journeyId);

    await env.DB.batch([deleteStmt, ...insertStatements]);

    // ── 8. Update journey status ───────────────────────────────────────────────
    await env.DB.prepare(
      "UPDATE journeys SET status = 'roadmap_ready', updated_at = ? WHERE id = ?",
    )
      .bind(Date.now(), journeyId)
      .run();

    // ── 9. roadmap.generated instrumentation signal ────────────────────────────
    console.log(
      JSON.stringify({
        event: "roadmap.generated",
        user_id: session.user.id,
        journey_id: journeyId,
        waypoint_count: parsedRoadmap.length,
        duration_ms: Date.now() - startTime,
      }),
    );

    return {
      firstWaypointId: waypointIds[0]!,
      waypointCount: parsedRoadmap.length,
    };
  });

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Attempt one roadmap gateway call.
 * Returns the validated WaypointOutput[] on success, or null on parse/validation failure.
 * Non-validation errors (network, quota) are re-thrown.
 */
async function attemptRoadmapCall(
  userId: string,
  journeyId: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
) {
  const response = await callGateway({
    env,
    userId,
    journeyId,
    type: "roadmap",
    messages,
  });

  const text = response.text ?? "";

  // Strip possible markdown code fences (defensive — model may ignore format instructions)
  const stripped = text
    .replace(/^```(?:json)?\n?/m, "")
    .replace(/\n?```$/m, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    console.log(
      JSON.stringify({
        event: "roadmap.parse_failure",
        user_id: userId,
        journey_id: journeyId,
        reason: "JSON.parse failed",
        response_preview: text.slice(0, 200),
      }),
    );
    return null;
  }

  try {
    return validateRoadmap(parsed);
  } catch (err) {
    console.log(
      JSON.stringify({
        event: "roadmap.parse_failure",
        user_id: userId,
        journey_id: journeyId,
        reason: err instanceof Error ? err.message : "validation failed",
        response_preview: text.slice(0, 200),
      }),
    );
    return null;
  }
}
