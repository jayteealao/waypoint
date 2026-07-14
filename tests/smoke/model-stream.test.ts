// @vitest-environment node
// Shared model-stream helper unit tests — run in Node because @tanstack/ai requires
// Node's native fetch. All LLM network calls are mocked; D1 is mocked in-process.
// Verifies: fallback loop advancement, handler routing, usage extraction (camel +
// snake case), cost computation, and the usage_events INSERT.

import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest'

// ── Module mocks — declared BEFORE any import of the modules under test ────
vi.mock('@tanstack/ai', () => ({
  chat: vi.fn(),
  toolDefinition: vi.fn((t: unknown) => t),
}))

vi.mock('@tanstack/ai-openrouter', () => ({
  createOpenRouterText: vi.fn((model: string) => ({ __model: model })),
}))

import {
  runModelWithFallback,
  computeCost,
  recordUsage,
  type StreamUsage,
} from '#/lib/ai/model-stream'
import type { TierConfig } from '#/lib/ai/tiers'
import { chat } from '@tanstack/ai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'

// ── Helpers ──────────────────────────────────────────────────────────────

/** Build an async iterable of stream events, mirroring the adapter vocabulary. */
function makeStream(
  events: Record<string, unknown>[],
): AsyncIterable<Record<string, unknown>> {
  return (async function* () {
    for (const e of events) yield e
  })()
}

const ENV = { OPENROUTER_API_KEY: 'test-key' }

const TIER: TierConfig = {
  primaryModel: 'primary/model',
  fallbackChain: ['fallback/model'],
  pricingPer1MTokens: { input: 1, output: 2 },
}

