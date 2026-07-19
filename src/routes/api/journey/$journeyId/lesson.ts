/**
 * SSE lesson streaming route: GET /api/journey/:journeyId/lesson?waypointId=:id
 *
 * Streams a lesson as Server-Sent Events (SSE) with NDJSON-parsed section events.
 * Each SSE event carries one NDJSON line from the model (header, section, sources, error).
 *
 * Auth: requireAuth(env, request) — 401 if unauthenticated.
 * Quota: checkQuota(env.DB, userId, 'lesson') — emits quota.rejected if over limit.
 * Resume: reads existing lesson sections from D1; emits them immediately if present.
 * Fallback: lesson tier (z-ai/glm-5.2 → google/gemini-3.5-flash). On all-fallbacks failure, emits
 *   {"type":"error","message":"..."} then closes.
 * D1 writes: AWAITED before controller.close(). The ReadableStream start() fn keeps the Worker
 *   request alive while the stream is open, so awaiting the writes there guarantees they land on a
 *   real Worker. (A prior un-awaited Promise.all — despite the "ctx.waitUntil" claim — was killed at
 *   request teardown, so lessons never persisted and usage was never metered; local isolates masked
 *   it. This handler has no access to the execution context, so await-before-close is the fix.)
 * Terminal event: a {"type":"sources",...} event is always emitted before close (synthesised if the
 *   model never produced one) so the client's EventSource receives a clean completion and does not
 *   read the server-side close as a dropped connection and auto-reconnect into a regeneration loop.
 *
 * NDJSON line format produced by LESSON_SYSTEM_PROMPT:
 *   Line 1:   {"type":"header","title":"...","summary":"..."}
 *   Lines 2+: section objects (prose/code/heading/widget) with optional concept_tags
 *   Last:     {"type":"sources","sources":[...],"recommended_primary_source":...}
 *
 * Pattern: Workers-native ReadableStream + Response with text/event-stream content type.
 * Proven by /api/demo-stream (platform-proofs). Extended with NDJSON line parsing.
 */

import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { requireAuth } from "#/lib/auth-guard";
import { checkQuota } from "#/lib/ai/quota";
import { TIERS } from "#/lib/ai/tiers";
import { runModelWithFallback, computeCost, recordUsage } from "#/lib/ai/model-stream";
import { LESSON_SYSTEM_PROMPT, buildSourceMaterialBlock } from "#/lib/interview/prompts";
import type { SourceContent } from "#/lib/source-fetch";
import { upsertLesson } from "#/server/lessons";
import type { LessonSection as LessonSectionType, LessonSource } from "#/types/lesson-document";

