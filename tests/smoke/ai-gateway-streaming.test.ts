// @vitest-environment node
/**
 * The streaming entry point's contract.
 *
 * `callGatewayStream` is what folded the lesson SSE route onto the shared outbound
 * path, so the things it must get right are the things the route used to do by hand:
 * gate quota exactly once and before any outbound request, reset per-attempt state
 * before a retried model's first token, commit the caller's write and the usage row
 * together, and report a persistence failure as a value rather than as a thrown
 * error — because the caller has three distinct things to tell the learner and only
 * one of them is "generation failed".
 *
 * Node environment with the LLM adapter mocked, same preamble as the buffered suite.
 * D1 is mocked in-process so batch ordering and query counts are directly observable.
 */

import { vi, describe, test, expect, beforeEach, afterEach } from "vitest";

vi.mock("@tanstack/ai", () => ({
  chat: vi.fn(),
  toolDefinition: vi.fn((t: unknown) => t),
}));

vi.mock("@tanstack/ai-openrouter", () => ({
  createOpenRouterText: vi.fn((model: string) => ({ __model: model })),
}));

import { callGatewayStream, QuotaExhaustedError } from "#/lib/ai/gateway";
import type { GatewayPersist } from "#/lib/ai/gateway";
import { TIERS } from "#/lib/ai/tiers";
import { DAILY_LIMIT_USD } from "#/lib/ai/quota";
import { chat } from "@tanstack/ai";
import { createOpenRouterText } from "@tanstack/ai-openrouter";
import { createFakeD1, type FakeD1Statement } from "./_fixtures/fake-d1";
import { signals } from "./_fixtures/signals";

// ── Mock D1 ────────────────────────────────────────────────────────────────

interface DbHandle {
  db: D1Database;
  prepared: string[];
  batches: FakeD1Statement[][];
  quotaQueries(): number;
}

function makeDb(opts?: {
  quotaUsed?: number;
  batch?: (statements: FakeD1Statement[]) => Promise<unknown>;
}): DbHandle {
  const batches: FakeD1Statement[][] = [];

  const fake = createFakeD1({
    first: () => ({ used: opts?.quotaUsed ?? 0 }),
    run: () => ({ success: true }),
    batch: async (statements) => {
      batches.push(statements);
      if (opts?.batch) return await opts.batch(statements);
      return [];
    },
  });

  return {
    db: fake.db,
    prepared: fake.prepared,
    batches,
    quotaQueries: () => fake.prepared.filter((s) => s.includes("SUM(cost_usd)")).length,
  };
}

function makeEnv(db: D1Database) {
  return { DB: db, OPENROUTER_API_KEY: "test-key" };
}

// ── Mock model stream ──────────────────────────────────────────────────────

function textStream(deltas: string[]): AsyncIterable<Record<string, unknown>> {
  return (async function* () {
    for (const delta of deltas) yield { type: "TEXT_MESSAGE_CONTENT", delta };
    yield {
      type: "RUN_FINISHED",
      usage: { promptTokens: 10, completionTokens: 20, total_cost: 0.001 },
    };
  })();
}

const MESSAGES = [{ role: "user" as const, content: "Teach me recursion" }];

const STREAM_CONTEXT = {
  userId: "user-123",
  journeyId: "journey-abc",
  type: "lesson" as const,
};

/** A caller statement that is distinguishable from the gateway's usage insert. */
function callerStatement(db: D1Database): D1PreparedStatement {
  return db.prepare("INSERT INTO lessons (id) VALUES (?)").bind("lesson-1");
}

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("callGatewayStream — the quota gate", () => {
  test("an exhausted quota rejects before the handle exists, with zero outbound requests", async () => {
    const { db } = makeDb({ quotaUsed: DAILY_LIMIT_USD + 0.01 });

    await expect(callGatewayStream({ env: makeEnv(db), ...STREAM_CONTEXT })).rejects.toBeInstanceOf(
      QuotaExhaustedError,
    );

    expect(vi.mocked(createOpenRouterText)).not.toHaveBeenCalled();
    expect(vi.mocked(chat)).not.toHaveBeenCalled();
  });

  test("one streaming generation costs exactly one quota query", async () => {
    const handleDb = makeDb();
    vi.mocked(chat).mockReturnValueOnce(textStream(["hello"]) as never);

    const handle = await callGatewayStream({ env: makeEnv(handleDb.db), ...STREAM_CONTEXT });
    await handle.run(MESSAGES, { onTextDelta: () => {} }, () => ({
      kind: "commit",
      statements: [],
    }));

    expect(handleDb.quotaQueries()).toBe(1);
  });
});

