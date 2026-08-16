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
import { createTextAdapter } from "./adapter";
import type { AdapterEnv } from "./adapter";
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
  /** Carries the outbound routing decision (see `./adapter`) alongside the provider key. */
  env: AdapterEnv;
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
  /**
   * `cf-aig-*` headers for the routed path — today the generation's metadata tags.
   * Forwarded verbatim to the adapter factory; ignored on the direct path, which has
   * no gateway to read them. The SAME map is used for every attempt in the chain, so
   * a primary failure followed by a fallback success produces two gateway log entries
   * sharing one `request_id`: the id identifies the generation, not the attempt, which
   * is what keeps it resolvable against the single `usage_events` row.
   */
  aigHeaders?: Record<string, string>;
}

export interface RunModelResult {
  /**
   * The model that produced the successful response — the one the provider reports
   * on RUN_FINISHED when it says so, otherwise the one that was requested.
   */
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
 * emits either shape keeps working. A RUN_ERROR chunk is the adapter's way of
 * reporting a failed call — it is treated as an attempt failure, never as a
 * successful empty stream.
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
    aigHeaders,
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
      // Inside the try on purpose: a routed environment that cannot build its gateway
      // adapter is an attempt failure like any other, so the chain advances and, if it
      // exhausts, the caller sees a thrown generation failure rather than a silent
      // fall-back to the direct provider.
      const adapter = await createTextAdapter(env, model, aigHeaders);

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
      /** The model the provider actually served — RUN_FINISHED carries it; see below. */
      let servedModel = model;
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
        } else if (chunkType === "RUN_ERROR") {
          // The OpenRouter adapter never rethrows: it catches every failure — transport,
          // gateway, or provider — and YIELDS a RUN_ERROR chunk (source:
          // node_modules/@tanstack/ai-openrouter/src/adapters/text.ts, chatStream's catch).
          // A loop that ignores it sees a clean end-of-stream and meters a generation that
          // never happened. Throwing here makes the failure an attempt failure: the chain
          // advances, exhaustion rethrows, and persistence — which runs after the model
          // call — never writes a row.
          const message = (chunk["message"] as string | undefined) ?? "unknown error";
          throw new Error(`model-stream: model stream failed — ${message}`);
        } else if (chunkType === "RUN_FINISHED" || chunkType === "USAGE") {
          // RUN_FINISHED reports `model: lastModel || options.model` — the model the
          // provider actually served, which differs from the requested one when the
          // gateway or OpenRouter itself falls back (same source file as above).
          const reported = chunk["model"];
          if (typeof reported === "string" && reported.length > 0) {
            servedModel = reported;
          }
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

      return { model: servedModel, usage, toolUse };
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
  /**
   * The row id to write. Supplied by the gateway so the id it already put on the wire
   * as the generation's `request_id` is the id the ledger row is keyed by — the two
   * sides of that cross-reference are then the same variable rather than two
   * generators that happened to agree. Omitted → minted here, as it always was.
   */
  id?: string;
  userId: string;
  journeyId?: string | null;
  model: string;
  type: GenerationType;
  usage: Pick<StreamUsage, "prompt_tokens" | "completion_tokens">;
  costUsd: number;
  durationMs: number;
}

/**
 * Build (without executing) the prepared statement that INSERTs one `usage_events`
 * row for a successful generation. Split out from `recordUsage` so callers that need
 * to commit this write atomically alongside another write (e.g. the lesson persist +
 * meter pair in the lesson SSE route) can pass it to `D1Database.batch([...])`.
 *
 * IMPORTANT: Supply `at` explicitly as an ISO-8601 string so the quota query
 * (which filters `at >= 'YYYY-MM-DDTHH:MM:SSZ'`) sees a consistent format. Omitting
 * `at` lets D1's DEFAULT datetime('now') produce 'YYYY-MM-DD HH:MM:SS' (space
 * separated, no Z), which sorts before any 'YYYY-MM-DDTHH:MM:SSZ' bound and makes
 * the quota SUM always return 0.
 */
export function recordUsageStatement(db: D1Database, input: RecordUsageInput): D1PreparedStatement {
  const { id, userId, journeyId = null, model, type, usage, costUsd, durationMs } = input;
  const usageId = id ?? crypto.randomUUID();
  const insertedAt = new Date().toISOString();
  return db
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
    );
}

/** INSERT one `usage_events` row for a successful generation. See `recordUsageStatement`. */
export async function recordUsage(db: D1Database, input: RecordUsageInput): Promise<void> {
  await recordUsageStatement(db, input).run();
}