describe('runModelWithFallback', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  test('(a) fallback loop advances on error and emits onFallback', async () => {
    const onFallback = vi.fn()

    vi.mocked(chat)
      .mockImplementationOnce(() => {
        throw new Error('primary unavailable')
      })
      .mockReturnValueOnce(
        makeStream([{ type: 'RUN_FINISHED', usage: { promptTokens: 5, completionTokens: 7 } }]) as any,
      )

    const result = await runModelWithFallback({
      env: ENV,
      modelChain: ['primary/model', 'fallback/model'],
      messages: [{ role: 'user', content: 'hi' }],
      onFallback,
    })

    expect(result.model).toBe('fallback/model')
    expect(onFallback).toHaveBeenCalledTimes(1)
    expect(onFallback).toHaveBeenCalledWith('primary/model', 'fallback/model', expect.any(Error))
    expect(vi.mocked(createOpenRouterText)).toHaveBeenCalledTimes(2)
  })

  test('(a2) rethrows the last error when the whole chain fails', async () => {
    vi.mocked(chat).mockImplementation(() => {
      throw new Error('all down')
    })

    await expect(
      runModelWithFallback({
        env: ENV,
        modelChain: ['primary/model', 'fallback/model'],
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toThrow('all down')
  })

  test('(b) text deltas reach onTextDelta; tool-call chunks build toolUse', async () => {
    const chunks: string[] = []

    vi.mocked(chat).mockReturnValueOnce(
      makeStream([
        { type: 'TEXT_MESSAGE_CONTENT', delta: 'Hello ' },
        { type: 'TEXT_MESSAGE_CONTENT', delta: 'world' },
        { type: 'RUN_FINISHED', usage: { promptTokens: 1, completionTokens: 2 } },
      ]) as any,
    )

    const textResult = await runModelWithFallback({
      env: ENV,
      modelChain: ['primary/model'],
      messages: [{ role: 'user', content: 'hi' }],
      handlers: { onTextDelta: (d) => chunks.push(d) },
    })
    expect(chunks).toEqual(['Hello ', 'world'])
    expect(textResult.toolUse).toBeUndefined()

    vi.mocked(chat).mockReturnValueOnce(
      makeStream([
        { type: 'TOOL_CALL_START', toolCallName: 'echo_tool' },
        { type: 'TOOL_CALL_ARGS', delta: '{"text":"pong"}' },
        { type: 'TOOL_CALL_END' },
        { type: 'RUN_FINISHED', usage: { promptTokens: 1, completionTokens: 1 } },
      ]) as any,
    )

    const toolResult = await runModelWithFallback({
      env: ENV,
      modelChain: ['primary/model'],
      messages: [{ role: 'user', content: 'call echo' }],
      tools: [{ name: 'echo_tool', description: 'echoes' }],
    })
    expect(toolResult.toolUse).toEqual({ name: 'echo_tool', input: { text: 'pong' } })
  })

  test('(c) usage extraction handles both camelCase and snake_case', async () => {
    vi.mocked(chat).mockReturnValueOnce(
      makeStream([{ type: 'RUN_FINISHED', usage: { promptTokens: 11, completionTokens: 22, total_cost: 0.5 } }]) as any,
    )
    const camel = await runModelWithFallback({
      env: ENV,
      modelChain: ['primary/model'],
      messages: [{ role: 'user', content: 'x' }],
    })
    expect(camel.usage.prompt_tokens).toBe(11)
    expect(camel.usage.completion_tokens).toBe(22)
    expect(camel.usage.total_cost).toBe(0.5)

    vi.mocked(chat).mockReturnValueOnce(
      makeStream([{ type: 'USAGE', usage: { prompt_tokens: 3, completion_tokens: 4, cost: 0.1 } }]) as any,
    )
    const snake = await runModelWithFallback({
      env: ENV,
      modelChain: ['primary/model'],
      messages: [{ role: 'user', content: 'x' }],
    })
    expect(snake.usage.prompt_tokens).toBe(3)
    expect(snake.usage.completion_tokens).toBe(4)
    expect(snake.usage.total_cost).toBe(0.1)
  })

  test('reasoning effort rides on the chat() call when set, absent when unset', async () => {
    vi.mocked(chat).mockReturnValueOnce(
      makeStream([{ type: 'RUN_FINISHED', usage: { promptTokens: 1, completionTokens: 1 } }]) as any,
    )
    await runModelWithFallback({
      env: ENV,
      modelChain: ['primary/model'],
      messages: [{ role: 'user', content: 'x' }],
      reasoningEffort: 'low',
    })
    const withEffort = vi.mocked(chat).mock.calls[0]?.[0] as Record<string, any>
    expect(withEffort?.modelOptions?.reasoning?.effort).toBe('low')

    vi.mocked(chat).mockReturnValueOnce(
      makeStream([{ type: 'RUN_FINISHED', usage: { promptTokens: 1, completionTokens: 1 } }]) as any,
    )
    await runModelWithFallback({
      env: ENV,
      modelChain: ['primary/model'],
      messages: [{ role: 'user', content: 'x' }],
    })
    const noEffort = vi.mocked(chat).mock.calls[1]?.[0] as Record<string, any>
    expect(noEffort?.modelOptions).toBeUndefined()
  })
})

describe('computeCost', () => {
  test('(d) prefers total_cost when present', () => {
    const usage: StreamUsage = { prompt_tokens: 100, completion_tokens: 200, total_cost: 0.009 }
    expect(computeCost(usage, TIER)).toEqual({ costUsd: 0.009, recomputed: false })
  })

  test('(d) recomputes from tier pricing when total_cost absent', () => {
    const usage: StreamUsage = { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 }
    // input=1/1M, output=2/1M → 1 + 2 = 3
    expect(computeCost(usage, TIER)).toEqual({ costUsd: 3, recomputed: true })
  })
})

describe('recordUsage', () => {
  test('inserts one usage_events row with an ISO-8601 `at` and bound fields', async () => {
    const captured: { sql: string; args: unknown[] }[] = []
    const db = {
      prepare(sql: string) {
        return {
          bind(...args: unknown[]) {
            return {
              async run() {
                captured.push({ sql, args })
                return { meta: { changes: 1 }, success: true, results: [] }
              },
            }
          },
        }
      },
    } as unknown as D1Database

    await recordUsage(db, {
      userId: 'u1',
      journeyId: 'j1',
      model: 'primary/model',
      type: 'lesson',
      usage: { prompt_tokens: 12, completion_tokens: 34 },
      costUsd: 0.0042,
      durationMs: 999,
    })

    expect(captured).toHaveLength(1)
    expect(captured[0]!.sql).toContain('INSERT INTO usage_events')
    const args = captured[0]!.args
    // (id, user_id, journey_id, model, type, prompt_tokens, completion_tokens, cost_usd, duration_ms, at)
    expect(args[1]).toBe('u1')
    expect(args[2]).toBe('j1')
    expect(args[3]).toBe('primary/model')
    expect(args[4]).toBe('lesson')
    expect(args[5]).toBe(12)
    expect(args[6]).toBe(34)
    expect(args[7]).toBe(0.0042)
    expect(args[8]).toBe(999)
    // `at` is an explicit ISO-8601 string (ends with Z), not D1's space-separated default.
    expect(String(args[9])).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/)
  })
})