describe("callGatewayStream — per-attempt reset", () => {
  test("onAttemptReset fires before the retried attempt's first delta", async () => {
    const { db } = makeDb();
    const events: string[] = [];

    vi.mocked(chat)
      .mockImplementationOnce(() => {
        throw new Error("primary model unavailable");
      })
      .mockReturnValueOnce(textStream(["second-attempt"]) as never);

    const handle = await callGatewayStream({ env: makeEnv(db), ...STREAM_CONTEXT });
    await handle.run(
      MESSAGES,
      {
        onTextDelta: (delta) => events.push(`delta:${delta}`),
        onAttemptReset: () => events.push("reset"),
      },
      () => ({ kind: "commit", statements: [] }),
    );

    expect(events).toEqual(["reset", "delta:second-attempt"]);
  });
});

describe("callGatewayStream — the persistence decision belongs to the caller", () => {
  test("refuse writes nothing at all and carries the caller's reason verbatim", async () => {
    const handleDb = makeDb();
    const buildStatement = vi.fn(() => callerStatement(handleDb.db));
    vi.mocked(chat).mockReturnValueOnce(textStream(["partial"]) as never);

    const handle = await callGatewayStream({ env: makeEnv(handleDb.db), ...STREAM_CONTEXT });
    const outcome = await handle.run(MESSAGES, { onTextDelta: () => {} }, () => ({
      kind: "refuse",
      reason: "missing_sources",
    }));

    expect(outcome).toEqual({ kind: "refused", reason: "missing_sources" });
    expect(buildStatement).not.toHaveBeenCalled();
    expect(handleDb.batches).toHaveLength(0);
    expect(handleDb.prepared.filter((s) => s.includes("INSERT INTO usage_events"))).toHaveLength(0);
  });

  test("commit runs one batch with the caller's statements ahead of the usage insert", async () => {
    const handleDb = makeDb();
    vi.mocked(chat).mockReturnValueOnce(textStream(["done"]) as never);

    const handle = await callGatewayStream({ env: makeEnv(handleDb.db), ...STREAM_CONTEXT });
    const outcome = await handle.run(MESSAGES, { onTextDelta: () => {} }, () => ({
      kind: "commit",
      statements: [callerStatement(handleDb.db)],
    }));

    expect(outcome.kind).toBe("success");
    expect(handleDb.batches).toHaveLength(1);
    const [statements] = handleDb.batches;
    expect(statements).toHaveLength(2);
    expect(statements![0]!.__sql).toContain("INSERT INTO lessons");
    expect(statements![1]!.__sql).toContain("INSERT INTO usage_events");
    // The usage row is metered against the model that actually answered.
    expect(statements![1]!.__args[3]).toBe(TIERS.lesson.primaryModel);
    expect(statements![1]!.__args[4]).toBe("lesson");
    expect(outcome).toMatchObject({
      kind: "success",
      usage: { model: TIERS.lesson.primaryModel, promptTokens: 10, completionTokens: 20 },
    });
  });
});

describe("callGatewayStream — a failed persist is a value, not a throw", () => {
  const cases: Array<{ name: string; db: () => DbHandle; finalize: (db: DbHandle) => unknown }> = [
    {
      name: "the batch rejects",
      db: () =>
        makeDb({
          batch: async () => {
            throw new Error("D1_ERROR: batch failed");
          },
        }),
      finalize: (handleDb) => () => ({
        kind: "commit",
        statements: [callerStatement(handleDb.db)],
      }),
    },
    {
      name: "finalize itself throws",
      db: () => makeDb(),
      finalize: () => () => {
        throw new Error("residual parse blew up");
      },
    },
    {
      name: "a statement builder throws",
      db: () => makeDb(),
      finalize: () => () => ({
        kind: "commit",
        get statements(): never {
          throw new Error("statement builder blew up");
        },
      }),
    },
  ];

  for (const { name, db, finalize } of cases) {
    test(`${name} → persist_failed, one completion signal, no rejection`, async () => {
      const handleDb = db();
      vi.mocked(chat).mockReturnValueOnce(textStream(["done"]) as never);

      const handle = await callGatewayStream({ env: makeEnv(handleDb.db), ...STREAM_CONTEXT });
      const outcome = await handle.run(
        MESSAGES,
        { onTextDelta: () => {} },
        finalize(handleDb) as never,
      );

      expect(outcome.kind).toBe("persist_failed");
      const completed = signals(logSpy).filter((s) => s["event"] === "generation.completed");
      expect(completed).toHaveLength(1);
      expect(completed[0]!["outcome"]).toBe("persist_failed");
    });
  }
});

