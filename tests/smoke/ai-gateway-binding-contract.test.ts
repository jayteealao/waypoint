// @vitest-environment node
/**
 * The routed path, driven against the real libraries.
 *
 * Everywhere else the adapter factory is mocked, which proves we *call* it correctly
 * and nothing about what it then does. Here nothing is mocked: the real
 * `createOpenRouterText`, the real OpenRouter SDK, our real gateway fetcher and the
 * real `@tanstack/ai` chat loop run against a fake `env.AI.gateway(id)` — the one
 * object a unit test can stand in for, because it is the boundary where the Worker
 * hands the request to Cloudflare.
 *
 * That makes this the closest thing to a real gateway call that exists before one is
 * provisioned: it asserts the exact request shape that would reach the gateway —
 * model and messages included — and it exercises the fail-closed path (a gateway that
 * errors must not end the stream cleanly) against the actual adapter rather than a
 * hand-written envelope.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

// The routed branch is reached the way production reaches it — through the model
// runner, which asks `createTextAdapter` for the adapter and then drains it.
import { runModelWithFallback } from "#/lib/ai/model-stream";
import { AIG_CACHE_TTL_SECONDS } from "#/lib/ai/aig-cache";
import type { AigCacheOptions } from "#/lib/ai/adapter";

/** The universal-endpoint envelope handed to `binding.run(...)`. */
interface GatewayRequest {
  provider: string;
  endpoint: string;
  headers: Record<string, string>;
  query: Record<string, unknown>;
}

interface RunOptions {
  signal?: AbortSignal;
}

interface FakeGateway {
  env: {
    OPENROUTER_API_KEY: string;
    AI: Ai;
    AIG_ENABLED: string;
    AIG_GATEWAY_ID: string;
  };
  requests: GatewayRequest[];
  options: Array<RunOptions | undefined>;
}

/**
 * A stand-in for `env.AI` whose `gateway(id).run(request, options)` records what it was
 * given and then answers with `respond` — a rejection, or a canned upstream response.
 */
function makeFakeGateway(respond: () => Promise<Response>): FakeGateway {
  const requests: GatewayRequest[] = [];
  const options: Array<RunOptions | undefined> = [];
  const AI = {
    gateway(_gatewayId: string) {
      return {
        async run(request: GatewayRequest, opts?: RunOptions) {
          requests.push(request);
          options.push(opts);
          return await respond();
        },
      };
    },
  } as unknown as Ai;

  return {
    env: {
      OPENROUTER_API_KEY: "test-key",
      AI,
      AIG_ENABLED: "true",
      AIG_GATEWAY_ID: "waypoint-test",
    },
    requests,
    options,
  };
}

const MODEL = "openai/gpt-5.6-luna";
const MESSAGES = [{ role: "user" as const, content: "Say hello" }];

/** An OpenAI-compatible SSE body — what OpenRouter streams back through the gateway. */
function cannedSseResponse(extraHeaders?: Record<string, string>): Response {
  const chunk = (payload: Record<string, unknown>): string =>
    `data: ${JSON.stringify({
      id: "gen-1",
      object: "chat.completion.chunk",
      created: 1,
      model: MODEL,
      ...payload,
    })}\n\n`;

  const body =
    // `finish_reason` is nullable but NOT optional in the SDK's stream-choice schema
    // (node_modules/@openrouter/sdk/esm/models/chatstreamchoice.js: `z.nullable(...)`),
    // so an in-flight chunk must carry an explicit null.
    chunk({
      choices: [{ index: 0, delta: { role: "assistant", content: "Hello" }, finish_reason: null }],
    }) +
    chunk({
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 },
    }) +
    "data: [DONE]\n\n";

  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream", ...extraHeaders },
  });
}

