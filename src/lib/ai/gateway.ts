/**
 * AI Gateway — the single entry point for all LLM calls in Waypoint.
 *
 * Every generation feature routes through `callGateway()`. The gateway:
 *  1. Rejects callers whose daily quota is exhausted (zero outbound requests).
 *  2. Routes to the correct model tier (interview/lesson/quiz/roadmap).
 *  3. Retries through the tier's fallback chain on model failure.
 *  4. Records prompt_tokens, completion_tokens, and cost_usd to D1 `usage_events`.
 *  5. Emits structured instrumentation signals to Cloudflare Logpush.
 *
 * Consumer slices (tutor-interview, roadmap-lesson-generation, quiz-fsrs,
 * adaptation-progress) MUST call this function — never the raw adapter factories.
 *
 * Invariant: `tools` and `responseFormat` are mutually exclusive in one request.
 * This is encoded as a TypeScript discriminated union AND enforced at runtime with
 * a TypeError so consumers cannot compile the invalid combination.
 */

// @ts-ignore — @tanstack/ai is in beta; complex generic constraints bypassed with 'as any'
import { chat, toolDefinition } from '@tanstack/ai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import type { GenerationType, TierConfig } from './tiers'
import { TIERS } from './tiers'
import { checkQuota } from './quota'
import type { QuotaStatus } from './quota'

// ---- Public error types -------------------------------------------------------

/** Thrown by callGateway when the user's daily quota is exhausted. */
export class QuotaExhaustedError extends Error {
  readonly status: QuotaStatus
  constructor(status: QuotaStatus) {
    super('Daily generation quota exhausted')
    this.name = 'QuotaExhaustedError'
    this.status = status
  }
}

// ---- Input / output types -----------------------------------------------------

type GatewayBase = {
  /** Cloudflare Workers env — must have DB and OPENROUTER_API_KEY. */
  env: { DB: D1Database; OPENROUTER_API_KEY: string }
  userId: string
  journeyId?: string | null
  type: GenerationType
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
}

/** Tool-call request (interview tier). No responseFormat. */
export type GatewayCallWithTools = GatewayBase & {
  tools: Array<{ name: string; description: string }>
  responseFormat?: never
}

/** Structured-output request (roadmap, quiz). No tools. */
export type GatewayCallWithFormat = GatewayBase & {
  responseFormat: Record<string, unknown>
  tools?: never
}

/** Plain text generation request (lesson). Neither tools nor responseFormat. */
export type GatewayCallText = GatewayBase & {
  tools?: never
  responseFormat?: never
}

/** Discriminated union — enforces structured-output + tool-call invariant at the type level. */
export type GatewayInput = GatewayCallWithTools | GatewayCallWithFormat | GatewayCallText

/** Collected usage data returned alongside the response. */
export interface GatewayUsage {
  model: string
  promptTokens: number
  completionTokens: number
  costUsd: number
  durationMs: number
}

/** Response from a successful gateway call. */
export interface GatewayResponse {
  /** Tool call result — present when tools were requested. */
  toolUse?: { name: string; input: Record<string, unknown> }
  /** Generated text — present for text and structured calls. */
  text?: string
  /** Recorded usage (also persisted to D1 usage_events). */
  usage: GatewayUsage
}

// ---- Internal helpers ---------------------------------------------------------

/** Raw usage payload shape from OpenRouter via @tanstack/ai stream events. */
interface StreamUsage {
  prompt_tokens: number
  completion_tokens: number
  /** OpenRouter includes the 5.5% credit fee; prefer over recomputed cost. */
  total_cost?: number
}

