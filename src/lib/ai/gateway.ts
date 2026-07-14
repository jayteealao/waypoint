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
 * The streaming/fallback/metering machinery is shared with the lesson SSE route
 * via `src/lib/ai/model-stream.ts`; this gateway consumes it in buffered mode
 * (it drains the full stream into a string), while the lesson route consumes the
 * same helper token-by-token.
 */

import type { GenerationType } from "./tiers";
import { TIERS } from "./tiers";
import { checkQuota } from "./quota";
import type { QuotaStatus } from "./quota";
import { runModelWithFallback, computeCost, recordUsage } from "./model-stream";

// ---- Public error types -------------------------------------------------------

/** Thrown by callGateway when the user's daily quota is exhausted. */
export class QuotaExhaustedError extends Error {
  readonly status: QuotaStatus;
  constructor(status: QuotaStatus) {
    super("Daily generation quota exhausted");
    this.name = "QuotaExhaustedError";
    this.status = status;
  }
}

// ---- Input / output types -----------------------------------------------------

type GatewayBase = {
  /** Cloudflare Workers env — must have DB and OPENROUTER_API_KEY. */
  env: { DB: D1Database; OPENROUTER_API_KEY: string };
  userId: string;
  journeyId?: string | null;
  type: GenerationType;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
};

/** Tool-call request (interview tier). */
export type GatewayCallWithTools = GatewayBase & {
  tools: Array<{ name: string; description: string }>;
};

/** Plain text / prompt-based-JSON generation request (lesson, roadmap, quiz). No tools. */
export type GatewayCallText = GatewayBase & {
  tools?: never;
};

/** Discriminated union — a request either carries tools or it does not. */
export type GatewayInput = GatewayCallWithTools | GatewayCallText;

/** Collected usage data returned alongside the response. */
export interface GatewayUsage {
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  durationMs: number;
}

/** Response from a successful gateway call. */
export interface GatewayResponse {
  /** Tool call result — present when tools were requested. */
  toolUse?: { name: string; input: Record<string, unknown> };
  /** Generated text — present for text calls. */
  text?: string;
  /** Recorded usage (also persisted to D1 usage_events). */
  usage: GatewayUsage;
}

// ---- Gateway ------------------------------------------------------------------

/**
 * Call the AI gateway.
 *
 * Enforces quota, routes to the correct model tier, retries through fallback
 * models on failure, records usage, and emits instrumentation signals.
 *
 * @throws {QuotaExhaustedError} if the user's daily quota is exhausted.
 * @throws {Error} if all models in the tier's fallback chain fail.
 */
export async function callGateway(input: GatewayInput): Promise<GatewayResponse> {
  const { env, userId, journeyId = null, type, messages, tools } = input;

  // ── 1. Quota gate ──────────────────────────────────────────────────────────
  const quotaStatus = await checkQuota(env.DB, userId, type);
  if (!quotaStatus.allowed) {
    // quota.rejected signal already emitted by checkQuota()
    throw new QuotaExhaustedError(quotaStatus);
  }

  // ── 2. Tier config ─────────────────────────────────────────────────────────
  const tier = TIERS[type];
  const modelChain = [tier.primaryModel, ...tier.fallbackChain];

  // ── 3. generation.started signal ───────────────────────────────────────────
  const estimatedPromptTokens = messages.reduce(
    (acc, m) => acc + Math.ceil(m.content.length / 4),
    0,
  );
  console.log(
    JSON.stringify({
      event: "generation.started",
      user_id: userId,
      journey_id: journeyId,
      model: tier.primaryModel,
      generation_type: type,
      estimated_prompt_tokens: estimatedPromptTokens,
      timestamp: Date.now(),
    }),
  );

  const startTime = Date.now();

  // ── 4. Run the model chain (buffered) via the shared helper ─────────────────
  // Buffered consumption: accumulate the streamed text into one string.
  let textContent = "";
  try {
    const {
      model,
      usage: rawUsage,
      toolUse,
    } = await runModelWithFallback({
      env,
      modelChain,
      messages,
      tools,
      reasoningEffort: tier.reasoningEffort,
      handlers: {
        onTextDelta: (delta) => {
          textContent += delta;
        },
      },
      onFallback: (previousModel, model, err) => {
        console.log(
          JSON.stringify({
            event: "model.fallback_triggered",
            user_id: userId,
            original_model: previousModel,
            fallback_model: model,
            reason: classifyError(err),
          }),
        );
      },
    });

    const durationMs = Date.now() - startTime;

    // ── 5. Cost computation: prefer total_cost over recomputed ───────────────
    const { costUsd, recomputed } = computeCost(rawUsage, tier);
    if (recomputed) {
      console.log(
        JSON.stringify({
          event: "generation.cost_recomputed",
          user_id: userId,
          model,
          generation_type: type,
          warning: "total_cost absent from usage payload; cost recomputed from token counts",
        }),
      );
    }

    // ── 6. Record usage in D1 ────────────────────────────────────────────────
    await recordUsage(env.DB, {
      userId,
      journeyId,
      model,
      type,
      usage: rawUsage,
      costUsd,
      durationMs,
    });

    // ── 7. generation.completed signal ───────────────────────────────────────
    console.log(
      JSON.stringify({
        event: "generation.completed",
        user_id: userId,
        journey_id: journeyId,
        model,
        generation_type: type,
        prompt_tokens: rawUsage.prompt_tokens,
        completion_tokens: rawUsage.completion_tokens,
        cost_usd: costUsd,
        duration_ms: durationMs,
        outcome: "success",
      }),
    );

    const usageResult: GatewayUsage = {
      model,
      promptTokens: rawUsage.prompt_tokens,
      completionTokens: rawUsage.completion_tokens,
      costUsd,
      durationMs,
    };

    return { toolUse, text: textContent || undefined, usage: usageResult };
  } catch (err) {
    // ── All models exhausted ───────────────────────────────────────────────
    const durationMs = Date.now() - startTime;
    console.log(
      JSON.stringify({
        event: "generation.completed",
        user_id: userId,
        journey_id: journeyId,
        model: modelChain[modelChain.length - 1],
        generation_type: type,
        prompt_tokens: 0,
        completion_tokens: 0,
        cost_usd: 0,
        duration_ms: durationMs,
        outcome: "failure",
        error_code: err instanceof Error ? err.message : "unknown",
      }),
    );
    throw err;
  }
}

/** Classify an error into a canonical reason string for the fallback signal. */
function classifyError(err: unknown): "timeout" | "error" | "quota" | "tool-call-regression" {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("timeout") || msg.includes("timed out")) return "timeout";
    if (msg.includes("quota") || msg.includes("rate limit") || msg.includes("429")) return "quota";
    if (msg.includes("tool")) return "tool-call-regression";
  }
  return "error";
}
