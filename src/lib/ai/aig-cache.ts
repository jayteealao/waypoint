/**
 * Response caching at the AI Gateway — the whole policy, as pure functions.
 *
 * Two properties define this module, and both are correctness properties rather
 * than performance ones.
 *
 * **Isolation.** `cf-aig-cache-key` *replaces* the gateway's own cache key
 * (https://developers.cloudflare.com/ai-gateway/features/caching/), and the default key
 * does not segment by user. So the key we send must carry the requesting user itself:
 * `` `${userId}:${sha256(...)}` ``. The user segment is structural, not a naming
 * convention — a hit can only ever replay the requesting user's own prior response.
 *
 * **Detection.** A cache hit must cost nothing in the `usage_events` ledger, and
 * "write no row" is the one metering decision that leaves no trace. The two errors are
 * not symmetric: a bogus zero-cost row is noise, a dropped real cost is money. So the
 * detector is deliberately asymmetric — an explicit `cf-aig-cache-status` header decides
 * in both directions, and the payload heuristic only runs when no header arrived at all.
 *
 * Nothing here does I/O beyond a WebCrypto digest, so both properties are assertable
 * without a gateway, a network, or a Worker runtime.
 *
 * Header names are taken from the code Cloudflare ships rather than from memory:
 * `headers["cf-aig-cache-ttl"] = String(opts.cacheTtl)`,
 * `headers["cf-aig-cache-key"] = opts.cacheKey`, `headers["cf-aig-skip-cache"] = "true"`
 * (source: node_modules/@cloudflare/tanstack-ai/dist/create-fetcher-Cmmx6As3.mjs:62-64),
 * and typed in worker-configuration.d.ts:10359-10361.
 */

/**
 * How long the gateway may serve a cached response, in seconds.
 *
 * Cloudflare's documented window is 60s..1 month; 10 minutes sits in the middle of the
 * shaped 5–15 minute band. A module constant rather than an environment variable on
 * purpose: the operator's emergency lever is already `AIG_ENABLED`, which takes the whole
 * routed path out without a redeploy, and a per-environment TTL knob is configuration
 * nobody asked for.
 */
export const AIG_CACHE_TTL_SECONDS = 600;

/** Sent instead of a cache key when there is no principal to scope the entry to. */
export const SKIP_CACHE_HEADERS: Record<string, string> = { "cf-aig-skip-cache": "true" };

export interface CacheKeyInput {
  /** Internal D1 user id. The mandatory isolation segment. */
  userId: string;
  /** Universal-endpoint provider, e.g. `openrouter`. */
  provider: string;
  /** Endpoint relative to the provider's base, e.g. `chat/completions`. */
  endpoint: string;
  /** The exact outbound request body, as it will be sent. */
  body: string;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Compose the cache key for one outbound request.
 *
 * The digest covers a **domain-separated tuple**, not the bare body, because our key
 * replaces Cloudflare's: the moment we override it, provider and endpoint stop
 * distinguishing entries on the platform's side, so they have to be inside ours. Both
 * are constant today (`openrouter` / `chat/completions`), which is exactly why omitting
 * them would never be caught by a test. The `v1` prefix makes a future change to the
 * scheme a cache miss rather than a silent mismatch.
 *
 * The gateway id is deliberately *not* in the tuple: each deploy scope has its own
 * gateway, so gateways are already separate cache namespaces.
 *
 * The `${userId}:` prefix sits outside the digest and is unambiguous — D1 user ids are
 * UUIDs (no `:`) and the digest has fixed length, so no boundary ambiguity is possible.
 */
export async function buildCacheKey(input: CacheKeyInput): Promise<string> {
  const canonical = `v1\n${input.provider}\n${input.endpoint}\n${input.body}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return `${input.userId}:${toHex(digest)}`;
}

/** The two headers that enable caching for one request. */
export function aigCacheHeaders(
  cacheKey: string,
  ttlSeconds: number = AIG_CACHE_TTL_SECONDS,
): Record<string, string> {
  return { "cf-aig-cache-key": cacheKey, "cf-aig-cache-ttl": String(ttlSeconds) };
}

/** Token/cost payload as the drain accumulated it. */
export interface CacheUsageView {
  prompt_tokens: number;
  completion_tokens: number;
  total_cost?: number;
}

export interface CacheOutcomeInput {
  /** `cf-aig-cache-status` as read off the gateway's Response, if one arrived. */
  status?: string | null;
  usage: CacheUsageView;
  /** Did this generation actually produce content (text deltas or a tool call)? */
  producedOutput: boolean;
}

export interface CacheOutcome {
  cached: boolean;
  /** Which rule decided — stamped on the completion signal so a waived charge is visible. */
  signal: "header" | "zeroed-usage" | "none";
}

/**
 * Classify one completed generation as a cache hit or not.
 *
 * Rules, in order:
 *
 *  a. **A header decides, both ways.** If `cf-aig-cache-status` is a string, the answer
 *     is `status === "HIT"` and the heuristic never runs. An explicit `MISS` is a stronger
 *     statement than any inference from the payload, so a real generation that happened to
 *     report zero tokens is never read as free.
 *  b. **No header → the zeroed-usage fallback**, which exists because Cloudflare's docs do
 *     not promise the header in binding mode. It is narrow on purpose: output must actually
 *     have been produced, *and* `total_cost` must be present and exactly `0`. An **absent**
 *     `total_cost` is the ordinary OpenRouter miss and must always meter — widening the rule
 *     to cover it would swallow the very case AC-7 exists to protect. The `producedOutput`
 *     condition covers the other direction: a refusal, a pre-generation failure or a
 *     truncated stream also reports all-zero usage, and none of them is a cache hit. A hit
 *     always replays content.
 *  c. Otherwise: not cached. Every ambiguity resolves toward metering.
 */
export function classifyCacheOutcome(input: CacheOutcomeInput): CacheOutcome {
  const { status, usage, producedOutput } = input;

  if (typeof status === "string") {
    return { cached: status.trim().toUpperCase() === "HIT", signal: "header" };
  }

  const zeroed =
    usage.prompt_tokens === 0 && usage.completion_tokens === 0 && usage.total_cost === 0;
  if (producedOutput && zeroed) {
    return { cached: true, signal: "zeroed-usage" };
  }

  return { cached: false, signal: "none" };
}
