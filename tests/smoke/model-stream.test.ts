// @vitest-environment node
// Shared model-stream helper unit tests — run in Node because @tanstack/ai requires
// Node's native fetch. All LLM network calls are mocked; D1 is mocked in-process.
// Verifies: fallback loop advancement, handler routing, usage extraction (camel +
// snake case), cost computation, and the usage_events INSERT.

import { vi, describe, test, expect, beforeEach, afterEach } from "vitest";

// ── Module mocks — declared BEFORE any import of the modules under test ────
vi.mock("@tanstack/ai", () => ({
  chat: vi.fn(),
  toolDefinition: vi.fn((t: unknown) => t),
}));

vi.mock("@tanstack/ai-openrouter", () => ({
  createOpenRouterText: vi.fn((model: string) => ({ __model: model })),
}));

import {
  runModelWithFallback,
  computeCost,
  recordUsage,
  type StreamUsage,
} from "#/lib/ai/model-stream";
import { MODEL_PRICING, TIERS, UNKNOWN_MODEL_PRICING } from "#/lib/ai/tiers";
import type { TierConfig } from "#/lib/ai/tiers";
import { chat } from "@tanstack/ai";
import { createOpenRouterText } from "@tanstack/ai-openrouter";

// ── Helpers ──────────────────────────────────────────────────────────────

/** Build an async iterable of stream events, mirroring the adapter vocabulary. */
function makeStream(events: Record<string, unknown>[]): AsyncIterable<Record<string, unknown>> {
  return (async function* () {
    for (const e of events) yield e;
  })();
}

const ENV = { OPENROUTER_API_KEY: "test-key" };

const TIER: TierConfig = {
  primaryModel: "primary/model",
  fallbackChain: ["fallback/model"],
};

