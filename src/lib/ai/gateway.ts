/**
 * AI Gateway — the single entry point for all LLM calls in Waypoint.
 *
 * Every generation feature routes through this module. The gateway:
 *  1. Rejects callers whose daily quota is exhausted (zero outbound requests).
 *  2. Routes to the correct model tier (interview/lesson/quiz/roadmap).
 *  3. Retries through the tier's fallback chain on model failure.
 *  4. Records prompt_tokens, completion_tokens, and cost_usd to D1 `usage_events` —
 *     unless the AI Gateway served the answer from its cache, which cost nothing and is
 *     therefore charged nothing and metered nowhere (see `./aig-cache`).
 *  5. Emits structured instrumentation signals to Cloudflare Logpush.
 *
 * Two entry points, one owner. `runGatewayGeneration()` (private) owns everything
 * that surrounds a model call: the started signal, the fallback chain, cost
 * computation, persistence, and exactly one completion signal. The exported entry
 * points differ only in how they consume the stream and what they do with a
 * finalization failure:
 *
 *  - `callGateway(input)` — buffered. Drains the whole stream into a string and
 *    returns it. Used by the interview, roadmap, and quiz call sites.
 *  - `callGatewayStream(context)` — token-by-token. Gates on quota, then hands back
 *    a single-use handle whose `run()` streams deltas to the caller and returns an
 *    exhaustive `StreamOutcome` instead of throwing for non-model failures. Used by
 *    the lesson SSE route.
 *
 * Consumer slices MUST call one of these — never the raw adapter factories.
 *
 * The streaming/fallback/metering machinery lives in `src/lib/ai/model-stream.ts`
 * and is consumed here, once, for both modes.
 *
 * NOTE: this module must not import `cloudflare:workers`. Its unit suite
 * (tests/smoke/ai-gateway.test.ts) runs in a plain Node environment with no mock
 * for that module, so the import alone would break it. Callers that need a
 * background-task registration (`waitUntil`) inject it as `registerBackground`.
 */

import type { GenerationType } from "./tiers";
import { TIERS } from "./tiers";
import { checkQuota } from "./quota";
import type { QuotaStatus } from "./quota";
import {
  runModelWithFallback,
  computeCost,
  recordUsage,
  recordUsageStatement,
} from "./model-stream";
import type { StreamUsage } from "./model-stream";
import { isAigRouted } from "./adapter";
import type { AdapterEnv } from "./adapter";
import { buildAigMetadata, aigMetadataHeaders } from "./aig-metadata";
import { AIG_CACHE_TTL_SECONDS, classifyCacheOutcome } from "./aig-cache";
import type { CacheOutcome } from "./aig-cache";
import type { AigCacheOptions } from "./adapter";

// ---- Public error types -------------------------------------------------------

/** Thrown by the gateway when the user's daily quota is exhausted. */
export class QuotaExhaustedError extends Error {
  readonly status: QuotaStatus;
  constructor(status: QuotaStatus) {
    super("Daily generation quota exhausted");
    this.name = "QuotaExhaustedError";
    this.status = status;
  }
}

// ---- Input / output types -----------------------------------------------------

/**
 * The env every gateway call needs: D1 for quota and metering, the provider key, and
 * the AI Gateway routing fields. The routing fields are optional so callers that
 * predate gateway routing — and both hand-built test envs — keep compiling untouched;
 * an env without them simply takes the direct outbound path.
 */
type GatewayEnv = { DB: D1Database; OPENROUTER_API_KEY: string } & AdapterEnv;

