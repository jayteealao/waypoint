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
 * Node environment, the adapter factory mocked, D1 mocked in-process so every
 * `usage_events` write — via `run()` or via `batch()` — is directly countable.
 */

import { vi, describe, test, expect, beforeEach, afterEach } from "vitest";

vi.mock("@tanstack/ai", () => ({
  chat: vi.fn(),
  toolDefinition: vi.fn((t: unknown) => t),
}));

vi.mock("@tanstack/ai-openrouter", () => ({
  createOpenRouterText: vi.fn((model: string) => ({ __adapter: model })),
}));

import { callGateway, callGatewayStream } from "#/lib/ai/gateway";
import { TIERS } from "#/lib/ai/tiers";
import { AIG_CACHE_TTL_SECONDS, buildCacheKey, classifyCacheOutcome } from "#/lib/ai/aig-cache";
import { chat } from "@tanstack/ai";
import { createOpenRouterText } from "@tanstack/ai-openrouter";
import type { HTTPClient } from "@openrouter/sdk";

/**
 * Both branches build the adapter with the same factory now, so factory identity no
 * longer says which way the request goes — the third argument does. A gateway
 * `httpClient` IS the routing: it is the transport that replaces a direct HTTPS call
 * with `env.AI.gateway(id).run(...)`.
 */
function adapterConfig(callIndex = 0): Record<string, unknown> | undefined {
  const call = vi.mocked(createOpenRouterText).mock.calls[callIndex];
  return call?.[2] as Record<string, unknown> | undefined;
}

// ── Mock D1 ────────────────────────────────────────────────────────────────

interface FakeStatement {
  __sql: string;
  __args: unknown[];
}

interface DbHandle {
  db: D1Database;
  /** Every `usage_events` INSERT that actually executed, in order. */
  usageWrites: unknown[][];
  /**
   * The SQL of EVERY statement that executed, usage row or not. Cache accounting is
   * defined by an absence — the caller's own write commits and the ledger row does not —
   * and an absence is only assertable against a record of what *did* run.
   */
  executedSql: string[];
}

/** `rejectBatch` makes `batch()` fail, which is how the persist-failure contract is driven. */
function makeDb(opts?: { rejectBatch?: boolean }): DbHandle {
  const usageWrites: unknown[][] = [];
  const executedSql: string[] = [];

  const record = (sql: string, args: unknown[]): void => {
    executedSql.push(sql);
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
      if (opts?.rejectBatch) throw new Error("d1: batch rejected");
      for (const s of statements) record(s.__sql, s.__args);
      return [];
    },
  } as unknown as D1Database;

  return { db, usageWrites, executedSql };
}

/**
 * A stand-in for `env.AI`.
 *
 * `cacheStatuses` is answered one entry per `run()` call, so a chain can be given a
 * gateway that reports a hit on the first attempt and says nothing on the next —
 * `undefined`/exhausted means the response carries no `cf-aig-cache-status` at all.
 */
function makeAiBinding(cacheStatuses: Array<string | undefined> = []): {
  binding: Ai;
  gatewayCalls: string[];
} {
  const gatewayCalls: string[] = [];
  let runs = 0;
  const binding = {
    gateway(gatewayId: string) {
      gatewayCalls.push(gatewayId);
      return {
        __gateway: gatewayId,
        run: async () => {
          const status = cacheStatuses[runs++];
          return new Response("{}", {
            headers: status === undefined ? {} : { "cf-aig-cache-status": status },
          });
        },
      };
    },
  } as unknown as Ai;
  return { binding, gatewayCalls };
}

/**
 * Send one request down the REAL gateway fetcher built for the Nth model attempt.
 *
 * The chat loop is mocked in this file, so the transport is never exercised on its own —
 * but the transport is where the gateway's cache verdict is read. Driving it explicitly
 * from inside a mocked stream is what lets an attempt "observe a HIT" and then fail,
 * which is the only way to prove the observation does not leak into the next attempt.
 */
async function driveGatewayTransport(callIndex = 0): Promise<void> {
  const httpClient = adapterConfig(callIndex)?.["httpClient"] as HTTPClient | undefined;
  expect(httpClient, "httpClient for attempt " + callIndex).toBeDefined();
  await httpClient!.request(
    new Request("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({ model: "m", messages: [{ role: "user", content: "Hello" }] }),
      headers: { "content-type": "application/json" },
    }),
  );
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

