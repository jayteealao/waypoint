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

/**
 * Build an async iterable of stream events — what `chat()` returns.
 *
 * Mirrors the real @tanstack/ai-openrouter event vocabulary: tool calls arrive
 * as TOOL_CALL_START/ARGS/END, streamed text as TEXT_MESSAGE_CONTENT, and final
 * token usage rides on the terminal RUN_FINISHED chunk (camelCase). OpenRouter
 * does not surface a per-call cost in the stream, so cost is normally recomputed
 * from the pricing table; `totalCost` here exercises the defensive prefer-cost path.
 */
function makeSuccessStream(opts?: { toolName?: string; totalCost?: number; text?: string }): AsyncIterable<Record<string, unknown>> {
  const events: Record<string, unknown>[] = []

  if (opts?.text !== undefined) {
    events.push({ type: 'TEXT_MESSAGE_START' })
    events.push({ type: 'TEXT_MESSAGE_CONTENT', delta: opts.text, content: opts.text })
    events.push({ type: 'TEXT_MESSAGE_END' })
  } else {
    const toolName = opts?.toolName ?? 'echo_tool'
    events.push({ type: 'TOOL_CALL_START', toolCallName: toolName })
    events.push({ type: 'TOOL_CALL_ARGS', delta: '{"text":"pong"}' })
    events.push({ type: 'TOOL_CALL_END' })
  }

  const usagePayload: Record<string, unknown> = {
    promptTokens: 10,
    completionTokens: 20,
    totalTokens: 30,
  }
  if (opts?.totalCost !== undefined) {
    usagePayload['total_cost'] = opts.totalCost
  }
  events.push({ type: 'RUN_FINISHED', usage: usagePayload })

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

  // ── Text extraction (regression: adapter emits TEXT_MESSAGE_CONTENT) ─────

  test('text extraction: returns model text from TEXT_MESSAGE_CONTENT chunks', async () => {
    const db = makeMockDb({ quotaUsed: 0 })
    const env = makeEnv(db)

    vi.mocked(chat).mockReturnValueOnce(
      makeSuccessStream({ text: 'What do you want to build?' }) as any,
    )

    const result = await callGateway({
      env,
      userId: 'user-123',
      type: 'lesson',
      messages: [{ role: 'user', content: 'ask me something' }],
    })

    // Regression guard: the OpenRouter adapter streams text as
    // TEXT_MESSAGE_CONTENT, not TEXT_DELTA. If the shared model-stream helper
    // matches the wrong event name, text is silently undefined and every
    // generation breaks.
    expect(result.text).toBe('What do you want to build?')
    expect(result.usage.promptTokens).toBe(10)
    expect(result.usage.completionTokens).toBe(20)
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

  // ── Reasoning effort passthrough ───────────────────────────────────────

  test('reasoning effort: interview tier sends modelOptions.reasoning.effort = low', async () => {
    const db = makeMockDb({ quotaUsed: 0 })
    const env = makeEnv(db)

    vi.mocked(chat).mockReturnValueOnce(makeSuccessStream() as any)

    await callGateway({ env, ...BASE_INPUT })

    // The interview tier sets reasoningEffort: 'low' — it must ride on the chat() call.
    const chatArg = vi.mocked(chat).mock.calls[0]?.[0] as Record<string, any>
    expect(chatArg?.modelOptions?.reasoning?.effort).toBe('low')
  })

  test('reasoning effort: roadmap tier (unset) sends no reasoning field', async () => {
    const db = makeMockDb({ quotaUsed: 0 })
    const env = makeEnv(db)

    vi.mocked(chat).mockReturnValueOnce(makeSuccessStream({ text: '{"waypoints":[]}' }) as any)

    await callGateway({
      env,
      userId: 'user-123',
      type: 'roadmap',
      messages: [{ role: 'user', content: 'Plan a course' }],
    })

    // Roadmap leaves reasoningEffort unset so grok-4.5's mandatory default applies —
    // the gateway must emit NO reasoning/modelOptions.reasoning field.
    const chatArg = vi.mocked(chat).mock.calls[0]?.[0] as Record<string, any>
    expect(chatArg?.modelOptions?.reasoning).toBeUndefined()
  })

  // ── Fallback chain exhaustion ──────────────────────────────────────────

  test('fallback chain: throws when all models fail', async () => {
    const db = makeMockDb({ quotaUsed: 0 })
    const env = makeEnv(db)

    // All calls throw — both primary and every fallback model.
    vi.mocked(chat).mockImplementation(() => { throw new Error('model unavailable') })

    // interview tier has 1 primary + 1 fallback = 2 calls maximum.
    await expect(
      callGateway({ env, ...BASE_INPUT }),
    ).rejects.toThrow('model unavailable')

    // Both primary and fallback were attempted.
    expect(vi.mocked(createOpenRouterText)).toHaveBeenCalledTimes(
      1 + TIERS.interview.fallbackChain.length,
    )
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

  // ── F9 no-regress: buffered path via the shared model-stream helper ──────

  test('shared helper (F9): buffered gateway still returns text and records one usage row', async () => {
    const insertArgs: unknown[] = []
    let insertCount = 0
    const db = makeMockDb({
      quotaUsed: 0,
      onInsert: (args) => {
        insertCount++
        insertArgs.push(...args)
      },
    })
    const env = makeEnv(db)

    vi.mocked(chat).mockReturnValueOnce(
      makeSuccessStream({ text: 'A recursive function calls itself.', totalCost: 0.002 }) as any,
    )

    const result = await callGateway({
      env,
      userId: 'user-123',
      type: 'lesson',
      messages: [{ role: 'user', content: 'Teach me recursion' }],
    })

    // Text still drains through the shared helper's onTextDelta seam.
    expect(result.text).toBe('A recursive function calls itself.')
    // Exactly one usage_events row is written by recordUsage (no double metering).
    expect(insertCount).toBe(1)
    expect(insertArgs[4]).toBe('lesson') // type column
    expect(insertArgs[7]).toBe(0.002) // cost_usd from total_cost
    expect(result.usage.model).toBe(TIERS.lesson.primaryModel)
  })
})
