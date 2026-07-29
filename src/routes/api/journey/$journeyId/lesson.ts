/**
 * SSE lesson streaming route: GET /api/journey/:journeyId/lesson?waypointId=:id
 *
 * Streams a lesson as Server-Sent Events (SSE) with NDJSON-parsed section events.
 * Each SSE event carries one NDJSON line from the model (header, section, sources, error).
 *
 * Auth: requireAuth(env, request) — 401 if unauthenticated. Authentication runs BEFORE
 *   parameter validation so an anonymous caller cannot learn the endpoint's parameter
 *   contract or tell malformed from unauthorized.
 * Ownership: the caller must own the journey (403 otherwise) AND the requested waypoint must
 *   belong to that journey (resolveOwnedWaypoint). A waypoint the caller does not own answers
 *   404 — indistinguishable from not-found, so the endpoint cannot be used to probe which
 *   waypoint ids exist. Every denial emits a server-side lesson.access_denied log. This gate
 *   sits above every lesson read AND above the upsert, so a foreign waypoint id can neither
 *   disclose nor overwrite another user's lesson.
 * Quota: checkQuota(env.DB, userId, 'lesson') — emits quota.rejected if over limit.
 * Resume: reads the existing lesson row from D1. If it already holds a complete lesson
 *   (non-empty sections + a persisted sources payload), the stream replays that stored
 *   content and emits the terminal event WITHOUT calling the model or metering again —
 *   this is what makes revisiting an already-generated waypoint free and instant, and
 *   what makes "Take Quiz" show up (the loader renders LessonView, not the generating
 *   view, once the stored row is recognised as complete). If the row is missing or
 *   incomplete, generation proceeds and any stored sections seed the resume baseline.
 * Fallback: lesson tier (z-ai/glm-5.2 → google/gemini-3.5-flash). On all-fallbacks failure, emits
 *   {"type":"error","message":"..."} then closes.
 * D1 writes: AWAITED before controller.close(), and ALSO handed to `waitUntil()` (imported
 *   from 'cloudflare:workers') as defense-in-depth. That module exports a context-free
 *   `waitUntil(promise): void` in this project's workerd version — no ExecutionContext needs
 *   to be threaded through — so unlike a plain fire-and-forget Promise.all, the write is
 *   registered with the platform even if something downstream stops awaiting it. The primary
 *   guarantee is still the `await`: the ReadableStream start() fn keeps the Worker request
 *   alive while the stream is open, so awaiting the writes there before enqueuing the
 *   terminal event guarantees both that they land AND that the client is told "done" only
 *   once the data is durable.
 * Stream validation: a stream that ends without throwing is not yet a lesson. Before the
 *   batch below runs, the generation must have produced a non-empty title, at least one
 *   structurally real section (non-empty string `id` + string `type`), and a terminal
 *   `sources` line whose payload is actually shaped like one. If any of those is missing
 *   the batch is skipped entirely — no lesson row, no usage row — and the client gets the
 *   existing {"type":"error",...} event. This is what keeps the billing invariant honest:
 *   a usage row is only ever recorded against a lesson a learner can actually open.
 *   Which guard failed is logged as lesson.stream_incomplete (reason + model) so the rate
 *   is measurable rather than inferred.
 * Atomicity: the lesson upsert and the usage-metering insert commit together via
 *   `env.DB.batch([...])` so a D1 failure can never leave one write applied without the
 *   other (an unmetered generation, or a metered generation with no lesson to show for it).
 *   If the batch throws, the client receives a terminal {"type":"error",...} event instead
 *   of a {"type":"sources",...} completion — it is never told "complete" for content that
 *   didn't actually get saved.
 * Terminal event: on the generation path, the {"type":"sources",...} completion event is
 *   enqueued only AFTER the D1 batch write above resolves — never before — so the client's
 *   `es.close()` (fired the instant it sees that event) never races the persist. On the
 *   resume-complete short-circuit path the terminal event is built directly from the stored
 *   row instead.
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
import { env, waitUntil } from "cloudflare:workers";
import { requireAuth } from "#/lib/auth-guard";
import { checkQuota } from "#/lib/ai/quota";
import { TIERS } from "#/lib/ai/tiers";
import { runModelWithFallback, computeCost, recordUsageStatement } from "#/lib/ai/model-stream";
import { LESSON_SYSTEM_PROMPT, buildSourceMaterialBlock } from "#/lib/interview/prompts";
import type { SourceContent } from "#/lib/source-fetch";
import { upsertLessonStatement } from "#/server/lessons";
import { resolveOwnedWaypoint } from "#/server/lesson-access";
import type {
  LessonDocumentV1,
  LessonSection as LessonSectionType,
  LessonSource,
} from "#/types/lesson-document";

/**
 * A candidate `sources` array element (or `recommended_primary_source`) is only a
 * LessonSource if it survives this check — `Array.isArray` alone accepts `[null]`,
 * `[42]`, or `["x"]`, and a cast over those would persist and bill a payload that
 * `source.url` in LessonView then throws on. `title` must be a real, non-empty
 * string; `url` may be absent or null but must be a string when it IS present.
 */