describe("callGatewayStream — background registration and durability", () => {
  test("registers a non-rejecting view of the batch before it settles, and resolves only after it", async () => {
    let settleBatch: (() => void) | undefined;
    const handleDb = makeDb({
      batch: () =>
        new Promise((_resolve, reject) => {
          settleBatch = () => reject(new Error("D1_ERROR: late failure"));
        }),
    });
    const registered: Promise<unknown>[] = [];
    vi.mocked(chat).mockReturnValueOnce(textStream(["done"]) as never);

    const handle = await callGatewayStream({
      env: makeEnv(handleDb.db),
      ...STREAM_CONTEXT,
      registerBackground: (p) => registered.push(p),
    });

    let resolved = false;
    const running = handle
      .run(MESSAGES, { onTextDelta: () => {} }, () => ({
        kind: "commit",
        statements: [callerStatement(handleDb.db)],
      }))
      .then((outcome) => {
        resolved = true;
        return outcome;
      });

    // Give the run a turn to reach the batch and register the background promise.
    await new Promise((r) => setTimeout(r, 0));
    expect(registered).toHaveLength(1);
    expect(resolved).toBe(false);

    settleBatch!();
    const outcome = await running;

    expect(outcome.kind).toBe("persist_failed");
    // The registered promise must not reject — the failure is reported on the caller's
    // own channel, and an unhandled rejection would double-report it to the platform.
    await expect(registered[0]).resolves.toBeUndefined();
  });
});

describe("callGatewayStream — the handle is single-use", () => {
  test("a second run() throws", async () => {
    const { db } = makeDb();
    vi.mocked(chat).mockReturnValueOnce(textStream(["done"]) as never);

    const handle = await callGatewayStream({ env: makeEnv(db), ...STREAM_CONTEXT });
    const finalize = (): GatewayPersist => ({ kind: "commit", statements: [] });

    await handle.run(MESSAGES, { onTextDelta: () => {} }, finalize);
    await expect(handle.run(MESSAGES, { onTextDelta: () => {} }, finalize)).rejects.toThrow(
      "already used",
    );
  });
});

describe("callGatewayStream — model-chain exhaustion is the only rejection", () => {
  test("every model failing rejects and still logs exactly one completion signal", async () => {
    const { db } = makeDb();
    vi.mocked(chat).mockImplementation(() => {
      throw new Error("model unavailable");
    });

    const handle = await callGatewayStream({ env: makeEnv(db), ...STREAM_CONTEXT });
    await expect(
      handle.run(MESSAGES, { onTextDelta: () => {} }, () => ({
        kind: "commit",
        statements: [],
      })),
    ).rejects.toThrow("model unavailable");

    const completed = signals(logSpy).filter((s) => s["event"] === "generation.completed");
    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({
      outcome: "failure",
      model: TIERS.lesson.fallbackChain[TIERS.lesson.fallbackChain.length - 1],
    });
    expect(vi.mocked(createOpenRouterText)).toHaveBeenCalledTimes(
      1 + TIERS.lesson.fallbackChain.length,
    );
  });
});

describe("callGatewayStream — caller log context", () => {
  test("logContext rides on every signal but cannot shadow a canonical field", async () => {
    const { db } = makeDb();
    vi.mocked(chat).mockReturnValueOnce(textStream(["done"]) as never);

    const handle = await callGatewayStream({
      env: makeEnv(db),
      ...STREAM_CONTEXT,
      logContext: { waypoint_id: "wp-1", user_id: "impostor" },
    });
    await handle.run(MESSAGES, { onTextDelta: () => {} }, () => ({
      kind: "commit",
      statements: [],
    }));

    const emitted = signals(logSpy);
    const started = emitted.find((s) => s["event"] === "generation.started");
    const completed = emitted.find((s) => s["event"] === "generation.completed");
    expect(started?.["waypoint_id"]).toBe("wp-1");
    expect(completed?.["waypoint_id"]).toBe("wp-1");
    expect(completed?.["user_id"]).toBe("user-123");
  });
});
