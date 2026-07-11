// @ts-ignore — @tanstack/ai is in beta; complex generic constraints bypassed with 'as any'
import { chat, toolDefinition } from '@tanstack/ai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import { createOpenaiChatCompletions } from '@tanstack/ai-openai'

// ---- Domain types --------------------------------------------------------

export interface ToolCallResult {
  name: string
  input: Record<string, unknown>
}

export interface AIResponse {
  tool_use: ToolCallResult
}

/** Minimal AI client interface used throughout the app. */
export interface AIClient {
  complete(
    messages: Array<{ role: 'user'; content: string }>,
    tools: Array<{ name: string; description: string }>,
  ): Promise<AIResponse>
}

// ---- Internal helpers ----------------------------------------------------

/** Iterate a chat() stream and collect the first tool-call round trip. */
async function collectFirstToolCall(
  adapter: unknown,
  messages: Array<{ role: 'user'; content: string }>,
  tools: Array<{ name: string; description: string }>,
): Promise<AIResponse> {
  // Build tool definitions without an execute handler — for the proof we only
  // observe the model's tool-call request (TOOL_CALL_START/ARGS/END events).
  // ToolDefinitionConfig does not include `execute`; execution lives on the
  // chained .server(fn) / .client(fn) methods which are not needed here.
  const toolDefs = tools.map((t) =>
    toolDefinition({
      name: t.name,
      description: t.description,
    }),
  )

  const stream = chat({
    adapter: adapter as any,
    messages: messages as any,
    tools: toolDefs as any,
  })

  let toolName: string | undefined
  let toolArgsJson = ''

  for await (const chunk of stream as AsyncIterable<Record<string, unknown>>) {
    if (chunk['type'] === 'TOOL_CALL_START') {
      toolName = chunk['toolCallName'] as string
      toolArgsJson = ''
    } else if (chunk['type'] === 'TOOL_CALL_ARGS') {
      toolArgsJson += (chunk['delta'] as string) ?? ''
    } else if (chunk['type'] === 'TOOL_CALL_END') {
      break
    }
  }

  if (!toolName) throw new Error('No tool call found in model response')

  const input: Record<string, unknown> = toolArgsJson
    ? (JSON.parse(toolArgsJson) as Record<string, unknown>)
    : {}
  return { tool_use: { name: toolName, input } }
}

// ---- Public factories ----------------------------------------------------

/**
 * Native OpenRouter adapter.
 * Reads the API key from the argument; falls back to OPENROUTER_API_KEY env var
 * when the key is the empty string (useful in tests that skip live runs).
 */
export function createOpenRouterClient(apiKey: string): AIClient {
  const adapter = createOpenRouterText('openai/gpt-4o-mini', apiKey)
  return {
    complete: (messages, tools) =>
      collectFirstToolCall(adapter, messages, tools),
  }
}

/**
 * OpenAI-compatible adapter pointed at OpenRouter's base URL.
 * Acts as a drop-in replacement for createOpenRouterClient — zero call-site changes.
 * Useful when the native OpenRouter adapter's tool-calling is broken (AC-PP3).
 */
export function createOpenAIFallbackClient(apiKey: string): AIClient {
  const adapter = createOpenaiChatCompletions('gpt-4o-mini', apiKey, {
    baseURL: 'https://openrouter.ai/api/v1',
  })
  return {
    complete: (messages, tools) =>
      collectFirstToolCall(adapter, messages, tools),
  }
}

/**
 * Mock AI client — returns a predefined tool-call response without any network
 * calls. Used in unit tests to validate the schema and adapter-swap symmetry.
 */
export function createMockAIClient(): AIClient {
  return {
    async complete(_messages, _tools): Promise<AIResponse> {
      // Simulate: model receives prompt → requests echo_tool → returns input
      return { tool_use: { name: 'echo_tool', input: { text: 'pong' } } }
    },
  }
}
