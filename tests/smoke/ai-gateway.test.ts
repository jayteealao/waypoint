// @vitest-environment node
// Gateway unit tests — run in Node because @tanstack/ai requires Node's native fetch.
// All LLM network calls are mocked; D1 is mocked in-process.
// Tests verify: quota gate, usage recording, fallback chain, tier routing, call-shape invariant, cost math.

import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest'

// ── Module mocks — declared BEFORE any import of the modules under test ────
vi.mock('@tanstack/ai', () => ({
  chat: vi.fn(),
  toolDefinition: vi.fn((t: unknown) => t),
}))

vi.mock('@tanstack/ai-openrouter', () => ({
  createOpenRouterText: vi.fn((model: string) => ({ __model: model })),
}))

// Now import the modules under test — mocks are in place.
import { callGateway, QuotaExhaustedError } from '#/lib/ai/gateway'
import { TIERS } from '#/lib/ai/tiers'
import { DAILY_LIMIT_USD } from '#/lib/ai/quota'
import { chat } from '@tanstack/ai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'

// ── Helpers ────────────────────────────────────────────────────────────────

/** Build a minimal mock D1Database that supports the gateway's two SQL patterns. */
function makeMockDb(options: {
  quotaUsed: number
  onInsert?: (bindArgs: unknown[]) => void
}): D1Database {
  return {
    prepare(sql: string) {
      return {
        bind(...bindArgs: unknown[]) {
          return {
            async first() {
              // Quota check: SELECT COALESCE(SUM(cost_usd), 0) AS used ...
              return { used: options.quotaUsed }
            },
            async run() {
              // Usage insert: INSERT INTO usage_events ...
              if (options.onInsert && sql.includes('INSERT INTO usage_events')) {
                options.onInsert(bindArgs)
              }
              return { meta: { changes: 1 }, success: true, results: [] }
            },
            async all() {
              return { results: [] }
            },
          }
        },
      }
    },
  } as unknown as D1Database
}

/** Build an async iterable of stream events — what `chat()` returns. */
function makeSuccessStream(opts?: { toolName?: string; totalCost?: number }): AsyncIterable<Record<string, unknown>> {
  const events: Record<string, unknown>[] = []
  const toolName = opts?.toolName ?? 'echo_tool'

  events.push({ type: 'TOOL_CALL_START', toolCallName: toolName })
  events.push({ type: 'TOOL_CALL_ARGS', delta: '{"text":"pong"}' })
  events.push({ type: 'TOOL_CALL_END' })

  const usagePayload: Record<string, unknown> = {
    prompt_tokens: 10,
    completion_tokens: 20,
  }
  if (opts?.totalCost !== undefined) {
    usagePayload['total_cost'] = opts.totalCost
  }
  events.push({ type: 'USAGE', usage: usagePayload })

  return (async function* () {
    for (const e of events) yield e
  })()
}

/** Shared env with mock DB. Override `db` per-test. */
function makeEnv(db: D1Database): { DB: D1Database; OPENROUTER_API_KEY: string } {
  return { DB: db, OPENROUTER_API_KEY: 'test-key' }
}

