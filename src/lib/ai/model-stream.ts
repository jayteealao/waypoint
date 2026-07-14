/**
 * Shared model-streaming helper — the single implementation of
 * "iterate a @tanstack/ai chat stream through a model-fallback chain and meter
 * to D1" used by BOTH the buffered gateway drain (src/lib/ai/gateway.ts) and the
 * token-by-token lesson SSE route (src/routes/api/journey/$journeyId/lesson.ts).
 *
 * Consumption is parameterized, not unified: the caller supplies an `onTextDelta`
 * handler and decides whether to buffer the text into a string (gateway) or
 * enqueue it into an SSE controller (lesson). The fallback loop, the @tanstack/ai
 * chunk vocabulary, the token-usage accumulation, cost computation, and the
 * usage_events INSERT live here once.
 */

// @ts-ignore — @tanstack/ai is in beta; complex generic constraints bypassed with 'as any'
import { chat, toolDefinition } from "@tanstack/ai";
import { createOpenRouterText } from "@tanstack/ai-openrouter";
import type { TierConfig } from "./tiers";
import type { GenerationType } from "./tiers";

/** Raw usage payload shape from OpenRouter via @tanstack/ai stream events. */
export interface StreamUsage {
  prompt_tokens: number;
  completion_tokens: number;
  /** OpenRouter includes the 5.5% credit fee; prefer over recomputed cost. */
  total_cost?: number;
}

/** Consumption handlers — the seam that keeps buffered and streaming callers separate. */
export interface ModelStreamHandlers {
  /** Called for each streamed text chunk (TEXT_MESSAGE_CONTENT / TEXT_DELTA). */
  onTextDelta?: (delta: string) => void;
}

export interface RunModelOptions {
  env: { OPENROUTER_API_KEY: string };
  /** Ordered model chain: [primary, ...fallbacks]. */
  modelChain: string[];
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  tools?: Array<{ name: string; description: string }>;
  reasoningEffort?: "low" | "medium" | "high";
  handlers?: ModelStreamHandlers;
  /** Called once per retry with (fromModel, toModel, error) — caller supplies the log payload. */
  onFallback?: (fromModel: string, toModel: string, error: unknown) => void;
  /**
   * Per-model stream timeout in ms. When set, a stream that exceeds it throws
   * (advancing to the next model). Omitted → no timeout (the buffered gateway path).
   */
  modelTimeoutMs?: number;
}

export interface RunModelResult {
  /** The model that produced the successful response. */
  model: string;
  usage: StreamUsage;
  toolUse?: { name: string; input: Record<string, unknown> };
}

/**
 * Run the model chain until one succeeds, streaming text through `handlers` and
 * accumulating token usage. Rethrows the last error when the chain is exhausted.
 *
 * Event vocabulary is the @tanstack/ai-openrouter adapter's: streamed text arrives
 * as TEXT_MESSAGE_CONTENT chunks; final token usage rides on the terminal
 * RUN_FINISHED chunk (camelCase promptTokens/completionTokens). The legacy
 * TEXT_DELTA/USAGE/snake_case names are also accepted so a future adapter that
 * emits either shape keeps working.
 */