/**
 * What a cache hit looks like coming out of the drain: real content, and a usage payload
 * whose tokens and cost are all present and exactly zero. The mocked chunk stream carries
 * no HTTP headers, so this is the fallback signal — the branch that exists precisely
 * because Cloudflare does not promise `cf-aig-cache-status` in binding mode.
 */
function zeroedUsageEnvelope(model: string): AsyncIterable<Record<string, unknown>> {
  return (async function* () {
    yield { type: "TEXT_MESSAGE_CONTENT", delta: "cached answer" };
    yield {
      type: "RUN_FINISHED",
      model,
      usage: { promptTokens: 0, completionTokens: 0, total_cost: 0 },
    };
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

  test("the dead attempt's partial text is not glued to the front of the answer", async () => {
    const { db } = makeDb();
    // Deltas are forwarded the moment they arrive, so a first attempt that emits half a
    // JSON document and then dies leaves that half in the buffer. Four call sites parse
    // this string as JSON; a concatenation of two documents parses as neither.
    vi.mocked(chat)
      .mockReturnValueOnce(
        (async function* () {
          yield { type: "TEXT_MESSAGE_CONTENT", delta: '{"verdict":"par' };
          yield { type: "RUN_ERROR", message: "upstream died mid-document" };
        })() as never,
      )
      .mockReturnValueOnce(
        (async function* () {
          yield { type: "TEXT_MESSAGE_CONTENT", delta: '{"verdict":"complete"}' };
          yield { type: "RUN_FINISHED", usage: { promptTokens: 3, completionTokens: 4 } };
        })() as never,
      );

    const result = await callGateway({ env: makeEnv(db), ...TEXT_INPUT });

    expect(result.text).toBe('{"verdict":"complete"}');
    expect(JSON.parse(result.text!)).toEqual({ verdict: "complete" });
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

    // The binding was asked for the configured gateway, and the adapter was built
    // against a transport that goes through it.
    expect(gatewayCalls).toEqual(["waypoint-dev"]);
    expect(vi.mocked(createOpenRouterText)).toHaveBeenCalledTimes(1);

    const [model, apiKey] = vi.mocked(createOpenRouterText).mock.calls[0]!;
    expect(model).toBe(TIERS.interview.primaryModel);
    // Routing to the gateway does not remove the need for a provider key — the
    // gateway forwards upstream, and OpenRouter answers 401 without one.
    expect(apiKey).toBe("test-key");
    expect(adapterConfig()?.["httpClient"]).toBeDefined();
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

    expect(vi.mocked(createOpenRouterText)).toHaveBeenCalledTimes(1);
    // No gateway transport was installed, so the request leaves for the provider
    // directly — even though the binding and the gateway id are both present.
    expect(adapterConfig()?.["httpClient"]).toBeUndefined();
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

// ── Caching helpers ────────────────────────────────────────────────────────

function routedEnv(db: D1Database, binding: Ai) {
  return makeEnv(db, { AI: binding, AIG_ENABLED: "true", AIG_GATEWAY_ID: "waypoint-dev" });
}

/** A write of the caller's own — the thing that must survive a cache hit. */
function lessonStatement(db: D1Database): D1PreparedStatement {
  return db.prepare("INSERT INTO lessons (id, body) VALUES (?, ?)").bind("lesson-1", "body");
}

/** Every structured signal this generation emitted, parsed. */
function emittedSignals(logSpy: { mock: { calls: unknown[][] } }): Array<Record<string, unknown>> {
  return logSpy.mock.calls
    .map((c) => {
      try {
        return JSON.parse(c[0] as string) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((s): s is Record<string, unknown> => s !== null);
}

// ── AC-5: the cache key isolates one user from another ─────────────────────

describe("the cache key can only ever replay the requesting user's own answer", () => {
  const BODY = JSON.stringify({
    model: "openai/gpt-5.6-luna",
    messages: [{ role: "user", content: "Teach me recursion" }],
  });
  const ROUTE = { provider: "openrouter", endpoint: "chat/completions", body: BODY };

  test("two users issuing byte-identical bodies get different keys", async () => {
    const a = await buildCacheKey({ ...ROUTE, userId: "user-a" });
    const b = await buildCacheKey({ ...ROUTE, userId: "user-b" });

    expect(a).not.toBe(b);
    expect(a.startsWith("user-a:")).toBe(true);
    expect(b.startsWith("user-b:")).toBe(true);
    // The digest halves are IDENTICAL — the principal is the only thing separating the
    // two entries, which is what makes the isolation structural rather than incidental.
    expect(a.split(":")[1]).toBe(b.split(":")[1]);
  });

  test("the same user and the same body always produce the same key", async () => {
    expect(await buildCacheKey({ ...ROUTE, userId: "user-a" })).toBe(
      await buildCacheKey({ ...ROUTE, userId: "user-a" }),
    );
  });

  test("one user's two different requests do not share an entry", async () => {
    const first = await buildCacheKey({ ...ROUTE, userId: "user-a" });
    const second = await buildCacheKey({
      ...ROUTE,
      userId: "user-a",
      body: JSON.stringify({ model: "openai/gpt-5.6-luna", messages: [] }),
    });

    expect(first).not.toBe(second);
  });

  test("the route is inside the digest, because our key replaces the platform's own", async () => {
    // `cf-aig-cache-key` OVERRIDES the gateway's default key, so provider and endpoint
    // stop discriminating entries the moment we set it. Both are constant today, which is
    // exactly why leaving them out would never be caught anywhere else.
    const here = await buildCacheKey({ ...ROUTE, userId: "user-a" });
    const elsewhere = await buildCacheKey({ ...ROUTE, userId: "user-a", endpoint: "completions" });
    const otherProvider = await buildCacheKey({ ...ROUTE, userId: "user-a", provider: "openai" });

    expect(new Set([here, elsewhere, otherProvider]).size).toBe(3);
  });

  test("every key is a principal followed by a full SHA-256 digest", async () => {
    expect(await buildCacheKey({ ...ROUTE, userId: "user-a" })).toMatch(/^user-a:[0-9a-f]{64}$/);
  });

  test("the TTL sits inside Cloudflare's documented window", () => {
    // 60s minimum, one month maximum
    // (https://developers.cloudflare.com/ai-gateway/features/caching/).
    expect(AIG_CACHE_TTL_SECONDS).toBeGreaterThanOrEqual(60);
    expect(AIG_CACHE_TTL_SECONDS).toBeLessThanOrEqual(2_592_000);
  });
});

// ── RIM-8: the detector's truth table ──────────────────────────────────────

describe("deciding whether a response was served from the gateway's cache", () => {
  const ZEROED = { prompt_tokens: 0, completion_tokens: 0, total_cost: 0 };
  const REAL = { prompt_tokens: 11, completion_tokens: 22, total_cost: 0.003 };

  test("an explicit HIT header decides, whatever the payload says", () => {
    expect(classifyCacheOutcome({ status: "HIT", usage: REAL, producedOutput: true })).toEqual({
      cached: true,
      signal: "header",
    });
  });

  test("an explicit MISS header decides too, even against a zeroed payload", () => {
    // The header wins in BOTH directions: a stated MISS is a stronger claim than any
    // inference from the numbers, so a real generation that happened to report zeros is
    // never waived.
    expect(classifyCacheOutcome({ status: "MISS", usage: ZEROED, producedOutput: true })).toEqual({
      cached: false,
      signal: "header",
    });
  });

  test("the header is read case- and whitespace-insensitively", () => {
    expect(
      classifyCacheOutcome({ status: " hit ", usage: REAL, producedOutput: true }).cached,
    ).toBe(true);
  });

  test("with no header, content plus an explicit zero cost is a hit", () => {
    expect(classifyCacheOutcome({ usage: ZEROED, producedOutput: true })).toEqual({
      cached: true,
      signal: "zeroed-usage",
    });
  });

  test("with no header, an ABSENT total_cost still meters", () => {
    // The ordinary OpenRouter miss, and AC-7's whole subject. Reading "zeroed" loosely
    // enough to include it would drop a real generation's cost — the one error that
    // leaves no trace.
    expect(
      classifyCacheOutcome({
        usage: { prompt_tokens: 0, completion_tokens: 0 },
        producedOutput: true,
      }),
    ).toEqual({ cached: false, signal: "none" });
  });

  test("with no header, real usage is not a hit", () => {
    expect(classifyCacheOutcome({ usage: REAL, producedOutput: true })).toEqual({
      cached: false,
      signal: "none",
    });
  });

  test("an all-zero response that produced NO output is not a hit", () => {
    // A refusal, a pre-generation failure or a truncated stream also reports zero tokens
    // and zero cost. A cache hit always replays content, so an empty answer never
    // qualifies — otherwise the ledger would waive exactly the failures worth seeing.
    expect(classifyCacheOutcome({ usage: ZEROED, producedOutput: false })).toEqual({
      cached: false,
      signal: "none",
    });
  });
});

// ── AC-6 / AC-7: what a hit and a miss cost in the ledger ──────────────────

describe("a cache hit costs nothing and a miss still meters", () => {
  test("a cached buffered generation resolves cost 0 and writes no ledger row", async () => {
    const { db, usageWrites } = makeDb();
    const { binding } = makeAiBinding();
    vi.mocked(chat).mockReturnValueOnce(zeroedUsageEnvelope(TIERS.interview.primaryModel) as never);

    const result = await callGateway({ env: routedEnv(db, binding), ...TEXT_INPUT });

    expect(result.text).toBe("cached answer");
    expect(result.usage.costUsd).toBe(0);
    // No row IS no quota: `checkQuota` sums `cost_usd` over `usage_events` and nothing
    // else advances it, so declining the insert is declining the charge.
    expect(usageWrites).toHaveLength(0);
  });

  test("a cached streamed generation still commits the caller's own write", async () => {
    const { db, usageWrites, executedSql } = makeDb();
    const { binding } = makeAiBinding();
    vi.mocked(chat).mockReturnValueOnce(zeroedUsageEnvelope(TIERS.lesson.primaryModel) as never);

    const handle = await callGatewayStream({ env: routedEnv(db, binding), ...STREAM_CONTEXT });
    const outcome = await handle.run(
      [{ role: "user", content: "Teach me recursion" }],
      { onTextDelta: () => {} },
      () => ({ kind: "commit", statements: [lessonStatement(db)] }),
    );

    // A cached lesson is still a real lesson the learner keeps — only the ledger row goes.
    expect(outcome.kind).toBe("success");
    expect(executedSql.some((sql) => sql.includes("INSERT INTO lessons"))).toBe(true);
    expect(usageWrites).toHaveLength(0);
  });

  test("the completion signal says the charge was waived and on what evidence", async () => {
    const logSpy = vi.spyOn(console, "log");
    const { db } = makeDb();
    const { binding } = makeAiBinding();
    vi.mocked(chat).mockReturnValueOnce(zeroedUsageEnvelope(TIERS.interview.primaryModel) as never);

    await callGateway({ env: routedEnv(db, binding), ...TEXT_INPUT });

    // A hit writes no row, so this signal is the only place a waived charge is visible.
    const completed = emittedSignals(logSpy).find((s) => s["event"] === "generation.completed");
    expect(completed!["cache_status"]).toBe("HIT");
    expect(completed!["cache_signal"]).toBe("zeroed-usage");
    expect(completed!["cost_usd"]).toBe(0);
  });

  test("a miss whose stream omits total_cost recomputes and meters (AC-7)", async () => {
    const logSpy = vi.spyOn(console, "log");
    const { db, usageWrites } = makeDb();
    const { binding } = makeAiBinding();
    vi.mocked(chat).mockReturnValueOnce(
      servedModelEnvelope({ servedModel: TIERS.interview.primaryModel }) as never,
    );

    const result = await callGateway({ env: routedEnv(db, binding), ...TEXT_INPUT });

    expect(result.usage.costUsd).toBeGreaterThan(0);
    expect(usageWrites).toHaveLength(1);
    expect(usageWrites[0]![7] as number).toBeGreaterThan(0); // cost_usd column
    expect(emittedSignals(logSpy).some((s) => s["event"] === "generation.cost_recomputed")).toBe(
      true,
    );
    const completed = emittedSignals(logSpy).find((s) => s["event"] === "generation.completed");
    expect(completed!["cache_status"]).toBe("MISS");
  });

  test("the same zeroed envelope off the gateway still meters (bypass guard)", async () => {
    const logSpy = vi.spyOn(console, "log");
    const { db, usageWrites } = makeDb();
    vi.mocked(chat).mockReturnValueOnce(zeroedUsageEnvelope(TIERS.interview.primaryModel) as never);

    await callGateway({ env: makeEnv(db), ...TEXT_INPUT });

    // Cache accounting exists only on the routed path. A bypass generation that happened
    // to report zeros must not stop metering — that would be exactly the drift the kill
    // switch exists to prevent.
    expect(usageWrites).toHaveLength(1);
    const completed = emittedSignals(logSpy).find((s) => s["event"] === "generation.completed");
    expect(completed!["cache_status"]).toBeUndefined();
    expect(completed!["cache_signal"]).toBeUndefined();
  });
});

// ── Attempt identity and the outcome contract ──────────────────────────────

describe("a cache observation belongs to the attempt that made it", () => {
  test("a HIT seen by a failed attempt does not waive the attempt that succeeded", async () => {
    const { db, usageWrites } = makeDb();
    // The gateway reports a hit to the FIRST attempt only; the second never reaches it.
    const { binding } = makeAiBinding(["HIT"]);
    vi.mocked(chat)
      .mockImplementationOnce(
        () =>
          (async function* () {
            await driveGatewayTransport(0);
            yield { type: "RUN_ERROR", message: "upstream 502" };
          })() as never,
      )
      .mockImplementationOnce(
        () =>
          servedModelEnvelope({
            servedModel: TIERS.interview.primaryModel,
            totalCost: 0.002,
          }) as never,
      );

    const result = await callGateway({ env: routedEnv(db, binding), ...TEXT_INPUT });

    // Without a per-attempt reset the stale "HIT" would answer for the retry and this
    // generation would go unmetered — a real cost dropped on the strength of an
    // observation about a request that failed.
    expect(result.usage.costUsd).toBe(0.002);
    expect(usageWrites).toHaveLength(1);
  });

  test("text streamed by a failed attempt does not vouch for an empty one", async () => {
    const { db, usageWrites } = makeDb();
    const { binding } = makeAiBinding();
    vi.mocked(chat)
      .mockImplementationOnce(
        () =>
          (async function* () {
            yield { type: "TEXT_MESSAGE_CONTENT", delta: "half an answer" };
            yield { type: "RUN_ERROR", message: "upstream reset" };
          })() as never,
      )
      .mockImplementationOnce(
        () =>
          (async function* () {
            yield {
              type: "RUN_FINISHED",
              model: TIERS.interview.primaryModel,
              usage: { promptTokens: 0, completionTokens: 0, total_cost: 0 },
            };
          })() as never,
      );

    await callGateway({ env: routedEnv(db, binding), ...TEXT_INPUT });

    // The retry said nothing at all, at zero reported cost — a refusal, not a replay.
    // Counting the abandoned attempt's deltas would have made it look like content plus
    // a zero cost, which is the shape of a cache hit, and the row would have vanished.
    expect(usageWrites).toHaveLength(1);
  });

  test("a cached generation whose batch fails is a persist failure, never a success", async () => {
    const { db } = makeDb({ rejectBatch: true });
    const { binding } = makeAiBinding();
    vi.mocked(chat).mockReturnValueOnce(zeroedUsageEnvelope(TIERS.lesson.primaryModel) as never);

    const handle = await callGatewayStream({ env: routedEnv(db, binding), ...STREAM_CONTEXT });
    const outcome = await handle.run(
      [{ role: "user", content: "Teach me recursion" }],
      { onTextDelta: () => {} },
      () => ({ kind: "commit", statements: [lessonStatement(db)] }),
    );

    // Free does not mean saved: the learner must still be told the lesson was not stored.
    expect(outcome.kind).toBe("persist_failed");
  });

  test("a cached generation whose caller refuses writes nothing at all", async () => {
    const { db, usageWrites, executedSql } = makeDb();
    const { binding } = makeAiBinding();
    vi.mocked(chat).mockReturnValueOnce(zeroedUsageEnvelope(TIERS.lesson.primaryModel) as never);

    const handle = await callGatewayStream({ env: routedEnv(db, binding), ...STREAM_CONTEXT });
    const outcome = await handle.run(
      [{ role: "user", content: "Teach me recursion" }],
      { onTextDelta: () => {} },
      () => ({ kind: "refuse", reason: "empty lesson" }),
    );

    expect(outcome).toEqual({ kind: "refused", reason: "empty lesson" });
    expect(usageWrites).toHaveLength(0);
    expect(executedSql).toEqual([]);
  });

  test("a cached generation with nothing else to write issues no batch at all", async () => {
    // `rejectBatch` is the instrument: if an empty `batch([])` were issued it would
    // reject and this would resolve `persist_failed` instead.
    const { db, usageWrites } = makeDb({ rejectBatch: true });
    const { binding } = makeAiBinding();
    vi.mocked(chat).mockReturnValueOnce(zeroedUsageEnvelope(TIERS.lesson.primaryModel) as never);

    const handle = await callGatewayStream({ env: routedEnv(db, binding), ...STREAM_CONTEXT });
    const outcome = await handle.run(
      [{ role: "user", content: "Teach me recursion" }],
      { onTextDelta: () => {} },
      () => ({ kind: "commit", statements: [] }),
    );

    expect(outcome.kind).toBe("success");
    expect(usageWrites).toHaveLength(0);
  });
});
