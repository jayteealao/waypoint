// @vitest-environment node
/**
 * Gateway routing: which way out, and what happens when that way fails.
 *
 * Two behaviors meet here. The kill switch decides whether a generation is built
 * against the AI Gateway binding or straight against OpenRouter — observable without
 * a network because adapter construction is a single seam (`createTextAdapter`).
 * And the error envelope decides what a gateway or upstream failure costs: the
 * OpenRouter adapter reports failures by YIELDING a RUN_ERROR chunk rather than
 * throwing, so a drain that ignores it would end the stream cleanly and meter a
 * generation that never happened. Every "no ledger row" assertion below is guarding
 * that hole.
 *
 * Node environment, both adapter factories mocked, D1 mocked in-process so every
 * `usage_events` write — via `run()` or via `batch()` — is directly countable.
 */

import { vi, describe, test, expect, beforeEach, afterEach } from "vitest";

vi.mock("@tanstack/ai", () => ({
  chat: vi.fn(),
  toolDefinition: vi.fn((t: unknown) => t),
}));

vi.mock("@tanstack/ai-openrouter", () => ({
  createOpenRouterText: vi.fn((model: string) => ({ __direct: model })),
}));

vi.mock("@cloudflare/tanstack-ai/adapters/openrouter", () => ({
  createOpenRouterChat: vi.fn((model: string) => ({ __routed: model })),
}));

import { callGateway, callGatewayStream } from "#/lib/ai/gateway";
import { TIERS } from "#/lib/ai/tiers";
import { chat } from "@tanstack/ai";
import { createOpenRouterText } from "@tanstack/ai-openrouter";
import { createOpenRouterChat } from "@cloudflare/tanstack-ai/adapters/openrouter";

// ── Mock D1 ────────────────────────────────────────────────────────────────

interface FakeStatement {
  __sql: string;
  __args: unknown[];
}

interface DbHandle {
  db: D1Database;
  /** Every `usage_events` INSERT that actually executed, in order. */
  usageWrites: unknown[][];
}

function makeDb(): DbHandle {
  const usageWrites: unknown[][] = [];

  const record = (sql: string, args: unknown[]): void => {
    if (sql.includes("INSERT INTO usage_events")) usageWrites.push(args);
  };

  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            __sql: sql,
            __args: args,
            async first() {
              return { used: 0 };
            },
            async run() {
              record(sql, args);
              return { success: true, meta: { changes: 1 }, results: [] };
            },
          };
        },
      };
    },
    async batch(statements: FakeStatement[]) {
      for (const s of statements) record(s.__sql, s.__args);
      return [];
    },
  } as unknown as D1Database;

  return { db, usageWrites };
}

/** A stand-in for `env.AI` — only `gateway(id)` is ever reached from here. */
function makeAiBinding(): { binding: Ai; gatewayCalls: string[] } {
  const gatewayCalls: string[] = [];
  const binding = {
    gateway(gatewayId: string) {
      gatewayCalls.push(gatewayId);
      return { __gateway: gatewayId, run: async () => new Response("{}") };
    },
  } as unknown as Ai;
  return { binding, gatewayCalls };
}

function makeEnv(
  db: D1Database,
  overrides?: Partial<{ AI: Ai; AIG_ENABLED: string; AIG_GATEWAY_ID: string }>,
) {
  return { DB: db, OPENROUTER_API_KEY: "test-key", ...overrides };
}

// ── Envelope builders ──────────────────────────────────────────────────────
//
// Local to this file on purpose: tests/smoke/ai-gateway.test.ts is a regression gate
// for the pre-routing behavior and must stay byte-identical, so nothing is extracted
// out of it. `scoped-caching` extends THIS file with the cache HIT/MISS envelopes.

/** What the adapter emits when the gateway or the provider fails: a chunk, not a throw. */
function errorEnvelope(message: string): AsyncIterable<Record<string, unknown>> {
  return (async function* () {
    yield { type: "RUN_ERROR", model: "z-ai/glm-5.2", message, error: { message } };
  })();
}

/**
 * A completed generation that the gateway (or OpenRouter's own routing) served with
 * a model other than the one requested — RUN_FINISHED reports what actually answered.
 */
function servedModelEnvelope(opts: {
  servedModel: string;
  text?: string;
  totalCost?: number;
}): AsyncIterable<Record<string, unknown>> {
  const usage: Record<string, unknown> = { promptTokens: 11, completionTokens: 22 };
  if (opts.totalCost !== undefined) usage["total_cost"] = opts.totalCost;

  return (async function* () {
    yield { type: "TEXT_MESSAGE_CONTENT", delta: opts.text ?? "answer" };
    yield { type: "RUN_FINISHED", model: opts.servedModel, usage };
  })();
}

const TEXT_INPUT = {
  userId: "user-123",
  journeyId: "journey-abc",
  type: "interview" as const,
  messages: [{ role: "user" as const, content: "Hello" }],
};

