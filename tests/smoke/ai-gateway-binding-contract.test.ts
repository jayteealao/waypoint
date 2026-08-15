// @vitest-environment node
/**
 * The routed path, driven against the real libraries.
 *
 * Everywhere else the gateway adapter is mocked, which proves we *call* it correctly
 * and nothing about what it then does. Here nothing is mocked: the real
 * `createOpenRouterChat`, the real OpenRouter SDK and the real `@tanstack/ai` chat
 * loop run against a fake `env.AI.gateway(id)` — the one object a unit test can stand
 * in for, because it is the boundary where the Worker hands the request to Cloudflare.
 *
 * That makes this the closest thing to a real gateway call that exists before one is
 * provisioned: it asserts the exact request shape that would reach the gateway, and
 * it exercises the fail-closed path (a gateway that errors must not end the stream
 * cleanly) against the actual adapter rather than a hand-written envelope.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

// The routed branch is reached the way production reaches it — through the model
// runner, which asks `createTextAdapter` for the adapter and then drains it.
import { runModelWithFallback } from "#/lib/ai/model-stream";

/** The request object `@cloudflare/tanstack-ai` hands to `binding.run(...)`. */
interface GatewayRequest {
  provider: string;
  endpoint: string;
  headers: Record<string, string>;
  query: Record<string, unknown>;
}

interface FakeGateway {
  env: {
    OPENROUTER_API_KEY: string;
    AI: Ai;
    AIG_ENABLED: string;
    AIG_GATEWAY_ID: string;
  };
  requests: GatewayRequest[];
}

/**
 * A stand-in for `env.AI` whose `gateway(id).run(request)` records what it was given
 * and then answers with `respond` — a rejection, or a canned upstream response.
 */
function makeFakeGateway(respond: () => Promise<Response>): FakeGateway {
  const requests: GatewayRequest[] = [];
  const AI = {
    gateway(_gatewayId: string) {
      return {
        async run(request: GatewayRequest) {
          requests.push(request);
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
  };
}

const MODEL = "openai/gpt-5.6-luna";
const MESSAGES = [{ role: "user" as const, content: "Say hello" }];

/** An OpenAI-compatible SSE body — what OpenRouter streams back through the gateway. */
function cannedSseResponse(): Response {
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
    headers: { "content-type": "text/event-stream" },
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
  test("carries the OpenRouter chat endpoint and the provider key", async () => {
    const gateway = makeFakeGateway(async () => {
      throw new Error("gateway unavailable");
    });

    await expect(
      runModelWithFallback({
        env: gateway.env,
        modelChain: [MODEL],
        messages: MESSAGES,
        handlers: { onTextDelta: () => {} },
      }),
    ).rejects.toThrow();

    expect(gateway.requests.length).toBeGreaterThan(0);
    const request = gateway.requests[0]!;
    expect(request.provider).toBe("openrouter");
    expect(request.endpoint).toContain("chat/completions");
    // Binding mode authenticates to the PROVIDER with this header; without it the
    // adapter sends the literal string "unused" and OpenRouter answers 401, which
    // would read as a gateway fault.
    expect(request.headers["authorization"]).toBe("Bearer test-key");
  });

  test("KNOWN UPSTREAM DEFECT: the request reaches the binding with an empty body", async () => {
    const gateway = makeFakeGateway(async () => {
      throw new Error("gateway unavailable");
    });

    await expect(
      runModelWithFallback({
        env: gateway.env,
        modelChain: [MODEL],
        messages: MESSAGES,
        handlers: { onTextDelta: () => {} },
      }),
    ).rejects.toThrow();

    // `query` is the provider's request body — the model and the messages
    // (https://developers.cloudflare.com/ai-gateway/usage/universal/). It is empty
    // because the two libraries disagree about how a fetcher is called: the OpenRouter
    // SDK invokes it with a single `Request`
    // (node_modules/@openrouter/sdk/esm/lib/http.js:34 — `this.fetcher(req)`), while the
    // gateway fetcher reads the body from a second `init` argument that is therefore
    // never passed (node_modules/@cloudflare/tanstack-ai/dist/create-fetcher-Cmmx6As3.mjs,
    // `createGatewayFetch`: `if (init?.body) query = JSON.parse(init.body)`).
    //
    // A real gateway would forward an empty payload upstream and the generation would
    // fail. This assertion is deliberately inverted — it PINS the defect so the suite
    // goes red the moment it is fixed upstream or worked around here, at which point it
    // becomes `expect(request.query["model"]).toBe(MODEL)`.
    expect(gateway.requests[0]!.query).toEqual({});
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
    // parsed into the same deltas and usage the direct path produces — not that a real
    // gateway would accept the request (see the defect pinned above).
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
});
