/**
 * AI model tier configuration.
 *
 * Maps each generation type to a primary model, ordered fallback chain, and
 * pricing metadata (per 1M tokens). Pricing is stored as config — not used in
 * arithmetic directly — so model swaps require a single constant update here
 * rather than scattered changes in gateway logic.
 *
 * Invariant: structured-output calls (quiz, roadmap) NEVER combine responseFormat
 * with tools in the same request. This is enforced at the gateway level via a
 * TypeScript discriminated union + runtime TypeError. Tier config does not need
 * to encode this — it is a call-shape constraint, not a model constraint.
 */

/** Generation types produced by AI calls in Waypoint. */
export type GenerationType = 'interview' | 'lesson' | 'quiz' | 'roadmap'

/** Per-tier model config with fallback chain and pricing. */
export interface TierConfig {
  /** Primary model identifier (OpenRouter format: provider/model). */
  primaryModel: string
  /**
   * Ordered fallback chain. On primary failure the gateway tries each in order.
   * Empty means no fallback — the error propagates immediately.
   */
  fallbackChain: string[]
  /** Per-1M-token pricing in USD. Used as fallback when total_cost absent. */
  pricingPer1MTokens: {
    input: number
    output: number
  }
  /**
   * Reasoning effort for reasoning-capable primaries. Forwarded to OpenRouter as
   * `reasoning.effort` on every call for this tier. Leave unset to use the model's
   * own default (e.g. grok-4.5's mandatory `high`). Additive/optional — omitting it
   * sends no reasoning field at all.
   */
  reasoningEffort?: 'low' | 'medium' | 'high'
}

/**
 * Canonical tier map. All generation features call `callGateway({ type })` and
 * the gateway resolves the model from here — no consumer hardcodes model IDs.
 *
 * Pricing figures are authoritative as of 2026-07-12 from live OpenRouter data
 * (per-model pricing captured during model selection). Update here when models
 * change; the gateway prefers `usage.total_cost` (which includes OpenRouter's
 * 5.5% credit fee) over recomputed cost.
 */
export const TIERS: Record<GenerationType, TierConfig> = {
  /**
   * Interview tier: cheap/fast for conversational turns.
   * Target latency: < 3 s (NFR from shape). `reasoningEffort: 'low'` protects the
   * latency budget on the reasoning-capable primary.
   */
  interview: {
    primaryModel: 'z-ai/glm-5.2',
    fallbackChain: ['openai/gpt-5.6-luna'],
    pricingPer1MTokens: { input: 0.42, output: 1.32 },
    reasoningEffort: 'low',
  },

  /**
   * Lesson tier: premium for long-form educational content.
   * Target latency: < 5 s for first meaningful token (NFR from shape).
   */
  lesson: {
    primaryModel: 'z-ai/glm-5.2',
    fallbackChain: ['google/gemini-3.5-flash'],
    pricingPer1MTokens: { input: 0.42, output: 1.32 },
    reasoningEffort: 'low',
  },

  /**
   * Structured tier: structured-output (JSON schema) for roadmap generation.
   * Low-volume, latency-tolerant planning — grok-4.5's mandatory reasoning default
   * (`high`) is desired here, so `reasoningEffort` is intentionally left unset.
   * NOTE: responseFormat and tools are NEVER combined in one request — enforced
   * at the gateway call-shape level (TypeScript discriminated union + TypeError).
   */
  roadmap: {
    primaryModel: 'x-ai/grok-4.5',
    fallbackChain: ['openai/gpt-5.6-luna'],
    pricingPer1MTokens: { input: 2.00, output: 6.00 },
  },

  /**
   * Quiz tier: structured-output grading. Same invariant as roadmap.
   */
  quiz: {
    primaryModel: 'z-ai/glm-5.2',
    fallbackChain: ['deepseek/deepseek-v4-pro'],
    pricingPer1MTokens: { input: 0.42, output: 1.32 },
    reasoningEffort: 'low',
  },
}