type GatewayBase = {
  /** Cloudflare Workers env — must have DB and OPENROUTER_API_KEY. */
  env: GatewayEnv;
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

// ---- Streaming types ----------------------------------------------------------

/** Context for a streaming generation — everything except the messages. */
export interface GatewayStreamContext {
  env: GatewayEnv;
  userId: string;
  journeyId?: string | null;
  type: GenerationType;
  /** Per-model-attempt stream timeout. Omitted → no timeout. */
  modelTimeoutMs?: number;
  /** Extra fields merged into every signal this generation emits. Canonical fields win. */
  logContext?: Record<string, unknown>;
  /**
   * Register a promise that must outlive the response — `waitUntil` from
   * `cloudflare:workers`, injected by the caller so this module stays importable
   * outside a Worker runtime.
   */
  registerBackground?: (promise: Promise<unknown>) => void;
}

/** Stream consumption callbacks supplied per run. */
export interface StreamRunCallbacks {
  /** Called for each streamed text delta. */
  onTextDelta: (delta: string) => void;
  /** Called synchronously when the chain advances, before the next model's first delta. */
  onAttemptReset?: () => void;
}

/** What the caller knows about a generation when it is time to decide what to persist. */
export interface GatewayFinalizeContext {
  /**
   * This generation's id — already on the wire as the AI Gateway's `request_id` tag,
   * and the id the `usage_events` row will be written under. A caller that writes the
   * usage row itself (the buffered path) must pass it through, or the dashboard's
   * `request_id` would resolve to no ledger row.
   */
  requestId: string;
  model: string;
  usage: StreamUsage;
  costUsd: number;
  durationMs: number;
  /**
   * Was this answer served from the AI Gateway's cache? A cached response cost nothing,
   * so it is not metered: a caller that writes the `usage_events` row itself must skip
   * it, exactly as the gateway skips its own. The caller's *own* writes are unaffected —
   * a cached lesson is still a real lesson the learner keeps.
   */
  cached: boolean;
}

/**
 * The caller's persistence decision.
 *  - `commit` — the gateway appends the `usage_events` insert to these statements and
 *    commits them as one `D1Database.batch([...])`.
 *  - `refuse` — nothing is written at all: no caller row, no usage row.
 */
export type GatewayPersist =
  | { kind: "commit"; statements: D1PreparedStatement[] }
  | { kind: "refuse"; reason: string };

/**
 * Caller-supplied finalization. Returning nothing means the caller persisted the
 * generation itself (the buffered entry point does this via `recordUsage`).
 */
export type GatewayFinalize = (
  ctx: GatewayFinalizeContext,
) => void | GatewayPersist | Promise<void | GatewayPersist>;

/**
 * Exhaustive result of a streaming run. Only exhaustion of the model chain rejects —
 * every other terminal state is a value, so a caller can map each one to its own
 * client-visible message without a taxonomy of thrown errors.
 */
export type StreamOutcome =
  | { kind: "success"; usage: GatewayUsage }
  | { kind: "refused"; reason: string }
  | { kind: "persist_failed"; error: unknown };

/** Single-use run handle returned by `callGatewayStream`. */
export interface GatewayStreamHandle {
  run(
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    callbacks: StreamRunCallbacks,
    finalize: GatewayFinalize,
  ): Promise<StreamOutcome>;
}

// ---- Shared orchestration -----------------------------------------------------

/**
 * How a finalization failure is reported — the ONLY behavioral difference between
 * the two entry points.
 *
 *  - `model-failure` — a throwing finalize is caught by the same block as model
 *    exhaustion, logged as `generation.completed { outcome: "failure" }`, and
 *    rethrown. This is what `callGateway` has always done with a rejected
 *    `usage_events` insert, and callers depend on it (see
 *    tests/smoke/ai-gateway-parity.test.ts).
 *  - `outcome` — a throwing finalize, a rejecting batch, or a throwing statement
 *    builder all resolve `{ kind: 'persist_failed' }`. This is what the lesson SSE
 *    route has always done with its batch, and it is why the learner is told
 *    "could not be saved" rather than "generation failed".
 */
type FinalizeErrorMode = "model-failure" | "outcome";

interface GenerationOptions {
  env: GatewayEnv;
  userId: string;
  journeyId?: string | null;
  type: GenerationType;
  /**
   * Proof the quota gate already ran for this generation. The orchestrator never
   * queries quota itself — that keeps exactly one `SUM(cost_usd)` query per
   * generation no matter which entry point is used — and requiring the resolved
   * status here makes it impossible to reach the model without having gated.
   */
  quotaStatus: QuotaStatus;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  tools?: Array<{ name: string; description: string }>;
  onTextDelta: (delta: string) => void;
  onAttemptReset?: () => void;
  modelTimeoutMs?: number;
  logContext?: Record<string, unknown>;
  registerBackground?: (promise: Promise<unknown>) => void;
  finalize: GatewayFinalize;
  finalizeErrorMode: FinalizeErrorMode;
}

interface GenerationResult {
  usage: GatewayUsage;
  toolUse?: { name: string; input: Record<string, unknown> };
  outcome: StreamOutcome;
}

/**
 * Everything that surrounds a model call, once: the started signal, the fallback
 * chain with its classified signal, cost computation, persistence, and exactly one
 * completion signal. Both entry points run through here.
 */
async function runGatewayGeneration(opts: GenerationOptions): Promise<GenerationResult> {
  const {
    env,
    userId,
    journeyId = null,
    type,
    messages,
    tools,
    onTextDelta,
    onAttemptReset,
    modelTimeoutMs,
    logContext,
    registerBackground,
    finalize,
    finalizeErrorMode,
  } = opts;

  /** Emit one structured signal, with the caller's context merged in behind it. */
  const signal = (payload: Record<string, unknown>): void => {
    console.log(JSON.stringify(logContext ? { ...logContext, ...payload } : payload));
  };

  /**
   * Which way out of the Worker this generation took. Computed once and stamped on
   * every generation signal, because nothing else in a running app says whether a
   * request went through the AI Gateway or straight to the provider — the outbound
   * call is server-side, so no browser trace can answer it. Operators read this in
   * the Logpush stream to confirm the kill switch actually took effect.
   */
  const routed = isAigRouted(env);
  const routing: Record<string, unknown> = routed
    ? { aig_routed: true, gateway_id: env.AIG_GATEWAY_ID }
    : { aig_routed: false };

  /**
   * This generation's identity, minted here rather than inside the ledger write.
   *
   * The gateway's `request_id` tag has to be on the wire *before* the model call, and
   * the `usage_events` row is written *after* it — so the only way the two can carry
   * the same value is for one variable to reach both. Minting it here is that variable;
   * `recordUsageStatement` accepts it and falls back to its own mint for every caller
   * that does not (see `model-stream.ts`).
   */
  const requestId = crypto.randomUUID();

  /**
   * The `cf-aig-*` headers for this generation — built only when the request is
   * actually routed, because an unrouted generation has no gateway to read them and
   * constructing one would blur what the kill switch means. The direct path stays
   * byte-identical to what it was before this slice.
   */
  const aigHeaders = routed
    ? aigMetadataHeaders(buildAigMetadata({ userId, journeyId, type, requestId }))
    : undefined;

  /**
   * Response caching, also routed-only. The key is composed down at the fetcher, from
   * the body the provider actually receives; what comes back up here is the gateway's
   * own verdict for the attempt that succeeded, which is the fact this function needs in
   * order to decide whether the generation is billable at all.
   */
  let observedCacheStatus: string | null | undefined;
  const aigCache: AigCacheOptions | undefined = routed
    ? {
        cache: { userId, ttlSeconds: AIG_CACHE_TTL_SECONDS },
        onCacheStatus: (status) => {
          observedCacheStatus = status;
        },
        resetCacheStatus: () => {
          observedCacheStatus = undefined;
        },
      }
    : undefined;

  /**
   * Did this generation actually say anything? A cache hit always replays content, so
   * an empty answer — a refusal, a truncated stream — can never be classified as one on
   * the payload heuristic alone (see `./aig-cache`).
   *
   * Counted per attempt, and reset when the chain advances, for the same reason the
   * cache status is: text streamed by an attempt that then failed must not vouch for the
   * attempt that actually answered. Otherwise a truncated first attempt followed by an
   * empty second one would look like content plus a zero cost — which is a cache hit —
   * and the generation would be waived.
   */
  let deltaChars = 0;
  const countingOnTextDelta = (delta: string): void => {
    deltaChars += delta.length;
    onTextDelta(delta);
  };

  // ── 1. Tier config ─────────────────────────────────────────────────────────
  const tier = TIERS[type];
  const modelChain = [tier.primaryModel, ...tier.fallbackChain];

  // ── 2. generation.started signal ───────────────────────────────────────────
  const estimatedPromptTokens = messages.reduce(
    (acc, m) => acc + Math.ceil(m.content.length / 4),
    0,
  );
  signal({
    event: "generation.started",
    request_id: requestId,
    user_id: userId,
    journey_id: journeyId,
    model: tier.primaryModel,
    generation_type: type,
    estimated_prompt_tokens: estimatedPromptTokens,
    ...routing,
    timestamp: Date.now(),
  });

  const startTime = Date.now();

  try {
    // ── 3. Run the model chain via the shared helper ─────────────────────────
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
      modelTimeoutMs,
      aigHeaders,
      aigCache,
      handlers: { onTextDelta: countingOnTextDelta },
      onFallback: (previousModel, nextModel, err) => {
        signal({
          event: "model.fallback_triggered",
          request_id: requestId,
          user_id: userId,
          original_model: previousModel,
          fallback_model: nextModel,
          reason: classifyError(err),
        });
        // Synchronous, inside onFallback: model-stream invokes this before creating
        // the next adapter, so a caller's per-attempt state — and ours — is reset before
        // any delta of the retried attempt arrives.
        deltaChars = 0;
        onAttemptReset?.();
      },
    });

    const durationMs = Date.now() - startTime;

    // ── 3b. Was it served from the gateway's cache? ──────────────────────────
    //
    // Classified only here, after the chain has returned successfully: a RUN_ERROR
    // throws out of `runModelWithFallback` and never reaches this line, so a failed
    // generation can never be waived as "cached and therefore free".
    const cacheOutcome: CacheOutcome = routed
      ? classifyCacheOutcome({
          status: observedCacheStatus,
          usage: rawUsage,
          producedOutput: deltaChars > 0 || toolUse !== undefined,
        })
      : { cached: false, signal: "none" };

    // ── 4. Cost computation: prefer total_cost over recomputed ───────────────
    const { costUsd: computedCost, recomputed } = computeCost(rawUsage, tier, model);
    // A cached answer cost nothing to produce, so it is charged nothing — and with
    // nothing to recompute, the stale-pricing warning below would be noise.
    const costUsd = cacheOutcome.cached ? 0 : computedCost;
    if (recomputed && !cacheOutcome.cached) {
      signal({
        event: "generation.cost_recomputed",
        request_id: requestId,
        user_id: userId,
        model,
        generation_type: type,
        warning: "total_cost absent from usage payload; cost recomputed from token counts",
      });
    }

    const usage: GatewayUsage = {
      model,
      promptTokens: rawUsage.prompt_tokens,
      completionTokens: rawUsage.completion_tokens,
      costUsd,
      durationMs,
    };

    // ── 5. Persist — what to write is the caller's; whether the usage row rides
    //       along is the gateway's ───────────────────────────────────────────
    const persist = async (): Promise<StreamOutcome> => {
      const directive = await finalize({
        requestId,
        model,
        usage: rawUsage,
        costUsd,
        durationMs,
        cached: cacheOutcome.cached,
      });
      if (directive?.kind === "refuse") {
        return { kind: "refused", reason: directive.reason };
      }
      if (directive?.kind === "commit") {
        // The caller's own statements always commit — a cached lesson is still a lesson
        // the learner must keep. Only the ledger row is dropped, and dropping it IS
        // declining to advance quota: `checkQuota` sums `cost_usd` over `usage_events`
        // and nothing else advances it (see `./quota`).
        const statements = cacheOutcome.cached
          ? directive.statements
          : [
              ...directive.statements,
              recordUsageStatement(env.DB, {
                id: requestId,
                userId,
                journeyId,
                model,
                type,
                usage: rawUsage,
                costUsd,
                durationMs,
              }),
            ];
        // A cached generation whose caller had nothing of its own to write must not
        // issue `batch([])`.
        if (statements.length === 0) {
          return { kind: "success", usage };
        }
        const batchPromise = env.DB.batch(statements);
        // Registered synchronously, BEFORE the await, and with a rejection-safe view:
        // the caller reports a persist failure on its own channel, so the platform
        // must not also log an unhandled rejection for the same failure.
        registerBackground?.(batchPromise.catch(() => undefined));
        await batchPromise;
      }
      return { kind: "success", usage };
    };

    let outcome: StreamOutcome;
    if (finalizeErrorMode === "model-failure") {
      // Deliberately unguarded: a throw here lands in the catch below, exactly as a
      // rejected usage_events insert always has on the buffered path.
      outcome = await persist();
    } else {
      try {
        outcome = await persist();
      } catch (error) {
        outcome = { kind: "persist_failed", error };
      }
    }

    // ── 6. generation.completed signal — exactly one, every branch ───────────
    //
    // Routed-only, like the routing fields themselves: the direct path's log shape stays
    // byte-identical. This is the operator's only view of cache behavior before a gateway
    // dashboard exists, and — because a hit writes no ledger row — the only thing that
    // makes a gap in `usage_events` explainable after the fact rather than suspicious.
    const caching = routed
      ? {
          cache_status: cacheOutcome.cached ? "HIT" : "MISS",
          cache_signal: cacheOutcome.signal,
        }
      : {};
    signal({
      event: "generation.completed",
      request_id: requestId,
      user_id: userId,
      journey_id: journeyId,
      model,
      generation_type: type,
      prompt_tokens: rawUsage.prompt_tokens,
      completion_tokens: rawUsage.completion_tokens,
      cost_usd: costUsd,
      duration_ms: durationMs,
      ...routing,
      ...caching,
      outcome: outcome.kind === "success" ? "success" : outcome.kind,
    });

    return { usage, toolUse, outcome };
  } catch (err) {
    // ── All models exhausted (or, in `model-failure` mode, a failed persist) ──
    const durationMs = Date.now() - startTime;
    signal({
      event: "generation.completed",
      request_id: requestId,
      user_id: userId,
      journey_id: journeyId,
      model: modelChain[modelChain.length - 1],
      generation_type: type,
      prompt_tokens: 0,
      completion_tokens: 0,
      cost_usd: 0,
      duration_ms: durationMs,
      ...routing,
      outcome: "failure",
      error_code: err instanceof Error ? err.message : "unknown",
    });
    throw err;
  }
}

