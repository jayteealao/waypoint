/**
 * Outbound routing decision — the only place in the Worker that knows there are
 * two ways to reach OpenRouter.
 *
 * Direct: `createOpenRouterText(model, key)` talks to the provider straight, as
 * every generation has until now. Routed: `createOpenRouterChat(model, { binding })`
 * from `@cloudflare/tanstack-ai` sends the same request through the Cloudflare AI
 * Gateway bound as `env.AI`, so the gateway can log, slice and (later) cache it.
 *
 * Both factories build the SAME `OpenRouterTextAdapter` class — the gateway package
 * only swaps the SDK's fetcher (see
 * `node_modules/@cloudflare/tanstack-ai/dist/adapters/openrouter.mjs`, which calls
 * `new HTTPClient({ fetcher: createGatewayFetch("openrouter", config) })`). The
 * `@tanstack/ai` chunk vocabulary `model-stream.ts` parses is therefore identical on
 * both paths, which is what makes this a one-expression swap rather than a rewrite.
 *
 * The binding rides on the env object callers already pass; nothing here imports
 * `cloudflare:workers`, so `gateway.ts` stays importable in a plain Node test.
 */

import { createOpenRouterText } from "@tanstack/ai-openrouter";

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
 */
export async function createTextAdapter(env: AdapterEnv, model: string): Promise<unknown> {
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

  // Dynamic, and confined to this branch. The two existing gateway suites mock
  // `@tanstack/ai-openrouter` with a namespace containing only `createOpenRouterText`,
  // while `@cloudflare/tanstack-ai` imports three further names from that same package
  // (source: node_modules/@cloudflare/tanstack-ai/dist/adapters/openrouter.mjs) — a
  // static import here would turn two untouched suites red for a reason that looks
  // nothing like its cause.
  const { createOpenRouterChat } = await import("@cloudflare/tanstack-ai/adapters/openrouter");

  // `apiKey` is still required in binding mode: the gateway fetcher only sets the
  // upstream `authorization` header when it is present, and `buildOpenRouterConfig`
  // otherwise sends the literal string "unused" (source:
  // node_modules/@cloudflare/tanstack-ai/dist/create-fetcher-Cmmx6As3.mjs). Binding
  // mode means "no Cloudflare token needed", not "no provider key needed".
  return createOpenRouterChat(model, {
    binding: env.AI.gateway(gatewayId),
    apiKey: env.OPENROUTER_API_KEY,
  });
}