describe("runModelWithFallback", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  test("(a) fallback loop advances on error and emits onFallback", async () => {
    const onFallback = vi.fn();

    vi.mocked(chat)
      .mockImplementationOnce(() => {
        throw new Error("primary unavailable");
      })
      .mockReturnValueOnce(
        makeStream([
          { type: "RUN_FINISHED", usage: { promptTokens: 5, completionTokens: 7 } },
        ]) as any,
      );

    const result = await runModelWithFallback({
      env: ENV,
      modelChain: ["primary/model", "fallback/model"],
      messages: [{ role: "user", content: "hi" }],
      onFallback,
    });

    expect(result.model).toBe("fallback/model");
    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(onFallback).toHaveBeenCalledWith("primary/model", "fallback/model", expect.any(Error));
    expect(vi.mocked(createOpenRouterText)).toHaveBeenCalledTimes(2);
  });

  test("(a2) rethrows the last error when the whole chain fails", async () => {
    vi.mocked(chat).mockImplementation(() => {
      throw new Error("all down");
    });

    await expect(
      runModelWithFallback({
        env: ENV,
        modelChain: ["primary/model", "fallback/model"],
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toThrow("all down");
  });

  test("(b) text deltas reach onTextDelta; tool-call chunks build toolUse", async () => {
    const chunks: string[] = [];

    vi.mocked(chat).mockReturnValueOnce(
      makeStream([
        { type: "TEXT_MESSAGE_CONTENT", delta: "Hello " },
        { type: "TEXT_MESSAGE_CONTENT", delta: "world" },
        { type: "RUN_FINISHED", usage: { promptTokens: 1, completionTokens: 2 } },
      ]) as any,
    );

    const textResult = await runModelWithFallback({
      env: ENV,
      modelChain: ["primary/model"],
      messages: [{ role: "user", content: "hi" }],
      handlers: { onTextDelta: (d) => chunks.push(d) },
    });
    expect(chunks).toEqual(["Hello ", "world"]);
    expect(textResult.toolUse).toBeUndefined();

    vi.mocked(chat).mockReturnValueOnce(
      makeStream([
        { type: "TOOL_CALL_START", toolCallName: "echo_tool" },
        { type: "TOOL_CALL_ARGS", delta: '{"text":"pong"}' },
        { type: "TOOL_CALL_END" },
        { type: "RUN_FINISHED", usage: { promptTokens: 1, completionTokens: 1 } },
      ]) as any,
    );

    const toolResult = await runModelWithFallback({
      env: ENV,
      modelChain: ["primary/model"],
      messages: [{ role: "user", content: "call echo" }],
      tools: [{ name: "echo_tool", description: "echoes" }],
    });
    expect(toolResult.toolUse).toEqual({ name: "echo_tool", input: { text: "pong" } });
  });

  test("(c) usage extraction handles both camelCase and snake_case", async () => {
    vi.mocked(chat).mockReturnValueOnce(
      makeStream([
        {
          type: "RUN_FINISHED",
          usage: { promptTokens: 11, completionTokens: 22, total_cost: 0.5 },
        },
      ]) as any,
    );
    const camel = await runModelWithFallback({
      env: ENV,
      modelChain: ["primary/model"],
      messages: [{ role: "user", content: "x" }],
    });
    expect(camel.usage.prompt_tokens).toBe(11);
    expect(camel.usage.completion_tokens).toBe(22);
    expect(camel.usage.total_cost).toBe(0.5);

    vi.mocked(chat).mockReturnValueOnce(
      makeStream([
        { type: "USAGE", usage: { prompt_tokens: 3, completion_tokens: 4, cost: 0.1 } },
      ]) as any,
    );
    const snake = await runModelWithFallback({
      env: ENV,
      modelChain: ["primary/model"],
      messages: [{ role: "user", content: "x" }],
    });
    expect(snake.usage.prompt_tokens).toBe(3);
    expect(snake.usage.completion_tokens).toBe(4);
    expect(snake.usage.total_cost).toBe(0.1);
  });

  test("reasoning effort rides on the chat() call when set, absent when unset", async () => {
    vi.mocked(chat).mockReturnValueOnce(
      makeStream([
        { type: "RUN_FINISHED", usage: { promptTokens: 1, completionTokens: 1 } },
      ]) as any,
    );
    await runModelWithFallback({
      env: ENV,
      modelChain: ["primary/model"],
      messages: [{ role: "user", content: "x" }],
      reasoningEffort: "low",
    });
    const withEffort = vi.mocked(chat).mock.calls[0]?.[0] as Record<string, any>;
    expect(withEffort?.modelOptions?.reasoning?.effort).toBe("low");

    vi.mocked(chat).mockReturnValueOnce(
      makeStream([
        { type: "RUN_FINISHED", usage: { promptTokens: 1, completionTokens: 1 } },
      ]) as any,
    );
    await runModelWithFallback({
      env: ENV,
      modelChain: ["primary/model"],
      messages: [{ role: "user", content: "x" }],
    });
    const noEffort = vi.mocked(chat).mock.calls[1]?.[0] as Record<string, any>;
    expect(noEffort?.modelOptions).toBeUndefined();
  });
});

describe("computeCost", () => {
  test("(d) prefers total_cost when present", () => {
    const usage: StreamUsage = { prompt_tokens: 100, completion_tokens: 200, total_cost: 0.009 };
    expect(computeCost(usage, TIER)).toEqual({ costUsd: 0.009, recomputed: false });
  });

  test("(d) recomputes from the served model's price when total_cost absent", () => {
    const usage: StreamUsage = { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 };
    const price = MODEL_PRICING["z-ai/glm-5.2"]!;
    // 1M prompt + 1M completion → exactly one unit of each per-1M price.
    expect(computeCost(usage, TIERS.lesson, "z-ai/glm-5.2")).toEqual({
      costUsd: price.input + price.output,
      recomputed: true,
    });
  });

  // ── AC-C1 — the gateway's cost column is a list-price estimate ────────────
  //
  // The AI Gateway logged $0.005656482 for generation
  // afe22983-9e09-4a98-a4c2-27d01aaaba0f while the D1 ledger holds $0.004057911
  // (OpenRouter's billed total_cost). Pinning the derivation makes the claim that
  // the two are not supposed to match checkable rather than asserted: the gateway
  // figure is tokens × the model's catalog list price, and nothing in this
  // repository computes it.
  //
  // The catalog pair is pinned here as literals rather than read from
  // MODEL_PRICING, because the two numbers have parted company: MODEL_PRICING now
  // holds the maximum across the model's live endpoints (glm-5.2 at 2.31 / 7.88),
  // not the catalog price the AI Gateway's own cost column is computed from. The
  // gateway keeps charting the catalog figure, so the derivation must read the
  // catalog figure.
  test("AC-C1 the AI Gateway figure reproduces from list price, not from the ledger", () => {
    // OpenRouter catalog price for z-ai/glm-5.2 (GET /api/v1/models), captured
    // 2026-09-04 — deliberately NOT MODEL_PRICING, see the note above.
    const catalogPrice = { input: 0.966, output: 3.036 };
    const gatewayFigure = (761 * catalogPrice.input + 1621 * catalogPrice.output) / 1_000_000;
    expect(gatewayFigure).toBeCloseTo(0.005656482, 9);
    // The ledger's number is OpenRouter's billed amount and is legitimately lower —
    // it charges what the endpoint that served the call charges, not list.
    expect(gatewayFigure).toBeGreaterThan(0.004057911);
  });

  // ── AC-C2 — the recompute fallback no longer under-charges ────────────────
  test("AC-C2 recompute is at or above what OpenRouter billed for the same tokens", () => {
    const usage: StreamUsage = { prompt_tokens: 761, completion_tokens: 1621 };
    const { costUsd, recomputed } = computeCost(usage, TIERS.lesson, "z-ai/glm-5.2");
    expect(recomputed).toBe(true);
    expect(costUsd).toBeGreaterThanOrEqual(0.004057911);
  });

  test("AC-C2 a long prompt is priced by the model's long-prompt step", () => {
    const usage: StreamUsage = { prompt_tokens: 250_000, completion_tokens: 1_000 };
    const grok = MODEL_PRICING["x-ai/grok-4.5"]!;
    const step = grok.overrides![0]!;
    expect(step.minPromptTokens).toBe(200_000);
    const { costUsd } = computeCost(usage, TIERS.roadmap, "x-ai/grok-4.5");
    expect(costUsd).toBeCloseTo((250_000 * step.input + 1_000 * step.output) / 1_000_000, 12);
    // The base pair would be half of it — the 2× under-charge this guards against.
    const base = (250_000 * grok.input + 1_000 * grok.output) / 1_000_000;
    expect(costUsd).toBeCloseTo(base * 2, 12);
  });

  test("AC-C2 a prompt below the step keeps the base price", () => {
    const usage: StreamUsage = { prompt_tokens: 199_999, completion_tokens: 1_000 };
    const grok = MODEL_PRICING["x-ai/grok-4.5"]!;
    const { costUsd } = computeCost(usage, TIERS.roadmap, "x-ai/grok-4.5");
    expect(costUsd).toBeCloseTo((199_999 * grok.input + 1_000 * grok.output) / 1_000_000, 12);
  });

  // ── TS-1 — the override step is selected by >=, so the boundary value itself
  // (not just values on either side of it) must reach the override step ────
  test("TS-1 grok-4.5 at exactly the 200,000-token boundary prices at the override rate", () => {
    const usage: StreamUsage = { prompt_tokens: 200_000, completion_tokens: 1_000 };
    const grok = MODEL_PRICING["x-ai/grok-4.5"]!;
    const step = grok.overrides![0]!;
    expect(step.minPromptTokens).toBe(200_000);
    expect(step.input).toBe(8.0);
    expect(step.output).toBe(24.0);
    const { costUsd } = computeCost(usage, TIERS.roadmap, "x-ai/grok-4.5");
    expect(costUsd).toBeCloseTo((200_000 * step.input + 1_000 * step.output) / 1_000_000, 12);
    // The base pair would price this lower — an off-by-one (`>` instead of `>=`)
    // would silently fall through to it at exactly the boundary.
    const base = (200_000 * grok.input + 1_000 * grok.output) / 1_000_000;
    expect(costUsd).toBeGreaterThan(base);
  });

  test("TS-1 gpt-5.6-luna at exactly the 272,000-token boundary prices at the override rate", () => {
    const usage: StreamUsage = { prompt_tokens: 272_000, completion_tokens: 1_000 };
    const luna = MODEL_PRICING["openai/gpt-5.6-luna"]!;
    const step = luna.overrides![0]!;
    expect(step.minPromptTokens).toBe(272_000);
    expect(step.input).toBe(0.8);
    expect(step.output).toBe(3.6);
    const { costUsd } = computeCost(usage, TIERS.roadmap, "openai/gpt-5.6-luna");
    expect(costUsd).toBeCloseTo((272_000 * step.input + 1_000 * step.output) / 1_000_000, 12);
    const base = (272_000 * luna.input + 1_000 * luna.output) / 1_000_000;
    expect(costUsd).toBeGreaterThan(base);
  });

  test("TS-1 gpt-5.6-luna just below the boundary keeps the base price", () => {
    const usage: StreamUsage = { prompt_tokens: 271_999, completion_tokens: 1_000 };
    const luna = MODEL_PRICING["openai/gpt-5.6-luna"]!;
    expect(luna.input).toBe(0.4);
    expect(luna.output).toBe(2.4);
    const { costUsd } = computeCost(usage, TIERS.roadmap, "openai/gpt-5.6-luna");
    expect(costUsd).toBeCloseTo((271_999 * luna.input + 1_000 * luna.output) / 1_000_000, 12);
  });

  test("AC-C2 an unpriced served model is charged the authored ceiling", () => {
    const usage: StreamUsage = { prompt_tokens: 761, completion_tokens: 1621 };
    const { costUsd } = computeCost(usage, TIERS.lesson, "some-provider/never-seen");
    const ceiling =
      (761 * UNKNOWN_MODEL_PRICING.input + 1621 * UNKNOWN_MODEL_PRICING.output) / 1_000_000;
    expect(costUsd).toBeCloseTo(ceiling, 12);
    // A maximum over the tier's own chain would have under-charged here.
    for (const model of [TIERS.lesson.primaryModel, ...TIERS.lesson.fallbackChain]) {
      expect(costUsd).toBeGreaterThan(computeCost(usage, TIERS.lesson, model).costUsd);
    }
  });

  // Regression (verify-stage adversarial probe, 2026-09-04): the served model is a
  // string the provider chose, and `MODEL_PRICING[thatString]` used to reach
  // Object.prototype. `constructor` / `toString` / `__proto__` resolved to inherited
  // members, which are truthy enough to skip UNKNOWN_MODEL_PRICING, so the cost came
  // out NaN — stored as no charge at all, the exact under-charge AC-C2 closes.
  test("a prototype-named served model is charged the ceiling, not NaN", () => {
    const usage: StreamUsage = { prompt_tokens: 761, completion_tokens: 1621 };
    const ceiling =
      (761 * UNKNOWN_MODEL_PRICING.input + 1621 * UNKNOWN_MODEL_PRICING.output) / 1_000_000;
    for (const name of ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf"]) {
      const { costUsd } = computeCost(usage, TIERS.lesson, name);
      expect(Number.isFinite(costUsd), name + " priced to a non-finite cost").toBe(true);
      expect(costUsd).toBeCloseTo(ceiling, 12);
    }
  });

  // ── AC-C3 — a fallback model is priced as itself ──────────────────────
  test("AC-C3 a fallback answer is priced by the model that served it", () => {
    const usage: StreamUsage = { prompt_tokens: 761, completion_tokens: 1621 };
    const primary = computeCost(usage, TIERS.lesson, TIERS.lesson.primaryModel).costUsd;
    const fallback = computeCost(usage, TIERS.lesson, TIERS.lesson.fallbackChain[0]).costUsd;
    expect(TIERS.lesson.fallbackChain[0]).toBe("google/gemini-3.5-flash");
    expect(fallback).not.toBeCloseTo(primary, 9);
    const gemini = MODEL_PRICING["google/gemini-3.5-flash"]!;
    expect(fallback).toBeCloseTo((761 * gemini.input + 1621 * gemini.output) / 1_000_000, 12);
  });

  test("every model in every tier chain is priced", () => {
    for (const tier of Object.values(TIERS)) {
      for (const model of [tier.primaryModel, ...tier.fallbackChain]) {
        expect(MODEL_PRICING[model], model + " is unpriced").toBeDefined();
      }
    }
  });

  // CO-1 / MT-3 — the ceiling's safety argument was asserted only in a comment,
  // so a priced entry could move above it (routine price-table maintenance)
  // without anything failing. This pins the invariant the docstring claims:
  // UNKNOWN_MODEL_PRICING must be >= every price step actually in the map,
  // including each entry's `overrides`, not just the base pair.
  test("CO-1 the ceiling is >= every price step in MODEL_PRICING, including overrides", () => {
    for (const [model, price] of Object.entries(MODEL_PRICING)) {
      const steps = [price, ...(price.overrides ?? [])];
      for (const step of steps) {
        expect(
          UNKNOWN_MODEL_PRICING.input,
          `${model} input ${step.input} exceeds the ceiling`,
        ).toBeGreaterThanOrEqual(step.input);
        expect(
          UNKNOWN_MODEL_PRICING.output,
          `${model} output ${step.output} exceeds the ceiling`,
        ).toBeGreaterThanOrEqual(step.output);
      }
    }
  });
});

describe("recordUsage", () => {
  test("inserts one usage_events row with an ISO-8601 `at` and bound fields", async () => {
    const captured: { sql: string; args: unknown[] }[] = [];
    const db = {
      prepare(sql: string) {
        return {
          bind(...args: unknown[]) {
            return {
              async run() {
                captured.push({ sql, args });
                return { meta: { changes: 1 }, success: true, results: [] };
              },
            };
          },
        };
      },
    } as unknown as D1Database;

    await recordUsage(db, {
      userId: "u1",
      journeyId: "j1",
      model: "primary/model",
      type: "lesson",
      usage: { prompt_tokens: 12, completion_tokens: 34 },
      costUsd: 0.0042,
      durationMs: 999,
    });

    expect(captured).toHaveLength(1);
    expect(captured[0]!.sql).toContain("INSERT INTO usage_events");
    const args = captured[0]!.args;
    // (id, user_id, journey_id, model, type, prompt_tokens, completion_tokens, cost_usd, duration_ms, at)
    expect(args[1]).toBe("u1");
    expect(args[2]).toBe("j1");
    expect(args[3]).toBe("primary/model");
    expect(args[4]).toBe("lesson");
    expect(args[5]).toBe(12);
    expect(args[6]).toBe(34);
    expect(args[7]).toBe(0.0042);
    expect(args[8]).toBe(999);
    // `at` is an explicit ISO-8601 string (ends with Z), not D1's space-separated default.
    expect(String(args[9])).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/);
  });
});