// ---- Entry point: buffered ----------------------------------------------------

/**
 * Call the AI gateway and wait for the complete response.
 *
 * Enforces quota, routes to the correct model tier, retries through fallback
 * models on failure, records usage, and emits instrumentation signals.
 *
 * @throws {QuotaExhaustedError} if the user's daily quota is exhausted.
 * @throws {Error} if all models in the tier's fallback chain fail, or if the
 *   `usage_events` insert fails (reported as a generation failure — see
 *   `FinalizeErrorMode`).
 */
export async function callGateway(input: GatewayInput): Promise<GatewayResponse> {
  const { env, userId, journeyId = null, type, messages, tools } = input;

  const quotaStatus = await checkQuota(env.DB, userId, type);
  if (!quotaStatus.allowed) {
    // quota.rejected signal already emitted by checkQuota()
    throw new QuotaExhaustedError(quotaStatus);
  }

  // Buffered consumption: accumulate the streamed text into one string.
  let textContent = "";
  const { usage, toolUse } = await runGatewayGeneration({
    env,
    userId,
    journeyId,
    type,
    quotaStatus,
    messages,
    tools,
    onTextDelta: (delta) => {
      textContent += delta;
    },
    // A failed attempt's partial text must not be prefixed onto the answer that
    // succeeded. Deltas are forwarded the moment they arrive, so when the chain
    // advances the buffer holds whatever the dead attempt managed to emit — and at
    // the four structured call sites that concatenation is a JSON payload with a
    // truncated document glued to its front.
    onAttemptReset: () => {
      textContent = "";
    },
    finalize: ({ requestId, model, usage: rawUsage, costUsd, durationMs, cached }) => {
      // A cache hit cost nothing, so it is metered nowhere — the buffered path drops its
      // row for the same reason the streaming path drops its statement.
      if (cached) return;
      return recordUsage(env.DB, {
        id: requestId,
        userId,
        journeyId,
        model,
        type,
        usage: rawUsage,
        costUsd,
        durationMs,
      });
    },
    finalizeErrorMode: "model-failure",
  });

  return { toolUse, text: textContent || undefined, usage };
}

