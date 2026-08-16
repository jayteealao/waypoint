/**
 * Outbound routing decision — the only place in the Worker that knows there are
 * two ways to reach OpenRouter.
 *
 * Direct: `createOpenRouterText(model, key)` talks to the provider straight, as
 * every generation has until now. Routed: the same factory, handed an `httpClient`
 * whose transport is the Cloudflare AI Gateway bound as `env.AI`, so the gateway can
 * log, slice and (later) cache the call.
 *
 * Both branches therefore build the SAME `OpenRouterTextAdapter` class and differ in
 * one argument. The `@tanstack/ai` chunk vocabulary `model-stream.ts` parses is
 * identical on both paths, which is what makes this a one-expression swap rather than
 * a rewrite. The gateway envelope itself lives in `./aig-gateway-fetch`.
 *
 * The binding rides on the env object callers already pass; nothing here imports
 * `cloudflare:workers`, so `gateway.ts` stays importable in a plain Node test.
 */

import { HTTPClient } from "@openrouter/sdk";
import { createOpenRouterText } from "@tanstack/ai-openrouter";
import { createAigGatewayFetcher } from "./aig-gateway-fetch";

/** The slice of the Worker env the outbound path needs. */
export interface AdapterEnv {
  OPENROUTER_API_KEY: string;
  /** Workers AI binding. Present in every deploy scope; optional so Node tests can omit it. */
  AI?: Ai;
  /** Kill switch. Routing happens on the exact string "true" and nothing else. */
  AIG_ENABLED?: string;
  /** Name of the AI Gateway to route through, e.g. "waypoint-dev". */
  AIG_GATEWAY_ID?: string;
}

/**
 * Is this environment routed through the AI Gateway?
 *
 * Opt-in on the exact string: every deploy scope declares `AIG_ENABLED` explicitly
 * (asserted by tests/smoke/wrangler-aig-config.test.ts), so nothing real depends on
 * the default, and the flagless environments — the unit suites, and CI's e2e run
 * whose `.dev.vars` is regenerated without AIG keys — keep taking the direct path.
 */
export function isAigRouted(env: Pick<AdapterEnv, "AIG_ENABLED">): boolean {
  return env.AIG_ENABLED === "true";
}

/**
 * Build the text adapter for one model attempt.
 *
 * Routed but unconfigured throws rather than degrading to direct: a silent degrade
 * is exactly the failure the fail-closed posture exists to refuse, and it would make
 * an operator's "is the gateway on?" unanswerable from the outside.
 *
 * `aigHeaders` carries the `cf-aig-*` headers for this generation (its metadata tags).
 * The direct branch ignores them — an unrouted call has no gateway to configure.
 */
export async function createTextAdapter(
  env: AdapterEnv,
  model: string,
  aigHeaders?: Record<string, string>,
): Promise<unknown> {
  if (!isAigRouted(env)) {
    // @ts-expect-error — createOpenRouterText accepts a string model ID; the TS overloads
    // enumerate the known model names but the list is non-exhaustive at runtime.
    return createOpenRouterText(model, env.OPENROUTER_API_KEY);
  }

  const gatewayId = env.AIG_GATEWAY_ID;
  if (!env.AI || !gatewayId) {
    throw new Error(
      "aig: AIG_ENABLED=true but the AI binding or AIG_GATEWAY_ID is missing — refusing to route",
    );
  }

  // `httpClient` is the OpenRouter SDK's own supported seam for replacing transport
  // (`SDKOptions.httpClient`, node_modules/@openrouter/sdk/esm/lib/config.d.ts:28), and
  // `createOpenRouterText`'s third parameter is `Omit<SDKOptions, "apiKey">`
  // (node_modules/@tanstack/ai-openrouter/src/adapters/text.ts:1431) — so this is a
  // typed option, not a cast. The provider key is still required: the gateway forwards
  // upstream, and OpenRouter answers 401 without it.
  const httpClient = new HTTPClient({
    fetcher: createAigGatewayFetcher(env.AI.gateway(gatewayId), {
      apiKey: env.OPENROUTER_API_KEY,
      headers: aigHeaders,
    }),
  });

  // @ts-expect-error — same non-exhaustive model-id overloads as the direct branch.
  return createOpenRouterText(model, env.OPENROUTER_API_KEY, { httpClient });
}