export const Route = createFileRoute("/api/journey/$journeyId/lesson")({
  server: {
    handlers: {
      GET: async (ctx: { request: Request }): Promise<Response> => {
        const request = ctx.request;
        // ── 1. Parse params ──────────────────────────────────────────────────
        const url = new URL(request.url);
        // Path: /api/journey/{journeyId}/lesson
        const pathParts = url.pathname.split("/");
        const journeyId = pathParts[3] ?? "";
        const waypointId = url.searchParams.get("waypointId") ?? "";

        if (!journeyId || !waypointId) {
          return new Response("Missing journeyId or waypointId", { status: 400 });
        }

        // ── 2. Auth ──────────────────────────────────────────────────────────
        let session: Awaited<ReturnType<typeof requireAuth>>;
        try {
          session = await requireAuth(env, request);
        } catch {
          return new Response(null, { status: 401 });
        }
        const userId = session.user.id;

        // ── 2b. Verify journey ownership ──────────────────────────────────────
        const journeyRow = await env.DB.prepare("SELECT user_id FROM journeys WHERE id = ?")
          .bind(journeyId)
          .first<{ user_id: string }>();
        if (!journeyRow) return new Response(null, { status: 404 });
        if (journeyRow.user_id !== userId) return new Response(null, { status: 403 });

        // ── 3. Quota check ───────────────────────────────────────────────────
        const quotaStatus = await checkQuota(env.DB, userId, "lesson");
        if (!quotaStatus.allowed) {
          return new Response(JSON.stringify({ error: "Daily generation quota exhausted" }), {
            status: 429,
            headers: { "Content-Type": "application/json" },
          });
        }

        // ── 4. Read existing lesson for resume ───────────────────────────────
        const existingLesson = await env.DB.prepare(
          "SELECT id, content FROM lessons WHERE waypoint_id = ?",
        )
          .bind(waypointId)
          .first<{ id: string; content: string | null }>();

        const lessonId = existingLesson?.id ?? crypto.randomUUID();
        let resumeSections: LessonSectionType[] = [];
        if (existingLesson?.content) {
          try {
            resumeSections = JSON.parse(existingLesson.content) as LessonSectionType[];
          } catch {
            resumeSections = [];
          }
        }

        // ── 5. Read waypoint context for concept-tagging prompt ──────────────
        const waypoint = await env.DB.prepare(
          "SELECT title, goal, concepts FROM waypoints WHERE id = ? AND journey_id = ?",
        )
          .bind(waypointId, journeyId)
          .first<{ title: string; goal: string | null; concepts: string }>();

        let concepts: string[] = [];
        if (waypoint?.concepts) {
          try {
            concepts = JSON.parse(waypoint.concepts) as string[];
          } catch {
            concepts = [];
          }
        }

        // ── 5b. Load fetched source content from interview record (source-grounding) ─
        let lessonSourceContent: SourceContent[] = [];
        const interviewRow = await env.DB.prepare(
          "SELECT captured_source_content FROM interview_records WHERE journey_id = ? AND user_id = ?",
        )
          .bind(journeyId, userId)
          .first<{ captured_source_content: string | null }>();
        if (interviewRow?.captured_source_content) {
          try {
            const rawContent = JSON.parse(interviewRow.captured_source_content);
            if (Array.isArray(rawContent)) lessonSourceContent = rawContent as SourceContent[];
          } catch {
            lessonSourceContent = [];
          }
        }

        // ── 6. Build system message with waypoint context ────────────────────
        const waypointContext = waypoint
          ? `\n\n## Waypoint context\nTitle: ${waypoint.title}\nGoal: ${waypoint.goal ?? "Not specified"}\nConcepts to cover: ${concepts.join(", ")}`
          : "";

        // Append source grounding block when available (source-grounding slice)
        const groundingBlock =
          lessonSourceContent.length > 0 ? buildSourceMaterialBlock(lessonSourceContent) : "";

        const systemContent = LESSON_SYSTEM_PROMPT + waypointContext + groundingBlock;
        const userContent = `Generate the lesson for this waypoint now. Use the concept names from the waypoint context for concept_tags on each section.`;

        const messages: Array<{ role: "user" | "assistant"; content: string }> = [
          { role: "user", content: systemContent + "\n\n" + userContent },
        ];

        // ── 7. Build the SSE streaming response ──────────────────────────────
        const encoder = new TextEncoder();
        const tier = TIERS["lesson"];
        const modelChain = [tier.primaryModel, ...tier.fallbackChain];

        const stream = new ReadableStream({
          async start(controller) {
            // ── 7a. Emit any resume sections first ───────────────────────────
            for (const section of resumeSections) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(section)}\n\n`));
            }

            // ── 7b. Per-model-attempt SSE state ──────────────────────────────
            // The shared model-stream helper owns the fallback loop, chunk vocab,
            // and usage accumulation; this closure owns the token-by-token SSE
            // consumption. State resets on each fallback so a retried model starts
            // from the resume baseline (preserving the original per-attempt reset).
            const startTime = Date.now();
            let lineBuffer = "";
            let completedSections: LessonSectionType[] = [...resumeSections];
            let sourcesPayload: {
              sources: LessonSource[];
              recommended_primary_source: LessonSource | null;
            } = {
              sources: [],
              recommended_primary_source: null,
            };
            // Whether a terminal `sources` event has been sent to the client. If the
            // model never emits one, step 7e synthesises it so the client always closes.
            let sourcesEmitted = false;
            const resetPerModelState = () => {
              lineBuffer = "";
              completedSections = [...resumeSections];
              sourcesPayload = { sources: [], recommended_primary_source: null };
            };

            // ── 7c. onTextDelta: NDJSON line-buffer → token-by-token SSE enqueue ─
            const onTextDelta = (delta: string): void => {
              lineBuffer += delta;

              // Process all complete lines in the buffer
              let newlineIndex: number;
              while ((newlineIndex = lineBuffer.indexOf("\n")) !== -1) {
                const line = lineBuffer.slice(0, newlineIndex).trim();
                lineBuffer = lineBuffer.slice(newlineIndex + 1);

                if (!line) continue;

                // Skip markdown fence lines (defensive against model non-compliance)
                if (line.startsWith("```") || line.startsWith("---")) continue;

                let parsed: Record<string, unknown>;
                try {
                  parsed = JSON.parse(line) as Record<string, unknown>;
                } catch {
                  // Non-JSON line — skip with warn (R2 risk per plan)
                  console.log(
                    JSON.stringify({
                      event: "lesson.ndjson_skip",
                      user_id: userId,
                      waypoint_id: waypointId,
                      reason: "invalid JSON line",
                      preview: line.slice(0, 80),
                    }),
                  );
                  continue;
                }

                const lineType = parsed["type"] as string | undefined;

                if (lineType === "header") {
                  // Emit header event
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(parsed)}\n\n`));
                } else if (lineType === "sources") {
                  // Capture sources payload for the final D1 write
                  sourcesPayload = {
                    sources: (parsed["sources"] as LessonSource[]) ?? [],
                    recommended_primary_source:
                      (parsed["recommended_primary_source"] as LessonSource | null) ?? null,
                  };
                  // Emit sources event — signals completion to the client
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(parsed)}\n\n`));
                  sourcesEmitted = true;
                } else if (lineType != null) {
                  // Section event — guard for resume duplicates
                  const section = parsed as unknown as LessonSectionType;
                  const alreadyHave = completedSections.some((s) => s.id === section.id);
                  if (!alreadyHave) {
                    completedSections.push(section);
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(section)}\n\n`));
                  }
                }
              }
            };

            // ── 7d. Run the model chain (streaming) via the shared helper ────
            try {
              const { model, usage } = await runModelWithFallback({
                env,
                modelChain,
                messages,
                reasoningEffort: tier.reasoningEffort,
                modelTimeoutMs: 120_000, // 2 minutes per model attempt
                handlers: { onTextDelta },
                onFallback: (previousModel, model) => {
                  console.log(
                    JSON.stringify({
                      event: "model.fallback_triggered",
                      user_id: userId,
                      journey_id: journeyId,
                      waypoint_id: waypointId,
                      original_model: previousModel,
                      fallback_model: model,
                    }),
                  );
                  resetPerModelState();
                },
              });

              // ── 7e. Guarantee a terminal completion event ───────────────────
              // If the model finished without emitting a `sources` line, synthesise a
              // terminal `sources` event so the client's EventSource always receives a
              // clean completion and closes — otherwise it treats the server-side stream
              // close as a dropped connection and auto-reconnects into a regeneration loop.
              if (!sourcesEmitted) {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "sources", ...sourcesPayload })}\n\n`,
                  ),
                );
                sourcesEmitted = true;
              }

              // ── 7f. Persist to D1 + record usage — AWAITED before close ─────
              // Awaiting keeps the Worker request alive until the writes land. The prior
              // un-awaited Promise.all (no execution-context ctx.waitUntil is reachable
              // from this handler) was terminated at request teardown on a real Worker,
              // so lessons never persisted and lesson usage was never metered — silently
              // breaking the no-unmetered-generation invariant. A write failure logs but
              // does not fail the stream (the client already has the rendered content).
              const durationMs = Date.now() - startTime;
              const contentJson = JSON.stringify(completedSections);
              const sourcesJson = JSON.stringify(sourcesPayload);
              const { costUsd } = computeCost(usage, tier);

              try {
                await Promise.all([
                  upsertLesson(env.DB, waypointId, lessonId, contentJson, sourcesJson),
                  recordUsage(env.DB, {
                    userId,
                    journeyId,
                    model,
                    type: "lesson",
                    usage,
                    costUsd,
                    durationMs,
                  }),
                ]);
              } catch (err) {
                console.error("[lesson-sse] D1 persist/meter failed:", err);
              }

              console.log(
                JSON.stringify({
                  event: "generation.completed",
                  user_id: userId,
                  journey_id: journeyId,
                  waypoint_id: waypointId,
                  model,
                  generation_type: "lesson",
                  prompt_tokens: usage.prompt_tokens,
                  completion_tokens: usage.completion_tokens,
                  cost_usd: costUsd,
                  duration_ms: durationMs,
                  outcome: "success",
                }),
              );
            } catch (err) {
              // ── 7f. All models failed — emit terminal error event ──────────
              // Use a generic client-facing message; log the actual error server-side.
              const clientMsg = "Lesson generation failed. Please try again.";
              if (err instanceof Error) {
                console.error("[lesson-sse] all models failed:", err.message);
              }
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "error", message: clientMsg })}\n\n`,
                ),
              );

              console.log(
                JSON.stringify({
                  event: "generation.completed",
                  user_id: userId,
                  journey_id: journeyId,
                  waypoint_id: waypointId,
                  model: modelChain[modelChain.length - 1],
                  generation_type: "lesson",
                  outcome: "failure",
                  error_code: err instanceof Error ? err.message : "unknown",
                }),
              );
            }

            controller.close();
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "X-Lesson-Id": lessonId,
          },
        });
      },
    },
  },
});