// ---- Entry point: streaming ---------------------------------------------------

/**
 * Open a streaming generation.
 *
 * Gates on quota immediately — before any handle exists — so an exhausted caller
 * learns about it before a single byte of the caller's own stream is produced, and
 * the model is never contacted. The messages arrive later, at `run()`, which is
 * what lets a caller put this call exactly where its quota check used to be
 * without moving any other read.
 *
 * The returned handle is single-use: a second `run()` throws.
 *
 * @throws {QuotaExhaustedError} if the user's daily quota is exhausted.
 */
export async function callGatewayStream(
  context: GatewayStreamContext,
): Promise<GatewayStreamHandle> {
  const { env, userId, journeyId = null, type } = context;

  const quotaStatus = await checkQuota(env.DB, userId, type);
  if (!quotaStatus.allowed) {
    // quota.rejected signal already emitted by checkQuota()
    throw new QuotaExhaustedError(quotaStatus);
  }

  let used = false;

  return {
    async run(messages, callbacks, finalize) {
      if (used) {
        throw new Error("gateway: streaming handle already used");
      }
      used = true;

      const { outcome } = await runGatewayGeneration({
        env,
        userId,
        journeyId,
        type,
        quotaStatus,
        messages,
        onTextDelta: callbacks.onTextDelta,
        onAttemptReset: callbacks.onAttemptReset,
        modelTimeoutMs: context.modelTimeoutMs,
        logContext: context.logContext,
        registerBackground: context.registerBackground,
        finalize,
        finalizeErrorMode: "outcome",
      });

      return outcome;
    },
  };
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
