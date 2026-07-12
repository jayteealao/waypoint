/**
 * SSE lesson streaming route: GET /api/journey/:journeyId/lesson?waypointId=:id
 *
 * Streams a lesson as Server-Sent Events (SSE) with NDJSON-parsed section events.
 * Each SSE event carries one NDJSON line from the model (header, section, sources, error).
 *
 * Auth: requireAuth(env, request) — 401 if unauthenticated.
 * Quota: checkQuota(env.DB, userId, 'lesson') — emits quota.rejected if over limit.
 * Resume: reads existing lesson sections from D1; emits them immediately if present.
 * Fallback: lesson tier (claude-3.5-haiku → gpt-4o). On all-fallbacks failure, emits
 *   {"type":"error","message":"..."} then closes.
 * D1 writes: fire-and-forget via ctx.waitUntil (non-blocking on the SSE stream).
 *
 * NDJSON line format produced by LESSON_SYSTEM_PROMPT:
 *   Line 1:   {"type":"header","title":"...","summary":"..."}
 *   Lines 2+: section objects (prose/code/heading/widget) with optional concept_tags
 *   Last:     {"type":"sources","sources":[...],"recommended_primary_source":...}
 *
 * Pattern: Workers-native ReadableStream + Response with text/event-stream content type.
 * Proven by /api/demo-stream (platform-proofs). Extended with NDJSON line parsing.
 */

// @ts-ignore — @tanstack/ai is in beta
import { chat } from '@tanstack/ai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { requireAuth } from '#/lib/auth-guard'
import { checkQuota } from '#/lib/ai/quota'
import { TIERS } from '#/lib/ai/tiers'
import { LESSON_SYSTEM_PROMPT } from '#/lib/interview/prompts'
import { upsertLesson } from '#/server/lessons'
import type { LessonSection as LessonSectionType, LessonSource } from '#/types/lesson-document'

