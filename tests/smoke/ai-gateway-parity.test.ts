// @vitest-environment node
/**
 * Characterization of the buffered gateway — the behavior a refactor must reproduce.
 *
 * `tests/smoke/ai-gateway.test.ts` covers the features (quota gate, tier routing, cost
 * math, fallback). It does NOT pin the boundaries a refactor of `callGateway` is most
 * likely to move: what happens when the `usage_events` insert rejects, what the
 * `generation.completed` payload actually contains, and how many quota queries one call
 * costs. Those are pinned here, deliberately as *characterization* — this file asserts
 * what the code does today, quirks included, so that "the extraction changed nothing"
 * becomes a claim a test can refuse.
 *
 * Written and green against the pre-extraction gateway. Any later change to these
 * assertions is a deliberate behavior change, not a refactor.
 */

import { vi, describe, test, expect, beforeEach, afterEach } from "vitest";

// ── Module mocks — declared BEFORE any import of the modules under test ────
vi.mock("@tanstack/ai", () => ({
  chat: vi.fn(),
  toolDefinition: vi.fn((t: unknown) => t),
}));

vi.mock("@tanstack/ai-openrouter", () => ({
  createOpenRouterText: vi.fn((model: string) => ({ __model: model })),
}));

import { callGateway } from "#/lib/ai/gateway";
import { TIERS } from "#/lib/ai/tiers";
import { chat } from "@tanstack/ai";

// ── Helpers ────────────────────────────────────────────────────────────────

interface MockDbHandle {
  db: D1Database;
  /** SQL text of every prepare() call, in order. */
  prepared: string[];
  /** Number of quota SUM queries issued. */
  quotaQueries(): number;
}