const BASE_INPUT = {
  userId: 'user-123',
  journeyId: 'journey-abc',
  type: 'interview' as const,
  messages: [{ role: 'user' as const, content: 'Hello' }],
  tools: [{ name: 'echo_tool', description: 'Echoes input' }],
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('AI gateway', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Quota gate ─────────────────────────────────────────────────────────

  test('quota gate: rejects call when quota exhausted', async () => {
    const db = makeMockDb({ quotaUsed: DAILY_LIMIT_USD + 0.01 }) // over limit
    const env = makeEnv(db)

    await expect(
      callGateway({ env, ...BASE_INPUT }),
    ).rejects.toBeInstanceOf(QuotaExhaustedError)

    // Verify adapter was NEVER called — the gate must fire before any LLM request.
    expect(vi.mocked(createOpenRouterText)).not.toHaveBeenCalled()
    expect(vi.mocked(chat)).not.toHaveBeenCalled()
  })

  test('quota gate: allows call when quota available', async () => {
    const db = makeMockDb({ quotaUsed: 0 }) // well under limit
    const env = makeEnv(db)

    vi.mocked(chat).mockReturnValueOnce(makeSuccessStream() as any)

    const result = await callGateway({ env, ...BASE_INPUT })

    expect(result).toBeDefined()
    // Adapter was called — quota gate passed.
    expect(vi.mocked(createOpenRouterText)).toHaveBeenCalledOnce()
  })

  // ── Usage recording ────────────────────────────────────────────────────

  test('usage recording: inserts row after successful call with correct fields', async () => {
    const insertArgs: unknown[] = []
    const db = makeMockDb({
      quotaUsed: 0,
      onInsert: (args) => { insertArgs.push(...args) },
    })
    const env = makeEnv(db)

    vi.mocked(chat).mockReturnValueOnce(makeSuccessStream({ totalCost: 0.001 }) as any)

    await callGateway({ env, ...BASE_INPUT })

    // insertArgs order: id, user_id, journey_id, model, type, prompt_tokens, completion_tokens, cost_usd, duration_ms
    expect(insertArgs[1]).toBe('user-123')       // user_id
    expect(insertArgs[2]).toBe('journey-abc')    // journey_id
    expect(insertArgs[4]).toBe('interview')      // type
    expect(insertArgs[5]).toBe(10)               // prompt_tokens
    expect(insertArgs[6]).toBe(20)               // completion_tokens
    expect(insertArgs[7]).toBe(0.001)            // cost_usd (from total_cost)
  })

  // ── Fallback chain ─────────────────────────────────────────────────────

  test('fallback chain: tries primary then fallback on error', async () => {
    const consoleSpy = vi.spyOn(console, 'log')
    const db = makeMockDb({ quotaUsed: 0 })
    const env = makeEnv(db)

    // Primary model throws; fallback succeeds.
    vi.mocked(chat)
      .mockImplementationOnce(() => { throw new Error('primary model unavailable') })
      .mockReturnValueOnce(makeSuccessStream({ totalCost: 0.0005 }) as any)

    const result = await callGateway({ env, ...BASE_INPUT })

    expect(result).toBeDefined()

    // Verify model.fallback_triggered signal was emitted.
    const signals = consoleSpy.mock.calls.map((c) => {
      try { return JSON.parse(c[0] as string) } catch { return null }
    })
    const fallbackSignal = signals.find((s) => s?.event === 'model.fallback_triggered')
    expect(fallbackSignal).toBeDefined()
    expect(fallbackSignal.original_model).toBe(TIERS.interview.primaryModel)
    expect(fallbackSignal.fallback_model).toBe(TIERS.interview.fallbackChain[0])

    // Two adapter calls: primary + one fallback.
    expect(vi.mocked(createOpenRouterText)).toHaveBeenCalledTimes(2)
  })

  // ── Tier routing ───────────────────────────────────────────────────────

  test('tier routing: interview type targets interview tier primary model', async () => {
    const db = makeMockDb({ quotaUsed: 0 })
    const env = makeEnv(db)

    vi.mocked(chat).mockReturnValueOnce(makeSuccessStream() as any)

    await callGateway({ env, ...BASE_INPUT })

    expect(vi.mocked(createOpenRouterText)).toHaveBeenCalledWith(
      TIERS.interview.primaryModel,
      'test-key',
    )
  })

  test('tier routing: lesson type targets lesson tier primary model', async () => {
    const db = makeMockDb({ quotaUsed: 0 })
    const env = makeEnv(db)

    vi.mocked(chat).mockReturnValueOnce(makeSuccessStream() as any)

    await callGateway({
      env,
      userId: 'user-123',
      type: 'lesson',
      messages: [{ role: 'user', content: 'Teach me about recursion' }],
    })

    expect(vi.mocked(createOpenRouterText)).toHaveBeenCalledWith(
      TIERS.lesson.primaryModel,
      'test-key',
    )
  })

  // ── Discriminated union / call-shape invariant ─────────────────────────

  test('structured+tool-call invariant: throws TypeError when both tools and responseFormat provided', async () => {
    const db = makeMockDb({ quotaUsed: 0 })
    const env = makeEnv(db)

    await expect(
      callGateway({
        env,
        userId: 'user-123',
        type: 'interview',
        messages: [{ role: 'user', content: 'test' }],
        tools: [{ name: 'echo_tool', description: 'echoes' }],
        // Force both at runtime — TypeScript union prevents this at compile time.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        responseFormat: { type: 'json_object' } as any,
      }),
    ).rejects.toThrow(TypeError)

    // No adapter or quota call should have been made.
    expect(vi.mocked(createOpenRouterText)).not.toHaveBeenCalled()
  })

  // ── Cost math ──────────────────────────────────────────────────────────

  test('cost math: prefers usage.total_cost over recomputed cost', async () => {
    const insertArgs: unknown[] = []
    const db = makeMockDb({
      quotaUsed: 0,
      onInsert: (args) => { insertArgs.push(...args) },
    })
    const env = makeEnv(db)

    // Adapter returns total_cost = 0.001 in USAGE event.
    vi.mocked(chat).mockReturnValueOnce(makeSuccessStream({ totalCost: 0.001 }) as any)

    await callGateway({ env, ...BASE_INPUT })

    // cost_usd in D1 insert should be 0.001 (total_cost), not recomputed.
    const costUsd = insertArgs[7]
    expect(costUsd).toBe(0.001)
  })

  test('cost math: falls back to token recompute when total_cost absent', async () => {
    const consoleSpy = vi.spyOn(console, 'log')
    const insertArgs: unknown[] = []
    const db = makeMockDb({
      quotaUsed: 0,
      onInsert: (args) => { insertArgs.push(...args) },
    })
    const env = makeEnv(db)

    // total_cost is absent from the USAGE event.
    vi.mocked(chat).mockReturnValueOnce(makeSuccessStream() as any)

    await callGateway({ env, ...BASE_INPUT })

    // cost_usd should be derived from token counts × pricing table.
    const expectedCost =
      (10 * TIERS.interview.pricingPer1MTokens.input +
        20 * TIERS.interview.pricingPer1MTokens.output) /
      1_000_000

    const costUsd = insertArgs[7]
    expect(typeof costUsd).toBe('number')
    expect(costUsd as number).toBeCloseTo(expectedCost, 10)

    // A warning signal should be emitted for the recompute path.
    const signals = consoleSpy.mock.calls.map((c) => {
      try { return JSON.parse(c[0] as string) } catch { return null }
    })
    const recomputeSignal = signals.find((s) => s?.event === 'generation.cost_recomputed')
    expect(recomputeSignal).toBeDefined()
  })
})