/** Collect the full @tanstack/ai stream, extracting tool call, text, and usage. */
async function drainStream(
  adapter: unknown,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  tools?: Array<{ name: string; description: string }>,
  reasoningEffort?: 'low' | 'medium' | 'high',
): Promise<{ toolUse?: { name: string; input: Record<string, unknown> }; text?: string; usage: StreamUsage }> {
  const toolDefs = tools?.map((t) =>
    toolDefinition({
      name: t.name,
      description: t.description,
    }),
  )

  const streamOpts: Record<string, unknown> = {
    adapter: adapter as any,
    messages: messages as any,
  }
  if (toolDefs && toolDefs.length > 0) {
    streamOpts['tools'] = toolDefs as any
  }
  // Per-tier reasoning effort → OpenRouter `reasoning.effort`. The adapter spreads
  // `modelOptions` into the ChatRequest (see @tanstack/ai-openrouter@0.15.8). Omitted
  // entirely when unset so the model's own default applies (e.g. grok-4.5's `high`).
  if (reasoningEffort) {
    streamOpts['modelOptions'] = { reasoning: { effort: reasoningEffort } }
  }

  const stream = chat(streamOpts as any)

  let toolName: string | undefined
  let toolArgsJson = ''
  let textContent = ''
  const usage: StreamUsage = { prompt_tokens: 0, completion_tokens: 0 }

  // Event vocabulary is the @tanstack/ai-openrouter adapter's: streamed text
  // arrives as TEXT_MESSAGE_CONTENT chunks and final token usage rides on the
  // terminal RUN_FINISHED chunk (camelCase promptTokens/completionTokens).
  // The legacy TEXT_DELTA/USAGE names are also accepted so a future adapter
  // that emits either shape keeps working.
  for await (const chunk of stream as AsyncIterable<Record<string, unknown>>) {
    const chunkType = chunk['type'] as string | undefined
    if (chunkType === 'TOOL_CALL_START') {
      toolName = chunk['toolCallName'] as string
      toolArgsJson = ''
    } else if (chunkType === 'TOOL_CALL_ARGS') {
      toolArgsJson += (chunk['delta'] as string) ?? ''
    } else if (chunkType === 'TEXT_MESSAGE_CONTENT' || chunkType === 'TEXT_DELTA') {
      textContent += (chunk['delta'] as string) ?? ''
    } else if (chunkType === 'RUN_FINISHED' || chunkType === 'USAGE') {
      const raw = chunk['usage'] as Record<string, unknown> | undefined
      if (raw) {
        const pt = raw['promptTokens'] ?? raw['prompt_tokens']
        const ct = raw['completionTokens'] ?? raw['completion_tokens']
        if (pt !== undefined) usage.prompt_tokens = Number(pt)
        if (ct !== undefined) usage.completion_tokens = Number(ct)
        const tc = raw['total_cost'] ?? raw['totalCost'] ?? raw['cost']
        if (tc !== undefined) usage.total_cost = Number(tc)
      }
    }
  }

  const toolUse =
    toolName != null
      ? {
          name: toolName,
          input: toolArgsJson ? (JSON.parse(toolArgsJson) as Record<string, unknown>) : {},
        }
      : undefined

  return { toolUse, text: textContent || undefined, usage }
}

/** Compute cost from token counts + tier pricing (fallback when total_cost absent). */
function recomputeCost(usage: StreamUsage, tier: TierConfig): number {
  const { pricingPer1MTokens: p } = tier
  return (usage.prompt_tokens * p.input + usage.completion_tokens * p.output) / 1_000_000
}

// ---- Gateway ------------------------------------------------------------------

/**
 * Call the AI gateway.
 *
 * Enforces quota, routes to the correct model tier, retries through fallback
 * models on failure, records usage, and emits instrumentation signals.
 *
 * @throws {TypeError} if both `tools` and `responseFormat` are provided.
 * @throws {QuotaExhaustedError} if the user's daily quota is exhausted.
 * @throws {Error} if all models in the tier's fallback chain fail.
 */