export const Route = createFileRoute('/api/journey/$journeyId/lesson')({
  server: {
    handlers: {
      GET: async (ctx: { request: Request }): Promise<Response> => {
        const request = ctx.request
        // ── 1. Parse params ──────────────────────────────────────────────────
        const url = new URL(request.url)
        // Path: /api/journey/{journeyId}/lesson
        const pathParts = url.pathname.split('/')
        const journeyId = pathParts[3] ?? ''
        const waypointId = url.searchParams.get('waypointId') ?? ''

        if (!journeyId || !waypointId) {
          return new Response('Missing journeyId or waypointId', { status: 400 })
        }

        // ── 2. Auth ──────────────────────────────────────────────────────────
        let session: Awaited<ReturnType<typeof requireAuth>>
        try {
          session = await requireAuth(env, request)
        } catch {
          return new Response(null, { status: 401 })
        }
        const userId = session.user.id

        // ── 3. Quota check ───────────────────────────────────────────────────
        const quotaStatus = await checkQuota(env.DB, userId, 'lesson')
        if (!quotaStatus.allowed) {
          return new Response(
            JSON.stringify({ error: 'Daily generation quota exhausted' }),
            { status: 429, headers: { 'Content-Type': 'application/json' } },
          )
        }

        // ── 4. Read existing lesson for resume ───────────────────────────────
        const existingLesson = await env.DB.prepare(
          'SELECT id, content FROM lessons WHERE waypoint_id = ?',
        )
          .bind(waypointId)
          .first<{ id: string; content: string | null }>()

        const lessonId = existingLesson?.id ?? crypto.randomUUID()
        let resumeSections: LessonSectionType[] = []
        if (existingLesson?.content) {
          try {
            resumeSections = JSON.parse(existingLesson.content) as LessonSectionType[]
          } catch {
            resumeSections = []
          }
        }

        // ── 5. Read waypoint context for concept-tagging prompt ──────────────
        const waypoint = await env.DB.prepare(
          'SELECT title, goal, concepts FROM waypoints WHERE id = ? AND journey_id = ?',
        )
          .bind(waypointId, journeyId)
          .first<{ title: string; goal: string | null; concepts: string }>()

        let concepts: string[] = []
        if (waypoint?.concepts) {
          try {
            concepts = JSON.parse(waypoint.concepts) as string[]
          } catch {
            concepts = []
          }
        }

        // ── 6. Build system message with waypoint context ────────────────────
        const waypointContext = waypoint
          ? `\n\n## Waypoint context\nTitle: ${waypoint.title}\nGoal: ${waypoint.goal ?? 'Not specified'}\nConcepts to cover: ${concepts.join(', ')}`
          : ''

        const systemContent = LESSON_SYSTEM_PROMPT + waypointContext
        const userContent = `Generate the lesson for this waypoint now. Use the concept names from the waypoint context for concept_tags on each section.`

        const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
          { role: 'user', content: systemContent + '\n\n' + userContent },
        ]

        // ── 7. Build the SSE streaming response ──────────────────────────────
        const encoder = new TextEncoder()
        const tier = TIERS['lesson']
        const modelChain = [tier.primaryModel, ...tier.fallbackChain]

        const stream = new ReadableStream({
          async start(controller) {
            // ── 7a. Emit any resume sections first ───────────────────────────
            for (const section of resumeSections) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(section)}\n\n`),
              )
            }

            // ── 7b. Attempt streaming with fallback chain ────────────────────
            const startTime = Date.now()
            let lastError: unknown
            let succeeded = false

            for (let i = 0; i < modelChain.length; i++) {
              const model = modelChain[i]!
              if (i > 0) {
                console.log(
                  JSON.stringify({
                    event: 'model.fallback_triggered',
                    user_id: userId,
                    journey_id: journeyId,
                    waypoint_id: waypointId,
                    original_model: modelChain[i - 1],
                    fallback_model: model,
                  }),
                )
              }

              try {
                // @ts-expect-error — createOpenRouterText accepts string model id
                const adapter = createOpenRouterText(model, env.OPENROUTER_API_KEY)

                // Use @tanstack/ai chat() for streaming — bypasses callGateway() drain
                const chatStream = chat({
                  adapter: adapter as any,
                  messages: messages as any,
                } as any)

                // ── 7c. NDJSON line-buffer accumulator ───────────────────────
                let lineBuffer = ''
                const completedSections: LessonSectionType[] = [...resumeSections]
                let sourcesPayload: { sources: LessonSource[]; recommended_primary_source: LessonSource | null } = { sources: [], recommended_primary_source: null }
                let promptTokens = 0
                let completionTokens = 0
                let totalCost: number | undefined

                for await (const chunk of chatStream as AsyncIterable<Record<string, unknown>>) {
                  const chunkType = chunk['type'] as string | undefined

                  if (chunkType === 'TEXT_DELTA') {
                    const delta = (chunk['delta'] as string) ?? ''
                    lineBuffer += delta

                    // Process all complete lines in the buffer
                    let newlineIndex: number
                    while ((newlineIndex = lineBuffer.indexOf('\n')) !== -1) {
                      const line = lineBuffer.slice(0, newlineIndex).trim()
                      lineBuffer = lineBuffer.slice(newlineIndex + 1)

                      if (!line) continue

                      // Skip markdown fence lines (defensive against model non-compliance)
                      if (line.startsWith('```') || line.startsWith('---')) continue

                      let parsed: Record<string, unknown>
                      try {
                        parsed = JSON.parse(line) as Record<string, unknown>
                      } catch {
                        // Non-JSON line — skip with warn (R2 risk per plan)
                        console.log(
                          JSON.stringify({
                            event: 'lesson.ndjson_skip',
                            user_id: userId,
                            waypoint_id: waypointId,
                            reason: 'invalid JSON line',
                            preview: line.slice(0, 80),
                          }),
                        )
                        continue
                      }

                      const lineType = parsed['type'] as string | undefined

                      if (lineType === 'header') {
                        // Emit header event
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(parsed)}\n\n`))
                      } else if (lineType === 'sources') {
                        // Capture sources payload for the final D1 write
                        sourcesPayload = {
                          sources: (parsed['sources'] as LessonSource[]) ?? [],
                          recommended_primary_source: (parsed['recommended_primary_source'] as LessonSource | null) ?? null,
                        }
                        // Emit sources event — signals completion to the client
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(parsed)}\n\n`))
                      } else if (lineType != null) {
                        // Section event — guard for resume duplicates
                        const section = parsed as unknown as LessonSectionType
                        const alreadyHave = completedSections.some((s) => s.id === section.id)
                        if (!alreadyHave) {
                          completedSections.push(section)
                          controller.enqueue(
                            encoder.encode(`data: ${JSON.stringify(section)}\n\n`),
                          )
                        }
                      }
                    }
                  } else if (chunkType === 'USAGE') {
                    const raw = chunk['usage'] as Partial<{ prompt_tokens: number; completion_tokens: number; total_cost: number }> | undefined
                    if (raw) {
                      promptTokens = raw.prompt_tokens ?? 0
                      completionTokens = raw.completion_tokens ?? 0
                      if (raw.total_cost !== undefined) totalCost = raw.total_cost
                    }
                  }
                }

                // ── 7d. Persist to D1 (fire-and-forget) ─────────────────────
                const durationMs = Date.now() - startTime
                const contentJson = JSON.stringify(completedSections)
                const sourcesJson = JSON.stringify(sourcesPayload)

                // Record usage to D1 (non-blocking via best-effort)
                const usageId = crypto.randomUUID()
                const insertedAt = new Date().toISOString()
                const costUsd = totalCost ?? (
                  (promptTokens * tier.pricingPer1MTokens.input +
                    completionTokens * tier.pricingPer1MTokens.output) / 1_000_000
                )

                Promise.all([
                  upsertLesson(env.DB, waypointId, lessonId, contentJson, sourcesJson),
                  env.DB.prepare(
                    `INSERT INTO usage_events (id, user_id, journey_id, model, type, prompt_tokens, completion_tokens, cost_usd, duration_ms, outcome, at)
                     VALUES (?, ?, ?, ?, 'lesson', ?, ?, ?, ?, 'success', ?)`,
                  )
                    .bind(usageId, userId, journeyId, model, promptTokens, completionTokens, costUsd, durationMs, insertedAt)
                    .run(),
                ]).catch((err) => {
                  console.error('[lesson-sse] background D1 write failed:', err)
                })

                console.log(
                  JSON.stringify({
                    event: 'generation.completed',
                    user_id: userId,
                    journey_id: journeyId,
                    waypoint_id: waypointId,
                    model,
                    generation_type: 'lesson',
                    prompt_tokens: promptTokens,
                    completion_tokens: completionTokens,
                    cost_usd: costUsd,
                    duration_ms: durationMs,
                    outcome: 'success',
                  }),
                )

                succeeded = true
                break
              } catch (err) {
                lastError = err
                // Continue to next model in fallback chain
              }
            }

            // ── 7e. All models failed — emit terminal error event ────────────
            if (!succeeded) {
              const errorMsg =
                lastError instanceof Error ? lastError.message : 'Generation failed'
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'error', message: errorMsg })}\n\n`,
                ),
              )

              console.log(
                JSON.stringify({
                  event: 'generation.completed',
                  user_id: userId,
                  journey_id: journeyId,
                  waypoint_id: waypointId,
                  model: modelChain[modelChain.length - 1],
                  generation_type: 'lesson',
                  outcome: 'failure',
                  error_code: errorMsg,
                }),
              )
            }

            controller.close()
          },
        })

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Lesson-Id': lessonId,
          },
        })
      },
    },
  },
})