function isLessonSource(value: unknown): value is LessonSource {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate["title"] !== "string" || candidate["title"].trim() === "") return false;
  const url = candidate["url"];
  if (url !== undefined && url !== null && typeof url !== "string") return false;
  return true;
}

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

        // ── 2. Auth ──────────────────────────────────────────────────────────
        // Before parameter validation: an anonymous caller gets 401, never a 400 that
        // would spell out the parameter contract.
        let session: Awaited<ReturnType<typeof requireAuth>>;
        try {
          session = await requireAuth(env, request);
        } catch {
          return new Response(null, { status: 401 });
        }
        const userId = session.user.id;

        if (!journeyId || !waypointId) {
          return new Response("Missing journeyId or waypointId", { status: 400 });
        }

        // ── 2b. Verify journey ownership ──────────────────────────────────────
        const journeyRow = await env.DB.prepare("SELECT user_id FROM journeys WHERE id = ?")
          .bind(journeyId)
          .first<{ user_id: string }>();
        if (!journeyRow) return new Response(null, { status: 404 });
        if (journeyRow.user_id !== userId) return new Response(null, { status: 403 });

        // ── 2c. Verify waypoint ownership ────────────────────────────────────
        // Owning the journey is not owning the waypoint. Everything below reads or writes
        // by waypoint id, so this gate has to clear before any of it runs. Doubles as the
        // waypoint-context fetch the prompt needs — one query, not two.
        const waypoint = await resolveOwnedWaypoint(env.DB, { waypointId, journeyId, userId });
        if (!waypoint) return new Response(null, { status: 404 });

        // ── 3. Read existing lesson for resume ───────────────────────────────
        // NOTE: the quota gate deliberately runs *after* this read — see step 4.
        const existingLesson = await env.DB.prepare(
          "SELECT id, content, sources FROM lessons WHERE waypoint_id = ?",
        )
          .bind(waypointId)
          .first<{ id: string; content: string | null; sources: string | null }>();

        const lessonId = existingLesson?.id ?? crypto.randomUUID();

        // Stored `content` may be the current full LessonDocumentV1 shape or the bare
        // LessonSection[] array written before that shape existed — accept both.
        let resumeSections: LessonSectionType[] = [];
        let resumeTitle: string | undefined;
        let resumeSummary: string | undefined;
        if (existingLesson?.content) {
          try {
            const parsedContent = JSON.parse(existingLesson.content) as unknown;
            if (Array.isArray(parsedContent)) {
              resumeSections = parsedContent as LessonSectionType[];
            } else if (
              parsedContent &&
              typeof parsedContent === "object" &&
              Array.isArray((parsedContent as { sections?: unknown }).sections)
            ) {
              const doc = parsedContent as LessonDocumentV1;
              resumeSections = doc.sections;
              resumeTitle = doc.title;
              resumeSummary = doc.summary;
            }
          } catch {
            resumeSections = [];
          }
        }

        // Stored `sources` payload — present only once a generation has fully completed
        // and persisted (upsertLesson always writes content + sources together, in the
        // same statement batch). A parsed object here (not the column's un-touched '[]'
        // default) is the signal that the stored lesson is complete, not partial.
        let resumeSourcesPayload: {
          sources: LessonSource[];
          recommended_primary_source: LessonSource | null;
        } | null = null;
        if (existingLesson?.sources) {
          try {
            const parsedSources = JSON.parse(existingLesson.sources) as unknown;
            if (
              parsedSources &&
              typeof parsedSources === "object" &&
              !Array.isArray(parsedSources) &&
              Array.isArray((parsedSources as { sources?: unknown }).sources)
            ) {
              resumeSourcesPayload = parsedSources as {
                sources: LessonSource[];
                recommended_primary_source: LessonSource | null;
              };
            }
          } catch {
            resumeSourcesPayload = null;
          }
        }

        // A stored lesson with sections AND a persisted sources payload is a complete,
        // already-billed generation — replay it instead of re-running the model.
        const isResumedLessonComplete = resumeSections.length > 0 && resumeSourcesPayload !== null;

        // ── 4. Quota check — only for work that will actually call the model ──
        // This runs after the resume read, not before it. Quota meters *generation*, and a
        // replay generates nothing: it re-serves a lesson the learner has already been billed
        // for. Gating it here too would make an exhausted quota retroactively revoke access to
        // finished work, contradicting the free-and-instant revisit guarantee this route's
        // short-circuit exists to provide.
        if (!isResumedLessonComplete) {
          const quotaStatus = await checkQuota(env.DB, userId, "lesson");
          if (!quotaStatus.allowed) {
            return new Response(JSON.stringify({ error: "Daily generation quota exhausted" }), {
              status: 429,
              headers: { "Content-Type": "application/json" },
            });
          }
        }

        // ── 5. Waypoint context for the concept-tagging prompt ───────────────
        // Already resolved by the ownership gate at 2c — no second round-trip.
        let concepts: string[] = [];
        if (waypoint.concepts) {
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
        const waypointContext = `\n\n## Waypoint context\nTitle: ${waypoint.title}\nGoal: ${waypoint.goal ?? "Not specified"}\nConcepts to cover: ${concepts.join(", ")}`;

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
            // ── 7a. Resume-complete short-circuit ────────────────────────────
            // A stored lesson that already has sections AND a persisted sources payload
            // was fully generated and metered on a prior request (upsertLesson only ever
            // writes both together). Replay it verbatim — no model call, no re-metering —
            // so revisiting a generated waypoint is free and instant, and the client sees
            // the same event shape (header?, sections, terminal sources) it would after a
            // fresh generation.
            if (isResumedLessonComplete && resumeSourcesPayload) {
              if (resumeTitle !== undefined) {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: "header",
                      title: resumeTitle,
                      summary: resumeSummary ?? "",
                    })}\n\n`,
                  ),
                );
              }
              for (const section of resumeSections) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(section)}\n\n`));
              }
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "sources", ...resumeSourcesPayload })}\n\n`,
                ),
              );
              controller.close();
              return;
            }

            // ── 7a2. Emit any resume sections first (partial/prior-incomplete attempt) ─
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
            let headerTitle = resumeTitle ?? "";
            let headerSummary = resumeSummary ?? "";
            let sourcesPayload: {
              sources: LessonSource[];
              recommended_primary_source: LessonSource | null;
            } = {
              sources: [],
              recommended_primary_source: null,
            };
            // `sourcesPayload` is born structurally valid, so it cannot distinguish "the
            // model sent an empty sources list" from "the model never reached its terminal
            // line". This flag can: it is set only by a `sources` line whose payload is
            // actually shaped like one. It is the only completion signal a resume baseline
            // cannot fake, which is what makes the pre-persist gate meaningful on a resumed
            // generation (title and sections can both come from the stored row).
            let sawSources = false;
            const resetPerModelState = () => {
              lineBuffer = "";
              completedSections = [...resumeSections];
              headerTitle = resumeTitle ?? "";
              headerSummary = resumeSummary ?? "";
              // Reset alongside everything else above — a failing attempt that emitted a
              // sources-typed line before dying must not leak that payload into a
              // successful fallback attempt's persisted/terminal payload (RV-11).
              sourcesPayload = { sources: [], recommended_primary_source: null };
              sawSources = false;
            };

            // ── 7c. handleLine: one NDJSON line → state update + SSE enqueue ──
            // Hoisted out of the read loop so the post-stream residual flush (7d2) runs
            // the SAME parser rather than a second copy that could drift from it.
            const handleLine = (raw: string): void => {
              const line = raw.trim();
              if (!line) return;

              // Skip markdown fence lines (defensive against model non-compliance)
              if (line.startsWith("```") || line.startsWith("---")) return;

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
                // A non-blank line that fails to parse AFTER a valid sources line already
                // fired is still more stream than the protocol declared — the residual
                // flush (7d2) hits this exact path for a truncated final line, and a
                // sources line is only the terminal record if nothing follows it. Blank
                // lines never reach here (the `if (!line) return;` above filters them),
                // so trailing whitespace-only content cannot trip this.
                if (sawSources) {
                  sawSources = false;
                  sourcesPayload = { sources: [], recommended_primary_source: null };
                }
                return;
              }

              const lineType = parsed["type"] as string | undefined;

              if (lineType === "header") {
                headerTitle = (parsed["title"] as string) ?? headerTitle;
                headerSummary = (parsed["summary"] as string) ?? headerSummary;
                // Emit header event
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(parsed)}\n\n`));
              } else if (lineType === "sources") {
                // Capture the sources payload for the final D1 write. Deliberately NOT
                // enqueued here — the terminal `sources` SSE event is deferred until
                // after the D1 persist below resolves (RV-2), so the client's
                // `es.close()` (fired the instant it sees that event type) can never
                // race the write that makes this generation durable.
                //
                // Saying "sources" is not being sources: a line carrying a string where
                // the array belongs would persist a payload the resume reader rejects,
                // so the next visit regenerates and bills again — the same double-bill
                // loop from the other end. Only a structurally sound payload counts as
                // the protocol having completed.
                //
                // Every element of `sources`, and `recommended_primary_source` itself when
                // it is a non-null object, must actually be a LessonSource — an array of
                // `[null]` or `[42]` passes `Array.isArray` just as well as a real payload,
                // and casting that through persists a lesson LessonView cannot render
                // (it dereferences `source.url` unconditionally). `isLessonSource` is the
                // single predicate both checks share, so the array and the primary can
                // never disagree about what counts as a source.
                const rawSources = parsed["sources"];
                const rawPrimary = parsed["recommended_primary_source"];
                const primaryOk =
                  rawPrimary === undefined || rawPrimary === null || isLessonSource(rawPrimary);
                if (Array.isArray(rawSources) && rawSources.every(isLessonSource) && primaryOk) {
                  sourcesPayload = {
                    sources: rawSources as LessonSource[],
                    recommended_primary_source: (rawPrimary as LessonSource | null) ?? null,
                  };
                  sawSources = true;
                } else if (sawSources) {
                  // A second `sources` line — this one malformed — arrived after a valid
                  // one already completed the protocol. That is more stream than the
                  // protocol allows for; see the terminal-record note below.
                  sawSources = false;
                  sourcesPayload = { sources: [], recommended_primary_source: null };
                }
              } else if (lineType != null) {
                // Section event — guard for resume duplicates
                const section = parsed as unknown as LessonSectionType;
                const alreadyHave = completedSections.some((s) => s.id === section.id);
                if (!alreadyHave) {
                  completedSections.push(section);
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(section)}\n\n`));
                }
                // A valid `sources` line is supposed to be the LAST thing the protocol
                // emits (see NDJSON line format at the top of this file). A section
                // arriving after one means the stream kept going past what it declared
                // its terminal line to be — that is not the completed protocol the sources
                // line claimed to be, so un-claim it and let the stream-incomplete gate
                // below refuse the whole generation rather than bill a payload that was
                // never actually final.
                if (sawSources) {
                  sawSources = false;
                  sourcesPayload = { sources: [], recommended_primary_source: null };
                }
              }
            };

            const onTextDelta = (delta: string): void => {
              lineBuffer += delta;

              // Process all complete lines in the buffer
              let newlineIndex: number;
              while ((newlineIndex = lineBuffer.indexOf("\n")) !== -1) {
                const line = lineBuffer.slice(0, newlineIndex);
                lineBuffer = lineBuffer.slice(newlineIndex + 1);
                handleLine(line);
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

              // ── 7d2. Flush the residual, unterminated line ───────────────────
              // `runModelWithFallback` has no end-of-stream callback — its chunk loop
              // forwards deltas and returns (src/lib/ai/model-stream.ts:130-133) — so a
              // model whose last line lacks a trailing newline would otherwise leave that
              // line stranded in `lineBuffer`, silently losing it. Run it through the same
              // parser once. A *truncated* line stays a failure: it hits `handleLine`'s
              // catch, sets no flag, and the gate below refuses. End-of-stream is not
              // permission to salvage malformed JSON.
              const flushedResidual = lineBuffer.trim() !== "";
              if (flushedResidual) {
                handleLine(lineBuffer);
                lineBuffer = "";
              }

              // ── 7d3. Did the stream actually deliver a lesson? ───────────────
              // Billing on "the stream ended without throwing" persists and meters an
              // empty generation, which the waypoint loader then judges incomplete and
              // regenerates — billing twice for a lesson nobody can open. Three
              // independent signals decide whether there is anything worth committing.
              const hasRealSection = completedSections.some(
                (s) =>
                  typeof (s as { id?: unknown }).id === "string" &&
                  (s as { id: string }).id.trim() !== "" &&
                  typeof (s as { type?: unknown }).type === "string",
              );
              const failedGuards: string[] = [];
              if (typeof headerTitle !== "string" || headerTitle.trim() === "")
                failedGuards.push("missing_header");
              if (!hasRealSection) failedGuards.push("no_sections");
              if (!sawSources) failedGuards.push("missing_sources");
              const invalidReason = failedGuards[0] ?? null;

              // ── 7e. Persist + meter atomically, AWAITED before the terminal event ──
              // The lesson upsert and the usage-metering insert commit together via
              // `env.DB.batch([...])` — a D1 failure can never apply one write without
              // the other. The write is also handed to `waitUntil()` as defense-in-depth
              // (still awaited directly below; waitUntil is additive insurance, not a
              // replacement). Only once this settles does the client learn the outcome —
              // `sources` on success, `error` if the persist failed — so `es.close()`
              // never fires before the generation is actually durable.
              const durationMs = Date.now() - startTime;
              const { costUsd } = computeCost(usage, tier);
              let outcome: "success" | "persist_failed" | "invalid_stream";

              if (invalidReason !== null) {
                // Nothing worth committing — skip the batch entirely. The guard sits in
                // FRONT of `env.DB.batch([...])`, never inside it, so the atomicity
                // guarantee (both writes or neither) is untouched: this is "neither".
                // No lessons row, no usage row — a learner is never billed for a lesson
                // they cannot open.
                outcome = "invalid_stream";
                console.log(
                  JSON.stringify({
                    event: "lesson.stream_incomplete",
                    user_id: userId,
                    journey_id: journeyId,
                    waypoint_id: waypointId,
                    model,
                    reason: invalidReason,
                    failed: failedGuards,
                    had_resume_baseline: resumeSections.length > 0,
                    flushed_residual: flushedResidual,
                  }),
                );
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: "error",
                      message: "Lesson generation ended early and was not saved. Please try again.",
                    })}\n\n`,
                  ),
                );
              } else {
                const lessonDoc: LessonDocumentV1 = {
                  version: 1,
                  title: headerTitle,
                  summary: headerSummary,
                  sections: completedSections,
                  sources: sourcesPayload.sources,
                  recommended_primary_source: sourcesPayload.recommended_primary_source,
                };
                const contentJson = JSON.stringify(lessonDoc);
                const sourcesJson = JSON.stringify(sourcesPayload);

                let persistFailed = false;
                try {
                  const batchPromise = env.DB.batch([
                    upsertLessonStatement(env.DB, waypointId, lessonId, contentJson, sourcesJson),
                    recordUsageStatement(env.DB, {
                      userId,
                      journeyId,
                      model,
                      type: "lesson",
                      usage,
                      costUsd,
                      durationMs,
                    }),
                  ]);
                  waitUntil(batchPromise);
                  await batchPromise;
                } catch (err) {
                  persistFailed = true;
                  console.error("[lesson-sse] D1 persist/meter failed:", err);
                }

                outcome = persistFailed ? "persist_failed" : "success";

                if (persistFailed) {
                  // The learner must not be shown a "complete" lesson that was never
                  // actually saved — tell the client explicitly instead of the usual
                  // `sources` completion event.
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        type: "error",
                        message:
                          "Lesson generation finished but could not be saved. Please try again.",
                      })}\n\n`,
                    ),
                  );
                } else {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ type: "sources", ...sourcesPayload })}\n\n`,
                    ),
                  );
                }
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
                  outcome,
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