beforeEach(() => {
  // The adapter logs upstream failures through its own logger; the rejection case
  // below is a deliberate failure, so keep the suite's output readable.
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the request that reaches the AI Gateway binding", () => {
  /** Drive one generation whose gateway rejects, and hand back what it was sent. */
  async function captureRequest(
    aigHeaders?: Record<string, string>,
    aigCache?: AigCacheOptions,
    modelChain: string[] = [MODEL],
  ): Promise<FakeGateway> {
    const gateway = makeFakeGateway(async () => {
      throw new Error("gateway unavailable");
    });

    await expect(
      runModelWithFallback({
        env: gateway.env,
        modelChain,
        messages: MESSAGES,
        handlers: { onTextDelta: () => {} },
        aigHeaders,
        aigCache,
      }),
    ).rejects.toThrow();

    expect(gateway.requests.length).toBeGreaterThan(0);
    return gateway;
  }

  /** The caching wiring the orchestrator supplies on every routed generation. */
  function cacheFor(userId: string): AigCacheOptions {
    return { cache: { userId, ttlSeconds: AIG_CACHE_TTL_SECONDS } };
  }

  test("names the provider and the endpoint relative to the provider's own base", async () => {
    const { requests } = await captureRequest();

    expect(requests[0]!.provider).toBe("openrouter");
    // Pinned exactly, not loosely. The SDK's URL is
    // https://openrouter.ai/api/v1/chat/completions, and the universal endpoint takes
    // the path relative to the PROVIDER's base — so a drift to "api/v1/chat/completions"
    // (what a naive strip produces) would send the provider's own prefix through the
    // gateway and 404. This assertion is the local guard for that.
    expect(requests[0]!.endpoint).toBe("chat/completions");
  });

  test("carries the payload the gateway must forward: the model and the messages", async () => {
    const { requests } = await captureRequest();

    // `query` is the provider's request body — the model and the messages
    // (https://developers.cloudflare.com/ai-gateway/usage/universal/). An empty one is
    // the exact failure this path was rebuilt to repair, so it is asserted directly
    // rather than through anything downstream of it.
    const query = requests[0]!.query;
    expect(query["model"]).toBe(MODEL);
    expect(JSON.stringify(query["messages"])).toContain("Say hello");
    expect(query["stream"]).toBe(true);
  });

  test("authenticates to the provider and declares a JSON body", async () => {
    const { requests } = await captureRequest();
    const headers = requests[0]!.headers;

    // Routing through the gateway does not authenticate to OpenRouter; without this
    // header the provider answers 401, which would read as a gateway fault.
    expect(headers["authorization"]).toBe("Bearer test-key");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  test("keeps the streaming Accept header and drops the per-hop ones", async () => {
    const { requests, options } = await captureRequest();
    const headers = requests[0]!.headers;

    // The SDK asks for SSE deliberately when streaming
    // (node_modules/@openrouter/sdk/esm/funcs/chatSend.js:26-30). Dropping it would
    // turn a stream into one buffered response — a lesson that appears all at once
    // rather than an error, which is the kind of regression nothing else catches.
    expect(headers["accept"]).toBe("text/event-stream");
    // A forwarded content-length describes a body the gateway re-serializes, and the
    // rest have no meaning across a hop.
    for (const dropped of ["content-length", "host", "accept-encoding", "connection"]) {
      expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain(dropped);
    }
    // Cancellation has to survive the translation, or an aborted lesson keeps
    // generating (and billing) upstream.
    expect(options[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  test("the dashboard tags survive the whole path and arrive beside the provider headers", async () => {
    // The strongest observation point available before a gateway is provisioned: the
    // metadata is not inspected where it is built, but where it lands — after the real
    // SDK has assembled the request and our fetcher has translated it into the envelope
    // Cloudflare would actually receive. A regression anywhere along that path (a header
    // map dropped, a name mangled, a deny-list widened) fails here rather than showing up
    // as an empty dashboard weeks later.
    const metadata = {
      user_id: "user-123",
      journey_id: "journey-abc",
      generation_type: "lesson",
      tier: "lesson",
      request_id: "req-1",
    };
    const { requests } = await captureRequest({ "cf-aig-metadata": JSON.stringify(metadata) });
    const headers = requests[0]!.headers;

    expect(JSON.parse(headers["cf-aig-metadata"]!)).toEqual(metadata);
    // Alongside, not instead of — the gateway header map merges last, so it must add to
    // the provider's own headers rather than replace them.
    expect(headers["authorization"]).toBe("Bearer test-key");
    expect(headers["accept"]).toBe("text/event-stream");
  });

  test("a gateway that fails is an attempt failure, not a clean empty stream", async () => {
    const gateway = makeFakeGateway(async () => {
      throw new Error("gateway unavailable");
    });
    const deltas: string[] = [];

    // The real adapter converts this rejection into a RUN_ERROR chunk rather than
    // rethrowing. If the drain ignored that chunk the call below would RESOLVE with
    // empty text and zero tokens — and the caller would meter a generation that never
    // happened. Fail-closed means this rejects.
    await expect(
      runModelWithFallback({
        env: gateway.env,
        modelChain: [MODEL],
        messages: MESSAGES,
        handlers: { onTextDelta: (d) => deltas.push(d) },
      }),
    ).rejects.toThrow(/model stream failed/);

    expect(deltas.join("")).toBe("");
  });

  test("a successful upstream response streams back through the binding with its usage", async () => {
    // Scope: the RESPONSE half. The fake answers regardless of what it was asked, so
    // this proves that an OpenAI-compatible SSE body arriving from the gateway is
    // parsed into the same deltas and usage the direct path produces. What it cannot
    // prove is that a REAL gateway accepts the envelope and forwards it — that is the
    // one thing still owed to a live run.
    const gateway = makeFakeGateway(async () => cannedSseResponse());
    const deltas: string[] = [];

    const result = await runModelWithFallback({
      env: gateway.env,
      modelChain: [MODEL],
      messages: MESSAGES,
      handlers: { onTextDelta: (d) => deltas.push(d) },
    });

    expect(deltas.join("")).toBe("Hello");
    expect(result.model).toBe(MODEL);
    expect(result.usage.prompt_tokens).toBe(7);
    expect(result.usage.completion_tokens).toBe(3);
    expect(gateway.requests).toHaveLength(1);
  });

  // ── Response caching, asserted where it lands ────────────────────────────

  test("the cache entry is scoped to the requesting user, with a bounded lifetime", async () => {
    const { requests } = await captureRequest(undefined, cacheFor("user-alpha"));
    const headers = requests[0]!.headers;

    expect(headers["cf-aig-cache-key"]).toMatch(/^user-[a-z]+:[0-9a-f]{64}$/);
    expect(headers["cf-aig-cache-ttl"]).toBe(String(AIG_CACHE_TTL_SECONDS));
    // Set, not merely computed: the header slot merges last, so a provider header can
    // never shadow it.
    expect(headers["cf-aig-skip-cache"]).toBeUndefined();
  });

  test("two users asking the identical question never share an entry", async () => {
    // The isolation proof taken at the boundary rather than at the function that builds
    // the key: identical messages, identical model, identical everything except who is
    // asking — and the key the gateway would file the answer under still differs.
    const alpha = await captureRequest(undefined, cacheFor("user-alpha"));
    const beta = await captureRequest(undefined, cacheFor("user-beta"));

    expect(alpha.requests[0]!.headers["cf-aig-cache-key"]).not.toBe(
      beta.requests[0]!.headers["cf-aig-cache-key"],
    );
  });

  test("a retried attempt files under the same key, not an empty-body one", async () => {
    // The key is a function of the payload, and the payload is read from a one-shot
    // Request body. A second attempt that hashed a drained body would produce a different
    // key — and the retry would never hit the entry the first attempt created.
    const { requests } = await captureRequest(undefined, cacheFor("user-alpha"), [MODEL, MODEL]);

    expect(requests.length).toBeGreaterThanOrEqual(2);
    expect(new Set(requests.map((r) => r.headers["cf-aig-cache-key"])).size).toBe(1);
  });

  test.each([
    ["blank", { cache: { userId: "   ", ttlSeconds: AIG_CACHE_TTL_SECONDS } }],
    ["absent", {}],
  ])("a %s principal skips the cache rather than sending an unkeyed request", async (_l, cache) => {
    // The tempting degrade is the dangerous one: without `cf-aig-cache-key` the gateway
    // falls back to its OWN default key, which does not segment by user — precisely the
    // cross-user replay the per-user key exists to prevent. No principal, no caching.
    const { requests } = await captureRequest(undefined, cache as AigCacheOptions);
    const headers = requests[0]!.headers;

    expect(headers["cf-aig-skip-cache"]).toBe("true");
    expect(headers["cf-aig-cache-key"]).toBeUndefined();
    expect(headers["cf-aig-cache-ttl"]).toBeUndefined();
  });

  test("the gateway's own cache verdict survives binding mode and reaches the observer", async () => {
    // The offline proof that the PRIMARY signal is reachable: `AiGateway.run()` returns a
    // `Response` and our fetcher owns it, so nothing between Cloudflare and the drain can
    // strip the header. What no offline test can settle is whether Cloudflare sets it —
    // which is what the zeroed-usage fallback is for.
    const gateway = makeFakeGateway(async () =>
      cannedSseResponse({ "cf-aig-cache-status": "HIT" }),
    );
    const observed: Array<string | null> = [];

    await runModelWithFallback({
      env: gateway.env,
      modelChain: [MODEL],
      messages: MESSAGES,
      handlers: { onTextDelta: () => {} },
      aigCache: { ...cacheFor("user-alpha"), onCacheStatus: (s) => observed.push(s) },
    });

    expect(observed).toEqual(["HIT"]);
  });
});