const STREAM_CONTEXT = {
  userId: "user-123",
  journeyId: "journey-abc",
  type: "lesson" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── AC-8: error envelope ───────────────────────────────────────────────────

describe("a gateway/upstream error envelope fails closed", () => {
  test("the buffered path exhausts the chain, rejects, and writes no ledger row", async () => {
    const { db, usageWrites } = makeDb();
    vi.mocked(chat).mockImplementation(() => errorEnvelope("gateway upstream 502") as never);

    await expect(callGateway({ env: makeEnv(db), ...TEXT_INPUT })).rejects.toThrow(
      "gateway upstream 502",
    );

    // Every model in the chain was attempted — an error envelope is an attempt
    // failure, not a successful empty answer.
    expect(vi.mocked(createOpenRouterText)).toHaveBeenCalledTimes(
      1 + TIERS.interview.fallbackChain.length,
    );
    expect(usageWrites).toHaveLength(0);
  });

  test("the streaming path rejects, so the lesson route emits its terminal error event", async () => {
    const { db, usageWrites } = makeDb();
    vi.mocked(chat).mockImplementation(() => errorEnvelope("gateway upstream 502") as never);

    const handle = await callGatewayStream({ env: makeEnv(db), ...STREAM_CONTEXT });
    await expect(
      handle.run(
        [{ role: "user", content: "Teach me recursion" }],
        { onTextDelta: () => {} },
        () => ({ kind: "commit", statements: [] }),
      ),
    ).rejects.toThrow("gateway upstream 502");

    expect(usageWrites).toHaveLength(0);
  });

  test("a completion signal still reports the failure exactly once", async () => {
    const logSpy = vi.spyOn(console, "log");
    const { db } = makeDb();
    vi.mocked(chat).mockImplementation(() => errorEnvelope("gateway upstream 502") as never);

    await expect(callGateway({ env: makeEnv(db), ...TEXT_INPUT })).rejects.toThrow();

    const completed = logSpy.mock.calls
      .map((c) => {
        try {
          return JSON.parse(c[0] as string) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter((s) => s?.["event"] === "generation.completed");

    expect(completed).toHaveLength(1);
    expect(completed[0]!["outcome"]).toBe("failure");
  });
});

// ── AC-8: retry / fallback envelope ────────────────────────────────────────

describe("a retry/fallback envelope still meters correctly", () => {
  test("usage parses and the model that actually served is what the ledger records", async () => {
    const { db, usageWrites } = makeDb();
    vi.mocked(chat).mockReturnValueOnce(
      servedModelEnvelope({ servedModel: "openai/gpt-5.6-luna", totalCost: 0.003 }) as never,
    );

    const result = await callGateway({ env: makeEnv(db), ...TEXT_INPUT });

    expect(result.usage.promptTokens).toBe(11);
    expect(result.usage.completionTokens).toBe(22);
    expect(result.usage.costUsd).toBe(0.003);
    // Requested the tier primary; the envelope says a different model answered.
    expect(vi.mocked(createOpenRouterText)).toHaveBeenCalledWith(
      TIERS.interview.primaryModel,
      "test-key",
    );
    expect(result.usage.model).toBe("openai/gpt-5.6-luna");
    expect(usageWrites).toHaveLength(1);
    expect(usageWrites[0]![3]).toBe("openai/gpt-5.6-luna"); // model column
  });

  test("an envelope that names no model still records the model that was requested", async () => {
    const { db, usageWrites } = makeDb();
    vi.mocked(chat).mockReturnValueOnce(
      (async function* () {
        yield { type: "TEXT_MESSAGE_CONTENT", delta: "answer" };
        yield { type: "RUN_FINISHED", usage: { promptTokens: 1, completionTokens: 2 } };
      })() as never,
    );

    const result = await callGateway({ env: makeEnv(db), ...TEXT_INPUT });

    expect(result.usage.model).toBe(TIERS.interview.primaryModel);
    expect(usageWrites[0]![3]).toBe(TIERS.interview.primaryModel);
  });
});

// ── AC-10a: the kill switch ────────────────────────────────────────────────

describe("the kill switch decides which way out of the Worker", () => {
  test('AIG_ENABLED="true" builds the request against the gateway binding', async () => {
    const { db } = makeDb();
    const { binding, gatewayCalls } = makeAiBinding();
    vi.mocked(chat).mockReturnValueOnce(
      servedModelEnvelope({ servedModel: TIERS.interview.primaryModel }) as never,
    );

    await callGateway({
      env: makeEnv(db, { AI: binding, AIG_ENABLED: "true", AIG_GATEWAY_ID: "waypoint-dev" }),
      ...TEXT_INPUT,
    });

    expect(gatewayCalls).toEqual(["waypoint-dev"]);
    expect(vi.mocked(createOpenRouterText)).not.toHaveBeenCalled();
    expect(vi.mocked(createOpenRouterChat)).toHaveBeenCalledTimes(1);

    const [model, config] = vi.mocked(createOpenRouterChat).mock.calls[0]!;
    expect(model).toBe(TIERS.interview.primaryModel);
    expect(config).toMatchObject({ apiKey: "test-key" });
    // Binding mode still carries the provider key: the gateway fetcher omits the
    // upstream authorization header without it and sends the literal "unused".
    expect((config as { binding?: unknown }).binding).toMatchObject({
      __gateway: "waypoint-dev",
    });
  });

  test.each([
    ["absent", undefined],
    ["false", "false"],
    ["TRUE (wrong case)", "TRUE"],
  ])("AIG_ENABLED=%s goes direct and still writes the ledger row", async (_label, flag) => {
    const { db, usageWrites } = makeDb();
    const { binding } = makeAiBinding();
    vi.mocked(chat).mockReturnValueOnce(
      servedModelEnvelope({ servedModel: TIERS.interview.primaryModel, totalCost: 0.001 }) as never,
    );

    await callGateway({
      env: makeEnv(db, {
        AI: binding,
        AIG_GATEWAY_ID: "waypoint-dev",
        ...(flag === undefined ? {} : { AIG_ENABLED: flag }),
      }),
      ...TEXT_INPUT,
    });

    expect(vi.mocked(createOpenRouterChat)).not.toHaveBeenCalled();
    expect(vi.mocked(createOpenRouterText)).toHaveBeenCalledTimes(1);
    expect(usageWrites).toHaveLength(1);
    expect(usageWrites[0]![7]).toBe(0.001); // cost_usd — metering is untouched by the bypass
  });

  test("the routing decision is stamped on the generation signals", async () => {
    const logSpy = vi.spyOn(console, "log");
    const { db } = makeDb();
    const { binding } = makeAiBinding();
    vi.mocked(chat).mockReturnValueOnce(
      servedModelEnvelope({ servedModel: TIERS.interview.primaryModel }) as never,
    );

    await callGateway({
      env: makeEnv(db, { AI: binding, AIG_ENABLED: "true", AIG_GATEWAY_ID: "waypoint-dev" }),
      ...TEXT_INPUT,
    });

    const emitted = logSpy.mock.calls
      .map((c) => {
        try {
          return JSON.parse(c[0] as string) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter((s): s is Record<string, unknown> => s !== null);

    // The seam that makes "did the kill switch take effect?" answerable from a
    // running app — the outbound call is server-side, invisible to any browser trace.
    for (const event of ["generation.started", "generation.completed"]) {
      const signal = emitted.find((s) => s["event"] === event);
      expect(signal, event).toBeDefined();
      expect(signal!["aig_routed"]).toBe(true);
      expect(signal!["gateway_id"]).toBe("waypoint-dev");
    }
  });

  test("the bypass says so on the signals too, and names no gateway", async () => {
    const logSpy = vi.spyOn(console, "log");
    const { db } = makeDb();
    vi.mocked(chat).mockReturnValueOnce(
      servedModelEnvelope({ servedModel: TIERS.interview.primaryModel }) as never,
    );

    await callGateway({ env: makeEnv(db, { AIG_ENABLED: "false" }), ...TEXT_INPUT });

    const started = logSpy.mock.calls
      .map((c) => {
        try {
          return JSON.parse(c[0] as string) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .find((s) => s?.["event"] === "generation.started");

    expect(started!["aig_routed"]).toBe(false);
    expect(started!["gateway_id"]).toBeUndefined();
  });

  test("routing enabled without a binding refuses rather than degrading to direct", async () => {
    const { db, usageWrites } = makeDb();

    await expect(
      callGateway({
        env: makeEnv(db, { AIG_ENABLED: "true", AIG_GATEWAY_ID: "waypoint-dev" }),
        ...TEXT_INPUT,
      }),
    ).rejects.toThrow("AIG_ENABLED=true but the AI binding or AIG_GATEWAY_ID is missing");

    // Silently falling back to the provider would make "is the gateway on?"
    // unanswerable from outside the Worker.
    expect(vi.mocked(createOpenRouterText)).not.toHaveBeenCalled();
    expect(vi.mocked(chat)).not.toHaveBeenCalled();
    expect(usageWrites).toHaveLength(0);
  });

  test("routing enabled without a gateway id refuses the same way", async () => {
    const { db, usageWrites } = makeDb();
    const { binding } = makeAiBinding();

    await expect(
      callGateway({
        env: makeEnv(db, { AI: binding, AIG_ENABLED: "true" }),
        ...TEXT_INPUT,
      }),
    ).rejects.toThrow("AIG_ENABLED=true but the AI binding or AIG_GATEWAY_ID is missing");

    expect(usageWrites).toHaveLength(0);
  });
});