export async function runModelWithFallback(opts: RunModelOptions): Promise<RunModelResult> {
  const {
    env,
    modelChain,
    messages,
    tools,
    reasoningEffort,
    handlers,
    onFallback,
    modelTimeoutMs,
  } = opts;

  const toolDefs = tools?.map((t) =>
    toolDefinition({
      name: t.name,
      description: t.description,
    }),
  );

  let lastError: unknown;

  for (let i = 0; i < modelChain.length; i++) {
    const model = modelChain[i]!;
    if (i > 0) {
      onFallback?.(modelChain[i - 1]!, model, lastError);
    }

    try {
      // @ts-expect-error — createOpenRouterText accepts a string model ID; the TS overloads
      // enumerate the known model names but the list is non-exhaustive at runtime.
      const adapter = createOpenRouterText(model, env.OPENROUTER_API_KEY);

      const streamOpts: Record<string, unknown> = {
        adapter: adapter as any,
        messages: messages as any,
      };
      if (toolDefs && toolDefs.length > 0) {
        streamOpts["tools"] = toolDefs as any;
      }
      // Per-tier reasoning effort → OpenRouter `reasoning.effort`. The adapter spreads
      // `modelOptions` into the ChatRequest (see @tanstack/ai-openrouter@0.15.8). Omitted
      // entirely when unset so the model's own default applies (e.g. grok-4.5's `high`).
      if (reasoningEffort) {
        streamOpts["modelOptions"] = { reasoning: { effort: reasoningEffort } };
      }

      const stream = chat(streamOpts as any);

      let toolName: string | undefined;
      let toolArgsJson = "";
      const usage: StreamUsage = { prompt_tokens: 0, completion_tokens: 0 };
      const modelCallStart = Date.now();

      for await (const chunk of stream as AsyncIterable<Record<string, unknown>>) {
        if (modelTimeoutMs !== undefined && Date.now() - modelCallStart > modelTimeoutMs) {
          throw new Error("model-stream: model stream timeout exceeded");
        }
        const chunkType = chunk["type"] as string | undefined;
        if (chunkType === "TOOL_CALL_START") {
          toolName = chunk["toolCallName"] as string;
          toolArgsJson = "";
        } else if (chunkType === "TOOL_CALL_ARGS") {
          toolArgsJson += (chunk["delta"] as string) ?? "";
        } else if (chunkType === "TEXT_MESSAGE_CONTENT" || chunkType === "TEXT_DELTA") {
          handlers?.onTextDelta?.((chunk["delta"] as string) ?? "");
        } else if (chunkType === "RUN_FINISHED" || chunkType === "USAGE") {
          const raw = chunk["usage"] as Record<string, unknown> | undefined;
          if (raw) {
            const pt = raw["promptTokens"] ?? raw["prompt_tokens"];
            const ct = raw["completionTokens"] ?? raw["completion_tokens"];
            if (pt !== undefined) usage.prompt_tokens = Number(pt);
            if (ct !== undefined) usage.completion_tokens = Number(ct);
            const tc = raw["total_cost"] ?? raw["totalCost"] ?? raw["cost"];
            if (tc !== undefined) usage.total_cost = Number(tc);
          }
        }
      }

      const toolUse =
        toolName != null
          ? {
              name: toolName,
              input: toolArgsJson ? (JSON.parse(toolArgsJson) as Record<string, unknown>) : {},
            }
          : undefined;

      return { model, usage, toolUse };
    } catch (err) {
      lastError = err;
      // Continue to the next model in the chain (logged via onFallback on next iteration).
    }
  }

  throw lastError ?? new Error("model-stream: all models in the chain failed");
}

/**
 * Compute cost from a usage payload: prefer OpenRouter's `total_cost` (which
 * includes the 5.5% credit fee), else recompute from the tier's pricing table.
 * `recomputed` lets the caller emit its own stale-pricing warning signal.
 */
export function computeCost(
  usage: StreamUsage,
  tier: TierConfig,
): { costUsd: number; recomputed: boolean } {
  if (usage.total_cost !== undefined) {
    return { costUsd: usage.total_cost, recomputed: false };
  }
  // sdlc-debt: pricing table goes stale on model swaps; prefer total_cost. Upgrade path: rely on OpenRouter total_cost once every tier surfaces it.
  const { pricingPer1MTokens: p } = tier;
  const costUsd = (usage.prompt_tokens * p.input + usage.completion_tokens * p.output) / 1_000_000;
  return { costUsd, recomputed: true };
}

export interface RecordUsageInput {
  userId: string;
  journeyId?: string | null;
  model: string;
  type: GenerationType;
  usage: Pick<StreamUsage, "prompt_tokens" | "completion_tokens">;
  costUsd: number;
  durationMs: number;
}

/**
 * INSERT one `usage_events` row for a successful generation.
 *
 * IMPORTANT: Supply `at` explicitly as an ISO-8601 string so the quota query
 * (which filters `at >= 'YYYY-MM-DDTHH:MM:SSZ'`) sees a consistent format. Omitting
 * `at` lets D1's DEFAULT datetime('now') produce 'YYYY-MM-DD HH:MM:SS' (space
 * separated, no Z), which sorts before any 'YYYY-MM-DDTHH:MM:SSZ' bound and makes
 * the quota SUM always return 0.
 */
export async function recordUsage(db: D1Database, input: RecordUsageInput): Promise<void> {
  const { userId, journeyId = null, model, type, usage, costUsd, durationMs } = input;
  const usageId = crypto.randomUUID();
  const insertedAt = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO usage_events (id, user_id, journey_id, model, type, prompt_tokens, completion_tokens, cost_usd, duration_ms, outcome, at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'success', ?)`,
    )
    .bind(
      usageId,
      userId,
      journeyId ?? null,
      model,
      type,
      usage.prompt_tokens,
      usage.completion_tokens,
      costUsd,
      durationMs,
      insertedAt,
    )
    .run();
}