export async function callGateway(input: GatewayInput): Promise<GatewayResponse> {
  const { env, userId, journeyId = null, type, messages, tools, responseFormat } = input

  // ── Runtime invariant: structured-output and tool calls cannot be combined ──
  // The TypeScript discriminated union catches this at compile time; the runtime
  // check is a defence-in-depth guard for consumers that bypass type checking.
  if (tools != null && responseFormat != null) {
    throw new TypeError('structured-output and tool calls cannot be combined in one request')
  }

  // ── 1. Quota gate ──────────────────────────────────────────────────────────
  const quotaStatus = await checkQuota(env.DB, userId, type)
  if (!quotaStatus.allowed) {
    // quota.rejected signal already emitted by checkQuota()
    throw new QuotaExhaustedError(quotaStatus)
  }

  // ── 2. Tier config ─────────────────────────────────────────────────────────
  const tier = TIERS[type]
  const modelChain = [tier.primaryModel, ...tier.fallbackChain]

  // ── 3. generation.started signal ───────────────────────────────────────────
  const estimatedPromptTokens = messages.reduce((acc, m) => acc + Math.ceil(m.content.length / 4), 0)
  console.log(
    JSON.stringify({
      event: 'generation.started',
      user_id: userId,
      journey_id: journeyId,
      model: tier.primaryModel,
      generation_type: type,
      estimated_prompt_tokens: estimatedPromptTokens,
      timestamp: Date.now(),
    }),
  )

  // ── 4. Fallback chain execution ────────────────────────────────────────────
  const startTime = Date.now()
  let lastError: unknown

  for (let i = 0; i < modelChain.length; i++) {
    const model = modelChain[i]!
    const isRetry = i > 0

    if (isRetry) {
      const previousModel = modelChain[i - 1]!
      console.log(
        JSON.stringify({
          event: 'model.fallback_triggered',
          user_id: userId,
          original_model: previousModel,
          fallback_model: model,
          reason: classifyError(lastError),
        }),
      )
    }

    try {
      // @ts-expect-error — createOpenRouterText accepts a string model ID; the TS overloads
      // enumerate the known model names but the list is non-exhaustive at runtime.
      const adapter = createOpenRouterText(model, env.OPENROUTER_API_KEY)
      const { toolUse, text, usage: rawUsage } = await drainStream(adapter, messages, tools, tier.reasoningEffort)

      const durationMs = Date.now() - startTime

      // ── 5. Cost computation: prefer total_cost over recomputed ─────────────
      let costUsd: number
      if (rawUsage.total_cost !== undefined) {
        costUsd = rawUsage.total_cost
      } else {
        // Fallback: recompute from token counts and pricing table.
        // sdlc-debt: pricing table goes stale on model swaps; prefer total_cost.
        costUsd = recomputeCost(rawUsage, tier)
        console.log(
          JSON.stringify({
            event: 'generation.cost_recomputed',
            user_id: userId,
            model,
            generation_type: type,
            warning: 'total_cost absent from usage payload; cost recomputed from token counts',
          }),
        )
      }

      // ── 6. Record usage in D1 ──────────────────────────────────────────────
      // IMPORTANT: Supply `at` explicitly as an ISO-8601 string so the quota
      // query (which filters `at >= 'YYYY-MM-DDTHH:MM:SSZ'`) sees consistent
      // format. Omitting `at` causes D1's DEFAULT datetime('now') to produce
      // 'YYYY-MM-DD HH:MM:SS' (space-separated, no Z), which sorts before any
      // 'YYYY-MM-DDTHH:MM:SSZ' bound and makes the quota SUM always return 0.
      const usageId = crypto.randomUUID()
      const insertedAt = new Date().toISOString()
      await env.DB.prepare(
        `INSERT INTO usage_events (id, user_id, journey_id, model, type, prompt_tokens, completion_tokens, cost_usd, duration_ms, outcome, at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'success', ?)`,
      )
        .bind(
          usageId,
          userId,
          journeyId ?? null,
          model,
          type,
          rawUsage.prompt_tokens,
          rawUsage.completion_tokens,
          costUsd,
          durationMs,
          insertedAt,
        )
        .run()

      // ── 7. generation.completed signal ────────────────────────────────────
      console.log(
        JSON.stringify({
          event: 'generation.completed',
          user_id: userId,
          journey_id: journeyId,
          model,
          generation_type: type,
          prompt_tokens: rawUsage.prompt_tokens,
          completion_tokens: rawUsage.completion_tokens,
          cost_usd: costUsd,
          duration_ms: durationMs,
          outcome: 'success',
        }),
      )

      const usageResult: GatewayUsage = {
        model,
        promptTokens: rawUsage.prompt_tokens,
        completionTokens: rawUsage.completion_tokens,
        costUsd,
        durationMs,
      }

      return { toolUse, text, usage: usageResult }
    } catch (err) {
      lastError = err
      // Continue to next model in the chain (logged at top of loop on next iteration).
    }
  }

  // ── All models exhausted ───────────────────────────────────────────────────
  const durationMs = Date.now() - startTime
  console.log(
    JSON.stringify({
      event: 'generation.completed',
      user_id: userId,
      journey_id: journeyId,
      model: modelChain[modelChain.length - 1],
      generation_type: type,
      prompt_tokens: 0,
      completion_tokens: 0,
      cost_usd: 0,
      duration_ms: durationMs,
      outcome: 'failure',
      error_code: lastError instanceof Error ? lastError.message : 'unknown',
    }),
  )
  throw lastError ?? new Error(`All models in the ${type} tier failed`)
}

/** Classify an error into a canonical reason string for the fallback signal. */
function classifyError(err: unknown): 'timeout' | 'error' | 'quota' | 'tool-call-regression' {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    if (msg.includes('timeout') || msg.includes('timed out')) return 'timeout'
    if (msg.includes('quota') || msg.includes('rate limit') || msg.includes('429')) return 'quota'
    if (msg.includes('tool')) return 'tool-call-regression'
  }
  return 'error'
}