/** A mock D1 whose usage insert can be made to reject, and which counts its queries. */
function makeMockDb(options: { quotaUsed: number; insertRejects?: boolean }): MockDbHandle {
  const prepared: string[] = [];
  const db = {
    prepare(sql: string) {
      prepared.push(sql);
      return {
        bind(..._bindArgs: unknown[]) {
          return {
            async first() {
              return { used: options.quotaUsed };
            },
            async run() {
              if (options.insertRejects && sql.includes("INSERT INTO usage_events")) {
                throw new Error("D1_ERROR: usage_events insert failed");
              }
              return { meta: { changes: 1 }, success: true, results: [] };
            },
            async all() {
              return { results: [] };
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  return {
    db,
    prepared,
    quotaQueries: () => prepared.filter((s) => s.includes("SUM(cost_usd)")).length,
  };
}

/** Async iterable of stream events, mirroring the @tanstack/ai-openrouter vocabulary. */
function makeStream(events: Record<string, unknown>[]): AsyncIterable<Record<string, unknown>> {
  return (async function* () {
    for (const e of events) yield e;
  })();
}

const RUN_FINISHED = {
  type: "RUN_FINISHED",
  usage: { promptTokens: 10, completionTokens: 20, total_cost: 0.001 },
};

function toolCallStream() {
  return makeStream([
    { type: "TOOL_CALL_START", toolCallName: "echo_tool" },
    { type: "TOOL_CALL_ARGS", delta: '{"text":"pong"}' },
    { type: "TOOL_CALL_END" },
    RUN_FINISHED,
  ]);
}

const BASE_INPUT = {
  userId: "user-123",
  journeyId: "journey-abc",
  type: "interview" as const,
  messages: [{ role: "user" as const, content: "Hello" }],
  tools: [{ name: "echo_tool", description: "Echoes input" }],
};

/** Every JSON log line the call emitted, parsed. */
function signals(spy: { mock: { calls: unknown[][] } }): Array<Record<string, unknown>> {
  const parsed: Array<Record<string, unknown>> = [];
  for (const call of spy.mock.calls) {
    try {
      parsed.push(JSON.parse(call[0] as string) as Record<string, unknown>);
    } catch {
      // Not a structured signal line — ignore.
    }
  }
  return parsed;
}

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  logSpy = vi.spyOn(console, "log");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("gateway characterization — persistence failure is reported as model failure", () => {
  test("a rejecting usage_events insert rethrows and logs outcome=failure with the LAST chain model", async () => {
    const { db } = makeMockDb({ quotaUsed: 0, insertRejects: true });
    vi.mocked(chat).mockReturnValueOnce(toolCallStream() as never);

    await expect(
      callGateway({ env: { DB: db, OPENROUTER_API_KEY: "test-key" }, ...BASE_INPUT }),
    ).rejects.toThrow("usage_events insert failed");

    const completed = signals(logSpy).filter((s) => s["event"] === "generation.completed");
    expect(completed).toHaveLength(1);
    // The quirk this pins: the model that actually ran was the PRIMARY (the insert is
    // what failed), but the failure branch reports the last model in the chain, because
    // the awaited insert sits inside the same try as the model call. Reproducing the
    // extraction faithfully means reproducing this, not fixing it.
    expect(completed[0]).toMatchObject({
      event: "generation.completed",
      user_id: "user-123",
      journey_id: "journey-abc",
      model: TIERS.interview.fallbackChain[TIERS.interview.fallbackChain.length - 1],
      generation_type: "interview",
      prompt_tokens: 0,
      completion_tokens: 0,
      cost_usd: 0,
      outcome: "failure",
      error_code: "D1_ERROR: usage_events insert failed",
    });
    expect(typeof completed[0]!["duration_ms"]).toBe("number");
  });
});

describe("gateway characterization — the success completion payload", () => {
  test("generation.completed carries exactly the documented keys and values", async () => {
    const { db } = makeMockDb({ quotaUsed: 0 });
    vi.mocked(chat).mockReturnValueOnce(toolCallStream() as never);

    await callGateway({ env: { DB: db, OPENROUTER_API_KEY: "test-key" }, ...BASE_INPUT });

    const completed = signals(logSpy).filter((s) => s["event"] === "generation.completed");
    expect(completed).toHaveLength(1);
    expect(Object.keys(completed[0]!).sort()).toEqual(
      [
        "event",
        "user_id",
        "journey_id",
        "model",
        "generation_type",
        "prompt_tokens",
        "completion_tokens",
        "cost_usd",
        "duration_ms",
        "outcome",
      ].sort(),
    );
    expect(completed[0]).toMatchObject({
      user_id: "user-123",
      journey_id: "journey-abc",
      model: TIERS.interview.primaryModel,
      generation_type: "interview",
      prompt_tokens: 10,
      completion_tokens: 20,
      cost_usd: 0.001,
      outcome: "success",
    });
  });

  test("generation.started fires once, before the model call, with the estimated prompt tokens", async () => {
    const { db } = makeMockDb({ quotaUsed: 0 });
    vi.mocked(chat).mockReturnValueOnce(toolCallStream() as never);

    await callGateway({ env: { DB: db, OPENROUTER_API_KEY: "test-key" }, ...BASE_INPUT });

    const started = signals(logSpy).filter((s) => s["event"] === "generation.started");
    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({
      user_id: "user-123",
      journey_id: "journey-abc",
      model: TIERS.interview.primaryModel,
      generation_type: "interview",
      // "Hello" → ceil(5/4) = 2
      estimated_prompt_tokens: 2,
    });
  });
});

describe("gateway characterization — result shape", () => {
  test("a tool-only response returns text === undefined, not an empty string", async () => {
    const { db } = makeMockDb({ quotaUsed: 0 });
    vi.mocked(chat).mockReturnValueOnce(toolCallStream() as never);

    const result = await callGateway({
      env: { DB: db, OPENROUTER_API_KEY: "test-key" },
      ...BASE_INPUT,
    });

    expect(result.text).toBeUndefined();
    expect("text" in result).toBe(true);
    expect(result.toolUse).toEqual({ name: "echo_tool", input: { text: "pong" } });
  });

  test("a text response returns no toolUse and the concatenated deltas", async () => {
    const { db } = makeMockDb({ quotaUsed: 0 });
    vi.mocked(chat).mockReturnValueOnce(
      makeStream([
        { type: "TEXT_MESSAGE_CONTENT", delta: "one " },
        { type: "TEXT_MESSAGE_CONTENT", delta: "two" },
        RUN_FINISHED,
      ]) as never,
    );

    const result = await callGateway({
      env: { DB: db, OPENROUTER_API_KEY: "test-key" },
      userId: "user-123",
      type: "lesson",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(result.text).toBe("one two");
    expect(result.toolUse).toBeUndefined();
    expect(result.usage).toEqual({
      model: TIERS.lesson.primaryModel,
      promptTokens: 10,
      completionTokens: 20,
      costUsd: 0.001,
      durationMs: expect.any(Number),
    });
  });
});

describe("gateway characterization — query budget", () => {
  test("one generation costs exactly one quota query", async () => {
    const handle = makeMockDb({ quotaUsed: 0 });
    vi.mocked(chat).mockReturnValueOnce(toolCallStream() as never);

    await callGateway({
      env: { DB: handle.db, OPENROUTER_API_KEY: "test-key" },
      ...BASE_INPUT,
    });

    expect(handle.quotaQueries()).toBe(1);
    expect(handle.prepared.filter((s) => s.includes("INSERT INTO usage_events"))).toHaveLength(1);
  });
});
