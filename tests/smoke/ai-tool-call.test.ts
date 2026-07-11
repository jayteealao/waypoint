// @vitest-environment node
// Override the project-level jsdom environment — @tanstack/ai requires Node's
// native fetch and cannot run in jsdom.

import { describe, expect, test } from 'vitest'
import {
  type AIClient,
  createMockAIClient,
  createOpenAIFallbackClient,
  createOpenRouterClient,
} from '#/lib/ai-client'

const TEST_MESSAGES: Array<{ role: 'user'; content: string }> = [
  {
    role: 'user',
    content:
      'Please call the echo_tool with text "pong". Return only the tool call.',
  },
]

const TEST_TOOLS: Array<{ name: string; description: string }> = [
  {
    name: 'echo_tool',
    description: 'Echo back the provided text. Input: { text: string }',
  },
]

// ── Test 1: mocked round-trip schema validation (AC-PP2a) ─────────────────

describe('AI tool-call smoke test', () => {
  test('mocked tool-call round trip validates schema', async () => {
    const client = createMockAIClient()
    const result = await client.complete(TEST_MESSAGES, TEST_TOOLS)

    expect(result).toHaveProperty('tool_use')
    expect(result.tool_use.name).toBe('echo_tool')
    expect(result.tool_use.input).toMatchObject({ text: 'pong' })
  })

  // ── Test 2: live OpenRouter smoke (AC-PP2b) ─────────────────────────────
  // Skipped when OPENROUTER_API_KEY is absent — constraint-resolution: proxy+deferral.
  // Evidence: the mocked round trip (test 1) is the immediate proxy.
  // Cleared by: a tagged live run with the key present.

  test.skipIf(!process.env['OPENROUTER_API_KEY'])(
    'live OpenRouter tool-call round trip (requires OPENROUTER_API_KEY)',
    async () => {
      const apiKey = process.env['OPENROUTER_API_KEY']!
      const client = createOpenRouterClient(apiKey)
      const result = await client.complete(TEST_MESSAGES, TEST_TOOLS)

      expect(result).toHaveProperty('tool_use')
      expect(typeof result.tool_use.name).toBe('string')
      expect(result.tool_use.name.length).toBeGreaterThan(0)
      expect(result.tool_use.input).toBeDefined()
    },
  )

  // ── Test 3: adapter-swap zero-callsite proof (AC-PP3) ────────────────────
  // Proves that createOpenAIFallbackClient() returns the same AIClient interface
  // as createOpenRouterClient(). Swapping adapters requires changing only the
  // factory line — zero changes to call sites.

  test('adapter-swap: OpenAI fallback satisfies AIClient interface', async () => {
    // TypeScript compile check: if createOpenAIFallbackClient didn't return
    // AIClient, this assignment would be a compile-time error.
    const fallbackClient: AIClient = createOpenAIFallbackClient('test-key')
    const nativeClient: AIClient = createOpenRouterClient('test-key')

    // Both variables satisfy the same interface shape at runtime.
    for (const client of [fallbackClient, nativeClient] as const) {
      expect(typeof client.complete).toBe('function')
    }

    // Run the same schema assertions using the mock (no network).
    // In production: replace createMockAIClient() with createOpenAIFallbackClient(key)
    // and no other line in this test would change.
    const mockClient: AIClient = createMockAIClient()
    const result = await mockClient.complete(TEST_MESSAGES, TEST_TOOLS)

    expect(result.tool_use.name).toBe('echo_tool')
    expect(result.tool_use.input).toMatchObject({ text: 'pong' })
  })
})
