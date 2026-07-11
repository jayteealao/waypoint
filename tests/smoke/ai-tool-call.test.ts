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
import { callGateway } from '#/lib/ai/gateway'

// ── Gateway-tier live smoke helpers ──────────────────────────────────────────

/** In-memory D1 stub — quota always satisfied, inserts captured for assertions. */
function makeLiveTestDb(): { db: D1Database; inserts: Record<string, unknown>[] } {
  const inserts: Record<string, unknown>[] = []
  const db: D1Database = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first() { return { used: 0 } },
            async run() {
              if (sql.includes('INSERT INTO usage_events')) {
                inserts.push({ sql, args })
              }
              return { meta: { changes: 1 }, success: true, results: [] }
            },
            async all() { return { results: [] } },
          }
        },
      }
    },
  } as unknown as D1Database
  return { db, inserts }
}

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

  // ── Gateway-tier live smoke (gateway slice) ─────────────────────────────
  // Three tests: interview (tool-call), lesson (text), structured (roadmap, no tools).
  // All skip when OPENROUTER_API_KEY is absent — pre-registered deferral (same as AC-PP2b).
  // Cleared by: a tagged live run with the key present in environment.

  test.skipIf(!process.env['OPENROUTER_API_KEY'])(
    'gateway smoke: interview tier live tool-call (requires OPENROUTER_API_KEY)',
    async () => {
      const apiKey = process.env['OPENROUTER_API_KEY']!
      const { db, inserts } = makeLiveTestDb()

      const result = await callGateway({
        env: { DB: db, OPENROUTER_API_KEY: apiKey },
        userId: 'smoke-user',
        journeyId: null,
        type: 'interview',
        messages: [
          { role: 'user', content: 'Please call the echo_tool with text "pong". Return only the tool call.' },
        ],
        tools: [
          { name: 'echo_tool', description: 'Echo back the provided text. Input: { text: string }' },
        ],
      })

      expect(result).toBeDefined()
      expect(result.toolUse).toBeDefined()
      expect(typeof result.toolUse?.name).toBe('string')
      // Usage row should have been inserted.
      expect(inserts.length).toBeGreaterThanOrEqual(1)
      expect(result.usage.model).toBeTruthy()
    },
  )

  test.skipIf(!process.env['OPENROUTER_API_KEY'])(
    'gateway smoke: lesson tier live text generation (requires OPENROUTER_API_KEY)',
    async () => {
      const apiKey = process.env['OPENROUTER_API_KEY']!
      const { db, inserts } = makeLiveTestDb()

      const result = await callGateway({
        env: { DB: db, OPENROUTER_API_KEY: apiKey },
        userId: 'smoke-user',
        journeyId: null,
        type: 'lesson',
        messages: [
          { role: 'user', content: 'In one sentence: what is a function in programming?' },
        ],
      })

      expect(result).toBeDefined()
      // Usage row should have been inserted.
      expect(inserts.length).toBeGreaterThanOrEqual(1)
      expect(result.usage.model).toBeTruthy()
    },
  )

  test.skipIf(!process.env['OPENROUTER_API_KEY'])(
    'gateway smoke: roadmap tier live structured call (requires OPENROUTER_API_KEY)',
    async () => {
      const apiKey = process.env['OPENROUTER_API_KEY']!
      const { db, inserts } = makeLiveTestDb()

      const result = await callGateway({
        env: { DB: db, OPENROUTER_API_KEY: apiKey },
        userId: 'smoke-user',
        journeyId: null,
        type: 'roadmap',
        messages: [
          { role: 'user', content: 'Reply with just the JSON: {"ok": true}' },
        ],
        // responseFormat drives structured-output path; no tools — invariant enforced.
        responseFormat: { type: 'json_object' },
      })

      expect(result).toBeDefined()
      expect(inserts.length).toBeGreaterThanOrEqual(1)
      expect(result.usage.model).toBeTruthy()
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
