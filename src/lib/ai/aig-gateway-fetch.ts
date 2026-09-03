/**
 * The Cloudflare AI Gateway universal-endpoint envelope, assembled here rather than
 * by a vendor package.
 *
 * `env.AI.gateway(id).run(...)` does not take an HTTP request — it takes
 * `{ provider, endpoint, headers, query }`, where `query` is the provider's own
 * request body (https://developers.cloudflare.com/ai-gateway/usage/universal/). The
 * OpenRouter SDK, meanwhile, speaks HTTP and lets a caller replace its transport
 * through `SDKOptions.httpClient` (node_modules/@openrouter/sdk/esm/lib/config.d.ts:28).
 * This module is the translation between the two: give it a gateway binding, get back
 * a `Fetcher` the SDK can call.
 *
 * It is a deliberate port of `createGatewayFetch` in
 * node_modules/@cloudflare/tanstack-ai/dist/create-fetcher-Cmmx6As3.mjs (same provider
 * string, same envelope shape, same `cf-aig-*` header slot), corrected in three places
 * that each carry their evidence below: where the body is read from, which headers are
 * forwarded, and how the endpoint is derived. The first of those is why the vendor
 * version could not be used — it reads the payload from a second `init` argument that
 * the OpenRouter SDK never passes (`this.fetcher(req)`, esm/lib/http.js:34), so every
 * routed request reached the gateway with an empty body.
 */

import type { Fetcher } from "@openrouter/sdk";
import { buildCacheKey, aigCacheHeaders, SKIP_CACHE_HEADERS } from "./aig-cache";

/**
 * Headers that describe one hop, or that describe a body the gateway re-serializes.
 * Everything else is forwarded: the SDK sets `accept: text/event-stream` deliberately
 * for streaming (esm/funcs/chatSend.js:26-30) and losing it would silently turn a
 * stream into a buffered response, and the `HTTP-Referer` / `X-OpenRouter-*` headers
 * are OpenRouter's own attribution inputs.
 *
 * `content-type` and `authorization` are in the list because this module sets both
 * itself below — skipping them here keeps each from appearing twice under two casings.
 */
const DROPPED_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-connection",
  "upgrade",
  "te",
  "trailer",
  "content-length",
  "transfer-encoding",
  "accept-encoding",
  "content-type",
  "authorization",
]);

/** `{ ... }` and nothing else — arrays, null and primitives are not a chat payload. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Derive the endpoint the universal API expects: the path **relative to the
 * provider's own base**, not the path the SDK called.
 *
 * The SDK resolves `chat/completions` (its leading slash is stripped by `pathToFunc`,
 * esm/lib/url.js:22) against the `https://openrouter.ai/api/v1` server
 * (esm/lib/config.js:14, esm/lib/sdks.js:65-83), so the request URL's path is
 * `/api/v1/chat/completions`. The vendor's single `^\/v1\//` strip does not match that
 * shape and would have sent the provider's own prefix through to the gateway. Both
 * shapes are normalized here.
 */
function deriveEndpoint(url: URL): string {
  return url.pathname.replace(/^\//, "").replace(/^(api\/)?v1\//, "") + url.search;
}

/**
 * Build the OpenRouter-SDK `Fetcher` that sends a request through an AI Gateway binding.
 *
 * `headers` is the `cf-aig-*` slot: it merges last, so a gateway header can never be
 * shadowed by a provider header of the same name. The gateway orchestrator fills it
 * with the generation's `cf-aig-metadata` tags (see `./aig-metadata`).
 *
 * `cache` and `onCacheStatus` are the caching pair, and they live here for the same
 * reason: this is the only boundary that holds both the body the provider actually
 * receives — the one thing a cache key may be composed from — and the `Response` the
 * binding returns, which is where the gateway reports whether it served the answer from
 * its cache. Anything computed upstream would hash a payload we *believe* is sent.
 *
 * Nothing here catches. A gateway rejection propagates into the SDK, the adapter turns
 * it into a RUN_ERROR chunk, and the drain treats that as an attempt failure with no
 * ledger row — the fail-closed path, unchanged.
 */
export function createAigGatewayFetcher(
  gateway: AiGateway,
  opts: {
    apiKey: string;
    headers?: Record<string, string>;
    /** Principal + TTL for the per-user cache key. Absent → the request is not cached. */
    cache?: { userId: string; ttlSeconds: number };
    /** Called once per attempt with `cf-aig-cache-status` (or null when absent). */
    onCacheStatus?: (status: string | null) => void;
  },
): Fetcher {
  return async (input, init) => {
    const request = input instanceof Request ? input : new Request(input as RequestInfo, init);

    // Reading a Request body is one-shot, and safe here: the SDK clones per attempt
    // INSIDE its retry callback (`retry(async () => { const cloned = request.clone(); … })`,
    // esm/lib/sdks.js:176-190), so no attempt is ever handed a drained body.
    let raw: string;
    if (init?.body != null) {
      // Only a string body survives `String(body)` intact. A Uint8Array, a Blob or a
      // stream would stringify to "[object Object]" and then be refused one line below
      // as unreadable JSON — a real payload turned into a failed generation by the
      // read, not by the gateway. `Response` decodes every `BodyInit` the platform
      // accepts, so this branch reads what the caller actually passed.
      raw = typeof init.body === "string" ? init.body : await new Response(init.body).text();
    } else {
      if (request.bodyUsed) {
        throw new Error("aig: request body already consumed — refusing to send an empty payload");
      }
      raw = await request.text();
    }

    // An empty or unreadable `query` is exactly the defect this path exists to repair:
    // the gateway would forward a request with no model and no messages and the
    // generation would fail somewhere far from the cause. Refuse instead.
    let query: unknown;
    try {
      query = raw ? JSON.parse(raw) : undefined;
    } catch {
      throw new Error("aig: request body is not JSON — refusing to send an unreadable payload");
    }
    if (!isPlainObject(query)) {
      throw new Error("aig: request body is not a JSON object — refusing to send it");
    }

    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      if (!DROPPED_HEADERS.has(key.toLowerCase())) headers[key] = value;
    });
    // Binding mode authenticates to the PROVIDER with this header — "no Cloudflare
    // token needed" is not "no provider key needed".
    headers["authorization"] = `Bearer ${opts.apiKey}`;
    headers["Content-Type"] = "application/json";
    Object.assign(headers, opts.headers ?? {});

    const endpoint = deriveEndpoint(new URL(request.url));

    // Caching is scoped to the requesting user or it does not happen. Falling through
    // without `cf-aig-cache-key` is the dangerous degrade, not the safe one: the gateway
    // would then use its OWN default key, which does not segment by user, and one
    // learner's answer could be replayed to another. No principal, no caching.
    const userId = opts.cache?.userId.trim();
    if (opts.cache && userId) {
      const cacheKey = await buildCacheKey({
        userId,
        provider: "openrouter",
        endpoint,
        body: raw,
      });
      Object.assign(headers, aigCacheHeaders(cacheKey, opts.cache.ttlSeconds));
    } else {
      Object.assign(headers, SKIP_CACHE_HEADERS);
    }

    // The Response is returned unbuffered: the SDK picks its SSE path from the status
    // plus content-type and then streams `response.body` straight through
    // (esm/lib/matchers.js:74,113). It is read for one header first — this is the only
    // place `cf-aig-cache-status` exists before the SDK layers hide it.
    const response = await gateway.run(
      {
        provider: "openrouter",
        endpoint,
        headers,
        query,
      },
      { signal: request.signal },
    );
    opts.onCacheStatus?.(response.headers.get("cf-aig-cache-status"));
    return response;
  };
}
